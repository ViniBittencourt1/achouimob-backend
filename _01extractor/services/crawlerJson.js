import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { manualCorrectionMaps, applyManualCorrection, duplicateGroupsForFile, applyDuplicateGroups, mergeScrapeHistory } from "./crawlerRecordRules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..", "..");
const outrosDatabaseDir = path.join(backendRoot, "_03database", "outros");
const cityJsonCorrectionsPath = path.join(outrosDatabaseDir, "city-json-manual-corrections.json");
const bairroJsonCorrectionsPath = path.join(backendRoot, "_03database", "filtros", "_jfBairrosManualCorrections.json");
const duplicadosGruposPath = path.join(outrosDatabaseDir, "duplicados-grupos.json");
const historicoRaspagensPath = path.join(backendRoot, "_03database", "filtros", "jfHistoricoRaspagens.json");
const crawlerDir = path.join(backendRoot, "crawler");
const originalWriteFileSync = fs.writeFileSync.bind(fs);

function loadManualCorrections(filePath) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`⚠️ Falha ao ler correções manuais em ${filePath}: ${error.message}`);
    return [];
  }
}

function getManualCorrectionsForFile(file) {
  return manualCorrectionMaps(file, loadManualCorrections(cityJsonCorrectionsPath), loadManualCorrections(bairroJsonCorrectionsPath));
}

function applyManualJsonCorrectionsToRecord(imovel, key, corrections) {
  return applyManualCorrection(imovel, key, corrections);
}

function applyManualJsonCorrectionsToArray(file, records) {
  if (!Array.isArray(records)) return 0;

  const corrections = getManualCorrectionsForFile(file);
  if (!corrections.cityByLink.size && !corrections.bairroByLink.size) return 0;

  let applied = 0;
  for (const imovel of records) {
    if (!imovel || typeof imovel !== "object") continue;
    applied += applyManualJsonCorrectionsToRecord(imovel, "", corrections);
  }

  return applied;
}

export function applyManualJsonCorrectionsToDataMap(collectionName, dataMap) {
  const file = `${collectionName}.json`;
  const corrections = getManualCorrectionsForFile(file);

  if (!corrections.cityByLink.size && !corrections.bairroByLink.size) return;

  let applied = 0;
  for (const [key, imovel] of dataMap.entries()) {
    if (!imovel || typeof imovel !== "object") continue;
    applied += applyManualJsonCorrectionsToRecord(imovel, key, corrections);
  }

  if (applied > 0) {
    console.log(`🛠️ Correções manuais JSON reaplicadas em ${collectionName}: ${applied} campo(s).`);
  }
}

// duplicados-grupos.json é a fonte de verdade do painel de duplicados; reaplica o
// campo duplicado_grupo a cada regravação para sobreviver a novas raspagens (JSON-first).
function loadDuplicadoGrupoMapForFile(file) {
  if (!fs.existsSync(duplicadosGruposPath)) return new Map();
  try {
    const store = JSON.parse(fs.readFileSync(duplicadosGruposPath, "utf8"));
    return duplicateGroupsForFile(file, store);
  } catch {
    return new Map();
  }
}

function applyDuplicadoGrupoToArray(file, records) {
  if (!Array.isArray(records)) return 0;
  return applyDuplicateGroups(records, loadDuplicadoGrupoMapForFile(file));
}

function atualizarHistoricoRaspagem(fileName, records) {
  if (!Array.isArray(records)) return;

  const projeto = path.basename(String(fileName || ""), ".json");
  if (!projeto) return;

  let historico = {};
  try {
    if (fs.existsSync(historicoRaspagensPath)) {
      historico = JSON.parse(fs.readFileSync(historicoRaspagensPath, "utf8"));
    }
  } catch (error) {
    console.warn(`⚠️ Falha ao ler ${path.basename(historicoRaspagensPath)}: ${error.message}`);
    historico = {};
  }

  historico = mergeScrapeHistory(historico, projeto, records);

  try {
    fs.mkdirSync(path.dirname(historicoRaspagensPath), { recursive: true });
    originalWriteFileSync(historicoRaspagensPath, `${JSON.stringify(historico, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn(`⚠️ Falha ao salvar ${path.basename(historicoRaspagensPath)}: ${error.message}`);
  }
}

function patchCrawlerJsonWrites() {
  if (fs.writeFileSync.__manualCorrectionsPatched) return;

  fs.writeFileSync = function patchedWriteFileSync(filePath, data, ...args) {
    const resolvedPath = path.resolve(String(filePath || ""));
    const isCrawlerJson =
      resolvedPath.startsWith(`${crawlerDir}${path.sep}`) &&
      !path.basename(resolvedPath).includes("Retirados") &&
      path.extname(resolvedPath).toLowerCase() === ".json";

    if (!isCrawlerJson || typeof data !== "string") {
      return originalWriteFileSync(filePath, data, ...args);
    }

    try {
      const records = JSON.parse(data);
      const fileName = path.basename(resolvedPath);
      const appliedCorrections = applyManualJsonCorrectionsToArray(fileName, records);
      const appliedDuplicados = applyDuplicadoGrupoToArray(fileName, records);
      if (appliedCorrections > 0) {
        console.log(`🛠️ Correções manuais JSON reaplicadas em ${fileName} antes de salvar: ${appliedCorrections} campo(s).`);
      }
      if (appliedDuplicados > 0) {
        console.log(`🔗 duplicado_grupo reaplicado em ${fileName} antes de salvar: ${appliedDuplicados} registro(s).`);
      }

      try {
        atualizarHistoricoRaspagem(fileName, records);
      } catch (error) {
        console.warn(`⚠️ Falha ao atualizar histórico de raspagens para ${fileName}: ${error.message}`);
      }

      if (appliedCorrections > 0 || appliedDuplicados > 0) {
        return originalWriteFileSync(filePath, `${JSON.stringify(records, null, 2)}\n`, ...args);
      }
    } catch {
      // Mantem a escrita original quando o conteúdo não é um JSON de imóveis.
    }

    return originalWriteFileSync(filePath, data, ...args);
  };

  fs.writeFileSync.__manualCorrectionsPatched = true;
}

patchCrawlerJsonWrites();

/**
 * Carrega os registros existentes de uma coleção a partir do JSON local (crawler/<collectionName>.json).
 * Um arquivo ausente inicia uma base vazia; um arquivo invalido interrompe a raspagem.
 * @param {string} collectionName - Nome da coleção.
 * @param {string} keyField - Campo a ser usado como chave no Map (ex: 'linkReal').
 * @returns {Promise<Map<string, object>>} Map dos documentos.
 */
export async function getCollectionAsMap(collectionName, keyField) {
  const existingDataMap = new Map();
  const jsonPath = path.join(crawlerDir, `${collectionName}.json`);

  let content;
  try {
    content = fs.readFileSync(jsonPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log(`[${collectionName}] JSON local ausente; iniciando primeira coleta sem registros anteriores.`);
    return existingDataMap;
  }
  let records;
  try {
    records = JSON.parse(content);
  } catch (error) {
    throw new Error(`JSON local invalido de ${collectionName}; base preservada: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(records)) throw new Error(`JSON local de ${collectionName} deve conter uma lista; base preservada.`);
  for (const data of records) {
    if (data && typeof data === "object" && data[keyField]) {
      existingDataMap.set(data[keyField], { ...data });
    }
  }
  console.log(`📄 ${existingDataMap.size} registros existentes carregados do JSON local (${collectionName}.json).`);
  return existingDataMap;
}
