// backend/src/routes/changePassword.js


import express from 'express';
import admin from 'firebase-admin';
const router = express.Router();

// Rota para alteração de senha
// Espera: { email, senhaAtual, novaSenha }

// Rota para alteração de senha usando Firebase Auth
// Espera: { uid, senhaAtual, novaSenha }
// Nova rota de alteração de senha sem proteção por token
router.post('/change-password', async (req, res) => {
  const { uid, senhaAtual, novaSenha } = req.body;
  if (!uid || !senhaAtual || !novaSenha) {
    return res.status(400).json({ success: false, message: 'Dados incompletos.' });
  }

  try {
    // Apenas altera a senha do usuário pelo UID
    await admin.auth().updateUser(uid, { password: novaSenha });
    return res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    console.error('Erro ao alterar senha no Firebase:', err);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
});

export default router;
