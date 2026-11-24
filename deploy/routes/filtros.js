import express from 'express';
import searchAIRoutes from '../api/searchAI.js';

const router = express.Router();

// Redireciona /filtros/bairros para /searchAI/bairros
router.get('/bairros', (req, res, next) => {
  req.url = '/bairros';
  searchAIRoutes.handle(req, res, next);
});

router.get('/garagens', (req, res, next) => {
  req.url = '/garagens';
  searchAIRoutes.handle(req, res, next);
});

router.get('/dormitorios', (req, res, next) => {
  req.url = '/dormitorios';
  searchAIRoutes.handle(req, res, next);
});

router.get('/banheiros', (req, res, next) => {
  req.url = '/banheiros';
  searchAIRoutes.handle(req, res, next);
});

router.get('/tiposimovel', (req, res, next) => {
  req.url = '/tipos-imovel';
  searchAIRoutes.handle(req, res, next);
});

export default router;
