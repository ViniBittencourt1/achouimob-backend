// backend/src/routes/userRoutes.js

import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();

// GET /api/user/:uid
router.get('/:uid', async (req, res) => {
  const { uid } = req.params;
  if (!uid) {
    return res.status(400).json({ status: 'error', error: 'UID não fornecido' });
  }
  try {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ status: 'not_found', error: 'Usuário não encontrado' });
    }
    const data = userDoc.data();
    res.json({
      status: 'ok',
      user: {
        createdAt: data.createdAt || null,
        creci: data.creci || '',
        email: data.email || '',
        name: data.name || '',
        plan: data.plan || '',
        stripeCustomerId: data.stripeCustomerId || '',
        stripeSubscriptionId: data.stripeSubscriptionId || '',
        subscriptionStatus: data.subscriptionStatus || '',
        trialEnd: data.trialEnd || null,
        updatedAt: data.updatedAt || null
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Erro ao buscar usuário', details: err.message });
  }
});

export default router;
