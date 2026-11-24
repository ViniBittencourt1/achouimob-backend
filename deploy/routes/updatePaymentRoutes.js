// backend/src/routes/updatePaymentRoutes.js

import express from 'express';
import { handleUpdatePaymentMethod } from '../controllers/updatePaymentController.js';

const router = express.Router();

router.post('/update-payment', handleUpdatePaymentMethod);

export default router;
