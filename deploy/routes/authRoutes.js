import express from 'express';
import admin from 'firebase-admin';


const router = express.Router();

// POST /api/auth/logout
// Remove o deviceId do usuário ao fazer logout


// POST /api/auth/logout
// Remove o deviceId do usuário ao fazer logout
// Nova rota de logout sem proteção por token
router.post('/logout', async (req, res) => {
  const { uid } = req.body;
  if (!uid) {
    return res.status(400).json({ status: 'error', error: 'UID não fornecido' });
  }
  try {
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ status: 'error', error: 'Usuário não encontrado' });
    }
    await userRef.update({ deviceId: admin.firestore.FieldValue.delete() });
    return res.json({ status: 'ok', message: 'Logout realizado e deviceId removido.' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Erro interno', details: err.message });
  }
});


// POST /api/auth/validate
// Permite login em apenas um dispositivo por vez usando deviceId
import { getFirestore } from 'firebase-admin/firestore';

// Nova rota de validação sem proteção por token
router.post('/validate', async (req, res) => {
  const { uid, deviceId } = req.body;
  if (!uid || !deviceId) {
    return res.status(400).json({ status: 'error', error: 'UID ou deviceId não fornecido' });
  }
  try {
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    // Se não há deviceId salvo, salva o atual
    if (!userData.deviceId) {
      await userRef.set({ deviceId }, { merge: true });
      return res.json({ status: 'ok', uid });
    }
    // Se o deviceId bate, permite login normalmente
    if (userData.deviceId === deviceId) {
      return res.json({ status: 'ok', uid });
    }
    // Se deviceId diferente, bloqueia login
    return res.status(403).json({ status: 'blocked', error: 'Login já realizado em outro dispositivo.' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Erro interno', details: err.message });
  }
});

export default router;
