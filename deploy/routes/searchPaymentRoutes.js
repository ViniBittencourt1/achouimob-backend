
import express from 'express';
import * as stripeModule from '../services/stripe.js';
const router = express.Router();

// POST /api/payments/cancel-subscription

// POST /api/payments/cancel-subscription
router.post('/api/payments/cancel-subscription', async (req, res) => {
  try {
    const { userId, previousPlan } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

    // Buscar dados do usuário no Firestore
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });
    const userData = userDoc.data();

    // Cancelar assinatura no Stripe se houver stripeSubscriptionId
    if (userData.stripeSubscriptionId) {
      try {
        await stripeModule.stripe.subscriptions.del(userData.stripeSubscriptionId);
      } catch (err) {
        console.error('Erro ao cancelar assinatura no Stripe:', err);
        // Continua para atualizar o status mesmo se der erro no Stripe
      }
    }

    // Atualizar status do usuário no Firestore
    await db.collection('users').doc(userId).set({
      subscriptionStatus: 'canceled',
      updatedAt: new Date(),
    }, { merge: true });

    res.json({ success: true, message: 'Assinatura cancelada com sucesso.' });
  } catch (err) {
    console.error('Erro ao cancelar assinatura:', err);
    res.status(500).json({ error: 'Erro ao cancelar assinatura', details: err && err.message });
  }
});

// GET /api/payments/payment-intent-card/:paymentIntentId
router.get('/api/payments/payment-intent-card/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    console.log('[payment-intent-card] paymentIntentId recebido:', paymentIntentId);
    if (!paymentIntentId) {
      console.log('[payment-intent-card] paymentIntentId não fornecido');
      return res.status(400).json({ error: 'paymentIntentId obrigatório' });
    }

    // Busca o PaymentIntent no Stripe
    const paymentIntent = await stripeModule.stripe.paymentIntents.retrieve(paymentIntentId);
    console.log('[payment-intent-card] paymentIntent retornado:', JSON.stringify(paymentIntent, null, 2));

    if (!paymentIntent) {
      console.log('[payment-intent-card] PaymentIntent não encontrado');
      return res.status(404).json({ error: 'PaymentIntent não encontrado' });
    }
    if (!paymentIntent.charges) {
      console.log('[payment-intent-card] PaymentIntent.charges ausente');
      return res.status(404).json({ error: 'Charges não encontradas no PaymentIntent' });
    }
    if (!paymentIntent.charges.data || !paymentIntent.charges.data.length) {
      console.log('[payment-intent-card] PaymentIntent.charges.data vazio:', paymentIntent.charges.data);
      return res.status(404).json({ error: 'Nenhuma charge encontrada no PaymentIntent' });
    }
    // Pega o último charge
    const charge = paymentIntent.charges.data[paymentIntent.charges.data.length - 1];
    console.log('[payment-intent-card] Última charge:', JSON.stringify(charge, null, 2));
    if (!charge.payment_method_details) {
      console.log('[payment-intent-card] charge.payment_method_details ausente');
      return res.status(404).json({ error: 'payment_method_details não encontrado na charge' });
    }
    if (!charge.payment_method_details.card) {
      console.log('[payment-intent-card] charge.payment_method_details.card ausente');
      return res.status(404).json({ error: 'Dados do cartão não encontrados' });
    }
    const card = charge.payment_method_details.card;
    console.log('[payment-intent-card] Dados do cartão extraídos:', card);
    res.json({
      last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      brand: card.brand
    });
  } catch (err) {
    console.error('Erro ao buscar PaymentIntent/card:', err);
    res.status(500).json({ error: 'Erro ao buscar dados do cartão', details: err && err.message });
  }
});

export default router;