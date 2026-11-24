import express from 'express';
import cors from 'cors';
import { getFirestore } from 'firebase-admin/firestore';
import userRoutes from './routes/userRoutes.js';
import updatePaymentRoutes from './routes/updatePaymentRoutes.js';
import card1Routes from './routes/card1.js';
import card2Routes from './routes/card2.js';
import tokenCleanupRoutes from './routes/tokenCleanupRoutes.js';
import searchAIRoutes from './api/searchAI.js';
import typesenseSearchRouter from './api/typesenseSearch.js';
import filtrosRoutes from './routes/filtros.js';

import './services/firebase.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

app.use('/user', userRoutes);
app.use('/update-payment', updatePaymentRoutes);
app.use('/card1', card1Routes);
app.use('/card2', card2Routes);
app.use('/api/token-cleanup', tokenCleanupRoutes);
app.use('/searchAI', searchAIRoutes);
app.use('/filtros', filtrosRoutes);

// Integração Typesense
app.use('/api', typesenseSearchRouter);

app.listen(PORT, () => {
  console.log(`Servidor backend deploy rodando na porta ${PORT}`);
});
