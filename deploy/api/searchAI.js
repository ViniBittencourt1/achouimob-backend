
//backend/api/searchAI.js
import express from "express";
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeAndExpand, getAbbreviationList } from "../routes/abbreviations.js";

const router = express.Router();

// Middleware para logar se o CORS está ativo
router.use((req, res, next) => {
  res.setHeader('X-CORS-DEBUG', 'searchAI-router');
  console.log(`[CORS][searchAI] rota: ${req.method} ${req.originalUrl}`);
  next();
});
// O cache será injetado pelo index.js
// Removido: cache injetado

// ======================================================================
// NORMALIZAÇÃO E TOKENIZAÇÃO
// ======================================================================
function normalizeText(str) {
  return normalizeAndExpand(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(t => normalizeAndExpand(t));
}

// ======================================================================
// FILTRO TEXTUAL (TIPO + LOCALIZAÇÃO)
// ======================================================================
function filterDocs(docs, queryTokens) {
  if (!queryTokens.length) return docs;

  const tipoWords =
    getAbbreviationList("tipoImovel") ||
    ["casa", "apartamento", "kitnet", "cobertura", "ap"];

  const tipoQueryTokens = queryTokens.filter(t => tipoWords.includes(t));

  let filtered = docs;

  if (tipoQueryTokens.length) {
    filtered = filtered.filter(doc => {
      const tipoNorm = normalizeText(doc.tipoImovel || "");
      return tipoQueryTokens.some(t => tipoNorm.includes(t));
    });
  }

  const otherTokens = queryTokens.filter(t => !tipoWords.includes(t));

  for (const tok of otherTokens) {
    filtered = filtered.filter(doc => {
      const bairroNorm = normalizeText(doc.bairro || "");
      const locNorm = normalizeText(doc.localizacao || "");
      const tituloNorm = normalizeText(doc.titulo || "");
      return (
        bairroNorm.includes(tok) ||
        locNorm.includes(tok) ||
        tituloNorm.includes(tok)
      );
    });
  }

  return filtered;
}

// ======================================================================
// SCORE DE RELEVÂNCIA
// ======================================================================
function calculateScore(query, doc) {
  if (!query) return 0;

  let score = 0;
  const queryNorm = normalizeText(query);
  const tokens = tokenize(query);

  const title = normalizeText(doc.titulo || "");
  const tipo = normalizeText(doc.tipoImovel || "");
  const bairro = normalizeText(doc.bairro || "");

  if (title.includes(queryNorm)) score += 2;
  if (tipo.includes(queryNorm)) score += 1;
  if (bairro.includes(queryNorm)) score += 1;

  tokens.forEach(t => {
    if (title.includes(t)) score += 0.4;
    if (tipo.includes(t)) score += 0.2;
    if (bairro.includes(t)) score += 0.2;
  });

  return Number(score.toFixed(2));
}

// ======================================================================
// ROTA PRINCIPAL DE BUSCA
// ======================================================================
// Middleware para garantir que o cache foi injetado
// Removido: middleware do cache

router.post("/", async (req, res) => {
  try {
    const { query = "", collections, filtros = {} } = req.body;
    const hasFilters = Object.values(filtros).some(v => v);
    const hasQuery = query && query.trim().length >= 3;
    if (!hasQuery && !hasFilters) {
      return res.json({ results: [] });
    }
    const tokens = hasQuery ? tokenize(query) : [];
    const db = getFirestore();
    let results = [];
    try {
      const snapshot = await db.collection("__imoveisPublicos").get();
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // ATIVOS
      const ativos = docs.filter(
        d => !d.dataExclusao || d.dataExclusao === ""
      );
      // FILTROS ESTRUTURAIS
      let estruturais = ativos.filter(doc => {
        if (filtros.tipo) {
          if (
            !normalizeText(doc.tipoImovel || "").includes(
              normalizeText(filtros.tipo)
            )
          ) return false;
        }
        if (filtros.bairro) {
          if (
            normalizeText(doc.bairro || "") !==
            normalizeText(filtros.bairro)
          ) return false;
        }
        if (filtros.dormitorios) {
          if (Number(doc.dormitorioValor) !== Number(filtros.dormitorios))
            return false;
        }
        if (filtros.banheiros) {
          if (Number(doc.banheiroValor) !== Number(filtros.banheiros))
            return false;
        }
        if (filtros.garagens) {
          if (Number(doc.garagemValor) !== Number(filtros.garagens))
            return false;
        }
        if (filtros.valorMin) {
          if (Number(doc.valor) < Number(filtros.valorMin))
            return false;
        }
        if (filtros.valorMax) {
          if (Number(doc.valor) > Number(filtros.valorMax))
            return false;
        }
        return true;
      });
      // FILTRO TEXTUAL
      const filtradosTexto = hasQuery
        ? filterDocs(estruturais, tokens)
        : estruturais;
      // SCORE + RESULTADOS
      for (const doc of filtradosTexto) {
        results.push({
          ...doc,
          crawler: "__IMOVEISPUBLICOS",
          score: calculateScore(query, doc),
        });
      }
    } catch (err) {
      // ignora erro de coleção
    }
    results.sort((a, b) => b.score - a.score);
    res.json({ results });
  } catch (err) {
    console.error("❌ ERRO SEARCH AI:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ======================================================================
// TIPOS DE IMÓVEL
// ======================================================================
router.get("/tipos-imovel", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("__brTipoImovel").get();
    const tipos = snapshot.docs
      .map(doc => {
        const nome = doc.data().nome;
        const slug = doc.id;
        if (typeof nome === 'string' && nome.trim().length > 0) {
          return { nome: nome.trim(), slug };
        }
        return null;
      })
      .filter(t => t && typeof t.nome === 'string' && t.nome.length > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    console.log('[TIPOS-IMOVEL DEBUG]', tipos);
    res.json(tipos);
  } catch (err) {
    console.error("Erro tipos-imovel:", err);
    res.status(500).json([]);
  }
});
// ======================================================================
// CIDADES ÚNICAS DE __imoveisPublicos
// ======================================================================
import fs from "fs";
router.get("/cidades", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("__cidadesUnicas").get();
    const nomesCidades = snapshot.docs
      .map(doc => doc.data().nome)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    res.json(nomesCidades);
  } catch (err) {
    console.error("Erro cidades:", err);
    res.status(500).json([]);
  }
});

// ======================================================================
// BAIRROS
// ======================================================================
router.get("/bairros", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("__bairrosUnicos").get();
    const set = new Set();
    snapshot.docs.forEach(doc => {
      const bairro = (doc.data().bairro || "").trim();
      if (bairro.length > 1) set.add(bairro.charAt(0).toUpperCase() + bairro.slice(1));
    });
    const bairros = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    res.json(bairros);
  } catch (err) {
    console.error("Erro bairros:", err);
    res.status(500).json([]);
  }
});

// ======================================================================
// DORMITÓRIOS
// ======================================================================
router.get("/dormitorios", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("_brDormitorio").get();
    const set = new Set();
    snapshot.docs.forEach(doc => {
      const n = Number(doc.data().dormitorioValor);
      if (!isNaN(n) && n > 0) set.add(n);
    });
    res.json([...set].sort((a, b) => a - b));
  } catch (err) {
    console.error("Erro dormitórios:", err);
    res.status(500).json([]);
  }
});

// ======================================================================
// BANHEIROS
// ======================================================================
router.get("/banheiros", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("_brBanheiro").get();
    const set = new Set();
    snapshot.docs.forEach(doc => {
      const n = Number(doc.data().banheiroValor);
      if (!isNaN(n) && n > 0) set.add(n);
    });
    res.json([...set].sort((a, b) => a - b));
  } catch (err) {
    console.error("Erro banheiros:", err);
    res.status(500).json([]);
  }
});

// ======================================================================
// GARAGENS
// ======================================================================
router.get("/garagens", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("_brVaga").get();
    const set = new Set();
    snapshot.docs.forEach(doc => {
      const n = Number(doc.data().garagemValor);
      if (!isNaN(n) && n > 0) set.add(n);
    });
    res.json([...set].sort((a, b) => a - b));
  } catch (err) {
    console.error("Erro garagens:", err);
    res.status(500).json([]);
  }
});

export default router;