import { arquivoPrincipalImoveis, arquivoPrincipalLocacao, arquivoPrincipalVendas } from "../_utils/vendasSincronizacao.js";
import { ordenarProjetos, ordenarScripts, projetoSuspenso } from "../../../../crawler-order.cjs";
import { expandirEtapas, montarProjetosCombinados } from "../_utils/projetosCombinados.js";
import { createFirestorePanelCache } from "./firestore-panel-cache.js";
import { listarPendenciasPrecoJson, upsertConfirmacoesPrecoJson } from "./precos-json.js";
import { validateSelectedProjects } from "../../../../_02utils/typesense/selectedProjects.cjs";
import { updateAvailability } from "../../../../crawler-availability.cjs";
﻿import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { exec, execFile } from "child_process";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import open from "open";
import cron from "node-cron";
import Typesense from "typesense";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { appendRows, readSheet, writeSheet } from "../../../services/googleSheets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../../../../");
const packageJsonPath = path.join(backendRoot, "package.json");
const configPath = path.join(__dirname, "site-scheduler-config.json");
const cidadesCatalogoPath = path.join(backendRoot, "_03database", "filtros", "_brCidades.json");
const bairrosCatalogoPath = path.join(backendRoot, "_03database", "filtros", "_jfBairros.json");
const bairroJsonCorrectionsPath = path.join(backendRoot, "_03database", "filtros", "_jfBairrosManualCorrections.json");
const tiposCatalogoPath = path.join(backendRoot, "_03database", "filtros", "_brTipoImovel.json");
const outrosDatabaseDir = path.join(backendRoot, "_03database", "outros");
const cityJsonCorrectionsPath = path.join(outrosDatabaseDir, "city-json-manual-corrections.json");
const tipoImovelJsonCorrectionsPath = path.join(outrosDatabaseDir, "tipo-imovel-json-manual-corrections.json");
const localizacaoJsonCorrectionsPath = path.join(outrosDatabaseDir, "localizacao-json-manual-corrections.json");
const linkFotoJsonCorrectionsPath = path.join(outrosDatabaseDir, "linkfoto-json-manual-corrections.json");
const linkFotoJsonConfirmationsPath = path.join(outrosDatabaseDir, "linkfoto-json-confirmations.json");
const precoJsonConfirmationsPath = path.join(outrosDatabaseDir, "preco-json-confirmations.json");
const precoJsonCorrectionsPath = path.join(outrosDatabaseDir, "preco-json-manual-corrections.json");
const firestoreTransferStatePath = path.join(outrosDatabaseDir, "firestore-json-transfer-state.json");
const firestorePanelCache = createFirestorePanelCache(path.join(outrosDatabaseDir, "firestore-panel-cache.json"));
const jsonSummarySnapshotPath = path.join(outrosDatabaseDir, "json-summary-snapshot.json");
const duplicadosGruposPath = path.join(outrosDatabaseDir, "duplicados-grupos.json");
const JSON_SUMMARY_VARIACAO_LIMIAR = 10; // percentual acima do qual um projeto é destacado
const PORT = 3105;
const TYPESENSE_SCRIPT = "typesense:sync";
const TYPESENSE_BACKUP_SCRIPT = "typesense:sync:backup";
const TYPESENSE_JSON_SCRIPT = "typesense:sync:json";
const CITY_SLUG_AUDIT_SCRIPT = "cidades:check-slug";
const BAIRRO_SLUG_AUDIT_SCRIPT = "bairros:check-slug";
const PRIORITY_CITY_SLUGS = new Set(["juiz-de-fora-mg", "juiz-de-fora"]);
const TYPESENSE_HOST = process.env.TYPESENSE_HOST || "wc9sthl3xe6ykq8ip-1.a2.typesense.net";
const TYPESENSE_PORT = Number(process.env.TYPESENSE_PORT || 443);
const TYPESENSE_PROTOCOL = process.env.TYPESENSE_PROTOCOL || "https";
const TYPESENSE_API_KEY = process.env.TYPESENSE_API_KEY || "JLsCS0EwEUHcl7zCKJOg7DTmdukGf3aZ";
const TYPESENSE_COLLECTION_IMOVEIS = "imoveis";
const SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";

const SHEETS_HEADER = [
  "linkReal",
  "titulo",
  "preco",
  "localizacao",
  "tipoImovel",
  "bairro",
  "cidade",
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
  "atualizadoEm",
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
app.use(express.json());
app.use((req, res, next) => {
  if (/^\/api\/(?:city|bairro)-slug-issues(?:\/|$)/.test(req.path) ||
      ["/api/check-missing-city-slugs", "/api/check-missing-bairro-slugs"].includes(req.path)) {
    return res.status(410).json({ error: "Validacao remota legada desativada. Use as checagens da aba JSON; publique somente por transmissao explicita." });
  }
  next();
});

let running = false;
let currentQueue = [];
let currentIndex = -1;
let currentProcess = null;
let cronTask = null;
let stopRequested = false;
const projectErrors = {};

let cachedCityCatalog = null;
let cachedCityCatalogMtime = 0;
let cachedBairroCatalog = null;
let cachedBairroCatalogMtime = 0;
let typesenseClient = null;
const manualSyncQueue = [];
let manualSyncRunning = false;

function nowStamp() {
  return new Date().toISOString();
}

function loadFirestoreTransferState() {
  if (!fs.existsSync(firestoreTransferStatePath)) return { collections: {} };
  try {
    const state = JSON.parse(fs.readFileSync(firestoreTransferStatePath, "utf8"));
    return state && typeof state === "object" && state.collections && typeof state.collections === "object" ? state : { collections: {} };
  } catch {
    return { collections: {} };
  }
}

function saveFirestoreTransferState(state) {
  fs.mkdirSync(path.dirname(firestoreTransferStatePath), { recursive: true });
  fs.writeFileSync(firestoreTransferStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function loadJsonSummarySnapshot() {
  if (!fs.existsSync(jsonSummarySnapshotPath)) return { collections: {}, updatedAt: "" };
  try {
    const data = JSON.parse(fs.readFileSync(jsonSummarySnapshotPath, "utf8"));
    return data && typeof data === "object" && data.collections && typeof data.collections === "object"
      ? data
      : { collections: {}, updatedAt: "" };
  } catch {
    return { collections: {}, updatedAt: "" };
  }
}

function saveJsonSummarySnapshot(collectionsCounts) {
  fs.mkdirSync(path.dirname(jsonSummarySnapshotPath), { recursive: true });
  const data = { collections: collectionsCounts, updatedAt: nowStamp() };
  fs.writeFileSync(jsonSummarySnapshotPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// Compara a contagem atual de registros válidos por coleção (JSON) com o snapshot
// salvo na última consulta ao resumo, destacando variações acima do limiar.
function buildVariacaoProjetos(currentCounts, previousSnapshot) {
  const previousCounts = previousSnapshot.collections || {};
  const collectionNames = new Set([...Object.keys(currentCounts), ...Object.keys(previousCounts)]);
  const rows = [];
  for (const collectionName of collectionNames) {
    const atual = currentCounts[collectionName] ?? 0;
    const anterior = previousCounts[collectionName] ?? 0;
    const diferenca = atual - anterior;
    let percentual;
    if (anterior > 0) percentual = (diferenca / anterior) * 100;
    else if (atual > 0) percentual = 100;
    else percentual = 0;
    rows.push({
      collectionName,
      anterior,
      atual,
      diferenca,
      percentual,
      destaque: Math.abs(percentual) > JSON_SUMMARY_VARIACAO_LIMIAR,
    });
  }
  return rows.sort((a, b) => Math.abs(b.percentual) - Math.abs(a.percentual) || a.collectionName.localeCompare(b.collectionName, "pt-BR"));
}

// ------------------------------
// 🔹 Duplicados: helpers de leitura/escrita e algoritmo de sugestão
// ------------------------------
function loadDuplicadosStore() {
  if (!fs.existsSync(duplicadosGruposPath)) return { grupos: {}, descartados: [] };
  try {
    const data = JSON.parse(fs.readFileSync(duplicadosGruposPath, "utf8"));
    return {
      grupos: data?.grupos && typeof data.grupos === "object" ? data.grupos : {},
      descartados: Array.isArray(data?.descartados) ? data.descartados : [],
    };
  } catch {
    return { grupos: {}, descartados: [] };
  }
}

function saveDuplicadosStore(store) {
  fs.mkdirSync(path.dirname(duplicadosGruposPath), { recursive: true });
  fs.writeFileSync(duplicadosGruposPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function memberKey(collectionName, linkReal) {
  return `${String(collectionName || "").trim()}::${String(linkReal || "").trim()}`;
}

function pairKey(keyA, keyB) {
  return [keyA, keyB].sort().join("||");
}

function normalizeTextForMatch(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSimilarity(a, b) {
  const normA = normalizeTextForMatch(a);
  const normB = normalizeTextForMatch(b);
  if (!normA || !normB) return 0;
  const setA = new Set(normA.split(" ").filter((w) => w.length > 2));
  const setB = new Set(normB.split(" ").filter((w) => w.length > 2));
  if (!setA.size || !setB.size) return 0;
  let intersecao = 0;
  for (const word of setA) if (setB.has(word)) intersecao += 1;
  const uniao = new Set([...setA, ...setB]).size;
  return uniao ? intersecao / uniao : 0;
}

function numeroProximo(a, b, toleranciaPercentual = 10) {
  if (a === null || b === null) return false;
  if (a === 0 && b === 0) return true;
  const maior = Math.max(Math.abs(a), Math.abs(b));
  if (!maior) return true;
  return (Math.abs(a - b) / maior) * 100 <= toleranciaPercentual;
}

function loadImoveisAtivos() {
  const crawlerDir = path.join(backendRoot, "crawler");
  if (!fs.existsSync(crawlerDir)) return [];
  const registros = [];
  fs.readdirSync(crawlerDir).filter(arquivoPrincipalVendas).forEach((file) => {
    const collectionName = path.basename(file, ".json");
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;
    data.forEach((item) => {
      if (!item || typeof item !== "object") return;
      if (String(item.dataExclusao || "").trim()) return;
      const linkReal = String(item.linkReal || "").trim();
      if (!linkReal) return;
      registros.push({
        collectionName,
        imobiliariaId: String(item.imobiliariaId || item.corretor || collectionName).trim(),
        linkReal,
        titulo: String(item.titulo || "").trim(),
        preco: String(item.preco || "").trim(),
        localizacao: String(item.localizacao || "").trim(),
        cidade: String(item.cidade || "").trim(),
        bairro: String(item.bairro || "").trim(),
        tipoImovel: String(item.tipoImovel || "").trim(),
        areaValor: parseNumericValue(item.areaValor),
        dormitorioValor: parseNumericValue(item.dormitorioValor),
        banheiroValor: parseNumericValue(item.banheiroValor),
        garagemValor: parseNumericValue(item.garagemValor),
        linkFoto: String(item.linkFoto || "").trim(),
        linkCard: String(item.linkCard || item.linkReal || "").trim(),
        duplicadoGrupo: String(item.duplicado_grupo || "").trim(),
      });
    });
  });
  return registros;
}

// Compara dois imóveis de imobiliárias diferentes e retorna os critérios batidos + score.
// Uma mesma imobiliária nunca tem imóveis duplicados entre si, então o primeiro
// filtro descarta qualquer par que pertença à mesma imobiliariaId (mesmo que
// estejam em coleções/projetos diferentes por algum motivo).
const TIPOS_AREA_OBRIGATORIA = new Set(["terreno", "loja"]); // metragem precisa bater para terrenos/lojas
const TIPOS_QUARTOS_VAGAS_OBRIGATORIOS = new Set(["casa", "apartamento"]); // quartos/vagas/banheiros precisam bater

function compararImoveis(a, b) {
  if (a.imobiliariaId === b.imobiliariaId) return null;
  if (a.cidade !== b.cidade || !a.cidade) return null;
  if (a.bairro !== b.bairro || !a.bairro) return null;
  // Tipo de imóvel também é obrigatório: apartamento só compara com apartamento, etc.
  if (a.tipoImovel !== b.tipoImovel || !a.tipoImovel) return null;

  const criterios = { cidade: true, bairro: true, tipo: true };
  let pontos = 3;

  // Terreno/loja: sem metragem compatível não há como sugerir (1936m² != 420m²).
  if (TIPOS_AREA_OBRIGATORIA.has(a.tipoImovel)) {
    if (a.areaValor === null || b.areaValor === null || !numeroProximo(a.areaValor, b.areaValor, 10)) return null;
    criterios.metragem = true;
    pontos += 1;
  }

  // Casa/apartamento: quartos, vagas e banheiros precisam bater exatamente.
  if (TIPOS_QUARTOS_VAGAS_OBRIGATORIOS.has(a.tipoImovel)) {
    if (a.dormitorioValor === null || b.dormitorioValor === null || a.dormitorioValor !== b.dormitorioValor) return null;
    if (a.garagemValor === null || b.garagemValor === null || a.garagemValor !== b.garagemValor) return null;
    if (a.banheiroValor === null || b.banheiroValor === null || a.banheiroValor !== b.banheiroValor) return null;
    criterios.quartos = true;
    criterios.vagas = true;
    criterios.banheiros = true;
    pontos += 3;
  }

  const localizacaoSim = textSimilarity(a.localizacao, b.localizacao);
  if (localizacaoSim >= 0.5) {
    criterios.localizacao = true;
    pontos += 1;
  }

  if (!criterios.metragem && a.areaValor !== null && b.areaValor !== null && numeroProximo(a.areaValor, b.areaValor, 10)) {
    criterios.metragem = true;
    pontos += 1;
  }

  if (!criterios.quartos && a.dormitorioValor !== null && b.dormitorioValor !== null && Math.abs(a.dormitorioValor - b.dormitorioValor) <= 1) {
    criterios.quartos = true;
    pontos += 1;
  }

  if (!criterios.vagas && a.garagemValor !== null && b.garagemValor !== null && Math.abs(a.garagemValor - b.garagemValor) <= 1) {
    criterios.vagas = true;
    pontos += 1;
  }

  // Para tipos sem regra obrigatória própria, exige cidade + bairro + tipo + ao
  // menos 2 outros critérios (localização/metragem/quartos/vagas) para sugerir.
  const temRegraObrigatoria = TIPOS_AREA_OBRIGATORIA.has(a.tipoImovel) || TIPOS_QUARTOS_VAGAS_OBRIGATORIOS.has(a.tipoImovel);
  if (!temRegraObrigatoria) {
    const criteriosExtras = Object.keys(criterios).length - 3;
    if (criteriosExtras < 2) return null;
  }

  return { criterios, pontos, localizacaoSim };
}

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const caminho = [];
    let raiz = x;
    while (this.parent.get(raiz) !== raiz) {
      caminho.push(raiz);
      raiz = this.parent.get(raiz);
    }
    for (const node of caminho) this.parent.set(node, raiz);
    return raiz;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function gerarSugestoesDuplicados() {
  const store = loadDuplicadosStore();
  const descartadosSet = new Set(store.descartados);
  const registros = loadImoveisAtivos();

  const jaAgrupados = new Set();
  Object.values(store.grupos).forEach((grupo) => {
    (grupo?.membros || []).forEach((membro) => jaAgrupados.add(memberKey(membro.collectionName, membro.linkReal)));
  });

  const candidatos = registros.filter((item) => !jaAgrupados.has(memberKey(item.collectionName, item.linkReal)));

  // Agrupa por cidade+bairro para evitar comparação O(n²) em toda a base.
  const buckets = new Map();
  candidatos.forEach((item) => {
    const bucketKey = `${item.cidade}::${item.bairro}::${item.tipoImovel}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(item);
  });

  const uf = new UnionFind();
  const pares = [];
  const registroPorKey = new Map(candidatos.map((item) => [memberKey(item.collectionName, item.linkReal), item]));

  // Cada raiz do Union-Find carrega o conjunto de imobiliariaId já presentes no
  // grupo. Uma união só acontece se não introduzir uma imobiliária repetida.
  const agenciasPorRaiz = new Map();
  candidatos.forEach((item) => {
    const key = memberKey(item.collectionName, item.linkReal);
    agenciasPorRaiz.set(key, new Set([item.imobiliariaId]));
  });

  for (const grupo of buckets.values()) {
    if (grupo.length < 2) continue;
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a = grupo[i];
        const b = grupo[j];
        const keyA = memberKey(a.collectionName, a.linkReal);
        const keyB = memberKey(b.collectionName, b.linkReal);
        if (descartadosSet.has(pairKey(keyA, keyB))) continue;
        const match = compararImoveis(a, b);
        if (!match) continue;

        const raizA = uf.find(keyA);
        const raizB = uf.find(keyB);
        if (raizA === raizB) {
          pares.push({ keyA, keyB, match });
          continue;
        }

        const agenciasA = agenciasPorRaiz.get(raizA);
        const agenciasB = agenciasPorRaiz.get(raizB);
        const teriaAgenciaRepetida = [...agenciasB].some((id) => agenciasA.has(id));
        if (teriaAgenciaRepetida) continue; // uniria dois imóveis da mesma imobiliária

        uf.union(keyA, keyB);
        const novaRaiz = uf.find(keyA);
        agenciasPorRaiz.set(novaRaiz, new Set([...agenciasA, ...agenciasB]));
        pares.push({ keyA, keyB, match });
      }
    }
  }

  const gruposPorRaiz = new Map();
  pares.forEach(({ keyA, keyB }) => {
    [keyA, keyB].forEach((key) => {
      const raiz = uf.find(key);
      if (!gruposPorRaiz.has(raiz)) gruposPorRaiz.set(raiz, new Set());
      gruposPorRaiz.get(raiz).add(key);
    });
  });

  const paresPorRaiz = new Map();
  pares.forEach((p) => {
    const raiz = uf.find(p.keyA);
    if (!paresPorRaiz.has(raiz)) paresPorRaiz.set(raiz, []);
    paresPorRaiz.get(raiz).push(p);
  });

  const sugestoes = [];
  gruposPorRaiz.forEach((keysSet, raiz) => {
    const keys = [...keysSet];
    if (keys.length < 2) return;
    const membros = keys.map((key) => registroPorKey.get(key)).filter(Boolean);
    if (membros.length < 2) return;
    const paresDoGrupo = paresPorRaiz.get(raiz) || [];
    // Evita spread (Math.max(...array)) para não estourar a pilha em grupos grandes.
    const pontosMax = paresDoGrupo.reduce((max, p) => Math.max(max, p.match.pontos), 0);
    sugestoes.push({ membros, pontos: pontosMax, criteriosExemplo: paresDoGrupo[0]?.match?.criterios || {} });
  });

  return sugestoes.sort((a, b) => b.pontos - a.pontos);
}

// Aplica o campo duplicado_grupo nos JSONs dos crawlers afetados por uma mudança pontual.
function aplicarDuplicadoGrupoNosJsons(collectionNames) {
  const store = loadDuplicadosStore();
  const mapaPorCollection = new Map();
  Object.entries(store.grupos).forEach(([grupoId, grupo]) => {
    (grupo?.membros || []).forEach((membro) => {
      const collectionName = String(membro?.collectionName || "").trim();
      const linkReal = String(membro?.linkReal || "").trim();
      if (!collectionName || !linkReal) return;
      if (!mapaPorCollection.has(collectionName)) mapaPorCollection.set(collectionName, new Map());
      mapaPorCollection.get(collectionName).set(linkReal, grupoId);
    });
  });

  const crawlerDir = path.join(backendRoot, "crawler");
  collectionNames.forEach((collectionName) => {
    const jsonPath = path.join(crawlerDir, `${collectionName}.json`);
    if (!fs.existsSync(jsonPath)) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;
    const mapa = mapaPorCollection.get(collectionName) || new Map();
    let changed = false;
    data.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const linkReal = String(item.linkReal || "").trim();
      const grupoId = linkReal ? mapa.get(linkReal) || "" : "";
      if ((item.duplicado_grupo || "") !== grupoId) {
        data[index] = { ...item, duplicado_grupo: grupoId };
        changed = true;
      }
    });
    if (changed) fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  });
}

function recordFirestoreTransfer(collectionNames) {
  const state = loadFirestoreTransferState();
  const sentAt = nowStamp();
  collectionNames.forEach((collectionName) => {
    const jsonPath = path.join(backendRoot, "crawler", `${collectionName}.json`);
    if (!fs.existsSync(jsonPath)) return;
    state.collections[collectionName] = { jsonMtimeMs: fs.statSync(jsonPath).mtimeMs, sentAt };
  });
  saveFirestoreTransferState(state);
}

function isDataExclusaoVazia(record) {
  const raw = String(record?.dataExclusao ?? "").trim();
  return !raw || raw === "0";
}

function getJsonTransferSummary() {
  const crawlerDir = path.join(backendRoot, "crawler");
  const projects = [];
  const porTipo = { venda: { projects: 0, records: 0, excluidos: 0 }, aluguel: { projects: 0, records: 0, excluidos: 0 } };
  let total = 0;
  let excluidos = 0;
  if (!fs.existsSync(crawlerDir)) return { projects, records: 0, excluidos: 0, porTipo, movedAt: "" };
  fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis).forEach((file) => {
    const collectionName = path.basename(file, ".json");
    const jsonPath = path.join(crawlerDir, file);
    const stats = fs.statSync(jsonPath);
    const records = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(records)) throw new Error(`JSON de imoveis invalido: ${file}`);
    const validRecords = records.filter((record) => String(record?.linkReal || "").trim());
    const removidos = validRecords.filter((record) => !isDataExclusaoVazia(record)).length;
    total += validRecords.length;
    excluidos += removidos;
    const tipo = arquivoPrincipalLocacao(file) ? "aluguel" : "venda";
    porTipo[tipo].projects++;
    porTipo[tipo].records += validRecords.length - removidos;
    porTipo[tipo].excluidos += removidos;
    projects.push({ collectionName, tipo, records: validRecords.length, movedAt: new Date(stats.mtimeMs).toISOString() });
  });
  return {
    projects,
    records: total - excluidos,
    excluidos,
    porTipo,
    movedAt: projects.reduce((latest, project) => !latest || project.movedAt > latest ? project.movedAt : latest, ""),
  };
}

// Usa agregacao count() e 1 documento por colecao: ler as colecoes inteiras estourava a cota diaria de leituras.
async function latestReplicatedAt(collection) {
  const snapshot = await collection.orderBy("replicatedAt", "desc").limit(1).select("replicatedAt", "atualizadoEm").get();
  const data = snapshot.docs[0]?.data() || {};
  return String(data.replicatedAt || data.atualizadoEm || "").trim();
}

function mensagemErroFirestore(error) {
  if (error?.code === 8 || /RESOURCE_EXHAUSTED/.test(error?.message || "")) {
    return "cota diária do Firestore esgotada (renova à meia-noite do horário do Pacífico, ~4h/5h de Brasília).";
  }
  return error?.message || String(error);
}

// Mesmos documentos publicados em __imoveisPublicos, montados direto dos JSONs locais.
// Roda em processo novo (como o envio real) para nao usar modulos desatualizados no cache do painel.
const JSON_PUBLIC_DOCS_SCRIPT = `
const { pathToFileURL } = await import("node:url");
const root = process.argv[1];
const publicador = await import(pathToFileURL(root + "/publish-crawler-json.js").href);
const { publicationProfile } = (await import(pathToFileURL(root + "/publication-profiles.cjs").href)).default;
const profile = publicationProfile("vendas");
const colecoes = await publicador.discoverCollections(profile);
const docs = publicador.buildPublicDocs(publicador.loadPublicationRecords(colecoes, profile), profile)
  .filter((doc) => doc.data.ativo !== false && ["", "0"].includes(String(doc.data.dataExclusao || "").trim()))
  .map((doc) => ({ id: doc.id, data: { imobiliariaId: doc.data.imobiliariaId, tipoImovel: doc.data.tipoImovel, cidade: doc.data.cidade, bairro: doc.data.bairro } }));
process.stdout.write(JSON.stringify(docs));
`;

function loadJsonPublicDocs() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ["--input-type=module", "-e", JSON_PUBLIC_DOCS_SCRIPT, backendRoot.replace(/\\/g, "/")], { cwd: backendRoot, maxBuffer: 512 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(String(stderr || error.message).trim()));
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Resposta inválida ao montar documentos dos JSONs: ${parseError.message}`));
      }
    });
  });
}

async function resumirJsonPublicacao() {
  const crawlerDir = path.join(backendRoot, "crawler");
  const ultimaAtualizacao = fs.existsSync(crawlerDir)
    ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalVendas)
      .reduce((latest, file) => Math.max(latest, fs.statSync(path.join(crawlerDir, file)).mtimeMs), 0)
    : 0;
  return { total: (await loadJsonPublicDocs()).length, ultimaAtualizacao: ultimaAtualizacao ? new Date(ultimaAtualizacao).toISOString() : "" };
}

async function getFirestoreTransferSummary() {
  const state = loadFirestoreTransferState();
  const db = await ensureFirestore();
  const result = {};
  for (const [key, suffix] of [["current", ""], ["backup", "__backup"]]) {
    const porTipo = {};
    for (const [tipo, base] of [["venda", "__imoveisPublicos"], ["aluguel", "__alugueisPublicos"]]) {
      const collection = db.collection(`${base}${suffix}`);
      const [count, movedAt] = await Promise.all([collection.count().get(), latestReplicatedAt(collection)]);
      porTipo[tipo] = { records: count.data().count, movedAt };
    }
    result[key] = {
      projects: null,
      records: porTipo.venda.records + porTipo.aluguel.records,
      excluidos: null,
      movedAt: [porTipo.venda.movedAt, porTipo.aluguel.movedAt].sort().at(-1) || (key === "backup" ? state.lastBackupAt || "" : ""),
      porTipo,
    };
  }
  return result;
}

function loadPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function extractJforaScripts() {
  const pkg = loadPackageJson();
  // Cada projeto roda a venda e, em seguida, o aluguel da mesma imobiliaria.
  return montarProjetosCombinados(pkg.scripts ?? {});
}

function getCollectionNameForScript(scriptName) {
  const project = extractJforaScripts().find((item) => item.name === scriptName);
  if (project?.colecao) return project.colecao;
  const match = project?.cmd?.match(/_01extractor[\\/]crawlers[\\/]jfora[\\/]((?:niteroi[\\/])?[^\\/]+)[\\/]index\.js/);
  if (!match) return "";

  const indexPath = path.join(backendRoot, "_01extractor", "crawlers", "jfora", match[1], "index.js");
  const source = fs.readFileSync(indexPath, "utf8");
  return source.match(/const\s+COLLECTION_NAME\s*=\s*["']([^"']+)["']/)?.[1]
    || source.match(/runNiteroiImobBrasil\(["']([^"']+)["']\)/)?.[1]
    || source.match(/projectName:\s*["']([^"']+)["']/)?.[1] || "";
}

function loadConfig(defaultScripts) {
  if (!fs.existsSync(configPath)) {
    return {
      hour: "21:00",
      timezone: "America/Sao_Paulo",
      selectedScripts: ordenarScripts(defaultScripts.map((s) => s.name)),
    };
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      hour: cfg.hour ?? "21:00",
      timezone: cfg.timezone ?? "America/Sao_Paulo",
      selectedScripts: ordenarScripts(Array.isArray(cfg.selectedScripts)
        ? cfg.selectedScripts
        : defaultScripts.map((s) => s.name)),
    };
  } catch {
    return {
      hour: "21:00",
      timezone: "America/Sao_Paulo",
      selectedScripts: ordenarScripts(defaultScripts.map((s) => s.name)),
    };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

function parseHour(text) {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function emitState() {
  io.emit("scheduler:state", {
    running,
    currentQueue,
    currentIndex,
    currentProject: currentIndex >= 0 ? currentQueue[currentIndex] : null,
    projectErrors,
  });
}

function emitLog(message, type = "info") {
  io.emit("scheduler:log", {
    at: nowStamp(),
    type,
    message,
  });
}

function slugifyCity(text) {
  if (!text) return "";

  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCityNameFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCityName(nome, slug = "") {
  const source = String(nome || formatCityNameFromSlug(slug)).trim();
  const lowerCaseWords = new Set(["a", "as", "da", "das", "de", "do", "dos", "e", "em", "no", "nos"]);

  return source
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part) || (index > 0 && lowerCaseWords.has(part))) return part;
      return part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1);
    })
    .join("");
}

function formatBairroName(nome) {
  const lowerCaseWords = new Set(["a", "as", "da", "das", "de", "do", "dos", "e", "em", "no", "nos"]);

  return String(nome || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part) || (index > 0 && lowerCaseWords.has(part))) return part;
      return part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1);
    })
    .join("");
}

function normalizeCatalogText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleContainsType(title, typeNames) {
  const normalizedTitle = normalizeCatalogText(title);
  return typeNames.some((name) => {
    if (name.length <= 3) {
      return ` ${normalizedTitle} `.includes(` ${name} `);
    }
    return normalizedTitle.includes(name);
  });
}

function loadTipoNames() {
  const catalog = JSON.parse(fs.readFileSync(tiposCatalogoPath, "utf8"));
  return [...new Set(
    Object.values(catalog?.tiposPorSlug || {})
      .flatMap((aliases) => Array.isArray(aliases) ? aliases : [])
      .map((item) => normalizeCatalogText(item?.nome))
      .filter(Boolean)
  )];
}

function ensureFirestore() {
  if (!getApps().length) {
    const credPath = path.join(backendRoot, "credentials", "firebase-key.json");
    initializeApp({ credential: cert(credPath) });
  }
  return getFirestore();
}

function loadCityCatalog() {
  const stat = fs.statSync(cidadesCatalogoPath);
  const mtime = stat.mtimeMs;

  if (cachedCityCatalog && cachedCityCatalogMtime === mtime) {
    return cachedCityCatalog;
  }

  const json = JSON.parse(fs.readFileSync(cidadesCatalogoPath, "utf8"));
  const options = json
    .filter((item) => item && typeof item.slug === "string" && isPrincipal(item))
    .map((item) => ({
      slug: item.slug,
      nome: formatCityName(item.nome, item.slug),
    }))
    .sort((a, b) => {
      const aPriority = PRIORITY_CITY_SLUGS.has(String(a.slug || "").toLowerCase()) ? 0 : 1;
      const bPriority = PRIORITY_CITY_SLUGS.has(String(b.slug || "").toLowerCase()) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

  const slugSet = new Set(options.map((item) => item.slug));

  cachedCityCatalog = { options, slugSet };
  cachedCityCatalogMtime = mtime;
  return cachedCityCatalog;
}

function loadLatestCitySlugReport() {
  const reportDir = path.join(backendRoot, "_03database", "outros");
  if (!fs.existsSync(reportDir)) return null;

  const reportName = fs.readdirSync(reportDir)
    .filter((name) => /^check-cidades-sem-slug-.*\.json$/i.test(name))
    .sort()
    .pop();

  if (!reportName) return null;

  try {
    return {
      path: path.join(reportDir, reportName),
      data: JSON.parse(fs.readFileSync(path.join(reportDir, reportName), "utf8")),
    };
  } catch (err) {
    console.warn(`[CITY-SLUG] Falha ao ler relatório ${reportName}: ${err.message}`);
    return null;
  }
}

function removeCityIssueFromLatestReport(docId) {
  const report = loadLatestCitySlugReport();
  if (!report || !Array.isArray(report.data.registros)) return;

  const registros = report.data.registros.filter((item) => String(item.docId || "") !== docId);
  report.data.registros = registros;
  report.data.totalRegistrosSemSlugValido = registros.length;
  fs.writeFileSync(report.path, `${JSON.stringify(report.data, null, 2)}\n`, "utf8");
}

function slugifyBairro(text) {
  if (!text) return "";

  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBairroCatalogText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveBairroSlugFromRawValue(value, cidade, catalog) {
  const raw = String(value || "").trim();
  if (!raw || !cidade) return "";

  const candidates = [raw, ...raw.split(/\s*>\s*/)]
    .map((candidate) => candidate
      .replace(/^\s*[|:,-]*\s*bairro(?:\s+atual)?\s*:?\s*/i, "")
      .replace(/\s*[-–—]\s*$/, "")
      .split(",")[0]
      .trim())
    .filter(Boolean);

  const options = catalog.byCity.get(cidade) || [];
  for (const candidate of candidates) {
    const exactMatches = options.filter((option) => option.nome === candidate || option.slug === candidate);
    const exactSlugs = new Set(exactMatches.map((option) => option.slug));
    if (exactSlugs.size === 1) return exactSlugs.values().next().value;
    if (exactSlugs.size > 1) return "";

    const normalized = normalizeBairroCatalogText(candidate);
    const matches = options.filter((option) =>
      normalizeBairroCatalogText(option.nome) === normalized ||
      normalizeBairroCatalogText(option.slug) === normalized
    );
    const slugs = new Set(matches.map((option) => option.slug));
    if (slugs.size === 1) return slugs.values().next().value;
    if (slugs.size > 1) return "";
  }

  return "";
}

function loadBairroCatalog() {
  const stat = fs.statSync(bairrosCatalogoPath);
  const mtime = stat.mtimeMs;

  if (cachedBairroCatalog && cachedBairroCatalogMtime === mtime) {
    return cachedBairroCatalog;
  }

  const json = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"));
  const entries = json
    .filter((item) => item && typeof item.slug === "string" && typeof item.cidade === "string")
    .map((item) => ({
      slug: String(item.slug || "").trim(),
      cidade: String(item.cidade || "").trim(),
      nome: String(item.nome || formatLabelFromSlug(item.slug)).trim(),
      principal: String(item.principal || "sim").trim() || "sim",
    }))
    .filter((item) => item.slug && item.cidade);

  const keySet = new Set(entries.map((item) => `${item.slug}__${item.cidade}`));
  const byCity = new Map();
  const byCityPrincipal = new Map();

  for (const entry of entries) {
    if (!byCity.has(entry.cidade)) {
      byCity.set(entry.cidade, []);
    }
    byCity.get(entry.cidade).push(entry);

    if (String(entry.principal || "").trim().toLowerCase() === "sim") {
      if (!byCityPrincipal.has(entry.cidade)) {
        byCityPrincipal.set(entry.cidade, []);
      }
      byCityPrincipal.get(entry.cidade).push(entry);
    }
  }

  for (const [cidade, options] of byCity.entries()) {
    options.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    byCity.set(cidade, options);
  }

  for (const [cidade, options] of byCityPrincipal.entries()) {
    options.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    byCityPrincipal.set(cidade, options);
  }

  cachedBairroCatalog = { entries, keySet, byCity, byCityPrincipal };
  cachedBairroCatalogMtime = mtime;
  return cachedBairroCatalog;
}

async function resolveExistingSourceDoc(db, origemColecao, sourceDocId, linkReal) {
  if (!origemColecao) {
    return { ref: null, id: "", data: null };
  }

  if (sourceDocId) {
    const ref = db.collection(origemColecao).doc(sourceDocId);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : null;
    if (snap.exists && String(data.linkReal || "").trim()) {
      return { ref, id: snap.id, data };
    }
  }

  const normalizedLinkReal = String(linkReal || "").trim();
  if (normalizedLinkReal) {
    const query = await db
      .collection(origemColecao)
      .where("linkReal", "==", normalizedLinkReal)
      .limit(1)
      .get();

    if (!query.empty) {
      const snap = query.docs[0];
      return { ref: snap.ref, id: snap.id, data: snap.data() || {} };
    }
  }

  return { ref: null, id: "", data: null };
}

// Ao corrigir um bairro do catalogo, propaga a correcao para imoveis
// cujo campo bairro (texto cru) corresponde ao nome antigo (sem slug),
// sincronizando cada um com Typesense, JSON de origem e Google Sheets.
async function applyCatalogFixToMatchingProperties(db, { cidade, originalNome, targetSlug, targetNome }) {
  const normalizedOriginal = slugifyBairro(originalNome);
  if (!normalizedOriginal) {
    return { matched: 0 };
  }

  const snapshot = await db.collection("__imoveisPublicos").where("cidade", "==", cidade).get();
  let matched = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const bairroAtual = String(data.bairro || "").trim();
    if (!bairroAtual || slugifyBairro(bairroAtual) !== normalizedOriginal) continue;

    matched += 1;

    await doc.ref.set(
      { bairro: targetSlug, bairroNome: targetNome, corrigidoEm: nowStamp() },
      { merge: true }
    );

    const origemColecao = String(data.imobiliariaId || "").trim();
    const sourceDocId = String(data.sourceDocId || "").trim();
    const sourceLinkReal = String(data.linkReal || "").trim();

    let resolvedSourceDocId = sourceDocId;
    let sourceData = {};
    const sourceResolved = await resolveExistingSourceDoc(db, origemColecao, sourceDocId, sourceLinkReal);
    if (sourceResolved.ref) {
      await sourceResolved.ref.set(
        { bairro: targetSlug, bairroNome: targetNome, corrigidoEm: nowStamp() },
        { merge: true }
      );
      resolvedSourceDocId = sourceResolved.id;
      sourceData = {
        ...(sourceResolved.data || {}),
        bairro: targetSlug,
        bairroNome: targetNome,
        corrigidoEm: nowStamp(),
      };
    } else if (origemColecao) {
      emitLog(`[BAIRROS-CATALOGO] Origem nao localizada para doc ${doc.id}; correcao aplicada apenas em __imoveisPublicos.`, "warn");
    }

    const publicAtualizado = {
      ...data,
      bairro: targetSlug,
      bairroNome: targetNome,
      corrigidoEm: nowStamp(),
    };

    enqueueManualSync({
      docId: doc.id,
      sourceDocId: resolvedSourceDocId,
      origemColecao,
      publicData: publicAtualizado,
      sourceData,
      patch: { bairro: targetSlug, bairroNome: targetNome },
      scopeLabel: "BAIRROS-CATALOGO",
    });
  }

  return { matched };
}

function writeBairroCatalog(entries) {
  const identities = new Set();
  const principals = new Set();
  for (const entry of entries) {
    const cidade = String(entry?.cidade || "").trim();
    const slug = String(entry?.slug || "").trim();
    const nome = String(entry?.nome || "").trim();
    const identity = JSON.stringify([cidade, slug, nome]);
    if (identities.has(identity)) {
      throw new Error(`Bairro repetido no catalogo: '${nome}' (${slug}, ${cidade}). Use o registro existente.`);
    }
    identities.add(identity);
    if (cidade && slug && isPrincipal(entry)) {
      const key = JSON.stringify([cidade, slug]);
      if (principals.has(key)) {
        throw new Error(`Mais de um bairro principal para '${slug}' em '${cidade}'. Mantenha os demais como aliases.`);
      }
      principals.add(key);
    }
  }
  fs.writeFileSync(bairrosCatalogoPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  cachedBairroCatalog = null;
  cachedBairroCatalogMtime = 0;
}

function writeCityCatalog(entries) {
  fs.writeFileSync(cidadesCatalogoPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  cachedCityCatalog = null;
  cachedCityCatalogMtime = 0;
}

function writeTipoCatalog(catalog) {
  fs.writeFileSync(tiposCatalogoPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

function isPrincipal(item) {
  return String(item?.principal || "sim").trim().toLowerCase() === "sim";
}

app.get("/api/filters/cities", (req, res) => {
  try {
    const cities = JSON.parse(fs.readFileSync(cidadesCatalogoPath, "utf8"))
      .map((item, index) => ({
        index,
        slug: String(item?.slug || "").trim(),
        nome: formatCityName(item?.nome, item?.slug),
        principal: isPrincipal(item),
      }))
      .filter((item) => item.slug);
    const principalCountBySlug = new Map();
    const hasPrincipalBySlug = new Map();
    for (const city of cities) {
      if (city.principal) {
        principalCountBySlug.set(city.slug, (principalCountBySlug.get(city.slug) || 0) + 1);
      }
      hasPrincipalBySlug.set(city.slug, (hasPrincipalBySlug.get(city.slug) || false) || city.principal);
    }

    const bySlug = (a, b) => a.slug.localeCompare(b.slug, "pt-BR", { sensitivity: "base" });
    const duplicates = cities.filter((item) => item.principal && principalCountBySlug.get(item.slug) > 1).sort(bySlug);
    const missingPrincipals = cities.filter((item) => !item.principal && !hasPrincipalBySlug.get(item.slug)).sort(bySlug);
    const items = cities.filter((item) => item.principal && principalCountBySlug.get(item.slug) === 1).sort(bySlug);

    return res.json({ ok: true, duplicates, missingPrincipals, items });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao carregar filtro de cidades: ${err.message}` });
  }
});

app.put("/api/filters/cities/:index", async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index, 10);
    const nome = String(req.body?.nome || "").trim();
    if (!Number.isInteger(index) || index < 0 || !nome) {
      return res.status(400).json({ error: "Indice e nome da cidade sao obrigatorios." });
    }

    const cities = JSON.parse(fs.readFileSync(cidadesCatalogoPath, "utf8"));
    const city = cities[index];
    if (!city || !isPrincipal(city) || !String(city.slug || "").trim()) {
      return res.status(404).json({ error: "Cidade principal nao encontrada." });
    }

    city.nome = formatCityName(nome, city.slug);
    writeCityCatalog(cities);

    return res.json({ ok: true, index, slug: city.slug, nome: city.nome });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao atualizar filtro de cidade: ${err.message}` });
  }
});

app.put("/api/filters/cities/:index/principal", async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index, 10);
    const principal = req.body?.principal === true;
    const nome = String(req.body?.nome || "").trim();
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: "Indice da cidade invalido." });
    }

    const cities = JSON.parse(fs.readFileSync(cidadesCatalogoPath, "utf8"));
    const city = cities[index];
    const slug = String(city?.slug || "").trim();
    if (!city || !slug) {
      return res.status(404).json({ error: "Cidade nao encontrada." });
    }

    if (nome) {
      city.nome = formatCityName(nome, slug);
    }

    if (principal) {
      cities.forEach((item) => {
        if (String(item?.slug || "").trim() === slug) {
          item.principal = item === city ? "sim" : "nao";
        }
      });
    } else {
      city.principal = "nao";
    }

    writeCityCatalog(cities);
    const canonicalCity = cities.find((item) => String(item?.slug || "").trim() === slug && isPrincipal(item));

    return res.json({
      ok: true,
      index,
      slug,
      nome: formatCityName(city.nome, slug),
      principal: isPrincipal(city),
      principalIndex: canonicalCity ? cities.indexOf(canonicalCity) : null,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao atualizar principal da cidade: ${err.message}` });
  }
});

app.get("/api/filters/bairros", (req, res) => {
  try {
    const bairros = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"))
      .map((item, index) => ({
        index,
        slug: String(item?.slug || "").trim(),
        cidade: String(item?.cidade || "").trim(),
        nome: String(item?.nome || "").trim(),
        principal: isPrincipal(item),
      }))
      .filter((item) => item.slug && item.cidade);
    const keyOf = (item) => `${item.slug}__${item.cidade}`;
    const principalCountByKey = new Map();
    const hasPrincipalByKey = new Map();
    for (const bairro of bairros) {
      const key = keyOf(bairro);
      if (bairro.principal) {
        principalCountByKey.set(key, (principalCountByKey.get(key) || 0) + 1);
      }
      hasPrincipalByKey.set(key, (hasPrincipalByKey.get(key) || false) || bairro.principal);
    }
    const bySlug = (a, b) =>
      a.slug.localeCompare(b.slug, "pt-BR", { sensitivity: "base" }) ||
      a.cidade.localeCompare(b.cidade, "pt-BR", { sensitivity: "base" });
    const duplicates = bairros.filter((item) => item.principal && principalCountByKey.get(keyOf(item)) > 1).sort(bySlug);
    const missingPrincipals = bairros.filter((item) => !item.principal && !hasPrincipalByKey.get(keyOf(item))).sort(bySlug);
    const items = bairros.filter((item) => item.principal && principalCountByKey.get(keyOf(item)) === 1).sort(bySlug);

    return res.json({ ok: true, duplicates, missingPrincipals, items });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao carregar filtro de bairros: ${err.message}` });
  }
});

app.put("/api/filters/bairros/:index", async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index, 10);
    const nome = String(req.body?.nome || "").trim();
    if (!Number.isInteger(index) || index < 0 || !nome) {
      return res.status(400).json({ error: "Indice e nome do bairro sao obrigatorios." });
    }

    const bairros = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"));
    const bairro = bairros[index];
    if (!bairro || !isPrincipal(bairro) || !String(bairro.slug || "").trim() || !String(bairro.cidade || "").trim()) {
      return res.status(404).json({ error: "Bairro principal nao encontrado." });
    }

    bairro.nome = formatBairroName(nome);
    writeBairroCatalog(bairros);

    return res.json({ ok: true, index, slug: bairro.slug, cidade: bairro.cidade, nome: bairro.nome });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao atualizar filtro de bairro: ${err.message}` });
  }
});

app.put("/api/filters/bairros/:index/principal", async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index, 10);
    const principal = req.body?.principal === true;
    const nome = String(req.body?.nome || "").trim();
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: "Indice do bairro invalido." });
    }

    const bairros = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"));
    const bairro = bairros[index];
    const slug = String(bairro?.slug || "").trim();
    const cidade = String(bairro?.cidade || "").trim();
    if (!bairro || !slug || !cidade) {
      return res.status(404).json({ error: "Bairro nao encontrado." });
    }

    if (nome) {
      bairro.nome = formatBairroName(nome);
    }

    if (principal) {
      bairros.forEach((item) => {
        if (String(item?.slug || "").trim() === slug && String(item?.cidade || "").trim() === cidade) {
          item.principal = item === bairro ? "sim" : "nao";
        }
      });
    } else {
      bairro.principal = "nao";
    }

    writeBairroCatalog(bairros);
    const canonicalBairro = bairros.find(
      (item) => String(item?.slug || "").trim() === slug && String(item?.cidade || "").trim() === cidade && isPrincipal(item)
    );

    return res.json({
      ok: true,
      index,
      slug,
      cidade,
      nome: bairro.nome,
      principal: isPrincipal(bairro),
      principalIndex: canonicalBairro ? bairros.indexOf(canonicalBairro) : null,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao atualizar principal do bairro: ${err.message}` });
  }
});

app.get("/api/filters/tipos", (req, res) => {
  try {
    const catalog = JSON.parse(fs.readFileSync(tiposCatalogoPath, "utf8"));
    const tipos = Object.entries(catalog?.tiposPorSlug || {}).flatMap(([groupSlug, aliases]) =>
      Array.isArray(aliases)
        ? aliases.map((item, aliasIndex) => ({
            slug: String(item?.slug || groupSlug).trim(),
            nome: String(item?.nome || "").trim(),
            tipo: String(item?.tipo || "").trim(),
            aliasIndex,
            principal: Object.hasOwn(item || {}, "principal") ? isPrincipal(item) : aliasIndex === 0,
          }))
        : []
    ).filter((item) => item.slug && item.nome);
    const principalCountBySlug = new Map();
    const hasPrincipalBySlug = new Map();
    for (const tipo of tipos) {
      if (tipo.principal) {
        principalCountBySlug.set(tipo.slug, (principalCountBySlug.get(tipo.slug) || 0) + 1);
      }
      hasPrincipalBySlug.set(tipo.slug, (hasPrincipalBySlug.get(tipo.slug) || false) || tipo.principal);
    }
    const bySlug = (a, b) => a.slug.localeCompare(b.slug, "pt-BR", { sensitivity: "base" });
    const duplicates = tipos.filter((item) => item.principal && principalCountBySlug.get(item.slug) > 1).sort(bySlug);
    const missingPrincipals = tipos.filter((item) => !item.principal && !hasPrincipalBySlug.get(item.slug)).sort(bySlug);
    const items = tipos.filter((item) => item.principal && principalCountBySlug.get(item.slug) === 1).sort(bySlug);

    return res.json({ ok: true, duplicates, missingPrincipals, items });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao carregar filtro de tipos: ${err.message}` });
  }
});

app.put("/api/filters/tipos/:slug/:aliasIndex", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const aliasIndex = Number.parseInt(req.params.aliasIndex, 10);
    const principal = req.body?.principal === true;
    const nome = String(req.body?.nome || "").trim();
    if (!slug || !Number.isInteger(aliasIndex) || aliasIndex < 0 || !nome) {
      return res.status(400).json({ error: "Slug, indice e nome do tipo sao obrigatorios." });
    }

    const catalog = JSON.parse(fs.readFileSync(tiposCatalogoPath, "utf8"));
    const aliases = catalog?.tiposPorSlug?.[slug];
    const tipo = Array.isArray(aliases) ? aliases[aliasIndex] : null;
    if (!tipo) {
      return res.status(404).json({ error: "Tipo nao encontrado." });
    }

    tipo.nome = nome;
    if (principal) {
      aliases.forEach((item) => {
        item.principal = item === tipo ? "sim" : "nao";
      });
    } else {
      tipo.principal = "nao";
    }

    writeTipoCatalog(catalog);
    const canonicalTipo = aliases.find((item, index) =>
      Object.hasOwn(item || {}, "principal") ? isPrincipal(item) : index === 0
    );

    return res.json({
      ok: true,
      slug,
      aliasIndex,
      nome: tipo.nome,
      principal: Object.hasOwn(tipo, "principal") ? isPrincipal(tipo) : aliasIndex === 0,
      principalIndex: canonicalTipo ? aliases.indexOf(canonicalTipo) : null,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao atualizar principal do tipo: ${err.message}` });
  }
});

function getCollectionNameFromCrawlerFile(file) {
  const baseName = path.basename(String(file || "").trim(), ".json");
  return /^[\w.-]+$/i.test(baseName) ? baseName : "";
}

async function updateFirestoreFromJsonCorrection({ scopeLabel }) {
  emitLog(`[${scopeLabel}] Correcao mantida somente no JSON; transmissao para Firestore/Typesense e manual.`, "info");
  return { sourceUpdated: 0, publicUpdated: 0, localOnly: true };
}

function loadCityJsonCorrections() {
  if (!fs.existsSync(cityJsonCorrectionsPath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(cityJsonCorrectionsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[CIDADES-JSON] Falha ao ler correcoes manuais: ${err.message}`, "warn");
    return [];
  }
}

function writeCityJsonCorrections(corrections) {
  fs.mkdirSync(outrosDatabaseDir, { recursive: true });
  const ordered = [...corrections].sort((a, b) => {
    const fileDiff = String(a.file || "").localeCompare(String(b.file || ""), "pt-BR");
    if (fileDiff !== 0) return fileDiff;
    return String(a.linkReal || "").localeCompare(String(b.linkReal || ""), "pt-BR");
  });
  fs.writeFileSync(cityJsonCorrectionsPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

function upsertCityJsonCorrection({ file, linkReal, cidade, nome }) {
  const normalizedFile = String(file || "").trim();
  const normalizedLinkReal = String(linkReal || "").trim();
  const normalizedCidade = String(cidade || "").trim();
  if (!normalizedFile || !normalizedLinkReal || !normalizedCidade) return;

  const corrections = loadCityJsonCorrections();
  const index = corrections.findIndex((item) =>
    String(item?.file || "").trim() === normalizedFile &&
    String(item?.linkReal || "").trim() === normalizedLinkReal
  );

  const correction = {
    file: normalizedFile,
    linkReal: normalizedLinkReal,
    cidade: normalizedCidade,
    nome: String(nome || formatCityNameFromSlug(normalizedCidade)).trim(),
    atualizadoEm: nowStamp(),
  };

  if (index >= 0) {
    corrections[index] = { ...corrections[index], ...correction };
    delete corrections[index].limparCidade;
  } else {
    corrections.push(correction);
  }

  writeCityJsonCorrections(corrections);
}

function applyCityJsonCorrectionsToFile(file, data, correctionsByFile) {
  if (!Array.isArray(data)) {
    return { data, changed: false, applied: 0 };
  }

  const corrections = correctionsByFile.get(file) || [];
  if (!corrections.length) {
    return { data, changed: false, applied: 0 };
  }

  const byLink = new Map(
    corrections
      .map((item) => [
        String(item?.linkReal || "").trim(),
        item?.limparCidade === true ? "" : String(item?.cidade || "").trim(),
        item?.limparCidade === true,
      ])
      .filter(([linkReal, cidade, limparCidade]) => linkReal && (cidade || limparCidade))
      .map(([linkReal, cidade]) => [linkReal, cidade])
  );

  if (!byLink.size) {
    return { data, changed: false, applied: 0 };
  }

  let changed = false;
  let applied = 0;
  const updated = data.map((item) => {
    const linkReal = String(item?.linkReal || "").trim();
    const cidade = byLink.get(linkReal);
    if (!cidade || String(item?.cidade || "").trim() === cidade) {
      return item;
    }

    changed = true;
    applied += 1;
    return { ...item, cidade };
  });

  return { data: updated, changed, applied };
}

function buildCityJsonCorrectionsByFile() {
  const byFile = new Map();
  for (const item of loadCityJsonCorrections()) {
    const file = String(item?.file || "").trim();
    const linkReal = String(item?.linkReal || "").trim();
    const cidade = String(item?.cidade || "").trim();
    if (!file || !linkReal || (!cidade && item?.limparCidade !== true)) continue;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(item);
  }
  return byFile;
}

function applyCityJsonCorrectionsToCrawlerFiles(targetFiles = null) {
  const crawlerDir = path.join(backendRoot, "crawler");
  if (!fs.existsSync(crawlerDir)) {
    return { filesChanged: 0, recordsUpdated: 0 };
  }

  const correctionsByFile = buildCityJsonCorrectionsByFile();
  if (!correctionsByFile.size) {
    return { filesChanged: 0, recordsUpdated: 0 };
  }

  const wanted = targetFiles instanceof Set ? targetFiles : null;
  const files = fs.readdirSync(crawlerDir)
    .filter(arquivoPrincipalImoveis)
    .filter((name) => correctionsByFile.has(name))
    .filter((name) => !wanted || wanted.has(name));

  let filesChanged = 0;
  let recordsUpdated = 0;

  for (const file of files) {
    const jsonPath = path.join(crawlerDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch (err) {
      emitLog(`[CIDADES-JSON] Falha ao aplicar correcoes em ${file}: ${err.message}`, "warn");
      continue;
    }

    const result = applyCityJsonCorrectionsToFile(file, data, correctionsByFile);
    if (!result.changed) continue;

    fs.writeFileSync(jsonPath, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
    filesChanged += 1;
    recordsUpdated += result.applied;
  }

  return { filesChanged, recordsUpdated };
}

function loadBairroJsonCorrections() {
  if (!fs.existsSync(bairroJsonCorrectionsPath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(bairroJsonCorrectionsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[BAIRROS-JSON] Falha ao ler correcoes manuais: ${err.message}`, "warn");
    return [];
  }
}

function writeBairroJsonCorrections(corrections) {
  fs.mkdirSync(path.dirname(bairroJsonCorrectionsPath), { recursive: true });
  const ordered = [...corrections].sort((a, b) => {
    const fileDiff = String(a.file || "").localeCompare(String(b.file || ""), "pt-BR");
    if (fileDiff !== 0) return fileDiff;
    return String(a.linkReal || "").localeCompare(String(b.linkReal || ""), "pt-BR");
  });
  fs.writeFileSync(bairroJsonCorrectionsPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

function upsertBairroJsonCorrection({ file, linkReal, cidade, bairro, nome }) {
  const normalizedFile = String(file || "").trim();
  const normalizedLinkReal = String(linkReal || "").trim();
  const normalizedBairro = String(bairro || "").trim();
  if (!normalizedFile || !normalizedLinkReal || !normalizedBairro) return;

  const corrections = loadBairroJsonCorrections();
  const index = corrections.findIndex((item) =>
    String(item?.file || "").trim() === normalizedFile &&
    String(item?.linkReal || "").trim() === normalizedLinkReal
  );

  const correction = {
    file: normalizedFile,
    linkReal: normalizedLinkReal,
    cidade: String(cidade || "").trim(),
    bairro: normalizedBairro,
    nome: String(nome || formatLabelFromSlug(normalizedBairro)).trim(),
    atualizadoEm: nowStamp(),
  };

  if (index >= 0) {
    corrections[index] = { ...corrections[index], ...correction };
  } else {
    corrections.push(correction);
  }

  writeBairroJsonCorrections(corrections);
}

function applyBairroJsonCorrectionsToFile(file, data, correctionsByFile) {
  if (!Array.isArray(data)) {
    return { data, changed: false, applied: 0 };
  }

  const corrections = correctionsByFile.get(file) || [];
  if (!corrections.length) {
    return { data, changed: false, applied: 0 };
  }

  const byLink = new Map(
    corrections
      .map((item) => [
        String(item?.linkReal || "").trim(),
        { bairro: String(item?.bairro || "").trim(), cidade: String(item?.cidade || "").trim() },
      ])
      .filter(([linkReal, correction]) => linkReal && correction.bairro)
  );

  if (!byLink.size) {
    return { data, changed: false, applied: 0 };
  }

  let changed = false;
  let applied = 0;
  const updated = data.map((item) => {
    const linkReal = String(item?.linkReal || "").trim();
    const correction = byLink.get(linkReal);
    if (!correction) {
      return item;
    }

    const bairroChanged = String(item?.bairro || "").trim() !== correction.bairro;
    const cidadeChanged = correction.cidade && String(item?.cidade || "").trim() !== correction.cidade;
    if (!bairroChanged && !cidadeChanged) return item;

    changed = true;
    applied += 1;
    return { ...item, bairro: correction.bairro, ...(correction.cidade ? { cidade: correction.cidade } : {}) };
  });

  return { data: updated, changed, applied };
}

function buildBairroJsonCorrectionsByFile() {
  const byFile = new Map();
  for (const item of loadBairroJsonCorrections()) {
    const file = String(item?.file || "").trim();
    const linkReal = String(item?.linkReal || "").trim();
    const bairro = String(item?.bairro || "").trim();
    if (!file || !linkReal || !bairro) continue;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(item);
  }
  return byFile;
}

function applyBairroJsonCorrectionsToCrawlerFiles(targetFiles = null) {
  const crawlerDir = path.join(backendRoot, "crawler");
  if (!fs.existsSync(crawlerDir)) {
    return { filesChanged: 0, recordsUpdated: 0 };
  }

  const correctionsByFile = buildBairroJsonCorrectionsByFile();
  if (!correctionsByFile.size) {
    return { filesChanged: 0, recordsUpdated: 0 };
  }

  const wanted = targetFiles instanceof Set ? targetFiles : null;
  const files = fs.readdirSync(crawlerDir)
    .filter(arquivoPrincipalImoveis)
    .filter((name) => correctionsByFile.has(name))
    .filter((name) => !wanted || wanted.has(name));

  let filesChanged = 0;
  let recordsUpdated = 0;

  for (const file of files) {
    const jsonPath = path.join(crawlerDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch (err) {
      emitLog(`[BAIRROS-JSON] Falha ao aplicar correcoes em ${file}: ${err.message}`, "warn");
      continue;
    }

    const result = applyBairroJsonCorrectionsToFile(file, data, correctionsByFile);
    if (!result.changed) continue;

    fs.writeFileSync(jsonPath, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
    filesChanged += 1;
    recordsUpdated += result.applied;
  }

  return { filesChanged, recordsUpdated };
}

function loadTipoImovelJsonCorrections() {
  if (!fs.existsSync(tipoImovelJsonCorrectionsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(tipoImovelJsonCorrectionsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[TIPO-IMOVEL-JSON] Falha ao ler correcoes manuais: ${err.message}`, "warn");
    return [];
  }
}

function upsertTipoImovelJsonCorrection({ file, linkReal, tipoImovel }) {
  if (!file || !linkReal || !tipoImovel) return;
  const corrections = loadTipoImovelJsonCorrections();
  const correction = { file, linkReal, tipoImovel, atualizadoEm: nowStamp() };
  const index = corrections.findIndex((item) => item?.file === file && item?.linkReal === linkReal);
  if (index >= 0) corrections[index] = { ...corrections[index], ...correction };
  else corrections.push(correction);
  fs.mkdirSync(outrosDatabaseDir, { recursive: true });
  fs.writeFileSync(tipoImovelJsonCorrectionsPath, `${JSON.stringify(corrections, null, 2)}\n`, "utf8");
}

function applyTipoImovelJsonCorrectionsToCrawlerFiles() {
  const correctionsByFile = new Map();
  for (const correction of loadTipoImovelJsonCorrections()) {
    if (!correction?.file || !correction?.linkReal || !correction?.tipoImovel) continue;
    if (!correctionsByFile.has(correction.file)) correctionsByFile.set(correction.file, new Map());
    correctionsByFile.get(correction.file).set(correction.linkReal, correction.tipoImovel);
  }
  let filesChanged = 0;
  let recordsUpdated = 0;
  for (const [file, corrections] of correctionsByFile) {
    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (!Array.isArray(data)) continue;
      let changed = false;
      const updated = data.map((item) => {
        const tipoImovel = corrections.get(String(item?.linkReal || "").trim());
        if (!tipoImovel || String(item?.tipoImovel || "").trim() === tipoImovel) return item;
        changed = true;
        recordsUpdated += 1;
        return { ...item, tipoImovel };
      });
      if (changed) {
        fs.writeFileSync(jsonPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
        filesChanged += 1;
      }
    } catch (err) {
      emitLog(`[TIPO-IMOVEL-JSON] Falha ao aplicar correcoes em ${file}: ${err.message}`, "warn");
    }
  }
  return { filesChanged, recordsUpdated };
}

function loadLocalizacaoJsonCorrections() {
  if (!fs.existsSync(localizacaoJsonCorrectionsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(localizacaoJsonCorrectionsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[LOCALIZACAO-JSON] Falha ao ler correcoes manuais: ${err.message}`, "warn");
    return [];
  }
}

function upsertLocalizacaoJsonCorrection({ file, linkReal, localizacao }) {
  if (!file || !linkReal || !localizacao) return;
  const corrections = loadLocalizacaoJsonCorrections();
  const correction = { file, linkReal, localizacao, atualizadoEm: nowStamp() };
  const index = corrections.findIndex((item) => item?.file === file && item?.linkReal === linkReal);
  if (index >= 0) corrections[index] = { ...corrections[index], ...correction };
  else corrections.push(correction);
  fs.mkdirSync(outrosDatabaseDir, { recursive: true });
  fs.writeFileSync(localizacaoJsonCorrectionsPath, `${JSON.stringify(corrections, null, 2)}\n`, "utf8");
}

function applyLocalizacaoJsonCorrectionsToCrawlerFiles() {
  const correctionsByFile = new Map();
  for (const correction of loadLocalizacaoJsonCorrections()) {
    if (!correction?.file || !correction?.linkReal || !correction?.localizacao) continue;
    if (!correctionsByFile.has(correction.file)) correctionsByFile.set(correction.file, new Map());
    correctionsByFile.get(correction.file).set(correction.linkReal, correction.localizacao);
  }
  let filesChanged = 0;
  let recordsUpdated = 0;
  for (const [file, corrections] of correctionsByFile) {
    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (!Array.isArray(data)) continue;
      let changed = false;
      const updated = data.map((item) => {
        const localizacao = corrections.get(String(item?.linkReal || "").trim());
        if (!localizacao || String(item?.localizacao || "").trim() === localizacao) return item;
        changed = true;
        recordsUpdated += 1;
        return { ...item, localizacao };
      });
      if (changed) {
        fs.writeFileSync(jsonPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
        filesChanged += 1;
      }
    } catch (err) {
      emitLog(`[LOCALIZACAO-JSON] Falha ao aplicar correcoes em ${file}: ${err.message}`, "warn");
    }
  }
  return { filesChanged, recordsUpdated };
}

function loadLinkFotoJsonCorrections() {
  if (!fs.existsSync(linkFotoJsonCorrectionsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(linkFotoJsonCorrectionsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[LINKFOTO-JSON] Falha ao ler correcoes manuais: ${err.message}`, "warn");
    return [];
  }
}

function loadLinkFotoJsonConfirmations() {
  if (!fs.existsSync(linkFotoJsonConfirmationsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(linkFotoJsonConfirmationsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[LINKFOTO-JSON] Falha ao ler confirmações: ${err.message}`, "warn");
    return [];
  }
}

function getLinkFotoJsonConfirmationKey({ file, linkReal, index }) {
  const normalizedFile = String(file || "").trim();
  const normalizedLinkReal = String(linkReal || "").trim();
  return normalizedLinkReal ? `${normalizedFile}__${normalizedLinkReal}` : `${normalizedFile}__index:${Number(index)}`;
}

function confirmLinkFotoJsonIssues(issues) {
  const confirmations = loadLinkFotoJsonConfirmations();
  const keys = new Set(confirmations.map(getLinkFotoJsonConfirmationKey));
  let confirmed = 0;

  for (const issue of issues) {
    const file = String(issue?.file || "").trim();
    const linkReal = String(issue?.linkReal || "").trim();
    const index = Number(issue?.index);
    const key = getLinkFotoJsonConfirmationKey({ file, linkReal, index });
    if (!file || !Number.isInteger(index) || keys.has(key)) continue;
    confirmations.push({ file, linkReal, index, confirmadoEm: nowStamp() });
    keys.add(key);
    confirmed += 1;
  }

  if (confirmed > 0) {
    fs.mkdirSync(outrosDatabaseDir, { recursive: true });
    fs.writeFileSync(linkFotoJsonConfirmationsPath, `${JSON.stringify(confirmations, null, 2)}\n`, "utf8");
  }

  return confirmed;
}

function upsertLinkFotoJsonCorrection({ file, linkReal, linkFoto }) {
  if (!file || !linkReal || !linkFoto) return;
  const corrections = loadLinkFotoJsonCorrections();
  const correction = { file, linkReal, linkFoto, atualizadoEm: nowStamp() };
  const index = corrections.findIndex((item) => item?.file === file && item?.linkReal === linkReal);
  if (index >= 0) corrections[index] = { ...corrections[index], ...correction };
  else corrections.push(correction);
  fs.mkdirSync(outrosDatabaseDir, { recursive: true });
  fs.writeFileSync(linkFotoJsonCorrectionsPath, `${JSON.stringify(corrections, null, 2)}\n`, "utf8");
}

function applyLinkFotoJsonCorrectionsToCrawlerFiles() {
  const correctionsByFile = new Map();
  for (const correction of loadLinkFotoJsonCorrections()) {
    if (!correction?.file || !correction?.linkReal || !correction?.linkFoto) continue;
    if (!correctionsByFile.has(correction.file)) correctionsByFile.set(correction.file, new Map());
    correctionsByFile.get(correction.file).set(correction.linkReal, correction.linkFoto);
  }
  let filesChanged = 0;
  let recordsUpdated = 0;
  for (const [file, corrections] of correctionsByFile) {
    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (!Array.isArray(data)) continue;
      let changed = false;
      const updated = data.map((item) => {
        const linkFoto = corrections.get(String(item?.linkReal || "").trim());
        if (!linkFoto || String(item?.linkFoto || "").trim() === linkFoto) return item;
        changed = true;
        recordsUpdated += 1;
        return { ...item, linkFoto };
      });
      if (changed) {
        fs.writeFileSync(jsonPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
        filesChanged += 1;
      }
    } catch (err) {
      emitLog(`[LINKFOTO-JSON] Falha ao aplicar correcoes em ${file}: ${err.message}`, "warn");
    }
  }
  return { filesChanged, recordsUpdated };
}

function loadPrecoJsonConfirmations() {
  if (!fs.existsSync(precoJsonConfirmationsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(precoJsonConfirmationsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[PRECO-JSON] Falha ao ler confirmações: ${err.message}`, "warn");
    return [];
  }
}

function confirmPrecoJson({ file, linkReal, preco }) {
  const confirmations = upsertConfirmacoesPrecoJson(loadPrecoJsonConfirmations(), [{ file, linkReal, preco }], nowStamp());
  savePrecoJsonConfirmations(confirmations);
}

function savePrecoJsonConfirmations(confirmations) {
  fs.mkdirSync(outrosDatabaseDir, { recursive: true });
  fs.writeFileSync(precoJsonConfirmationsPath, `${JSON.stringify(confirmations, null, 2)}\n`, "utf8");
}

function loadPrecoJsonCorrections() {
  if (!fs.existsSync(precoJsonCorrectionsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(precoJsonCorrectionsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    emitLog(`[PRECO-JSON] Falha ao ler correcoes manuais: ${err.message}`, "warn");
    return [];
  }
}

function upsertPrecoJsonCorrection({ file, linkReal, preco }) {
  const corrections = loadPrecoJsonCorrections();
  const correction = { file, linkReal, preco, atualizadoEm: nowStamp() };
  const index = corrections.findIndex((item) => item?.file === file && item?.linkReal === linkReal);
  if (index >= 0) corrections[index] = correction;
  else corrections.push(correction);
  fs.mkdirSync(outrosDatabaseDir, { recursive: true });
  fs.writeFileSync(precoJsonCorrectionsPath, `${JSON.stringify(corrections, null, 2)}\n`, "utf8");
}

function applyPrecoJsonCorrectionsToCrawlerFiles() {
  const byFile = new Map();
  for (const correction of loadPrecoJsonCorrections()) {
    if (!correction?.file || !correction?.linkReal || typeof correction?.preco !== "number") continue;
    if (!byFile.has(correction.file)) byFile.set(correction.file, new Map());
    byFile.get(correction.file).set(correction.linkReal, correction.preco);
  }
  let filesChanged = 0;
  let recordsUpdated = 0;
  for (const [file, corrections] of byFile) {
    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (!Array.isArray(data)) continue;
      let changed = false;
      const updated = data.map((item) => {
        const preco = corrections.get(String(item?.linkReal || "").trim());
        if (typeof preco !== "number" || item?.preco === preco) return item;
        changed = true;
        recordsUpdated += 1;
        return { ...item, preco };
      });
      if (changed) {
        fs.writeFileSync(jsonPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
        filesChanged += 1;
      }
    } catch (err) {
      emitLog(`[PRECO-JSON] Falha ao aplicar correcoes em ${file}: ${err.message}`, "warn");
    }
  }
  return { filesChanged, recordsUpdated };
}

function parsePrecoManual(value) {
  const raw = String(value || "").trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (!raw) return NaN;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  return Number(normalized);
}

function normalizeTextForSlugLabel(text) {
  return String(text || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatLabelFromSlug(slug) {
  return normalizeTextForSlugLabel(slug)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toFloat(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function toInt(value) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
}

function buildTypesenseDocFromPublic(publicId, data) {
  const cidadeSlug = String(data?.cidade || "");
  const bairroSlug = String(data?.bairro || "");
  const tipoSlug = String(data?.tipoImovel || "");

  return {
    id: String(data?.id || publicId),
    titulo: String(data?.titulo || ""),
    preco: toFloat(data?.preco),
    areaValor: toFloat(data?.areaValor),
    codigoBase: String(data?.codigoBase || ""),
    garagemValor: toInt(data?.garagemValor),
    dormitorioValor: toInt(data?.dormitorioValor),
    linkReal: String(data?.linkReal || ""),
    localizacao: String(data?.localizacao || ""),
    corretor: String(data?.corretor || ""),
    linkFoto: String(data?.linkFoto || ""),
    imobiliariaId: String(data?.imobiliariaId || ""),
    ativo: data?.ativo !== false,
    replicatedAt: String(data?.replicatedAt || ""),
    dataInclusao: String(data?.dataInclusao || ""),
    tipoImovel: tipoSlug,
    bairro: bairroSlug,
    cidade: cidadeSlug,
    tipoImovelNome: String(data?.tipoImovelNome || formatLabelFromSlug(tipoSlug) || ""),
    bairroNome: String(data?.bairroNome || formatLabelFromSlug(bairroSlug) || ""),
    cidadeNome: String(data?.cidadeNome || formatLabelFromSlug(cidadeSlug) || ""),
    elevadorValor: toInt(data?.elevadorValor),
    ambienteValor: toInt(data?.ambienteValor),
    linkCard: String(data?.linkCard || ""),
    banheiroValor: toInt(data?.banheiroValor),
    dataExclusao: String(data?.dataExclusao || ""),
    atualizadoEm: String(data?.atualizadoEm || ""),
    duplicado_grupo: String(data?.duplicado_grupo || ""),
  };
}

function getTypesenseClient() {
  if (typesenseClient) return typesenseClient;

  typesenseClient = new Typesense.Client({
    nodes: [
      {
        host: TYPESENSE_HOST,
        port: TYPESENSE_PORT,
        protocol: TYPESENSE_PROTOCOL,
      },
    ],
    apiKey: TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 10,
  });

  return typesenseClient;
}

async function fetchAllTypesenseDocs() {
  const exported = await getTypesenseClient().collections(TYPESENSE_COLLECTION_IMOVEIS).documents().export();
  return String(exported || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildSheetRowFromSourceDoc(data) {
  const item = data || {};
  return [
    item.linkReal ?? "",
    item.titulo ?? "",
    item.preco ?? "",
    item.localizacao ?? "",
    item.tipoImovel ?? "",
    item.bairro ?? "",
    item.cidade ?? "",
    item.dormitorioValor ?? "",
    item.banheiroValor ?? "",
    item.ambienteValor ?? "",
    item.areaValor ?? "",
    item.garagemValor ?? "",
    item.elevadorValor ?? "",
    item.codigoBase ?? "",
    item.linkCard ?? "",
    item.corretor ?? "",
    item.dataInclusao ?? "",
    item.dataExclusao ?? "",
    item.linkFoto ?? "",
    item.atualizadoEm ?? "",
  ];
}

async function syncManualUpdateToTypesense(docId, scopeLabel) {
  const db = ensureFirestore();
  const publicDoc = await db.collection("__imoveisPublicos").doc(docId).get();
  if (!publicDoc.exists) {
    emitLog(`[${scopeLabel}] Typesense skip: doc ${docId} nao existe em __imoveisPublicos.`, "warn");
    return;
  }

  const data = publicDoc.data() || {};
  const doc = buildTypesenseDocFromPublic(docId, data);
  await getTypesenseClient().collections(TYPESENSE_COLLECTION_IMOVEIS).documents().upsert(doc);
  emitLog(`[${scopeLabel}] Typesense sincronizado para doc ${docId}.`, "success");
}

async function syncManualUpdateToSourceJson(task) {
  const { origemColecao, sourceDocId, sourceData, publicData, patch, scopeLabel } = task;
  if (!origemColecao) return;

  const jsonPath = path.join(backendRoot, "crawler", `${origemColecao}.json`);
  if (!fs.existsSync(jsonPath)) {
    emitLog(`[${scopeLabel}] JSON skip: arquivo nao encontrado para ${origemColecao}.`, "warn");
    return;
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) {
    emitLog(`[${scopeLabel}] JSON skip: formato invalido em ${origemColecao}.json.`, "warn");
    return;
  }

  const sourceLinkReal = String(sourceData?.linkReal || publicData?.linkReal || "").trim();

  const index = arr.findIndex((item) => {
    const docIdCandidate = String(item?.docId || item?.id || "").trim();
    const linkRealCandidate = String(item?.linkReal || "").trim();
    if (sourceDocId && docIdCandidate && docIdCandidate === sourceDocId) return true;
    if (sourceLinkReal && linkRealCandidate && linkRealCandidate === sourceLinkReal) return true;
    return false;
  });

  if (index < 0) {
    emitLog(`[${scopeLabel}] JSON skip: registro nao localizado em ${origemColecao}.json.`, "warn");
    return;
  }

  arr[index] = {
    ...arr[index],
    ...patch,
    corrigidoEm: nowStamp(),
  };

  fs.writeFileSync(jsonPath, `${JSON.stringify(arr, null, 2)}\n`, "utf8");
  emitLog(`[${scopeLabel}] JSON sincronizado para ${origemColecao}.json.`, "success");
}

async function syncManualUpdateToSheets(task) {
  const { origemColecao, sourceData, publicData, patch, scopeLabel } = task;
  if (!SHEETS_SPREADSHEET_ID || !origemColecao) {
    return;
  }

  const sheetRange = `${origemColecao}!A:T`;
  const rows = await readSheet(SHEETS_SPREADSHEET_ID, sheetRange);

  if (!Array.isArray(rows) || rows.length === 0) {
    emitLog(`[${scopeLabel}] Sheets skip: aba ${origemColecao} vazia ou inexistente.`, "warn");
    return;
  }

  const header = rows[0] || [];
  const linkRealColumn = header.findIndex((h) => String(h || "").trim().toLowerCase() === "linkreal");
  const codigoBaseColumn = header.findIndex((h) => String(h || "").trim().toLowerCase() === "codigobase");

  const targetLinkReal = String(sourceData?.linkReal || publicData?.linkReal || "").trim();
  const targetCodigoBase = String(sourceData?.codigoBase || publicData?.codigoBase || "").trim();

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rowLinkReal = linkRealColumn >= 0 ? String(row[linkRealColumn] || "").trim() : "";
    const rowCodigoBase = codigoBaseColumn >= 0 ? String(row[codigoBaseColumn] || "").trim() : "";

    if (targetLinkReal && rowLinkReal === targetLinkReal) {
      rowIndex = i;
      break;
    }
    if (targetCodigoBase && rowCodigoBase === targetCodigoBase) {
      rowIndex = i;
      break;
    }
  }

  const baseData = { ...publicData, ...sourceData, ...patch };
  const rowValues = buildSheetRowFromSourceDoc(baseData);

  if (rowIndex >= 1) {
    const sheetRowNumber = rowIndex + 1;
    await writeSheet(SHEETS_SPREADSHEET_ID, `${origemColecao}!A${sheetRowNumber}:T${sheetRowNumber}`, [rowValues]);
    emitLog(`[${scopeLabel}] Sheets atualizado na aba ${origemColecao}, linha ${sheetRowNumber}.`, "success");
    return;
  }

  await appendRows(SHEETS_SPREADSHEET_ID, `${origemColecao}!A:T`, [rowValues]);
  emitLog(`[${scopeLabel}] Sheets append na aba ${origemColecao} para registro corrigido.`, "success");
}

function enqueueManualSync(task) {
  manualSyncQueue.push(task);
  if (!manualSyncRunning) {
    processManualSyncQueue().catch((err) => {
      emitLog(`[SYNC] Erro inesperado na fila de sincronizacao: ${err.message}`, "error");
    });
  }
}

async function processManualSyncQueue() {
  if (manualSyncRunning) return;
  manualSyncRunning = true;

  while (manualSyncQueue.length) {
    const task = manualSyncQueue.shift();
    if (!task) continue;

    try {
      await syncManualUpdateToTypesense(task.docId, task.scopeLabel);
    } catch (err) {
      emitLog(`[${task.scopeLabel}] Typesense falhou para doc ${task.docId}: ${err.message}`, "error");
    }

    try {
      await syncManualUpdateToSourceJson(task);
    } catch (err) {
      emitLog(`[${task.scopeLabel}] JSON falhou para doc ${task.docId}: ${err.message}`, "error");
    }

    try {
      await syncManualUpdateToSheets(task);
    } catch (err) {
      emitLog(`[${task.scopeLabel}] Sheets falhou para doc ${task.docId}: ${err.message}`, "error");
    }
  }

  manualSyncRunning = false;
}

function terminateCurrentProcess() {
  if (!currentProcess || !currentProcess.pid) return;

  const pid = currentProcess.pid;

  if (process.platform === "win32") {
    exec(`taskkill /pid ${pid} /t /f`, () => {});
    return;
  }

  try {
    currentProcess.kill("SIGTERM");
  } catch {}
}

function scheduleDailyRun(config) {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  if (!config.hour) {
    emitLog("Agendamento automatico desativado. Execucao manual disponivel.", "info");
    return;
  }

  const parsed = parseHour(config.hour);
  if (!parsed) return;

  const expr = `${parsed.minute} ${parsed.hour} * * *`;
  cronTask = cron.schedule(
    expr,
    async () => {
      emitLog(`Disparo agendado (${config.hour}) iniciado.`, "info");
      await runQueue(config.selectedScripts, "agendado");
    },
    { timezone: config.timezone }
  );

  emitLog(`Agendamento ativo: todos os dias as ${config.hour} (${config.timezone}).`, "info");
}

async function runQueue(selectedScripts, origin = "manual", extraEnv = {}) {
  if (running) {
    emitLog("Ja existe uma execucao em andamento.", "warn");
    return;
  }

  if (!Array.isArray(selectedScripts) || selectedScripts.length === 0) {
    emitLog("Nenhum projeto selecionado para executar.", "warn");
    return;
  }

  const allowedScripts = loadPackageJson().scripts || {};
  const projetosCombinados = extractJforaScripts();
  const nomesCombinados = new Set(projetosCombinados.map((project) => project.name));
  selectedScripts = selectedScripts.filter((name) => typeof name === "string" && Object.hasOwn(allowedScripts, name) && (nomesCombinados.has(name) || (name !== "alugueis" && !name.endsWith(":alugueis") && !name.endsWith(":locacao") && !name.startsWith("locacao:"))));
  if (!selectedScripts.length) {
    emitLog("Nenhum projeto valido selecionado.", "warn");
    return;
  }
  selectedScripts = ordenarScripts(selectedScripts);
  const etapas = expandirEtapas(selectedScripts, projetosCombinados);

  running = true;
  stopRequested = false;
  currentQueue = etapas.map((etapa) => etapa.script);
  currentIndex = -1;
  emitState();

  const startedAt = Date.now();
  const projetosIniciados = new Set();
  let ok = 0;
  let fail = 0;

  emitLog(`Rodada iniciada (${origin}) com ${selectedScripts.length} projetos (${etapas.length} etapas: vendas e alugueis em sequencia).`, "info");

  for (let i = 0; i < currentQueue.length; i++) {
    if (stopRequested) {
      emitLog("Parada solicitada. Encerrando rodada antes do proximo projeto.", "warn");
      break;
    }

    currentIndex = i;
    const projeto = etapas[i].projeto;
    if (!projetosIniciados.has(projeto)) {
      delete projectErrors[projeto];
      projetosIniciados.add(projeto);
    }
    emitState();

    const scriptName = currentQueue[i];
    const etapaLabel = etapas[i].tipo === "script" ? "" : ` ${etapas[i].tipo === "venda" ? "vendas" : "alugueis"}`;
    const cmd = `npm run ${scriptName}`;
    const scriptStart = Date.now();
    let outputTail = "";

    emitLog(`>>> [${etapas[i].projeto}${etapaLabel}] INICIO (${scriptName})`, "info");

    const code = await new Promise((resolve) => {
      currentProcess = spawn(cmd, {
        cwd: backendRoot,
        shell: true,
        env: { ...process.env, ...extraEnv },
      });

      currentProcess.stdout.on("data", (data) => {
        outputTail = (outputTail + data.toString()).slice(-16000);
        io.emit("scheduler:output", {
          project: scriptName,
          stream: "stdout",
          text: data.toString(),
        });
      });

      currentProcess.stderr.on("data", (data) => {
        outputTail = (outputTail + data.toString()).slice(-16000);
        io.emit("scheduler:output", {
          project: scriptName,
          stream: "stderr",
          text: data.toString(),
        });
      });

      currentProcess.on("close", (exitCode) => {
        resolve(exitCode ?? 1);
      });
      currentProcess.on("error", (error) => {
        emitLog(`[${scriptName}] Falha ao iniciar processo: ${error.message}`, "error");
        resolve(1);
      });
    });

    let effectiveCode = code;
    if (etapas[i].tipo !== "script" && !stopRequested) {
      try {
        const availability = await updateAvailability(scriptName, { status: code === 0 ? "completed" : "failed", outputTail });
        if (availability.siteUnavailable) {
          effectiveCode = 1;
          emitLog(`[${scriptName}] ${availability.publicationError || "Site indisponivel; anuncios suspensos do Typesense ate a recuperacao."}`, availability.publicationError ? "error" : "warn");
        }
      } catch (error) {
        effectiveCode = 1;
        emitLog(`[${scriptName}] Falha ao atualizar disponibilidade: ${error.message}`, "error");
      }
    }
    const elapsed = Date.now() - scriptStart;
    const min = Math.floor(elapsed / 60000);
    const sec = Math.floor((elapsed % 60000) / 1000);

    if (effectiveCode !== 0 && !stopRequested) {
      projectErrors[projeto] = [...(projectErrors[projeto] || []), scriptName];
    }
    emitState();

    if (effectiveCode === 0) {
      ok++;
      emitLog(`<<< [${scriptName}] OK (${min}m ${sec}s)`, "success");
      const correctionResult = applyCityJsonCorrectionsToCrawlerFiles();
      if (correctionResult.recordsUpdated > 0) {
        emitLog(`[CIDADES-JSON] ${correctionResult.recordsUpdated} correcao(oes) manual(is) reaplicada(s) apos ${scriptName}.`, "success");
      }
      const bairroCorrectionResult = applyBairroJsonCorrectionsToCrawlerFiles();
      if (bairroCorrectionResult.recordsUpdated > 0) {
        emitLog(`[BAIRROS-JSON] ${bairroCorrectionResult.recordsUpdated} correcao(oes) manual(is) reaplicada(s) apos ${scriptName}.`, "success");
      }
      const tipoCorrectionResult = applyTipoImovelJsonCorrectionsToCrawlerFiles();
      if (tipoCorrectionResult.recordsUpdated > 0) {
        emitLog(`[TIPO-IMOVEL-JSON] ${tipoCorrectionResult.recordsUpdated} correcao(oes) manual(is) reaplicada(s) apos ${scriptName}.`, "success");
      }
      const localizacaoCorrectionResult = applyLocalizacaoJsonCorrectionsToCrawlerFiles();
      if (localizacaoCorrectionResult.recordsUpdated > 0) {
        emitLog(`[LOCALIZACAO-JSON] ${localizacaoCorrectionResult.recordsUpdated} correcao(oes) manual(is) reaplicada(s) apos ${scriptName}.`, "success");
      }
      const linkFotoCorrectionResult = applyLinkFotoJsonCorrectionsToCrawlerFiles();
      if (linkFotoCorrectionResult.recordsUpdated > 0) {
        emitLog(`[LINKFOTO-JSON] ${linkFotoCorrectionResult.recordsUpdated} correcao(oes) manual(is) reaplicada(s) apos ${scriptName}.`, "success");
      }
      const precoCorrectionResult = applyPrecoJsonCorrectionsToCrawlerFiles();
      if (precoCorrectionResult.recordsUpdated > 0) {
        emitLog(`[PRECO-JSON] ${precoCorrectionResult.recordsUpdated} correcao(oes) manual(is) reaplicada(s) apos ${scriptName}.`, "success");
      }
    } else {
      fail++;
      const statusType = stopRequested ? "warn" : "error";
      const statusText = stopRequested ? "CANCELADO" : "FALHOU";
      emitLog(`<<< [${scriptName}] ${statusText} (code=${effectiveCode}) (${min}m ${sec}s)`, statusType);
    }

    currentProcess = null;

    if (stopRequested) {
      emitLog("Parada solicitada. Rodada sera encerrada apos cancelar o processo atual.", "warn");
      break;
    }
  }

  const totalElapsed = Date.now() - startedAt;
  const min = Math.floor(totalElapsed / 60000);
  const sec = Math.floor((totalElapsed % 60000) / 1000);

  const finalMsg = stopRequested
    ? `Rodada interrompida pelo usuario. Sucesso: ${ok}, Falhas: ${fail}, Duracao: ${min}m ${sec}s`
    : `Rodada finalizada. Sucesso: ${ok}, Falhas: ${fail}, Duracao: ${min}m ${sec}s`;

  emitLog(finalMsg, fail || stopRequested ? "warn" : "success");

  running = false;
  stopRequested = false;
  currentQueue = [];
  currentIndex = -1;
  emitState();
}

app.get("/api/projects", (req, res) => {
  const projects = extractJforaScripts();
  const config = loadConfig(projects);
  res.json({ projects, config, projectErrors });
});

app.post("/api/config", (req, res) => {
  const projects = extractJforaScripts();
  const validNames = new Set(projects.map((p) => p.name));

  const hour = String(req.body?.hour ?? "").trim();
  const timezone = "America/Sao_Paulo";
  const selectedScripts = ordenarScripts(Array.isArray(req.body?.selectedScripts)
    ? req.body.selectedScripts.filter((s) => validNames.has(s))
    : []);

  const parsed = parseHour(hour);
  if (hour && !parsed) {
    return res.status(400).json({ error: "Horario invalido. Use HH:mm." });
  }
  if (selectedScripts.length === 0) {
    return res.status(400).json({ error: "Selecione ao menos um projeto." });
  }

  const config = { hour, timezone, selectedScripts };
  saveConfig(config);
  scheduleDailyRun(config);

  return res.json({ ok: true, config });
});

app.post("/api/run-now", async (req, res) => {
  const projects = extractJforaScripts();
  const validNames = new Set(projects.map((p) => p.name));
  const config = loadConfig(projects);
  const selectedScripts = Array.isArray(req.body?.selectedScripts)
    ? req.body.selectedScripts.filter((s) => validNames.has(s))
    : config.selectedScripts;

  if (!selectedScripts.length) {
    return res.status(400).json({ error: "Selecione ao menos um projeto para executar agora." });
  }

  runQueue(selectedScripts, "manual").catch((err) => {
    emitLog(`Erro na rodada manual: ${err.message}`, "error");
  });

  return res.json({ ok: true, selectedScripts });
});

app.post("/api/publish-json", (req, res) => {
  if (running) {
    return res.status(409).json({ error: "Ja existe uma execucao em andamento." });
  }

  const validNames = new Set(extractJforaScripts().map((project) => project.name));
  const selectedScripts = Array.isArray(req.body?.selectedScripts)
    ? req.body.selectedScripts.filter((script) => validNames.has(script))
    : [];
  const collectionNames = selectedScripts.map(getCollectionNameForScript).filter(Boolean);

  if (!collectionNames.length) {
    return res.status(400).json({ error: "Selecione ao menos um projeto com JSON para publicar." });
  }

  const missingJsons = collectionNames
    .filter((collectionName) => !fs.existsSync(path.join(backendRoot, "crawler", `${collectionName}.json`)))
    .map((collectionName) => `${collectionName}.json`);
  if (missingJsons.length) {
    return res.status(400).json({
      error: `JSONs ausentes: ${missingJsons.join(", ")}. Execute e revise esses projetos antes de publicar.`
    });
  }

  running = true;
  currentQueue = [...selectedScripts];
  currentIndex = -1;
  emitState();
  emitLog(`Publicacao no Firestore iniciada para: ${collectionNames.join(", ")}.`, "info");

  let firestoreOutput = "";
  let publishFinished = false;
  const finishPublish = (code, errorMessage = "") => {
    if (publishFinished) return;
    publishFinished = true;
    const total = firestoreOutput.match(/FIRESTORE_PUBLISH_TOTAL=(\d+)/)?.[1];
    const message = code === 0
      ? `Publicacao no Firestore concluida. Imoveis gravados: ${total || 0}.`
      : `Publicacao no Firestore falhou${errorMessage ? `: ${errorMessage}` : ` (code=${code})`}.`;
    if (code === 0) recordFirestoreTransfer(collectionNames);
    emitLog(message, code === 0 ? "success" : "error");
    running = false;
    currentQueue = [];
    currentIndex = -1;
    currentProcess = null;
    emitState();
  };

  currentProcess = spawn(process.execPath, ["publish-crawler-json.js", ...collectionNames], {
    cwd: backendRoot,
    env: { ...process.env, FIRESTORE_PUBLISH_JSON: "true" },
  });

  currentProcess.stdout.on("data", (data) => {
    firestoreOutput += data.toString();
    io.emit("scheduler:output", { project: "firestore", stream: "stdout", text: data.toString() });
  });
  currentProcess.stderr.on("data", (data) => {
    io.emit("scheduler:output", { project: "firestore", stream: "stderr", text: data.toString() });
  });
  currentProcess.on("error", (error) => {
    emitLog(`[FIRESTORE] Falha ao iniciar publicação: ${error.message}`, "error");
    finishPublish(1, error.message);
  });
  currentProcess.on("close", (code) => {
    finishPublish(code ?? 1);
  });

  return res.json({ ok: true, collectionNames });
});

function parseNumericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/R\$\s*/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function summarizeFirestoreRecords(records, highlightInvalid = false) {
  const { options: cityOptions } = loadCityCatalog();
  const { entries: bairroEntries } = loadBairroCatalog();
  const tipoNamesBySlug = new Map(
    Object.entries(JSON.parse(fs.readFileSync(tiposCatalogoPath, "utf8")).tiposPorSlug || {})
      .map(([slug, aliases]) => [slug, String(aliases?.[0]?.nome || "").trim()])
  );
  const countBy = (field, formatName = (value) => ({ name: value, value, foraDoPadrao: false })) => {
    const counts = new Map();
    for (const record of records) {
      const value = String(record[field] ?? "").trim();
      if (!value) continue;
      const formatted = formatName(value, record) || { name: value, value, foraDoPadrao: false };
      const name = String(formatted.name || value).trim();
      const key = `${formatted.foraDoPadrao ? "invalido" : "valido"}::${name}`;
      const current = counts.get(key) || { name, value: String(formatted.value ?? value).trim(), count: 0, foraDoPadrao: Boolean(formatted.foraDoPadrao) };
      current.count += 1;
      counts.set(key, current);
    }
    return [...counts.values()]
      .sort((a, b) => Number(b.foraDoPadrao) - Number(a.foraDoPadrao) || b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  };
  const rangeFor = (field) => {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    for (const record of records) {
      const value = parseNumericValue(record[field]);
      if (value === null || value < 0) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
      count += 1;
    }
    return count ? { min, max, count } : null;
  };

  return {
    total: records.length,
    imobiliarias: countBy("imobiliariaId"),
    tipos: countBy("tipoImovel", (slug) => ({ name: tipoNamesBySlug.get(slug) || formatLabelFromSlug(slug), foraDoPadrao: highlightInvalid && !tipoNamesBySlug.has(slug) })),
    cidades: countBy("cidade", (slug) => ({ name: cityOptions.find((item) => item.slug === slug)?.nome || formatCityNameFromSlug(slug), foraDoPadrao: highlightInvalid && !cityOptions.some((item) => item.slug === slug) })),
    bairros: countBy("bairro", (slug, record) => {
      const city = String(record.cidade || "").trim();
      const matches = bairroEntries.filter((item) => item.cidade === city && item.slug === slug);
      const principal = matches.find((item) => String(item.principal).toLowerCase() === "sim");
      return { name: principal?.nome || matches[0]?.nome || formatLabelFromSlug(slug), value: slug, foraDoPadrao: highlightInvalid && !principal };
    }),
    ranges: {
      preco: rangeFor("preco"),
      dormitorioValor: rangeFor("dormitorioValor"),
      banheiroValor: rangeFor("banheiroValor"),
      areaValor: rangeFor("areaValor"),
      garagemValor: rangeFor("garagemValor"),
    },
  };
}

function cachedPublicFirestoreRecords() {
  const snapshot = firestorePanelCache.get("public-records");
  if (!snapshot) throw new Error("Sem snapshot local do Firestore. Consulte o detalhamento remoto explicitamente na aba Firestore; essa operacao le toda a base.");
  return snapshot;
}

app.get("/api/firestore-summary", (req, res) => {
  try {
    const snapshot = cachedPublicFirestoreRecords();
    return res.json({ ok: true, cached: true, snapshotAt: snapshot.updatedAt,
      ...summarizeFirestoreRecords(snapshot.value.map(doc => doc.data)) });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao carregar resumo do Firestore: ${error.message}` });
  }
});

app.post("/api/firestore-summary/refresh", async (req, res) => {
  if (req.body?.confirmarLeituraCompleta !== true) {
    return res.status(400).json({ error: "Confirme a leitura completa: pode consumir uma leitura por imovel publicado e esgotar a cota diaria." });
  }
  try {
    const entry = await firestorePanelCache.refresh("public-records", async () => {
      const db = ensureFirestore();
      emitLog("[FIRESTORE] Consulta completa explicitamente solicitada; cada documento lido consome cota.", "warn");
      const snapshots = await Promise.all(["__imoveisPublicos", "__alugueisPublicos"].map(name => db.collection(name).get()));
      emitLog(`[FIRESTORE] Detalhamento remoto: ${snapshots.reduce((total, snapshot) => total + snapshot.docs.length, 0)} documentos lidos. Proximas consultas do painel usarao cache.`, "info");
      return snapshots.flatMap((snapshot, index) => snapshot.docs.map(doc => ({
        id: doc.id, tipo: index === 0 ? "venda" : "aluguel", data: doc.data() || {},
      })));
    });
    return res.json({ ok: true, snapshotAt: entry.updatedAt });
  } catch (error) {
    return res.status(503).json({ error: `Falha ao consultar detalhamento: ${mensagemErroFirestore(error)}` });
  }
});

function firestoreTransferSummaryResponse(req, res) {
  let json;
  try {
    const local = getJsonTransferSummary();
    json = { ...local, projects: local.projects.length };
    const snapshot = firestorePanelCache.get("transfer-summary");
    return res.json({ ok: true, json, firestore: snapshot?.value, snapshotAt: snapshot?.updatedAt || "",
      firestoreError: snapshot ? "" : "Sem contagem remota em cache. Use Consultar contagens no Firestore para realizar uma leitura explicita." });
  } catch (error) {
    return res.status(500).json({ ok: false, json, error: `Falha ao carregar resumo da transmissão: ${error.message}` });
  }
}

app.get("/api/firestore-transfer-summary", firestoreTransferSummaryResponse);
app.post("/api/firestore-transfer-summary/refresh", async (req, res) => {
  try {
    await firestorePanelCache.refresh("transfer-summary", getFirestoreTransferSummary);
    return firestoreTransferSummaryResponse(req, res);
  } catch (error) {
    return res.status(503).json({ error: `Falha ao consultar contagens: ${mensagemErroFirestore(error)}` });
  }
});

app.get("/api/json-summary", (req, res) => {
  try {
    const crawlerDir = path.join(backendRoot, "crawler");
    const currentCounts = {};
    const records = fs.readdirSync(crawlerDir)
      .filter(arquivoPrincipalImoveis)
      .flatMap((file) => {
        const collectionName = path.basename(file, ".json");
        const content = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
        if (!Array.isArray(content)) return [];
        const validos = content.filter((record) => record && typeof record === "object" && !String(record.dataExclusao || "").trim());
        currentCounts[collectionName] = validos.length;
        return validos.map((record) => ({ ...record, imobiliariaId: record.imobiliariaId || record.corretor || collectionName }));
      });

    const previousSnapshot = loadJsonSummarySnapshot();
    const variacaoProjetos = buildVariacaoProjetos(currentCounts, previousSnapshot);
    saveJsonSummarySnapshot(currentCounts);

    return res.json({
      ok: true,
      ...summarizeFirestoreRecords(records, true),
      variacaoProjetos,
      variacaoLimiar: JSON_SUMMARY_VARIACAO_LIMIAR,
      variacaoAnteriorEm: previousSnapshot.updatedAt || "",
    });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao carregar resumo dos JSONs: ${error.message}` });
  }
});

app.get("/api/json-summary/bairro-records", (req, res) => {
  try {
    const bairro = String(req.query.bairro || "").trim();
    if (!bairro) return res.status(400).json({ error: "Bairro obrigatorio." });

    const { byCityPrincipal } = loadBairroCatalog();
    const { options: cityOptions } = loadCityCatalog();
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;
      data.forEach((item, index) => {
        if (String(item?.dataExclusao || "").trim()) return;
        if (String(item?.bairro || "").trim() !== bairro) return;
        issues.push({
          file,
          index,
          bairro,
          cidade: String(item?.cidade || "").trim(),
          titulo: String(item?.titulo || "").trim(),
          linkReal: String(item?.linkReal || "").trim(),
        });
      });
    }

    return res.json({
      ok: true,
      total: issues.length,
      issues,
      bairroOptions: Object.fromEntries(byCityPrincipal),
      cityOptions,
    });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao carregar registros do bairro: ${error.message}` });
  }
});

app.post("/api/json-summary/bairro-records/resolve-all", async (req, res) => {
  try {
    const bairroOriginal = String(req.body?.bairro || "").trim();
    const cidade = String(req.body?.cidade || "").trim();
    const targetSlug = String(req.body?.targetSlug || "").trim();
    if (!bairroOriginal || !cidade || !targetSlug) {
      return res.status(400).json({ error: "Bairro original, cidade e bairro correto são obrigatórios." });
    }

    const { keySet, byCity } = loadBairroCatalog();
    if (!keySet.has(`${targetSlug}__${cidade}`)) {
      return res.status(400).json({ error: "Bairro correto não existe para a cidade selecionada." });
    }

    const targetNome = (byCity.get(cidade) || []).find((item) => item.slug === targetSlug)?.nome || formatLabelFromSlug(targetSlug);
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const corrections = loadBairroJsonCorrections();
    const correctionIndex = new Map(corrections.map((item, index) => [`${item?.file || ""}__${item?.linkReal || ""}`, index]));
    const updatedRecords = [];

    for (const file of files) {
      const jsonPath = path.join(crawlerDir, file);
      let data;
      try {
        data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;
      let changed = false;

      data.forEach((item, index) => {
        if (String(item?.dataExclusao || "").trim()) return;
        if (String(item?.cidade || "").trim() !== cidade || String(item?.bairro || "").trim() !== bairroOriginal) return;
        data[index] = { ...item, cidade, bairro: targetSlug };
        changed = true;
        const linkReal = String(item?.linkReal || "").trim();
        updatedRecords.push({ file, linkReal });
        if (!linkReal) return;
        const correction = { file, linkReal, cidade, bairro: targetSlug, nome: targetNome, atualizadoEm: nowStamp() };
        const key = `${file}__${linkReal}`;
        const existingIndex = correctionIndex.get(key);
        if (existingIndex === undefined) {
          correctionIndex.set(key, corrections.length);
          corrections.push(correction);
        } else {
          corrections[existingIndex] = correction;
        }
      });

      if (changed) fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }

    writeBairroJsonCorrections(corrections);
    const firestoreResults = await Promise.all(updatedRecords
      .filter((record) => record.linkReal)
      .map((record) => updateFirestoreFromJsonCorrection({
        file: record.file,
        linkReal: record.linkReal,
        patch: { cidade, bairro: targetSlug, bairroNome: targetNome },
        scopeLabel: "BAIRROS-JSON-LOTE",
      })));
    const firestore = firestoreResults.reduce((total, result) => ({
      sourceUpdated: total.sourceUpdated + Number(result?.sourceUpdated || 0),
      publicUpdated: total.publicUpdated + Number(result?.publicUpdated || 0),
    }), { sourceUpdated: 0, publicUpdated: 0 });

    emitLog(`[BAIRROS-JSON] ${updatedRecords.length} registro(s) com '${bairroOriginal}' corrigido(s) para '${targetSlug}'.`, "success");
    return res.json({ ok: true, updated: updatedRecords.length, targetSlug, targetNome, firestore });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao corrigir bairros em lote: ${error.message}` });
  }
});

// ------------------------------
// 🔹 Duplicados: rotas do painel
// ------------------------------
app.get("/api/duplicados/sugestoes", (req, res) => {
  try {
    const sugestoes = gerarSugestoesDuplicados();
    return res.json({ ok: true, total: sugestoes.length, sugestoes });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao gerar sugestões de duplicados: ${error.message}` });
  }
});

app.get("/api/duplicados/buscar", (req, res) => {
  try {
    const termo = normalizeTextForMatch(String(req.query?.q || ""));
    if (termo.length < 2) return res.json({ ok: true, resultados: [] });

    const registros = loadImoveisAtivos();
    const resultados = registros
      .filter((item) => normalizeTextForMatch(`${item.titulo} ${item.localizacao} ${item.linkReal}`).includes(termo))
      .slice(0, 30);

    return res.json({ ok: true, resultados });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao buscar imóveis: ${error.message}` });
  }
});

app.get("/api/duplicados/grupos", (req, res) => {
  try {
    const store = loadDuplicadosStore();
    const registros = loadImoveisAtivos();
    const registroPorKey = new Map(registros.map((item) => [memberKey(item.collectionName, item.linkReal), item]));

    const grupos = Object.entries(store.grupos)
      .map(([grupoId, grupo]) => ({
        grupoId,
        origem: grupo?.origem || "manual",
        criadoEm: grupo?.criadoEm || "",
        atualizadoEm: grupo?.atualizadoEm || "",
        membros: (grupo?.membros || [])
          .map((membro) => registroPorKey.get(memberKey(membro.collectionName, membro.linkReal)) || { ...membro, ausente: true }),
      }))
      .sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));

    return res.json({ ok: true, total: grupos.length, grupos });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao carregar grupos de duplicados: ${error.message}` });
  }
});

app.post("/api/duplicados/confirmar", (req, res) => {
  try {
    const membros = Array.isArray(req.body?.membros) ? req.body.membros : [];
    const membrosValidos = membros
      .map((item) => ({ collectionName: String(item?.collectionName || "").trim(), linkReal: String(item?.linkReal || "").trim() }))
      .filter((item) => item.collectionName && item.linkReal);

    if (membrosValidos.length < 2) {
      return res.status(400).json({ error: "Selecione ao menos 2 imóveis para confirmar a duplicidade." });
    }

    const store = loadDuplicadosStore();
    const keysNovos = membrosValidos.map((m) => memberKey(m.collectionName, m.linkReal));

    // Verifica se algum dos membros já pertence a um grupo existente para fazer merge nele.
    let grupoIdAlvo = null;
    for (const [grupoId, grupo] of Object.entries(store.grupos)) {
      const temIntersecao = (grupo.membros || []).some((membro) => keysNovos.includes(memberKey(membro.collectionName, membro.linkReal)));
      if (temIntersecao) {
        grupoIdAlvo = grupoId;
        break;
      }
    }

    const agora = nowStamp();
    if (grupoIdAlvo) {
      const grupo = store.grupos[grupoIdAlvo];
      const membrosExistentesKeys = new Set((grupo.membros || []).map((m) => memberKey(m.collectionName, m.linkReal)));
      membrosValidos.forEach((membro) => {
        const key = memberKey(membro.collectionName, membro.linkReal);
        if (!membrosExistentesKeys.has(key)) grupo.membros.push(membro);
      });
      grupo.atualizadoEm = agora;
    } else {
      grupoIdAlvo = randomUUID();
      store.grupos[grupoIdAlvo] = {
        membros: membrosValidos,
        origem: req.body?.origem === "manual" ? "manual" : "sugerido",
        criadoEm: agora,
        atualizadoEm: agora,
      };
    }

    // Remove qualquer marcação de descarte entre os membros agora confirmados.
    store.descartados = store.descartados.filter((par) => {
      const [a, b] = par.split("||");
      return !(keysNovos.includes(a) && keysNovos.includes(b));
    });

    saveDuplicadosStore(store);
    const collectionNames = [...new Set(store.grupos[grupoIdAlvo].membros.map((m) => m.collectionName))];
    aplicarDuplicadoGrupoNosJsons(collectionNames);

    emitLog(`[DUPLICADOS] Grupo ${grupoIdAlvo} confirmado com ${store.grupos[grupoIdAlvo].membros.length} imóvel(is).`, "success");
    return res.json({ ok: true, grupoId: grupoIdAlvo, grupo: store.grupos[grupoIdAlvo] });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao confirmar duplicidade: ${error.message}` });
  }
});

app.post("/api/duplicados/rejeitar", (req, res) => {
  try {
    const membros = Array.isArray(req.body?.membros) ? req.body.membros : [];
    const keys = membros
      .map((item) => memberKey(item?.collectionName, item?.linkReal))
      .filter((key) => key !== "::");

    if (keys.length < 2) {
      return res.status(400).json({ error: "Informe ao menos 2 imóveis para rejeitar a sugestão." });
    }

    const store = loadDuplicadosStore();
    const descartadosSet = new Set(store.descartados);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        descartadosSet.add(pairKey(keys[i], keys[j]));
      }
    }
    store.descartados = [...descartadosSet];
    saveDuplicadosStore(store);

    emitLog(`[DUPLICADOS] Sugestão com ${keys.length} imóvel(is) rejeitada.`, "info");
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao rejeitar sugestão: ${error.message}` });
  }
});

app.post("/api/duplicados/desvincular", (req, res) => {
  try {
    const grupoId = String(req.body?.grupoId || "").trim();
    const membro = req.body?.membro || {};
    const collectionName = String(membro.collectionName || "").trim();
    const linkReal = String(membro.linkReal || "").trim();

    if (!grupoId || !collectionName || !linkReal) {
      return res.status(400).json({ error: "grupoId e membro são obrigatórios." });
    }

    const store = loadDuplicadosStore();
    const grupo = store.grupos[grupoId];
    if (!grupo) return res.status(404).json({ error: "Grupo não encontrado." });

    const alvoKey = memberKey(collectionName, linkReal);
    const collectionNamesOriginais = [...new Set((grupo.membros || []).map((m) => m.collectionName))];
    grupo.membros = (grupo.membros || []).filter((m) => memberKey(m.collectionName, m.linkReal) !== alvoKey);

    // Se o grupo deixa de ter ao menos 2 membros, ele é dissolvido e todos os
    // arquivos originais precisam ter o duplicado_grupo limpo (não só o removido).
    let collectionNamesAfetados = [collectionName];
    if (grupo.membros.length < 2) {
      delete store.grupos[grupoId];
      collectionNamesAfetados = collectionNamesOriginais;
    } else {
      grupo.atualizadoEm = nowStamp();
    }

    saveDuplicadosStore(store);
    aplicarDuplicadoGrupoNosJsons(collectionNamesAfetados);

    emitLog(`[DUPLICADOS] Imóvel removido do grupo ${grupoId}.`, "info");
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao desvincular imóvel: ${error.message}` });
  }
});

app.post("/api/send-typesense", async (req, res) => {
  if (running) {
    emitLog("Envio ao Typesense ignorado: ja existe uma execucao em andamento.", "warn");
    return res.status(409).json({ error: "Ja existe uma execucao em andamento." });
  }

  const source = String(req.body?.source || "current").trim();
  if (!["current", "backup", "json"].includes(source)) {
    return res.status(400).json({ error: "Origem inválida para o Typesense." });
  }
  let selectedProjects;
  if (req.body?.selectedProjects !== undefined) {
    try {
      if (source !== "json") throw new Error("Selecao de projetos disponivel somente para JSON local.");
      const available = fs.readdirSync(path.join(backendRoot, "crawler")).filter(arquivoPrincipalVendas).map(file => file.slice(0, -5)).filter(name => !projetoSuspenso(name));
      selectedProjects = validateSelectedProjects(req.body.selectedProjects, available);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (source === "backup") {
    const backupSnapshot = await ensureFirestore().collection("__imoveisPublicos__backup").limit(1).get();
    if (backupSnapshot.empty) {
      return res.status(400).json({ error: "Não há backup público disponível para enviar ao Typesense." });
    }
  }

  const script = source === "backup" ? TYPESENSE_BACKUP_SCRIPT : source === "json" ? TYPESENSE_JSON_SCRIPT : TYPESENSE_SCRIPT;
  const scripts = loadPackageJson().scripts ?? {};
  if (!scripts[script]) {
    return res.status(400).json({ error: `Script '${script}' nao encontrado no package.json.` });
  }

  const previousSource = process.env.TYPESENSE_SOURCE_COLLECTION;
  if (source === "backup") process.env.TYPESENSE_SOURCE_COLLECTION = "__imoveisPublicos__backup";
  runQueue([script], "typesense-manual", { TYPESENSE_SELECTED_PROJECTS: selectedProjects ? JSON.stringify(selectedProjects) : "" }).catch((err) => {
    emitLog(`Erro ao enviar dados ao Typesense: ${err.message}`, "error");
  }).finally(() => {
    if (previousSource === undefined) delete process.env.TYPESENSE_SOURCE_COLLECTION;
    else process.env.TYPESENSE_SOURCE_COLLECTION = previousSource;
  });

  emitLog(`Envio ao Typesense solicitado com a origem ${source === "backup" ? "backup" : source === "json" ? "JSON local (sem Firestore)" : "atual"}.`, "info");
  return res.json({ ok: true, script, source });
});

app.get("/api/typesense-source-info", async (req, res) => {
  try {
    const json = await resumirJsonPublicacao();
    json.projects = fs.readdirSync(path.join(backendRoot, "crawler")).filter(arquivoPrincipalVendas).map(file => file.slice(0, -5)).filter(name => !projetoSuspenso(name)).sort();
    const snapshot = firestorePanelCache.get("transfer-summary");
    if (!snapshot) return res.json({ ok: true, json, firestoreError: "Sem contagem remota em cache; consulte explicitamente na aba Firestore." });
    const resumir = value => ({ total: value.porTipo.venda.records, ultimaAtualizacao: value.porTipo.venda.movedAt });
    return res.json({ ok: true, json, current: resumir(snapshot.value.current), backup: resumir(snapshot.value.backup), snapshotAt: snapshot.updatedAt });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao obter data dos dados: ${error.message}` });
  }
});

app.get("/api/typesense-summary", async (req, res) => {
  try {
    const origemJson = req.query.source === "json";
    let selectedProjects;
    if (req.query.projects !== undefined) {
      const available = fs.readdirSync(path.join(backendRoot, "crawler")).filter(arquivoPrincipalVendas).map(file => file.slice(0, -5)).filter(name => !projetoSuspenso(name));
      selectedProjects = validateSelectedProjects(JSON.parse(req.query.projects), available);
    }
    const [origemRecords, typesenseDocs] = await Promise.all([
      origemJson
        ? loadJsonPublicDocs().then((docs) => docs.filter(doc => !selectedProjects || selectedProjects.includes(doc.data.imobiliariaId)).map((doc) => doc.data))
        : Promise.resolve(cachedPublicFirestoreRecords().value.filter(doc => doc.tipo === "venda").map(doc => doc.data)),
      fetchAllTypesenseDocs(),
    ]);
    const firestoreResumo = summarizeFirestoreRecords(origemRecords);
    const typesenseResumo = summarizeFirestoreRecords(typesenseDocs);
    const sortByName = (items) => [...items].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    const compararPorNome = (origem, destino) => {
      const linhas = new Map();
      for (const item of origem) linhas.set(item.name, { name: item.name, origem: item.count, typesense: 0 });
      for (const item of destino) {
        const linha = linhas.get(item.name) || { name: item.name, origem: 0, typesense: 0 };
        linha.typesense += item.count;
        linhas.set(item.name, linha);
      }
      return sortByName([...linhas.values()]);
    };
    return res.json({
      ok: true,
      origem: origemJson ? "json" : "firestore",
      snapshotAt: origemJson ? "" : cachedPublicFirestoreRecords().updatedAt,
      firestore: {
        total: firestoreResumo.total,
        tipos: firestoreResumo.tipos.length,
        cidades: firestoreResumo.cidades.length,
        bairros: firestoreResumo.bairros.length,
      },
      typesense: {
        total: typesenseResumo.total,
        tipos: typesenseResumo.tipos.length,
        cidades: typesenseResumo.cidades.length,
        bairros: typesenseResumo.bairros.length,
      },
      resumo: {
        ...typesenseResumo,
        cidades: sortByName(typesenseResumo.cidades),
        bairros: sortByName(typesenseResumo.bairros),
        tipos: sortByName(typesenseResumo.tipos),
      },
      comparacao: {
        cidades: compararPorNome(firestoreResumo.cidades, typesenseResumo.cidades),
        bairros: compararPorNome(firestoreResumo.bairros, typesenseResumo.bairros),
        tipos: compararPorNome(firestoreResumo.tipos, typesenseResumo.tipos),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: `Falha ao carregar resumo do Typesense: ${mensagemErroFirestore(error)}` });
  }
});

app.post("/api/check-missing-city-slugs", (req, res) => {
  if (running) {
    emitLog("Checagem de cidades ignorada: ja existe uma execucao em andamento.", "warn");
    return res.status(409).json({ error: "Ja existe uma execucao em andamento." });
  }

  const scripts = loadPackageJson().scripts ?? {};
  if (!scripts[CITY_SLUG_AUDIT_SCRIPT]) {
    return res.status(400).json({ error: `Script '${CITY_SLUG_AUDIT_SCRIPT}' nao encontrado no package.json.` });
  }

  runQueue([CITY_SLUG_AUDIT_SCRIPT], "check-city-slugs-manual").catch((err) => {
    emitLog(`Erro ao checar cidades sem slug: ${err.message}`, "error");
  });

  emitLog("Disparo manual da checagem de cidades sem slug solicitado.", "info");
  return res.json({ ok: true, script: CITY_SLUG_AUDIT_SCRIPT });
});

app.post("/api/check-missing-bairro-slugs", (req, res) => {
  if (running) {
    emitLog("Checagem de bairros ignorada: ja existe uma execucao em andamento.", "warn");
    return res.status(409).json({ error: "Ja existe uma execucao em andamento." });
  }

  const scripts = loadPackageJson().scripts ?? {};
  if (!scripts[BAIRRO_SLUG_AUDIT_SCRIPT]) {
    return res.status(400).json({ error: `Script '${BAIRRO_SLUG_AUDIT_SCRIPT}' nao encontrado no package.json.` });
  }

  runQueue([BAIRRO_SLUG_AUDIT_SCRIPT], "check-bairro-slugs-manual").catch((err) => {
    emitLog(`Erro ao checar bairros sem slug: ${err.message}`, "error");
  });

  emitLog("Disparo manual da checagem de bairros sem slug solicitado.", "info");
  return res.json({ ok: true, script: BAIRRO_SLUG_AUDIT_SCRIPT });
});

app.get("/api/city-slug-issues", async (req, res) => {
  try {
    const { options, slugSet } = loadCityCatalog();
    const latestReport = loadLatestCitySlugReport();

    if (latestReport && Array.isArray(latestReport.data.registros)) {
      const issues = latestReport.data.registros.map((item) => ({
        docId: item.docId || "",
        cidadeAtual: item.cidade || "",
        titulo: item.titulo || "",
        linkReal: item.linkReal || "",
        localizacao: item.localizacao || "",
        imobiliariaId: item.imobiliariaId || "",
      }));

      issues.sort((a, b) => {
        const aEmpty = !a.cidadeAtual;
        const bEmpty = !b.cidadeAtual;
        if (aEmpty !== bEmpty) return aEmpty ? -1 : 1;
        return String(a.cidadeAtual || "").localeCompare(String(b.cidadeAtual || ""), "pt-BR");
      });

      return res.json({
        ok: true,
        total: issues.length,
        issues,
        cityOptions: options,
        source: "audit-report",
      });
    }

    const db = ensureFirestore();
    const snapshot = await db.collection("__imoveisPublicos").get();

    const issues = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const cidade = String(data.cidade || "").trim();

      if (!cidade || !slugSet.has(cidade)) {
        issues.push({
          docId: doc.id,
          cidadeAtual: cidade,
          titulo: data.titulo || "",
          linkReal: data.linkReal || "",
          localizacao: data.localizacao || "",
          imobiliariaId: data.imobiliariaId || "",
        });
      }
    }

    issues.sort((a, b) => {
      const aEmpty = !a.cidadeAtual;
      const bEmpty = !b.cidadeAtual;
      if (aEmpty !== bEmpty) return aEmpty ? -1 : 1;
      return String(a.cidadeAtual || "").localeCompare(String(b.cidadeAtual || ""), "pt-BR");
    });

    return res.json({
      ok: true,
      total: issues.length,
      issues,
      cityOptions: options,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao carregar pendencias de cidade: ${err.message}` });
  }
});

app.get("/api/bairro-slug-issues", async (req, res) => {
  try {
    const db = ensureFirestore();
    const { slugSet: citySlugSet } = loadCityCatalog();
    const { byCityPrincipal, keySet } = loadBairroCatalog();
    const snapshot = await db.collection("__imoveisPublicos").get();

    const issues = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const cidade = String(data.cidade || "").trim();
      const bairro = String(data.bairro || "").trim();

      if (!cidade || !citySlugSet.has(cidade)) {
        continue;
      }

      if (!bairro || !keySet.has(`${bairro}__${cidade}`)) {
        issues.push({
          docId: doc.id,
          bairroAtual: bairro,
          cidadeAtual: cidade,
          titulo: data.titulo || "",
          linkReal: data.linkReal || "",
          localizacao: data.localizacao || "",
          imobiliariaId: data.imobiliariaId || "",
        });
      }
    }

    issues.sort((a, b) => {
      const aEmpty = !a.bairroAtual;
      const bEmpty = !b.bairroAtual;
      if (aEmpty !== bEmpty) return aEmpty ? -1 : 1;
      const cityDiff = String(a.cidadeAtual || "").localeCompare(String(b.cidadeAtual || ""), "pt-BR");
      if (cityDiff !== 0) return cityDiff;
      return String(a.bairroAtual || "").localeCompare(String(b.bairroAtual || ""), "pt-BR");
    });

    const bairroOptions = Object.fromEntries(
      Array.from(byCityPrincipal.entries()).map(([cidade, options]) => [cidade, options])
    );

    return res.json({
      ok: true,
      total: issues.length,
      issues,
      bairroOptions,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao carregar pendencias de bairro: ${err.message}` });
  }
});

// Checagem de cidade lendo diretamente os JSONs brutos dos crawlers (backend/crawler/*.json),
// sem consultar Firestore. Sinaliza cidade vazia, toda em maiusculas ou fora do catalogo.
app.get("/api/city-json-issues", async (req, res) => {
  try {
    const { options: cityOptions, slugSet } = loadCityCatalog();
    const correctionsByFile = buildCityJsonCorrectionsByFile();
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];

    const issues = [];
    let correctionsApplied = 0;

    for (const file of files) {
      let data;
      const jsonPath = path.join(crawlerDir, file);
      try {
        data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;

      const correctionResult = applyCityJsonCorrectionsToFile(file, data, correctionsByFile);
      if (correctionResult.changed) {
        data = correctionResult.data;
        correctionsApplied += correctionResult.applied;
        fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      }

      data.forEach((item, index) => {
        if (String(item?.dataExclusao || "").trim()) return;

        const cidade = String(item?.cidade || "").trim();
        const isEmpty = !cidade;
        const isUpper = !isEmpty && cidade === cidade.toUpperCase() && cidade !== cidade.toLowerCase();
        const isUnknown = !isEmpty && !slugSet.has(cidade);

        if (isEmpty || isUpper || isUnknown) {
          issues.push({
            file,
            index,
            cidade,
            titulo: item?.titulo || "",
            linkReal: item?.linkReal || "",
            motivo: isEmpty ? "vazio" : isUpper ? "maiusculo" : "sem-slug",
          });
        }
      });
    }

    issues.sort((a, b) => {
      const fileDiff = a.file.localeCompare(b.file, "pt-BR");
      if (fileDiff !== 0) return fileDiff;
      return a.index - b.index;
    });

    return res.json({
      ok: true,
      total: issues.length,
      correctionsApplied,
      issues,
      cityOptions,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar cidades no JSON: ${err.message}` });
  }
});

app.post("/api/city-json-issues/resolve", async (req, res) => {
  // Importante: esta rota altera SOMENTE o arquivo JSON do crawler (e o catalogo _brCidades.json
  // em modo "create"). Nao toca Firestore, Typesense ou Google Sheets nesta etapa.
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const mode = String(req.body?.mode || "assign").trim();
    let targetSlug = String(req.body?.targetSlug || "").trim();
    let targetNome = String(req.body?.targetNome || "").trim();

    if (!file || !arquivoPrincipalImoveis(file)) {
      return res.status(400).json({ error: "Arquivo invalido." });
    }
    if (!linkReal) {
      return res.status(400).json({ error: "linkReal obrigatorio para localizar o registro." });
    }
    if (mode !== "assign" && mode !== "create") {
      return res.status(400).json({ error: "Modo invalido. Use 'assign' ou 'create'." });
    }

    const crawlerDir = path.join(backendRoot, "crawler");
    const jsonPath = path.join(crawlerDir, file);
    if (!jsonPath.startsWith(crawlerDir) || !fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: `Arquivo ${file} nao encontrado.` });
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: `Formato invalido em ${file}.` });
    }

    const index = data.findIndex((item) => String(item?.linkReal || "").trim() === linkReal);
    if (index < 0) {
      return res.status(404).json({ error: "Registro nao encontrado (linkReal nao localizado)." });
    }

    const { slugSet } = loadCityCatalog();

    if (mode === "assign") {
      if (!targetSlug || !slugSet.has(targetSlug)) {
        return res.status(400).json({ error: "Cidade invalida para atribuicao." });
      }
      if (!targetNome) {
        targetNome = formatCityNameFromSlug(targetSlug);
      }
    }

    if (mode === "create") {
      const createdFromNome = slugifyCity(targetNome);
      const createdFromSlug = slugifyCity(targetSlug);
      targetSlug = createdFromSlug || createdFromNome;

      if (!targetSlug) {
        return res.status(400).json({ error: "Informe nome ou slug para criar a cidade." });
      }
      if (!targetNome) {
        targetNome = formatCityNameFromSlug(targetSlug);
      }

      if (!slugSet.has(targetSlug)) {
        const rawCidades = JSON.parse(fs.readFileSync(cidadesCatalogoPath, "utf8"));
        const estadoMatch = /-([a-z]{2})$/.exec(targetSlug);
        rawCidades.push({
          nome: formatCityName(targetNome, targetSlug),
          estado: estadoMatch ? estadoMatch[1].toUpperCase() : "",
          slug: targetSlug,
          principal: "sim",
        });
        writeCityCatalog(rawCidades);
      }
    }

    targetNome = formatCityName(targetNome, targetSlug);

    data[index] = {
      ...data[index],
      cidade: targetSlug,
    };

    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    upsertCityJsonCorrection({ file, linkReal, cidade: targetSlug, nome: targetNome });
    const firestore = await updateFirestoreFromJsonCorrection({
      file,
      linkReal,
      patch: { cidade: targetSlug, cidadeNome: targetNome },
      scopeLabel: "CIDADES-JSON",
    });

    emitLog(`[CIDADES-JSON] ${file}: cidade corrigida para '${targetSlug}' (linkReal ${linkReal}).`, "success");

    return res.json({
      ok: true,
      file,
      linkReal,
      cidade: targetSlug,
      nome: targetNome,
      firestore,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir cidade no JSON: ${err.message}` });
  }
});

app.get("/api/titulo-json-issues", (req, res) => {
  try {
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;

      data.forEach((item, index) => {
        const titulo = String(item?.titulo || "").trim();
        if (!titulo) {
          issues.push({
            file,
            index,
            titulo,
            tipoImovel: String(item?.tipoImovel || "").trim(),
            cidade: String(item?.cidade || "").trim(),
            bairro: String(item?.bairro || "").trim(),
            linkReal: String(item?.linkReal || "").trim(),
            motivo: "vazio",
          });
        }
      });
    }

    issues.sort((a, b) => {
      const priority = a.motivo === "acima-limite" ? 0 : 1;
      const otherPriority = b.motivo === "acima-limite" ? 0 : 1;
      return priority - otherPriority || b.preco - a.preco || a.file.localeCompare(b.file, "pt-BR") || a.index - b.index;
    });
    return res.json({ ok: true, total: issues.length, issues });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar títulos no JSON: ${err.message}` });
  }
});

app.get("/api/localizacao-json-issues", (req, res) => {
  try {
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;

      data.forEach((item, index) => {
        if (!String(item?.localizacao || "").trim()) {
          issues.push({
            file,
            index,
            localizacao: "",
            titulo: String(item?.titulo || "").trim(),
            tipoImovel: String(item?.tipoImovel || "").trim(),
            cidade: String(item?.cidade || "").trim(),
            bairro: String(item?.bairro || "").trim(),
            linkReal: String(item?.linkReal || "").trim(),
          });
        }
      });
    }

    issues.sort((a, b) => a.file.localeCompare(b.file, "pt-BR") || a.index - b.index);
    return res.json({ ok: true, total: issues.length, issues });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar localizações no JSON: ${err.message}` });
  }
});

app.get("/api/linkfoto-json-issues", (req, res) => {
  try {
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];
    const projectStats = [];
    const confirmedKeys = new Set(loadLinkFotoJsonConfirmations().map(getLinkFotoJsonConfirmationKey));

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;
      let emptyLinkFotoCount = 0;

      data.forEach((item, index) => {
        if (!String(item?.linkFoto || "").trim()) {
          emptyLinkFotoCount += 1;
          const linkReal = String(item?.linkReal || "").trim();
          if (confirmedKeys.has(getLinkFotoJsonConfirmationKey({ file, linkReal, index }))) return;
          issues.push({
            file,
            index,
            titulo: String(item?.titulo || "").trim(),
            tipoImovel: String(item?.tipoImovel || "").trim(),
            cidade: String(item?.cidade || "").trim(),
            bairro: String(item?.bairro || "").trim(),
            linkReal,
          });
        }
      });
      if (data.length > 0) {
        projectStats.push({
          file,
          total: data.length,
          emptyLinkFotoCount,
          emptyLinkFotoPercentage: Number(((emptyLinkFotoCount / data.length) * 100).toFixed(1)),
        });
      }
    }

    issues.sort((a, b) => a.file.localeCompare(b.file, "pt-BR") || a.index - b.index);
    projectStats.sort((a, b) => b.emptyLinkFotoPercentage - a.emptyLinkFotoPercentage || a.file.localeCompare(b.file, "pt-BR"));
    return res.json({ ok: true, total: issues.length, issues, projectStats });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar linkFoto no JSON: ${err.message}` });
  }
});

app.post("/api/linkfoto-json-issues/confirm", (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const requestedIndex = req.body?.index;
    if (req.body?.confirmacao !== true || !arquivoPrincipalImoveis(file) || path.basename(file) !== file ||
        (!linkReal && (!Number.isInteger(requestedIndex) || requestedIndex < 0))) {
      return res.status(400).json({ error: "Confirme o registro e informe um arquivo e identificador validos." });
    }
    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!fs.existsSync(jsonPath)) return res.status(404).json({ error: "Arquivo nao encontrado." });
    const records = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(records)) throw new Error(`JSON invalido: ${file}`);
    const index = linkReal
      ? records.findIndex(item => String(item?.linkReal || "").trim() === linkReal)
      : requestedIndex;
    const record = records[index];
    if (!record || (!linkReal && String(record.linkReal || "").trim())) {
      return res.status(404).json({ error: "Registro nao encontrado. Atualize a checagem." });
    }
    if (String(record.linkFoto || "").trim()) {
      return res.status(409).json({ error: "O registro ja possui linkFoto. Atualize a checagem antes de confirmar." });
    }
    const confirmed = confirmLinkFotoJsonIssues([{ file, linkReal, index }]);
    emitLog(`[LINKFOTO-JSON] ${file}: ${confirmed} registro(s) sem foto confirmado(s).`, "success");
    return res.json({ ok: true, confirmed, file, linkReal, index });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao confirmar link de foto: ${err.message}` });
  }
});

app.post("/api/linkfoto-json-issues/confirm-all", (req, res) => {
  try {
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;
      data.forEach((item, index) => {
        const linkReal = String(item?.linkReal || "").trim();
        if (!String(item?.linkFoto || "").trim()) issues.push({ file, linkReal, index });
      });
    }

    const confirmed = confirmLinkFotoJsonIssues(issues);
    emitLog(`[LINKFOTO-JSON] ${confirmed} registro(s) sem foto confirmado(s).`, "success");
    return res.json({ ok: true, confirmed, total: issues.length });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao confirmar links de foto: ${err.message}` });
  }
});

app.post("/api/linkfoto-json-issues/resolve", async (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const linkFoto = String(req.body?.linkFoto || "").trim();
    let parsedUrl;

    try {
      parsedUrl = new URL(linkFoto);
    } catch {
      parsedUrl = null;
    }

    if (!file || !arquivoPrincipalImoveis(file) || !linkReal || !parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "Arquivo, linkReal e um link de foto http(s) válido são obrigatórios." });
    }

    const crawlerDir = path.join(backendRoot, "crawler");
    const jsonPath = path.join(crawlerDir, file);
    if (!jsonPath.startsWith(crawlerDir) || !fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: `Arquivo ${file} não encontrado.` });
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const index = Array.isArray(data) ? data.findIndex((item) => String(item?.linkReal || "").trim() === linkReal) : -1;
    if (index < 0) return res.status(404).json({ error: "Registro não encontrado." });

    data[index] = { ...data[index], linkFoto };
    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    upsertLinkFotoJsonCorrection({ file, linkReal, linkFoto });
    const firestore = await updateFirestoreFromJsonCorrection({ file, linkReal, patch: { linkFoto }, scopeLabel: "LINKFOTO-JSON" });
    emitLog(`[LINKFOTO-JSON] ${file}: link da foto corrigido.`, "success");
    return res.json({ ok: true, file, linkReal, linkFoto, firestore });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir linkFoto no JSON: ${err.message}` });
  }
});

app.get("/api/linkreal-json-issues", (req, res) => {
  try {
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;

      data.forEach((item, index) => {
        if (!String(item?.linkReal || "").trim()) {
          issues.push({
            file,
            index,
            titulo: String(item?.titulo || "").trim(),
            tipoImovel: String(item?.tipoImovel || "").trim(),
            cidade: String(item?.cidade || "").trim(),
            bairro: String(item?.bairro || "").trim(),
            linkFoto: String(item?.linkFoto || "").trim(),
          });
        }
      });
    }

    issues.sort((a, b) => a.file.localeCompare(b.file, "pt-BR") || a.index - b.index);
    return res.json({ ok: true, total: issues.length, issues });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar linkReal no JSON: ${err.message}` });
  }
});

app.post("/api/localizacao-json-issues/resolve", async (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const localizacao = String(req.body?.localizacao || "").trim();
    if (!file || !arquivoPrincipalImoveis(file) || !linkReal || !localizacao) {
      return res.status(400).json({ error: "Arquivo, linkReal e localização são obrigatórios." });
    }

    const crawlerDir = path.join(backendRoot, "crawler");
    const jsonPath = path.join(crawlerDir, file);
    if (!jsonPath.startsWith(crawlerDir) || !fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: `Arquivo ${file} não encontrado.` });
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const index = Array.isArray(data) ? data.findIndex((item) => String(item?.linkReal || "").trim() === linkReal) : -1;
    if (index < 0) return res.status(404).json({ error: "Registro não encontrado." });

    data[index] = { ...data[index], localizacao };
    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    upsertLocalizacaoJsonCorrection({ file, linkReal, localizacao });
    const firestore = await updateFirestoreFromJsonCorrection({
      file,
      linkReal,
      patch: { localizacao },
      scopeLabel: "LOCALIZACAO-JSON",
    });
    emitLog(`[LOCALIZACAO-JSON] ${file}: localização corrigida.`, "success");
    return res.json({ ok: true, file, linkReal, localizacao, firestore });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir localização no JSON: ${err.message}` });
  }
});

app.get("/api/tipo-imovel-json-issues", (req, res) => {
  try {
    const tipoCatalog = JSON.parse(fs.readFileSync(tiposCatalogoPath, "utf8"));
    const typeOptions = Object.entries(tipoCatalog?.tiposPorSlug || {})
      .map(([slug, aliases]) => {
        const principal = Array.isArray(aliases)
          ? aliases.find((item, index) => Object.hasOwn(item || {}, "principal") ? isPrincipal(item) : index === 0)
          : null;
        return { slug, nome: String(principal?.nome || slug).trim() };
      })
      .filter((item) => item.slug)
      .sort((a, b) => a.slug.localeCompare(b.slug, "pt-BR", { sensitivity: "base" }));
    const validTypeSlugs = new Set(typeOptions.map((item) => item.slug));
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];
    const issues = [];

    for (const file of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;

      data.forEach((item, index) => {
        const tipoImovel = String(item?.tipoImovel || "").trim();
        const motivo = !tipoImovel ? "vazio" : !validTypeSlugs.has(tipoImovel) ? "fora-do-catalogo" : "";
        if (motivo) {
          issues.push({
            file,
            index,
            tipoImovel,
            motivo,
            titulo: String(item?.titulo || "").trim(),
            localizacao: String(item?.localizacao || "").trim(),
            cidade: String(item?.cidade || "").trim(),
            bairro: String(item?.bairro || "").trim(),
            linkReal: String(item?.linkReal || "").trim(),
          });
        }
      });
    }

    issues.sort((a, b) => a.file.localeCompare(b.file, "pt-BR") || a.index - b.index);
    const totalVazios = issues.filter((item) => item.motivo === "vazio").length;
    return res.json({ ok: true, total: issues.length, totalVazios, totalForaDoCatalogo: issues.length - totalVazios, issues, typeOptions });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar tipos de imóvel no JSON: ${err.message}` });
  }
});

app.get("/api/preco-json-issues", (req, res) => {
  try {
    const issues = listarPendenciasPrecoJson(backendRoot, loadPrecoJsonConfirmations());
    return res.json({ ok: true, total: issues.length, issues });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar preços no JSON: ${err.message}` });
  }
});

app.post("/api/preco-json-issues/confirm-all", (req, res) => {
  try {
    if (req.body?.confirmacao !== true) {
      return res.status(400).json({ error: "Confirme explicitamente a confirmação de todos os preços pendentes." });
    }
    if (running) return res.status(409).json({ error: "Aguarde o fim da execução antes de confirmar os preços." });

    const existingConfirmations = loadPrecoJsonConfirmations();
    const issues = listarPendenciasPrecoJson(backendRoot, existingConfirmations);
    const confirmations = upsertConfirmacoesPrecoJson(existingConfirmations, issues, nowStamp());
    if (issues.length) savePrecoJsonConfirmations(confirmations);
    emitLog(`[PRECO-JSON] ${issues.length} preço(s) pendente(s) confirmado(s).`, "success");
    return res.json({ ok: true, confirmed: issues.length, total: issues.length });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao confirmar preços no JSON: ${err.message}` });
  }
});

app.post("/api/preco-json-issues/confirm", (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const preco = req.body?.preco;
    if (!file || !arquivoPrincipalImoveis(file) || !linkReal || typeof preco !== "number" || !Number.isFinite(preco)) {
      return res.status(400).json({ error: "Arquivo, linkReal e preço numérico são obrigatórios." });
    }
    confirmPrecoJson({ file, linkReal, preco });
    emitLog(`[PRECO-JSON] ${file}: valor ${preco} confirmado.`, "success");
    return res.json({ ok: true, file, linkReal, preco });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao confirmar preço no JSON: ${err.message}` });
  }
});

app.post("/api/preco-json-issues/resolve", async (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const preco = parsePrecoManual(req.body?.preco);
    if (!file || !arquivoPrincipalImoveis(file) || !linkReal || !Number.isFinite(preco) || preco < 0) {
      return res.status(400).json({ error: "Arquivo, linkReal e preço válido são obrigatórios." });
    }
    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!jsonPath.startsWith(path.join(backendRoot, "crawler")) || !fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: `Arquivo ${file} não encontrado.` });
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const index = Array.isArray(data) ? data.findIndex((item) => String(item?.linkReal || "").trim() === linkReal) : -1;
    if (index < 0) return res.status(404).json({ error: "Registro não encontrado." });
    data[index] = { ...data[index], preco };
    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    upsertPrecoJsonCorrection({ file, linkReal, preco });
    const firestore = await updateFirestoreFromJsonCorrection({ file, linkReal, patch: { preco }, scopeLabel: "PRECO-JSON" });
    emitLog(`[PRECO-JSON] ${file}: preço corrigido para ${preco}.`, "success");
    return res.json({ ok: true, file, linkReal, preco, firestore });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir preço no JSON: ${err.message}` });
  }
});

app.post("/api/tipo-imovel-json-issues/resolve", async (req, res) => {
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const tipoImovel = String(req.body?.tipoImovel || "").trim();
    if (!file || !arquivoPrincipalImoveis(file) || !linkReal || !tipoImovel) {
      return res.status(400).json({ error: "Arquivo, linkReal e tipo de imóvel são obrigatórios." });
    }

    const tipoCatalog = JSON.parse(fs.readFileSync(tiposCatalogoPath, "utf8"));
    if (!Object.hasOwn(tipoCatalog?.tiposPorSlug || {}, tipoImovel)) {
      return res.status(400).json({ error: "Tipo de imóvel inválido." });
    }

    const jsonPath = path.join(backendRoot, "crawler", file);
    if (!jsonPath.startsWith(path.join(backendRoot, "crawler")) || !fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: `Arquivo ${file} não encontrado.` });
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const index = Array.isArray(data) ? data.findIndex((item) => String(item?.linkReal || "").trim() === linkReal) : -1;
    if (index < 0) return res.status(404).json({ error: "Registro não encontrado." });

    data[index] = { ...data[index], tipoImovel };
    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    upsertTipoImovelJsonCorrection({ file, linkReal, tipoImovel });
    const firestore = await updateFirestoreFromJsonCorrection({
      file,
      linkReal,
      patch: { tipoImovel },
      scopeLabel: "TIPO-IMOVEL-JSON",
    });
    emitLog(`[TIPO-IMOVEL-JSON] ${file}: tipo corrigido para '${tipoImovel}'.`, "success");
    return res.json({ ok: true, file, linkReal, tipoImovel, firestore });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir tipo de imóvel no JSON: ${err.message}` });
  }
});

// Checagem de bairro lendo diretamente os JSONs brutos dos crawlers (backend/crawler/*.json),
// sem consultar Firestore. Sinaliza bairro vazio ou totalmente em maiusculas.
app.get("/api/bairro-json-issues", async (req, res) => {
  try {
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 200);
    const rawBairroFilter = String(req.query.bairro || "").trim();
    const { byCity, byCityPrincipal, keySet } = loadBairroCatalog();
    const { options: cityOptions } = loadCityCatalog();
    const correctionsByFile = buildBairroJsonCorrectionsByFile();
    const crawlerDir = path.join(backendRoot, "crawler");
    const files = fs.existsSync(crawlerDir)
      ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
      : [];

    const issues = [];
    let correctionsApplied = 0;
    let normalizedRecords = 0;

    for (const file of files) {
      let data;
      const jsonPath = path.join(crawlerDir, file);
      try {
        data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;

      const correctionResult = applyBairroJsonCorrectionsToFile(file, data, correctionsByFile);
      if (correctionResult.changed) {
        data = correctionResult.data;
        correctionsApplied += correctionResult.applied;
        fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      }

      data.forEach((item, index) => {
        if (String(item?.dataExclusao || "").trim()) return;

        const bairroOriginal = String(item?.bairro || "").trim();
        const cidade = String(item?.cidade || "").trim();
        const bairroNormalizado = resolveBairroSlugFromRawValue(bairroOriginal, cidade, { byCity });
        if (bairroNormalizado && bairroNormalizado !== bairroOriginal) {
          item.bairro = bairroNormalizado;
          normalizedRecords += 1;
        }

        const bairro = String(item?.bairro || "").trim();
        const isEmpty = !bairro;
        const isUpper = !isEmpty && bairro === bairro.toUpperCase() && bairro !== bairro.toLowerCase();
        const bairroExisteNoCatalogo = keySet.has(`${bairro}__${cidade}`);
        const motivo = isEmpty ? "vazio" : !bairroExisteNoCatalogo ? "fora-do-catalogo" : isUpper ? "maiusculo" : "";

        if (motivo && (!rawBairroFilter || bairro === rawBairroFilter)) {
          issues.push({
            file,
            index,
            bairro,
            cidade,
            titulo: item?.titulo || "",
            linkReal: item?.linkReal || "",
            motivo,
          });
        }
      });

      if (normalizedRecords > 0) {
        fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      }
    }

    issues.sort((a, b) => {
      const priority = { "fora-do-catalogo": 0, vazio: 1, maiusculo: 2 };
      const priorityDiff = (priority[a.motivo] ?? 9) - (priority[b.motivo] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      const fileDiff = a.file.localeCompare(b.file, "pt-BR");
      if (fileDiff !== 0) return fileDiff;
      return a.index - b.index;
    });

    const bairroOptions = Object.fromEntries(
      Array.from(byCityPrincipal.entries()).map(([cidade, options]) => [cidade, options])
    );
    const totalByMotivo = issues.reduce((totals, issue) => {
      totals[issue.motivo] = (totals[issue.motivo] || 0) + 1;
      return totals;
    }, {});

    return res.json({
      ok: true,
      total: issues.length,
      offset,
      limit,
      hasMore: offset + limit < issues.length,
      correctionsApplied,
      normalizedRecords,
      totalByMotivo,
      issues: issues.slice(offset, offset + limit),
      bairroOptions,
      cityOptions,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao checar bairros no JSON: ${err.message}` });
  }
});

app.post("/api/bairro-json-issues/resolve", async (req, res) => {
  // Importante: esta rota altera SOMENTE o arquivo JSON do crawler (e o catalogo _jfBairros.json
  // em modo "create"). Nao toca Firestore, Typesense ou Google Sheets nesta etapa.
  try {
    const file = String(req.body?.file || "").trim();
    const linkReal = String(req.body?.linkReal || "").trim();
    const mode = String(req.body?.mode || "assign").trim();
    let targetSlug = String(req.body?.targetSlug || "").trim();
    let targetNome = String(req.body?.targetNome || "").trim();
    const targetCidade = String(req.body?.targetCidade || "").trim();

    if (!file || !arquivoPrincipalImoveis(file)) {
      return res.status(400).json({ error: "Arquivo invalido." });
    }
    if (!linkReal) {
      return res.status(400).json({ error: "linkReal obrigatorio para localizar o registro." });
    }
    if (mode !== "assign" && mode !== "create") {
      return res.status(400).json({ error: "Modo invalido. Use 'assign' ou 'create'." });
    }

    const crawlerDir = path.join(backendRoot, "crawler");
    const jsonPath = path.join(crawlerDir, file);
    if (!jsonPath.startsWith(crawlerDir) || !fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: `Arquivo ${file} nao encontrado.` });
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: `Formato invalido em ${file}.` });
    }

    const index = data.findIndex((item) => String(item?.linkReal || "").trim() === linkReal);
    if (index < 0) {
      return res.status(404).json({ error: "Registro nao encontrado (linkReal nao localizado)." });
    }

    const cidade = targetCidade || String(data[index]?.cidade || "").trim();
    if (!cidade) {
      return res.status(400).json({ error: "Registro nao possui cidade definida - corrija a cidade primeiro." });
    }

    const { keySet, byCity } = loadBairroCatalog();
    const { slugSet: citySlugSet } = loadCityCatalog();
    if (!citySlugSet.has(cidade)) {
      return res.status(400).json({ error: "Cidade invalida para atribuicao." });
    }

    if (mode === "assign") {
      if (!targetSlug || !keySet.has(`${targetSlug}__${cidade}`)) {
        return res.status(400).json({ error: "Bairro invalido para atribuicao nesta cidade." });
      }
      if (!targetNome) {
        const option = (byCity.get(cidade) || []).find((item) => item.slug === targetSlug);
        targetNome = option?.nome || formatLabelFromSlug(targetSlug);
      }
    }

    if (mode === "create") {
      const createdFromNome = slugifyBairro(targetNome);
      const createdFromSlug = slugifyBairro(targetSlug);
      targetSlug = createdFromSlug || createdFromNome;

      if (!targetSlug) {
        return res.status(400).json({ error: "Informe nome ou slug para criar o bairro." });
      }
      if (!targetNome) {
        targetNome = formatLabelFromSlug(targetSlug);
      }

      if (!keySet.has(`${targetSlug}__${cidade}`)) {
        const raw = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"));
        raw.push({
          nome: targetNome,
          cidade,
          slug: targetSlug,
          principal: "sim",
        });
        writeBairroCatalog(raw);
      }
    }

    data[index] = {
      ...data[index],
      bairro: targetSlug,
      cidade,
    };

    fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    upsertBairroJsonCorrection({ file, linkReal, cidade, bairro: targetSlug, nome: targetNome });
    const firestore = await updateFirestoreFromJsonCorrection({
      file,
      linkReal,
      patch: { cidade, bairro: targetSlug, bairroNome: targetNome },
      scopeLabel: "BAIRROS-JSON",
    });

    emitLog(`[BAIRROS-JSON] ${file}: bairro corrigido para '${targetSlug}' (linkReal ${linkReal}).`, "success");

    return res.json({
      ok: true,
      file,
      linkReal,
      bairro: targetSlug,
      nome: targetNome,
      firestore,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir bairro no JSON: ${err.message}` });
  }
});

// Bairros sem slug diretamente no catalogo (_jfBairros.json), diferente das pendencias
// acima (que sao imoveis referenciando um bairro invalido).
app.get("/api/bairro-catalog-issues", async (req, res) => {
  try {
    const raw = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"));
    const { options: cityOptions } = loadCityCatalog();
    const { byCityPrincipal } = loadBairroCatalog();

    const issues = [];
    raw.forEach((item, index) => {
      const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
      if (!slug) {
        issues.push({
          index,
          cidade: String(item?.cidade || "").trim(),
          nome: String(item?.nome || "").trim(),
          principal: String(item?.principal || "sim").trim() || "sim",
        });
      }
    });

    issues.sort((a, b) => {
      const cityDiff = String(a.cidade || "").localeCompare(String(b.cidade || ""), "pt-BR");
      if (cityDiff !== 0) return cityDiff;
      return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
    });

    const bairroOptions = Object.fromEntries(
      Array.from(byCityPrincipal.entries()).map(([cidade, options]) => [cidade, options])
    );

    return res.json({
      ok: true,
      total: issues.length,
      issues,
      cityOptions,
      bairroOptions,
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao carregar bairros sem slug no catalogo: ${err.message}` });
  }
});

app.post("/api/bairro-catalog-issues/:index/resolve", async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index, 10);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: "Indice invalido." });
    }

    const mode = String(req.body?.mode || "assign").trim();
    let targetSlug = String(req.body?.targetSlug || "").trim();
    let targetNome = String(req.body?.targetNome || "").trim();
    const targetCidade = String(req.body?.cidade || "").trim();

    if (mode !== "assign" && mode !== "create") {
      return res.status(400).json({ error: "Modo invalido. Use 'assign' ou 'create'." });
    }

    if (!targetCidade) {
      return res.status(400).json({ error: "Selecione a cidade do bairro." });
    }

    const { slugSet: citySlugSet } = loadCityCatalog();
    if (!citySlugSet.has(targetCidade)) {
      return res.status(400).json({ error: "Cidade invalida." });
    }

    const raw = JSON.parse(fs.readFileSync(bairrosCatalogoPath, "utf8"));
    if (index >= raw.length) {
      return res.status(404).json({ error: "Registro nao encontrado no catalogo." });
    }

    const entry = raw[index] || {};
    const existingSlug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    if (existingSlug) {
      return res.status(400).json({ error: "Este registro ja possui slug." });
    }

    const bairroCatalog = loadBairroCatalog();

    if (mode === "assign") {
      if (!targetSlug || !bairroCatalog.keySet.has(`${targetSlug}__${targetCidade}`)) {
        return res.status(400).json({ error: "Slug de bairro invalido para atribuicao nesta cidade." });
      }
      const option = (bairroCatalog.byCity.get(targetCidade) || []).find((item) => item.slug === targetSlug);
      if (!targetNome) {
        targetNome = option?.nome || formatLabelFromSlug(targetSlug);
      }
    }

    if (mode === "create") {
      const createdFromNome = slugifyBairro(targetNome || entry.nome);
      const createdFromSlug = slugifyBairro(targetSlug);
      targetSlug = createdFromSlug || createdFromNome;

      if (!targetSlug) {
        return res.status(400).json({ error: "Informe nome ou slug para criar o bairro." });
      }
      if (!targetNome) {
        targetNome = entry.nome ? String(entry.nome).trim() : formatLabelFromSlug(targetSlug);
      }
      if (bairroCatalog.keySet.has(`${targetSlug}__${targetCidade}`)) {
        return res.status(400).json({ error: "Ja existe um bairro com este slug nesta cidade. Use a opcao de atribuir um bairro existente." });
      }
    }

    raw[index] = {
      ...entry,
      slug: targetSlug,
      cidade: targetCidade,
      nome: targetNome,
      principal: entry.principal || "sim",
    };

    writeBairroCatalog(raw);

    emitLog(
      `Bairro do catalogo corrigido somente no JSON (indice ${index}): ${targetSlug} (${targetCidade}). Revalide os imoveis na aba JSON antes de publicar.`,
      "success"
    );

    return res.json({
      ok: true,
      index,
      slug: targetSlug,
      cidade: targetCidade,
      nome: targetNome,
      imoveisAtualizados: 0,
      sync: { queued: false, targets: [] },
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir bairro do catalogo: ${err.message}` });
  }
});

app.post("/api/city-slug-issues/:docId/resolve", async (req, res) => {
  try {
    const docId = String(req.params.docId || "").trim();
    if (!docId) {
      return res.status(400).json({ error: "docId obrigatorio." });
    }

    const mode = String(req.body?.mode || "assign").trim();
    let targetSlug = String(req.body?.targetSlug || "").trim();
    let targetNome = String(req.body?.targetNome || "").trim();

    const db = ensureFirestore();
    const { slugSet } = loadCityCatalog();

    if (mode !== "assign" && mode !== "create") {
      return res.status(400).json({ error: "Modo invalido. Use 'assign' ou 'create'." });
    }

    if (mode === "assign") {
      if (!targetSlug || !slugSet.has(targetSlug)) {
        return res.status(400).json({ error: "Slug de cidade invalido para atribuicao." });
      }
      if (!targetNome) {
        targetNome = formatCityNameFromSlug(targetSlug);
      }
    }

    if (mode === "create") {
      const createdFromNome = slugifyCity(targetNome);
      const createdFromSlug = slugifyCity(targetSlug);
      targetSlug = createdFromSlug || createdFromNome;

      if (!targetSlug) {
        return res.status(400).json({ error: "Informe nome ou slug para criar a cidade." });
      }

      if (!targetNome) {
        targetNome = formatCityNameFromSlug(targetSlug);
      }

      targetNome = formatCityName(targetNome, targetSlug);
      await db.collection("__cidadesUnicas").doc(targetSlug).set(
        {
          slug: targetSlug,
          nome: targetNome,
          principal: "sim",
          origem: "painel-correcao-cidade",
          atualizadoEm: nowStamp(),
        },
        { merge: true }
      );
    }

    const publicRef = db.collection("__imoveisPublicos").doc(docId);
    const publicDoc = await publicRef.get();
    if (!publicDoc.exists) {
      return res.status(404).json({ error: "Registro nao encontrado em __imoveisPublicos." });
    }

    const publicData = publicDoc.data() || {};
    const origemColecao = String(publicData.imobiliariaId || "").trim();
    const sourceDocId = String(publicData.sourceDocId || "").trim();
    const sourceLinkReal = String(publicData.linkReal || "").trim();

    await publicRef.set(
      {
        cidade: targetSlug,
        cidadeNome: targetNome,
        corrigidoEm: nowStamp(),
      },
      { merge: true }
    );

    let resolvedSourceDocId = sourceDocId;
    let sourceData = {};

    const sourceResolved = await resolveExistingSourceDoc(db, origemColecao, sourceDocId, sourceLinkReal);
    if (sourceResolved.ref) {
      await sourceResolved.ref.set(
        {
          cidade: targetSlug,
          cidadeNome: targetNome,
          corrigidoEm: nowStamp(),
        },
        { merge: true }
      );
      resolvedSourceDocId = sourceResolved.id;
      sourceData = {
        ...(sourceResolved.data || {}),
        cidade: targetSlug,
        cidadeNome: targetNome,
        corrigidoEm: nowStamp(),
      };
    } else if (origemColecao) {
      emitLog(`[CIDADES] Origem nao localizada para doc ${docId}; correção aplicada apenas em __imoveisPublicos.`, "warn");
    }

    const publicAtualizado = {
      ...publicData,
      cidade: targetSlug,
      cidadeNome: targetNome,
      corrigidoEm: nowStamp(),
    };

    enqueueManualSync({
      docId,
      sourceDocId: resolvedSourceDocId,
      origemColecao,
      publicData: publicAtualizado,
      sourceData,
      patch: {
        cidade: targetSlug,
        cidadeNome: targetNome,
      },
      scopeLabel: "CIDADES",
    });

    removeCityIssueFromLatestReport(docId);

    emitLog(`Cidade corrigida manualmente para doc ${docId}: ${targetSlug}`, "success");

    return res.json({
      ok: true,
      docId,
      sourceDocId: resolvedSourceDocId,
      cidade: targetSlug,
      cidadeNome: targetNome,
      origemColecao,
      sync: {
        queued: true,
        targets: ["typesense", "source-json", "google-sheets"],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir cidade: ${err.message}` });
  }
});

app.post("/api/bairro-slug-issues/:docId/resolve", async (req, res) => {
  try {
    const docId = String(req.params.docId || "").trim();
    if (!docId) {
      return res.status(400).json({ error: "docId obrigatorio." });
    }

    const mode = String(req.body?.mode || "assign").trim();
    let targetSlug = String(req.body?.targetSlug || "").trim();
    let targetNome = String(req.body?.targetNome || "").trim();

    const db = ensureFirestore();
    const { slugSet: citySlugSet } = loadCityCatalog();
    const bairroCatalog = loadBairroCatalog();

    if (mode !== "assign" && mode !== "create") {
      return res.status(400).json({ error: "Modo invalido. Use 'assign' ou 'create'." });
    }

    const publicRef = db.collection("__imoveisPublicos").doc(docId);
    const publicDoc = await publicRef.get();
    if (!publicDoc.exists) {
      return res.status(404).json({ error: "Registro nao encontrado em __imoveisPublicos." });
    }

    const publicData = publicDoc.data() || {};
    const cidadeAtual = String(publicData.cidade || "").trim();
    if (!cidadeAtual || !citySlugSet.has(cidadeAtual)) {
      return res.status(400).json({ error: "Corrija a cidade antes de corrigir o bairro." });
    }

    if (mode === "assign") {
      if (!targetSlug || !bairroCatalog.keySet.has(`${targetSlug}__${cidadeAtual}`)) {
        return res.status(400).json({ error: "Slug de bairro invalido para atribuicao nesta cidade." });
      }

      const option = (bairroCatalog.byCity.get(cidadeAtual) || []).find((item) => item.slug === targetSlug);
      if (!targetNome) {
        targetNome = option?.nome || formatLabelFromSlug(targetSlug);
      }
    }

    if (mode === "create") {
      const createdFromNome = slugifyBairro(targetNome);
      const createdFromSlug = slugifyBairro(targetSlug);
      targetSlug = createdFromSlug || createdFromNome;

      if (!targetSlug) {
        return res.status(400).json({ error: "Informe nome ou slug para criar o bairro." });
      }

      if (!targetNome) {
        targetNome = formatLabelFromSlug(targetSlug);
      }

      const alreadyExists = bairroCatalog.keySet.has(`${targetSlug}__${cidadeAtual}`);
      if (!alreadyExists) {
        const updatedEntries = [...bairroCatalog.entries, {
          slug: targetSlug,
          cidade: cidadeAtual,
          nome: targetNome,
          principal: "sim",
        }].sort((a, b) => {
          const cityDiff = a.cidade.localeCompare(b.cidade, "pt-BR");
          if (cityDiff !== 0) return cityDiff;
          return a.nome.localeCompare(b.nome, "pt-BR");
        });

        writeBairroCatalog(updatedEntries);
      }
    }

    const origemColecao = String(publicData.imobiliariaId || "").trim();
    const sourceDocId = String(publicData.sourceDocId || "").trim();
  const sourceLinkReal = String(publicData.linkReal || "").trim();

    await publicRef.set(
      {
        bairro: targetSlug,
        bairroNome: targetNome,
        corrigidoEm: nowStamp(),
      },
      { merge: true }
    );

    let resolvedSourceDocId = sourceDocId;
    let sourceData = {};
    const sourceResolved = await resolveExistingSourceDoc(db, origemColecao, sourceDocId, sourceLinkReal);
    if (sourceResolved.ref) {
      await sourceResolved.ref.set(
        {
          bairro: targetSlug,
          bairroNome: targetNome,
          corrigidoEm: nowStamp(),
        },
        { merge: true }
      );
      resolvedSourceDocId = sourceResolved.id;
      sourceData = {
        ...(sourceResolved.data || {}),
        bairro: targetSlug,
        bairroNome: targetNome,
        corrigidoEm: nowStamp(),
      };
    } else if (origemColecao) {
      emitLog(`[BAIRROS] Origem nao localizada para doc ${docId}; correção aplicada apenas em __imoveisPublicos.`, "warn");
    }

    const publicAtualizado = {
      ...publicData,
      bairro: targetSlug,
      bairroNome: targetNome,
      corrigidoEm: nowStamp(),
    };

    enqueueManualSync({
      docId,
      sourceDocId: resolvedSourceDocId,
      origemColecao,
      publicData: publicAtualizado,
      sourceData,
      patch: {
        bairro: targetSlug,
        bairroNome: targetNome,
      },
      scopeLabel: "BAIRROS",
    });

    emitLog(`Bairro corrigido manualmente para doc ${docId}: ${targetSlug}`, "success");

    return res.json({
      ok: true,
      docId,
      sourceDocId: resolvedSourceDocId,
      bairro: targetSlug,
      bairroNome: targetNome,
      cidade: cidadeAtual,
      origemColecao,
      sync: {
        queued: true,
        targets: ["typesense", "source-json", "google-sheets"],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: `Falha ao corrigir bairro: ${err.message}` });
  }
});

app.post("/api/stop", (req, res) => {
  if (!running) {
    emitLog("Nao ha execucao em andamento para parar.", "warn");
    return res.json({ ok: true, running: false });
  }

  stopRequested = true;

  if (currentProcess) {
    terminateCurrentProcess();
    emitLog("Parada solicitada: cancelando processo atual e encerrando a rodada.", "warn");
  } else {
    emitLog("Parada solicitada: rodada sera encerrada antes do proximo projeto.", "warn");
  }

  return res.json({ ok: true, running: true, stopRequested: true });
});

io.on("connection", (socket) => {
  emitState();
});

const projects = extractJforaScripts();
const initialConfig = loadConfig(projects);
scheduleDailyRun(initialConfig);

server.on("error", async (err) => {
  if (err && err.code === "EADDRINUSE") {
    const url = `http://localhost:${PORT}/painel.html`;
    console.warn(`[Scheduler] Porta ${PORT} já está em uso. Usando a instância já ativa em ${url}.`);
    try {
      await open(url);
    } catch {}
    process.exit(0);
    return;
  }

  console.error("[Scheduler] Erro ao iniciar servidor:", err);
  process.exit(1);
});

server.listen(PORT, async () => {
  const url = `http://localhost:${PORT}/painel.html`;
  emitLog(`Painel iniciado em ${url}`);
  await open(url);
});
