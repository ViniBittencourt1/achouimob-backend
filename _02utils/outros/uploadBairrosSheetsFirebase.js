import { backendRoot as ISOLATED_BACKEND_ROOT, backendEnvPath as ISOLATED_BACKEND_ENV } from '../../backend-paths.cjs';
// COMANDO PARA ENVIAR DADOS DO SHEETS PARA O FIREBASE
// node utils/uploadBairrosSheetsFirebase.js

// --------------------------------------------------
// 🔧 AJUSTE DE CONTEXTO (ANTES DE QUALQUER IMPORT)
// --------------------------------------------------
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Força execução a partir de /backend
process.chdir(ISOLATED_BACKEND_ROOT);

// --------------------------------------------------
// IMPORTS BÁSICOS
// --------------------------------------------------
import dotenv from "dotenv";
dotenv.config({ path: ISOLATED_BACKEND_ENV });

import { readSheet, writeSheet } from "../../src/services/googleSheets.js"; // adicionamos writeSheet

// --------------------------------------------------
// CONFIGURAÇÃO ÚNICA
// --------------------------------------------------
const BASE_NAME = "jfBairros";
const COLLECTION_NAME = BASE_NAME;
const SHEET_NAME = BASE_NAME;
const RANGE = `${SHEET_NAME}!A:Z`; // pega todas as colunas
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

// Caminho do JSON que será espelhado
const BAIRROS_JSON_PATH = path.resolve("crawler", "_jfBairros.json");

// --------------------------------------------------
// UTIL
// --------------------------------------------------
function saveBairrosJson(data) {
  fs.writeFileSync(
    BAIRROS_JSON_PATH,
    JSON.stringify(data, null, 2),
    "utf-8"
  );
  console.log("📄 JSON atualizado: crawler/_jfBairros.json");
}

// Gera slug a partir do nome
function generateSlug(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------
export async function uploadBairrosSheetsFirebase() {
  console.log("📥 Lendo bairros do Google Sheets...");

  const rows = await readSheet(SPREADSHEET_ID, RANGE);

  if (!rows || rows.length <= 1) {
    console.log("⚠️ Aba de bairros vazia ou sem dados.");
    return;
  }

  const headersRow = rows[0].map(h => String(h).toLowerCase().trim());
  const nomeIdx = headersRow.findIndex(h => h.includes("nome"));

  if (nomeIdx === -1) {
    console.error("❌ Não foi possível encontrar a coluna 'nome' no Sheets.");
    return;
  }

  console.log(`🔍 Coluna 'nome' encontrada em index ${nomeIdx}`);

  // 🔥 Importa Firebase só depois do chdir
  const { batchUpdateFromMap, deleteCollection } = await import("../../src/services/firebase.js");

  // 🧹 Apaga toda a coleção antes de inserir os novos dados
  console.log("🔥 Inicializando conexão com Firebase...");
  console.log("🧹 Limpando coleção no Firebase...");
  await deleteCollection(COLLECTION_NAME);

  const firebaseMap = new Map();
  const bairrosJson = [];
  const sheetRows = [["nome", "slug", "atualizadoEm"]]; // Cabeçalho da nova coluna
  let processed = 0;

  const now = new Date().toISOString(); // timestamp único para todos os registros

  for (const row of rows.slice(1)) {
    const nome = String(row[nomeIdx] || "").trim();
    if (!nome) continue;

    const slug = generateSlug(nome);

    const clean = { nome, slug, atualizadoEm: now };

    // Atualiza Firebase
    firebaseMap.set(slug, clean);

    // Prepara JSON
    bairrosJson.push(clean);

    // Prepara linha para Sheets
    sheetRows.push([nome, slug, now]);

    processed++;
  }

  if (!processed) {
    console.warn("⚠️ Nenhum bairro válido encontrado no Sheets.");
    return;
  }

  console.log(`📊 ${processed} bairros processados.`);

  // 💾 JSON
  saveBairrosJson(bairrosJson);

  // 🔥 Firebase
  await batchUpdateFromMap(COLLECTION_NAME, firebaseMap);

  // 💻 Atualiza Sheets com coluna atualizadoEm
  await writeSheet(SPREADSHEET_ID, `${SHEET_NAME}!A:C`, sheetRows);

  console.log("✅ Sheets → Firebase → JSON (bairros) sincronizado com coluna atualizadoEm.");
}

// --------------------------------------------------
// EXECUÇÃO DIRETA
// --------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  uploadBairrosSheetsFirebase().catch(err => {
    console.error("❌ Erro ao sincronizar bairros:", err);
    process.exit(1);
  });
}