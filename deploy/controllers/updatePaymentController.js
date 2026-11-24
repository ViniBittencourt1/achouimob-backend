// backend/src/controllers/updatePaymentController.js

import { updatePaymentMethod } from '../services/stripe.js';

// Atualiza o método de pagamento do cliente Stripe já cadastrado
export async function handleUpdatePaymentMethod(req, res) {
  console.log("\n--- [CONTROLLER] Rota /update-payment ACESSADA ---");
  console.log("Payload recebido:", req.body);
  try {
    const { userId, paymentMethodId } = req.body;
    if (!userId || !paymentMethodId) {
      return res.status(400).json({ error: 'userId e paymentMethodId são obrigatórios.' });
    }
    const result = await updatePaymentMethod(userId, paymentMethodId);
    return res.status(200).json({
      message: 'Forma de pagamento atualizada com sucesso!',
      cardLast4: result.cardLast4,
      cardBrand: result.cardBrand,
      cardExpMonth: result.cardExpMonth,
      cardExpYear: result.cardExpYear
    });
  } catch (error) {
    console.error('❌ [CONTROLLER] ERRO na rota /update-payment:', error);
    return res.status(500).json({ error: 'Erro ao atualizar forma de pagamento', details: error.message });
  }
}
