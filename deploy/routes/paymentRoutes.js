// backend/src/routes/paymentRoutes.js



import express from 'express';
import { handleSubscription, handleOneTimePayment, handleSubscriptionNoTrial } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/subscribe', handleSubscription);
router.post('/one-time', handleOneTimePayment);

// Nova rota para assinatura mensal sem trial
router.post('/subscribe-no-trial', handleSubscriptionNoTrial);

export default router;