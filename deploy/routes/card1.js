import express from 'express';
const router = express.Router();

// Rota /card1 - retorna valor e banco
router.get('/', (req, res) => {
  // Exemplo de resposta, ajuste conforme sua lógica
  res.json({ valor: 8.5, banco: 'Banco Exemplo' });
});

export default router;
