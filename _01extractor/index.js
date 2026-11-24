// ...existing code...
import express from 'express';
import cors from 'cors';
import { getFirestore } from 'firebase-admin/firestore';
import paymentRoutes from './routes/paymentRoutes.js';
import searchPaymentRoutes from './routes/searchPaymentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import changePasswordRoute from './routes/changePassword.js';
import userRoutes from './routes/userRoutes.js';

import tokenCleanupRoutes from './routes/tokenCleanupRoutes.js';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import searchAIRouter from '../api/searchAI.js';

import './services/firebase.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'https://fifty50.com.br',
    'https://raspagemimoveis.onrender.com',
    'https://www.fifty50.com.br'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Garantir que o CORS está antes de todas as rotas
app.use(express.json());

// ------------------------------
// 🔹 Endpoint para tipos de imóvel direto do Firestore
// ------------------------------
app.get('/filtros/tiposimovel', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('_brTipoImovel').get();
    console.log('TiposImovel encontrados:', snapshot.size);
    const tipos = snapshot.docs.map(doc => doc.data());
    res.json(tipos);
  } catch (err) {
    console.error('Erro ao buscar tiposImovel:', err);
    res.status(500).json([]);
  }
});

// ------------------------------
// 🔹 Endpoint para bairros direto do Firestore
// ------------------------------
app.get('/filtros/bairros', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('_jfBairro').get();
    console.log('Bairros encontrados:', snapshot.size);
    const bairros = snapshot.docs.map(doc => doc.data());
    res.json(bairros);
  } catch (err) {
    console.error('Erro ao buscar bairros:', err);
    res.status(500).json([]);
  }
});

// ------------------------------
// 🔹 Endpoint para dormitórios direto do Firestore
// ------------------------------
app.get('/filtros/dormitorios', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('_brDormitorio').get();
    console.log('Dormitórios encontrados:', snapshot.size);
    const dormitorios = snapshot.docs.map(doc => doc.data());
    res.json(dormitorios);
  } catch (err) {
    console.error('Erro ao buscar dormitórios:', err);
    res.status(500).json([]);
  }
});

// ------------------------------
// 🔹 Endpoint para banheiros direto do Firestore
// ------------------------------
app.get('/filtros/banheiros', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('_brBanheiro').get();
    console.log('Banheiros encontrados:', snapshot.size);
    const banheiros = snapshot.docs.map(doc => doc.data());
    res.json(banheiros);
  } catch (err) {
    console.error('Erro ao buscar banheiros:', err);
    res.status(500).json([]);
  }
});

// ------------------------------
// 🔹 Endpoint para garagens direto do Firestore
// ------------------------------
app.get('/filtros/garagens', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('_brVaga').get();
    console.log('Vagas encontradas:', snapshot.size);
    const garagens = snapshot.docs.map(doc => doc.data());
    res.json(garagens);
  } catch (err) {
    console.error('Erro ao buscar garagens:', err);
    res.status(500).json([]);
  }
});

// ------------------------------
// 🔹 Endpoint para cidades direto do Firestore
// ------------------------------
app.get('/filtros/cidades', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('_brCidade').get();
    console.log('Cidades encontradas:', snapshot.size);
    const cidades = snapshot.docs.map(doc => doc.data());
    res.json(cidades);
  } catch (err) {
    console.error('Erro ao buscar cidades:', err);
    res.status(500).json([]);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Servidor LensImob Online' });
});

// Centralização de todas as rotas em um único app Express
app.use('/api/payments', paymentRoutes);
// app.use('/api/payments', updatePaymentRoutes); // rota removida
// Rotas de busca de cartão/paymentIntent (CommonJS export)
app.use('/', searchPaymentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', changePasswordRoute);
app.use('/api/user', userRoutes);
app.use('/api/token-cleanup', tokenCleanupRoutes);

// ------------------------------
// 🔹 Caminho do arquivo _card2.json
// ------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const card2Path = join(__dirname, '..', 'crawler', '_card2.json');

// ------------------------------
// 🔹 Função de normalização robusta
// ------------------------------
function normalizeAndClean(str) {
  if (!str) return '';
  return normalizeAndExpand(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// ------------------------------
// 🔥 CACHE EM MEMÓRIA
// ------------------------------
// ...cache removido...

// ------------------------------
// 🔹 Rotas de busca AI
// ------------------------------

app.use('/searchAI', searchAIRouter);

// ------------------------------
// 🔹 Endpoint de busca tradicional
// ------------------------------
app.post('/search', async (req, res) => {
  const { query, collections } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query não fornecida' });
  }
  const qWords = normalizeAndClean(query).split(/\s+/);
  const cols = collections?.length ? collections : [
    'jfACasas', 'jfInvest', 'jfRemax', 'jfSouzaGomes', 'jfRibeiroArrabal',
    'jfRVNegocios', 'jfAlmar', 'jfEuro', 'jfAna', 'jfAlicerce', 'jfUniversal',
    'jfLocato', 'jfClientt', 'jfSelect', 'jfNogueira', 'jfNegociar', 'jfRedentor',
    'jfToronto', 'jfBomClima', 'jfAcervo', 'jfMasson', 'jfEstrelaSul', 'jfLocal',
    'jfLider', 'jfDecisao', 'jfSoares', 'jfToc2', 'jfJeferson', 'jfOliveira',
    'jfSouzaRocha', 'jfBellos', 'jfAntonioDias', 'jfJfImovel'
  ];
  const db = getFirestore();
  let results = [];
  for (const col of cols) {
    try {
      const snapshot = await db.collection(col).get();
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, collection: col }));
      const filtrados = docs.filter((data) => {
        const docText = normalizeAndClean(
          (data.titulo || '') + ' ' + (data.tipoImovel || '') + ' ' + (data.localizacao || '') + ' ' + (data.bairro || '') + ' ' + (data.preco || '') + ' ' + (data.codigoBase || '')
        );
        return qWords.every((w) => docText.includes(w));
      });
      results = results.concat(filtrados);
      console.log(`Coleção ${col}: ${filtrados.length} documentos encontrados`);
    } catch (err) {
      console.error(`Erro ao buscar coleção ${col}:`, err);
    }
  }
  res.json({ results });
});

// ------------------------------
// 🔹 Endpoint /card1
// ------------------------------
app.get('/card1', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('Card1').get();
    const card = snapshot.docs.map(doc => doc.data());
    if (card && card.length > 0) {
      res.json(card[0]);
    } else {
      res.status(404).json({ error: 'Card1 vazio' });
    }
  } catch (err) {
    res.status(500).json({
      error: 'Erro ao carregar Card1',
      details: err.message,
    });
  }
});

// ------------------------------
// 🔹 Endpoint /card2
// ------------------------------
app.get('/card2', async (req, res) => {
  try {
    let card2Data = {};
    if (fs.existsSync(card2Path)) {
      const raw = fs.readFileSync(card2Path, 'utf-8');
      if (raw.trim()) {
        card2Data = JSON.parse(raw);
      }
    }
    // Busca coleções do Firestore
    const db = getFirestore();
    const collections = {};
    const colNames = [
      'jfACasas', 'jfInvest', 'jfRemax', 'jfSouzaGomes', 'jfRibeiroArrabal',
      'jfRVNegocios', 'jfAlmar', 'jfEuro', 'jfAna', 'jfAlicerce', 'jfUniversal',
      'jfLocato', 'jfClientt', 'jfSelect', 'jfNogueira', 'jfNegociar', 'jfRedentor',
      'jfToronto', 'jfBomClima', 'jfAcervo', 'jfMasson', 'jfEstrelaSul', 'jfLocal',
      'jfLider', 'jfDecisao', 'jfSoares', 'jfToc2', 'jfJeferson', 'jfOliveira',
      'jfSouzaRocha', 'jfBellos', 'jfAntonioDias', 'jfJfImovel'
    ];
    for (const col of colNames) {
      try {
        const snapshot = await db.collection(col).get();
        collections[col] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      } catch (err) {
        collections[col] = [];
      }
    }
    card2Data.collections = collections;
    res.json(card2Data);
  } catch (err) {
    console.error('❌ Erro na rota /card2:', err.message);
    res.status(500).json({ error: 'Erro ao buscar Card2' });
  }
});

app.listen(PORT, () => {
  console.log('Servidor rodando na porta ' + PORT);
});