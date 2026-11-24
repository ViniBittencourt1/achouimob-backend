
function gerarTokenCurto(tamanho = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < tamanho; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

import express from 'express';
import admin from 'firebase-admin';

let sendEmail;
const router = express.Router();

// POST /api/token-cleanup/validate-token
router.post('/validate-token', async (req, res) => {
  const { uid, idToken } = req.body;
  if (!uid || !idToken) {
    return res.status(400).json({ success: false, message: 'Dados incompletos.' });
  }
  try {
    // Busca idToken salvo no Auth (custom claims ou metadata)
    const userRecord = await admin.auth().getUser(uid);
    let authToken = userRecord.customClaims && userRecord.customClaims.idToken ? userRecord.customClaims.idToken : null;
    return res.json({ success: true, authToken });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao buscar token no Auth.', details: err.message });
  }
});

// POST /api/token-cleanup/delete-token
router.post('/delete-token', async (req, res) => {
  const { uid } = req.body;
  if (!uid) {
    return res.status(400).json({ success: false, message: 'UID ausente.' });
  }
  try {
    // Remove idToken dos customClaims do Auth
    await admin.auth().setCustomUserClaims(uid, {});
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao apagar token no Auth.', details: err.message });
  }
});

// POST /api/token-cleanup/unlock
// Nova rota unlock sem proteção por token
router.post('/unlock', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ success: false, message: 'Dados incompletos.' });
  }
  try {
    const userRecord = await admin.auth().getUserByEmail(login);
    const uid = userRecord.uid;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }
    await userRef.update({ deviceId: admin.firestore.FieldValue.delete() });
    return res.json({ success: true, message: 'Sessão desbloqueada com sucesso!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro interno do servidor.', details: err.message });
  }
});

// POST /api/token-cleanup/send
router.post('/send', async (req, res) => {
  if (!sendEmail) {
    const mailModule = await import('../services/emailServiceSendGrid.js');
    sendEmail = mailModule.sendEmail || (mailModule.default && mailModule.default.sendEmail);
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail ausente' });
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    // Sempre gera um novo token curto ao enviar o e-mail
    const novoToken = gerarTokenCurto(10);
    await userRef.update({ idToken: novoToken });
    const frontendUrl = 'https://fifty50.com.br';
    const link = `${frontendUrl}/unlock.html`;

    await sendEmail({
      to: email,
      subject: 'Limpeza de sessão: acesso exclusivo',
      text: `Olá, você solicitou a limpeza de sessão.\n\nCopie o código abaixo e cole na tela de desbloqueio:\n\n${novoToken}\n\nAcesse: ${link}`,
      html: `<p>Olá,<br>Você solicitou a limpeza de sessão.<br><br><b>Copie o código abaixo e cole na tela de desbloqueio:</b><br><pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-family:monospace;font-size:16px;word-break:break-all;">${novoToken}</pre><br><a href="${link}" style="background:#1976d2;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Clique aqui para liberar o acesso</a></p>`
    });

    return res.json({ success: true, link });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar link de limpeza', details: err.message });
  }
});

// GET /api/token-cleanup?token=TOKEN
// Nova rota token-cleanup sem proteção por token
router.get('/token-cleanup', async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'UID ausente' });
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    await userRef.update({ deviceId: admin.firestore.FieldValue.delete() });
    return res.json({ success: true, message: 'Sessão liberada. Faça login novamente.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno do servidor.', details: err.message });
  }
});

export default router;