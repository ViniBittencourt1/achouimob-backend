// backend/src/controllers/paymentController.js

import { createSubscriptionWithTrial, createOneTimePayment, createSubscriptionNoTrial } from '../services/stripe.js';
// Função para ASSINATURA SEM TRIAL (Plano Mensal, cobrança imediata)
export async function handleSubscriptionNoTrial(req, res) {
  console.log("\n--- [CONTROLLER] Rota /subscribe-no-trial ACESSADA ---");
  try {
    const { userId, email, paymentMethodId, plan } = req.body;
    if (plan !== 'mensal') {
      return res.status(400).json({ error: 'Rota inválida para este plano.' });
    }
    console.log(`[CONTROLLER] Chamando createSubscriptionNoTrial para ${email}...`);
    const result = await createSubscriptionNoTrial(userId, email, paymentMethodId, plan);
    console.log(`[CONTROLLER] SUCESSO em createSubscriptionNoTrial. Enviando resposta 200.`);
    return res.status(200).json({ message: 'Assinatura criada sem trial!', data: result });
  } catch (error) {
    console.error('❌ [CONTROLLER] ERRO FATAL na rota /subscribe-no-trial:', error);
    return res.status(500).json({ error: 'Erro ao processar assinatura', details: error.message });
  }
}

// Função para ASSINATURAS (Plano Mensal)
export async function handleSubscription(req, res) {
  console.log("\n--- [CONTROLLER] Rota /subscribe ACESSADA ---");
  try {
    const { userId, email, paymentMethodId, plan } = req.body;
    if (plan !== 'mensal') {
      return res.status(400).json({ error: 'Rota inválida para este plano.' });
    }
    console.log(`[CONTROLLER] Chamando createSubscriptionWithTrial para ${email}...`);
    const result = await createSubscriptionWithTrial(userId, email, paymentMethodId, plan);
    console.log(`[CONTROLLER] SUCESSO em createSubscriptionWithTrial. Enviando resposta 200.`);
    return res.status(200).json({ message: 'Assinatura criada com sucesso!', data: result });
  } catch (error) {
    console.error('❌ [CONTROLLER] ERRO FATAL na rota /subscribe:', error);
    return res.status(500).json({ error: 'Erro ao processar assinatura', details: error.message });
  }
}

// Função para PAGAMENTO ÚNICO (Plano Anual)
export async function handleOneTimePayment(req, res) {
  console.log("\n--- [CONTROLLER] Rota /one-time ACESSADA ---");
  try {
    const { userId, email, paymentMethodId, plan } = req.body;
    if (plan !== 'anual') {
        return res.status(400).json({ error: 'Rota inválida para pagamento único.' });
    }
    console.log(`[CONTROLLER] Chamando createOneTimePayment para ${email}...`);
    const paymentIntent = await createOneTimePayment(userId, email, paymentMethodId, plan);
    console.log(`[CONTROLLER] SUCESSO em createOneTimePayment. Enviando resposta 200.`);
    return res.status(200).json({ message: 'Pagamento único realizado com sucesso!', data: { clientSecret: paymentIntent.client_secret } });
  } catch (error) {
    console.error('❌ [CONTROLLER] ERRO FATAL na rota /one-time:', error);
    return res.status(500).json({ error: 'Erro ao processar pagamento único', details: error.message });
  }
}