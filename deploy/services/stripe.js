// backend/src/services/stripe.js

export { stripe };
// =================================================
// FUNÇÃO PARA ASSINATURA SEM TRIAL (PLANO MENSAL, cobrança imediata)
// =================================================
export async function createSubscriptionNoTrial(userId, email, paymentMethodId, plan) {
  const db = getFirestore();
  console.log("[SERVICE] Dentro de createSubscriptionNoTrial...");

  try {
    console.log(`[SERVICE] 1. Criando cliente no Stripe para ${email}...`);
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    console.log(`[SERVICE] ✅ Cliente Stripe criado: ${customer.id}`);

    console.log(`[SERVICE] 2. Criando assinatura no Stripe (sem trial)...`);
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PLANS.mensal }],
      trial_period_days: 0,
      expand: ['latest_invoice.payment_intent'],
    });
    console.log(`[SERVICE] ✅ Assinatura Stripe criada: ${subscription.id}`);

    // Extrair dados do cartão do PaymentIntent ou PaymentMethod
    let cardLast4 = null, cardBrand = null, cardExpMonth = null, cardExpYear = null;
    try {
      const paymentIntent = subscription.latest_invoice?.payment_intent;
      const charges = paymentIntent?.charges?.data;
      if (charges && charges.length > 0) {
        const charge = charges[charges.length - 1];
        const card = charge.payment_method_details?.card;
        if (card) {
          cardLast4 = card.last4;
          cardBrand = card.brand;
          cardExpMonth = card.exp_month;
          cardExpYear = card.exp_year;
        }
      }
      // Se não encontrou, buscar do PaymentMethod
      if (!cardLast4 && paymentMethodId) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (paymentMethod && paymentMethod.card) {
          cardLast4 = paymentMethod.card.last4;
          cardBrand = paymentMethod.card.brand;
          cardExpMonth = paymentMethod.card.exp_month;
          cardExpYear = paymentMethod.card.exp_year;
        }
      }
    } catch (e) {
      console.warn('[SERVICE] Não foi possível extrair dados do cartão:', e);
    }

    console.log(`[SERVICE] 3. Atualizando Firestore...`);
    await db.collection('users').doc(userId).set({
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      plan: plan,
      subscriptionStatus: subscription.status,
      trialEnd: null,
      updatedAt: new Date(),
      cardLast4,
      cardBrand,
      cardExpMonth,
      cardExpYear
    }, { merge: true });
    console.log(`[SERVICE] ✅ Firestore atualizado para o usuário ${userId}.`);

    return subscription;
  } catch (error) {
      console.error("❌ [SERVICE] ERRO em createSubscriptionNoTrial:", error);
      throw error;
  }
}

// Atualiza o método de pagamento do cliente Stripe já cadastrado
export async function updatePaymentMethod(userId, paymentMethodId) {
  const db = getFirestore();
  try {
    // Buscar stripeCustomerId do usuário
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new Error('Usuário não encontrado no Firestore');
    const userData = userDoc.data();
    if (!userData.stripeCustomerId) throw new Error('stripeCustomerId não encontrado para o usuário');

    // Atualizar método de pagamento padrão no Stripe
    await stripe.customers.update(userData.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Buscar dados do cartão
    let cardLast4 = null, cardBrand = null, cardExpMonth = null, cardExpYear = null;
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod && paymentMethod.card) {
      cardLast4 = paymentMethod.card.last4;
      cardBrand = paymentMethod.card.brand;
      cardExpMonth = paymentMethod.card.exp_month;
      cardExpYear = paymentMethod.card.exp_year;
    }

    // Atualizar Firestore
    await db.collection('users').doc(userId).set({
      lastPaymentMethodId: paymentMethodId,
      cardLast4,
      cardBrand,
      cardExpMonth,
      cardExpYear,
      updatedAt: new Date(),
    }, { merge: true });

    return { stripeCustomerId: userData.stripeCustomerId, paymentMethodId, cardLast4, cardBrand, cardExpMonth, cardExpYear };
  } catch (error) {
    throw error;
  }
}
// backend/src/services/stripe.js

import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';

// ✅ LOG 1: VERIFICANDO A CHAVE DE API
console.log("\n--- [SERVICE] Inicializando serviço do Stripe ---");
if (process.env.STRIPE_SECRET_KEY) {
    console.log("[SERVICE] ✅ Chave STRIPE_SECRET_KEY encontrada!");
} else {
    console.error("[SERVICE] ❌ ERRO CRÍTICO: Chave STRIPE_SECRET_KEY NÃO encontrada em process.env!");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  mensal: "price_1SrPbSFpEO4WSMTjr2CX1Rqa",
  anual: "price_1SrPb5FpEO4WSMTjejNkzTM5",
};

// =================================================
// FUNÇÃO PARA ASSINATURAS (PLANO MENSAL)
// =================================================
export async function createSubscriptionWithTrial(userId, email, paymentMethodId, plan) {
  const db = getFirestore();
  console.log("[SERVICE] Dentro de createSubscriptionWithTrial...");

  try {
    console.log(`[SERVICE] 1. Criando cliente no Stripe para ${email}...`);
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    console.log(`[SERVICE] ✅ Cliente Stripe criado: ${customer.id}`);

    console.log(`[SERVICE] 2. Criando assinatura no Stripe...`);
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PLANS.mensal }],
      trial_period_days: 7,
      expand: ['latest_invoice.payment_intent'],
    });
    console.log(`[SERVICE] ✅ Assinatura Stripe criada: ${subscription.id}`);

    // Extrair dados do cartão do PaymentIntent ou PaymentMethod
    let cardLast4 = null, cardBrand = null, cardExpMonth = null, cardExpYear = null;
    try {
      const paymentIntent = subscription.latest_invoice?.payment_intent;
      const charges = paymentIntent?.charges?.data;
      if (charges && charges.length > 0) {
        const charge = charges[charges.length - 1];
        const card = charge.payment_method_details?.card;
        if (card) {
          cardLast4 = card.last4;
          cardBrand = card.brand;
          cardExpMonth = card.exp_month;
          cardExpYear = card.exp_year;
        }
      }
      // Se não encontrou, buscar do PaymentMethod
      if (!cardLast4 && paymentMethodId) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (paymentMethod && paymentMethod.card) {
          cardLast4 = paymentMethod.card.last4;
          cardBrand = paymentMethod.card.brand;
          cardExpMonth = paymentMethod.card.exp_month;
          cardExpYear = paymentMethod.card.exp_year;
        }
      }
    } catch (e) {
      console.warn('[SERVICE] Não foi possível extrair dados do cartão:', e);
    }

    console.log(`[SERVICE] 3. Atualizando Firestore...`);
    await db.collection('users').doc(userId).set({
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      plan: plan,
      subscriptionStatus: subscription.status,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      updatedAt: new Date(),
      cardLast4,
      cardBrand,
      cardExpMonth,
      cardExpYear
    }, { merge: true });
    console.log(`[SERVICE] ✅ Firestore atualizado para o usuário ${userId}.`);

    return subscription;
  } catch (error) {
      console.error("❌ [SERVICE] ERRO em createSubscriptionWithTrial:", error);
      throw error; // Re-lança o erro para o controller capturar
  }
}

// =================================================
// FUNÇÃO PARA PAGAMENTO ÚNICO (PLANO ANUAL)
// =================================================
export async function createOneTimePayment(userId, email, paymentMethodId, plan) {
  const db = getFirestore();
  console.log("[SERVICE] Dentro de createOneTimePayment...");

  try {
    console.log(`[SERVICE] 1. Criando cliente no Stripe para ${email}...`);
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    console.log(`[SERVICE] ✅ Cliente Stripe criado: ${customer.id}`);

    console.log(`[SERVICE] 2. Criando PaymentIntent no Stripe...`);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 57500,
      currency: 'brl',
      customer: customer.id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
    });
    console.log(`[SERVICE] ✅ PaymentIntent Stripe criado: ${paymentIntent.id}, Status: ${paymentIntent.status}`);

    if (paymentIntent.status !== 'succeeded') {
        throw new Error(`Falha no pagamento. Status do PaymentIntent: ${paymentIntent.status}`);
    }

    console.log(`[SERVICE] 3. Atualizando Firestore...`);
    // Extrair dados do cartão do PaymentIntent ou PaymentMethod
    let cardLast4 = null, cardBrand = null, cardExpMonth = null, cardExpYear = null;
    try {
      const charges = paymentIntent?.charges?.data;
      if (charges && charges.length > 0) {
        const charge = charges[charges.length - 1];
        const card = charge.payment_method_details?.card;
        if (card) {
          cardLast4 = card.last4;
          cardBrand = card.brand;
          cardExpMonth = card.exp_month;
          cardExpYear = card.exp_year;
        }
      }
      // Se não encontrou, buscar do PaymentMethod
      if (!cardLast4 && paymentMethodId) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (paymentMethod && paymentMethod.card) {
          cardLast4 = paymentMethod.card.last4;
          cardBrand = paymentMethod.card.brand;
          cardExpMonth = paymentMethod.card.exp_month;
          cardExpYear = paymentMethod.card.exp_year;
        }
      }
    } catch (e) {
      console.warn('[SERVICE] Não foi possível extrair dados do cartão:', e);
    }

    await db.collection('users').doc(userId).set({
      stripeCustomerId: customer.id,
      plan: plan,
      subscriptionStatus: 'active',
      paymentType: 'one_time',
      lastPaymentIntentId: paymentIntent.id,
      updatedAt: new Date(),
      cardLast4,
      cardBrand,
      cardExpMonth,
      cardExpYear
    }, { merge: true });
    console.log(`[SERVICE] ✅ Firestore atualizado para o usuário ${userId}.`);

    return paymentIntent;
  } catch (error) {
      console.error("❌ [SERVICE] ERRO em createOneTimePayment:", error);
      throw error; // Re-lança o erro para o controller capturar
  }
}