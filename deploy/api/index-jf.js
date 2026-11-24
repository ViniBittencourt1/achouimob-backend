// backend/api/index-jf.js
import express from "express";
import cors from "cors";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { getCollectionAsMap } from "../src/services/firebase.js";
import { normalizeAndExpand } from "../_02utils/abbreviations.js";
import searchAIRouter from "./searchAI.js";
import { loadCard1 } from "./apiCard1.js";
import { saveImoveisDisponiveis } from "./apiCard2.js";

// ------------------------------
// 🔹 Inicialização do Express
// ------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// Rotas principais
// Exemplo: app.get('/card1', ...)
app.get('/card1', async (req, res) => {
  try {
    const card1 = cache.collections["Card1"] || [];
    // Retorna o primeiro card ou vazio
    res.json(card1[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar Card1' });
  }
});

app.get('/card2', async (req, res) => {
  try {
    // Lê o arquivo _card2.json
    const data = fs.readFileSync(card2Path, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar Card2' });
  }
});

// Outras rotas podem ser adicionadas aqui

// Exporta o app para uso no backend/index.js
export { app };
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
  if (!str) return "";
  return normalizeAndExpand(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ------------------------------
// 🔥 CACHE EM MEMÓRIA
// ------------------------------
const DEFAULT_COLLECTIONS = ["__imoveisPublicos"];
const cache = { loaded: false, collections: {} };

// ------------------------------
// 🔥 Carrega todas as coleções na memória
// ------------------------------
async function loadCache() {
  console.log("⏳ Carregando cache do Firestore...");

  for (const col of DEFAULT_COLLECTIONS) {
    try {
      const map = await getCollectionAsMap(col, "id");
      cache.collections[col] = [...map.values()].map((doc) => ({
        ...doc,
        collection: col,
      }));
      console.log(`✔️ Coleção '${col}' carregada: ${cache.collections[col].length} documentos`);
    } catch (err) {
      console.error(`❌ Erro ao carregar ${col}:`, err);
      cache.collections[col] = [];
    }
  }

  // ------------------------------
  // 🔹 Carregar Card1
  // ------------------------------
  try {
    const card1 = await loadCard1();
    cache.collections["Card1"] = card1;
    if (card1.length > 0) {
      console.log(`✔️ Coleção 'Card1' carregado com sucesso (${card1.length} registros)`);
    } else {
      console.log("⚠️ Coleção 'Card1' vazia");
    }
  } catch (err) {
    console.error("❌ Erro ao carregar Card1:", err.message);
    cache.collections["Card1"] = [];
  }

  // ------------------------------
  // 🔹 Salvar total de imóveis disponíveis em _card2.json
  // ------------------------------
  try {
    await saveImoveisDisponiveis(cache);
  } catch (err) {
    console.error("❌ Erro ao salvar total de imóveis:", err.message);
  }

  cache.loaded = true;
  console.log("🔥 Cache carregado com sucesso!");
}


// Exporta função utilitária para carregar cache, se necessário
export async function initJfCache() {
  await loadCache();
  return cache;
}
