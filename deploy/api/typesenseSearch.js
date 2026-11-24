// Endpoint de busca de imóveis usando Typesense Cloud

import express from 'express';
import Typesense from 'typesense';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar mapeamentos de bairro, cidade e tipoImovel
const bairros = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_03database/filtros/_jfBairros.json'), 'utf-8'));
const cidades = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_03database/filtros/_brCidades.json'), 'utf-8'));
const tiposImovel = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_03database/filtros/_brTipoImovel.json'), 'utf-8'));

// Funções utilitárias para mapear slug para nome
function getBairroNome(slug) {
  const found = bairros.find(b => b.slug === slug);
  return found ? found.nome : slug;
}
function getCidadeNome(slug) {
  const found = cidades.find(c => c.slug === slug);
  return found ? found.nome : slug;
}
function getTipoImovelNome(slug) {
  // tiposImovel.tiposFiltro pode ter vários arrays, mas vamos tentar pelo tiposPorSlug
  if (tiposImovel.tiposPorSlug && tiposImovel.tiposPorSlug[slug]) {
    // Pega o primeiro nome associado ao slug
    return tiposImovel.tiposPorSlug[slug][0]?.nome || slug;
  }
  // fallback: procurar em todos os arrays
  for (const tipoArr of Object.values(tiposImovel.tiposFiltro || {})) {
    const found = tipoArr.find(t => t.slug === slug);
    if (found) return found.nome;
  }
  return slug;
}

const router = express.Router();

const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'wc9sthl3xe6ykq8ip-1.a2.typesense.net',
      port: Number(process.env.TYPESENSE_PORT || 443),
      protocol: process.env.TYPESENSE_PROTOCOL || 'https',
    },
  ],
  apiKey: process.env.TYPESENSE_API_KEY || 'JLsCS0EwEUHcl7zCKJOg7DTmdukGf3aZ',
  connectionTimeoutSeconds: 10,
});

// Busca principal

router.get('/imoveis/search', async (req, res) => {
  const {
    query = '',
    cidade,
    bairro,
    tipoImovel,
    minPreco,
    maxPreco,
    dormitorios,
    banheiros,
    garagens,
    page = 1,
    perPage = 20
  } = req.query;
  console.log('[API] /imoveis/search chamada', {
    page,
    perPage,
    query,
    cidade,
    bairro,
    tipoImovel
  });

  let filterBy = [];
  // Se múltiplas cidades e bairro, faz OR de pares cidade+bairro
  if (cidade && bairro && cidade.includes(',')) {
    // cidade pode ser string separada por vírgula ou array
    let cidadesArr = Array.isArray(cidade) ? cidade : cidade.split(',');
    let orPairs = cidadesArr.map(c => `(cidade:=${c.trim()} && bairro:=${bairro})`).join(' || ');
    filterBy.push(orPairs);
  } else {
    if (cidade) filterBy.push(`cidade:=[${cidade}]`);
    if (bairro) filterBy.push(`bairro:=[${bairro}]`);
  }
  if (tipoImovel) filterBy.push(`tipoImovel:=[${tipoImovel}]`);
  if (minPreco) filterBy.push(`preco:>=${minPreco}`);
  if (maxPreco) filterBy.push(`preco:<=${maxPreco}`);
  // Filtros de dormitórios, banheiros e garagens (maior ou igual)
  if (dormitorios) filterBy.push(`dormitorioValor:>=${dormitorios}`);
  if (banheiros) filterBy.push(`banheiroValor:>=${banheiros}`);
  if (garagens) filterBy.push(`garagemValor:>=${garagens}`);

  try {
    const searchParams = {
      q: query || '*',
      query_by: 'titulo,bairro,cidade,tipoImovel',
      filter_by: filterBy.join(' && '),
      sort_by: 'preco:asc',
      page: Number(page),
      per_page: Number(perPage)
    };
    const result = await typesenseClient.collections('imoveis').documents().search(searchParams);
    // Adicionar nome de bairro, cidade e tipoImovel em cada hit
    if (result && result.hits) {
      result.hits = result.hits.map(hit => {
        const doc = hit.document;
        return {
          ...hit,
          document: {
            ...doc,
            bairro_nome: doc.bairro ? getBairroNome(doc.bairro) : undefined,
            cidade_nome: doc.cidade ? getCidadeNome(doc.cidade) : undefined,
            tipoImovel_nome: doc.tipoImovel ? getTipoImovelNome(doc.tipoImovel) : undefined
          }
        };
      });
    }
    res.json(result);
  } catch (err) {
    console.error('Erro na busca Typesense:', err);
    res.status(500).json({ error: 'Erro na busca Typesense', details: err.message });
  }
});

// Rotas de filtros
router.get('/imoveis/cidade', async (req, res) => {
  console.log('[API] /imoveis/cidade chamada');
  try {
    const result = await typesenseClient.collections('imoveis').documents().search({
      q: '*',
      query_by: 'cidade',
      per_page: 250
    });
    const cidadesUnicas = [...new Set(result.hits.map(hit => hit.document.cidade).filter(Boolean))];
    // Mapear para { slug, nome }
    const cidadesComNome = cidadesUnicas.map(slug => ({
      slug,
      nome: getCidadeNome(slug)
    }));
    res.json(cidadesComNome);
  } catch (err) {
    console.error('[ERRO] /imoveis/cidade:', err);
    res.status(500).json({ error: 'Erro ao buscar cidade', details: err.message });
  }
});

router.get('/imoveis/bairro', async (req, res) => {
  console.log('[API] /imoveis/bairro chamada');
  try {
    const result = await typesenseClient.collections('imoveis').documents().search({
      q: '*',
      query_by: 'bairro',
      per_page: 250
    });
    const bairrosUnicos = [...new Set(result.hits.map(hit => hit.document.bairro).filter(Boolean))];
    // Mapear para { slug, nome }
    const bairrosComNome = bairrosUnicos.map(slug => ({
      slug,
      nome: getBairroNome(slug)
    }));
    res.json(bairrosComNome);
  } catch (err) {
    console.error('[ERRO] /imoveis/bairro:', err);
    res.status(500).json({ error: 'Erro ao buscar bairro', details: err.message });
  }
});

router.get('/imoveis/garagemValor', async (req, res) => {
  console.log('[API] /imoveis/garagemValor chamada');
  try {
    const result = await typesenseClient.collections('imoveis').documents().search({
      q: '*',
      facet_by: 'garagemValor',
      per_page: 250
    });
    const garagemValor = result.facet_counts?.[0]?.counts.map(c => Number(c.value)) || [];
    res.json(garagemValor);
  } catch (err) {
    console.error('[ERRO] /imoveis/garagemValor:', err);
    res.status(500).json({ error: 'Erro ao buscar garagemValor', details: err.message });
  }
});

router.get('/imoveis/banheiroValor', async (req, res) => {
  console.log('[API] /imoveis/banheiroValor chamada');
  try {
    const result = await typesenseClient.collections('imoveis').documents().search({
      q: '*',
      facet_by: 'banheiroValor',
      per_page: 250
    });
    const banheiroValor = result.facet_counts?.[0]?.counts.map(c => Number(c.value)) || [];
    res.json(banheiroValor);
  } catch (err) {
    console.error('[ERRO] /imoveis/banheiroValor:', err);
    res.status(500).json({ error: 'Erro ao buscar banheiroValor', details: err.message });
  }
});

router.get('/imoveis/dormitorioValor', async (req, res) => {
  console.log('[API] /imoveis/dormitorioValor chamada');
  try {
    const result = await typesenseClient.collections('imoveis').documents().search({
      q: '*',
      facet_by: 'dormitorioValor',
      per_page: 250
    });
    const dormitorioValor = result.facet_counts?.[0]?.counts.map(c => Number(c.value)) || [];
    res.json(dormitorioValor);
  } catch (err) {
    console.error('[ERRO] /imoveis/dormitorioValor:', err);
    res.status(500).json({ error: 'Erro ao buscar dormitorioValor', details: err.message });
  }
});

router.get('/imoveis/tipoImovel', async (req, res) => {
  console.log('[API] /imoveis/tipoImovel chamada');
  try {
    const result = await typesenseClient.collections('imoveis').documents().search({
      q: '*',
      query_by: 'tipoImovel',
      per_page: 250
    });
    const tiposUnicos = [...new Set(result.hits.map(hit => hit.document.tipoImovel).filter(Boolean))];
    // Mapear para { slug, nome }
    const tiposComNome = tiposUnicos.map(slug => ({
      slug,
      nome: getTipoImovelNome(slug)
    }));
    res.json(tiposComNome);
  } catch (err) {
    console.error('[ERRO] /imoveis/tipoImovel:', err);
    res.status(500).json({ error: 'Erro ao buscar tipoImovel', details: err.message });
  }
});

export default router;
