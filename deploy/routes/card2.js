import express from 'express';
const router = express.Router();

// Rota /card2 - retorna total de imóveis disponíveis
router.get('/', (req, res) => {
  // Exemplo de resposta, ajuste conforme sua lógica
  res.json({ imoveisDisponiveis: 16757 });
});

export default router;
