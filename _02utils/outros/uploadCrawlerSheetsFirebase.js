import { backendRoot as ISOLATED_BACKEND_ROOT, backendEnvPath as ISOLATED_BACKEND_ENV } from '../../backend-paths.cjs';
// COMANDO PARA ENVIAR DADOS DO SHEETS PARA O FIREBASE E ATUALIZAR SHEETS
// node utils/uploadCrawlerSheetsFirebase.js

// --------------------------------------------------
// CONFIGURAÇÃO
// --------------------------------------------------
const BASE_NAME = "jfInvest";
const COLLECTION_NAME = BASE_NAME;
const SHEET_NAME = BASE_NAME;
const RANGE = `${SHEET_NAME}!A:Z`;
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

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
// IMPORTS
// --------------------------------------------------
import dotenv from "dotenv";
dotenv.config({ path: ISOLATED_BACKEND_ENV });

import { readSheet, clearSheet, writeHeader, appendRows } from "../../src/services/googleSheets.js";



// Diretório dos crawlers
const CRAWLER_DIR = path.resolve("crawler");

// Map de JSONs
const CRAWLER_JSON_MAP = {
  jfBairros: "_jfBairros.json",
  jfACasas: "jfACasas.json",
  jfInvest: "jfInvest.json",
  jfRemax: "jfRemax.json",
  jfSouzaGomes: "jfSouzaGomes.json",
  jfRibeiroArrabal: "jfRibeiroArrabal.json",
  jfRVNegocios: "jfRVNegocios.json",
  jfAlmar: "jfAlmar.json",
  jfEuro: "jfEuro.json",
  jfAna: "jfAna.json",
  jfAlicerce: "jfAlicerce.json",
  jfUniversal: "jfUniversal.json",
  jfLocato: "jfLocato.json",
  jfClientt: "jfClientt.json",
  jfSelect: "jfSelect.json",
  jfNogueira: "jfNogueira.json",
  jfNegociar: "jfNegociar.json",
  jfRedentor: "jfRedentor.json",
  jfToronto: "jfToronto.json",
  jfBomClima: "jfBomClima.json",
  jfAcervo: "jfAcervo.json",
  jfMasson: "jfMasson.json",
  jfEstrelaSul: "jfEstrelaSul.json",
  jfLocal: "jfLocal.json",
  jfLider: "jfLider.json",
  jfDecisao: "jfDecisao.json",
  jfSoares: "jfSoares.json",
  jfToc2: "jfToc2.json",
  jfJeferson: "jfJeferson.json",
  jfOliveira: "jfOliveira.json",
  jfSouzaRocha: "jfSouzaRocha.json",
  jfBellos: "jfBellos.json",
  jfAntonioDias: "jfAntonioDias.json",
  jfJfImovel: "jfJfImovel.json"
};

const JSON_FILE = CRAWLER_JSON_MAP[BASE_NAME];
if (!JSON_FILE) throw new Error(`❌ Nenhum crawler configurado para BASE_NAME="${BASE_NAME}"`);

// --------------------------------------------------
// HEADERS DA PLANILHA
// --------------------------------------------------
const HEADERS = [
  "linkReal",
  "titulo",
  "preco",
  "localizacao",
  "bairro",
  "cidade",
  "tipoImovel",
  "dormitorioValor",
  "banheiroValor",
  "ambienteValor",
  "areaValor",
  "garagemValor",
  "elevadorValor",
  "codigoBase",
  "linkCard",
  "corretor",
  "dataInclusao",
  "dataExclusao",
  "linkFoto",
  "atualizadoEm" // NOVA COLUNA
];

// --------------------------------------------------
// UTIL
// --------------------------------------------------
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, i) => (obj[header] = row?.[i] ?? ""));
  return obj;
}

function saveCrawlerJson(fileName, data) {
  const filePath = path.join(CRAWLER_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`📄 JSON atualizado: ${fileName}`);
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------
export async function uploadSheetsFirebase() {
  console.log("📥 Lendo dados do Google Sheets...");

  let rows = await readSheet(SPREADSHEET_ID, RANGE);

  if (!rows || rows.length <= 1) {
    console.log("⚠️ Planilha vazia ou sem dados.");
    return;
  }

  // 🔥 IMPORT DINÂMICO DO FIREBASE (APÓS chdir)
  const { getCollectionAsMap, batchUpdateFromMap } = await import("../../src/services/firebase.js");

  // Cria JSON inicial com os dados da planilha
  const headersRow = rows[0];
  const dataRows = rows.slice(1);

  const dataJson = dataRows.map(row => {
    const obj = rowToObject(headersRow, row);
    obj.atualizadoEm = new Date().toISOString();
    return obj;
  });

  // -------------------------------
  // 💾 ATUALIZA JSON DO CRAWLER
  // -------------------------------
  saveCrawlerJson(JSON_FILE, dataJson);

  // -------------------------------
  // 🔥 ENVIA PARA FIREBASE
  // -------------------------------
  const firebaseMap = await getCollectionAsMap(COLLECTION_NAME, "linkReal");

  dataJson.forEach(item => {
    if (!item.linkReal) return;
    const existing = firebaseMap.get(item.linkReal) || {};
    firebaseMap.set(item.linkReal, { ...existing, ...item });
  });

  await batchUpdateFromMap(COLLECTION_NAME, firebaseMap);
  console.log(`✅ Firebase atualizado com ${dataJson.length} itens.`);

  // -------------------------------
  // 🔄 SOBRESCREVE O SHEETS
  // -------------------------------
  console.log("🔄 Atualizando planilha no Google Sheets...");

  // Limpa aba
  await clearSheet(SPREADSHEET_ID, SHEET_NAME);

  // Escreve cabeçalho
  await writeHeader(SPREADSHEET_ID, SHEET_NAME, HEADERS);

  // Prepara valores
  const values = dataJson.map(item => HEADERS.map(h => item[h] || ""));
  await appendRows(SPREADSHEET_ID, `${SHEET_NAME}!A2`, values);

  console.log("✅ Google Sheets atualizado com coluna atualizadoEm.");
  console.log("🎯 Sheets → JSON → Firebase → Sheets sincronizado com sucesso.");
}

// --------------------------------------------------
// EXECUÇÃO DIRETA
// --------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  uploadSheetsFirebase().catch(err => {
    console.error("❌ Erro na importação:", err);
    process.exit(1);
  });
}