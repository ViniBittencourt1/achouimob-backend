import { backendEnvPath as ISOLATED_BACKEND_ENV } from '../../backend-paths.cjs';
// backend/src/services/googleSheets.js

import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ISOLATED_BACKEND_ENV });

// -------------------------
//   CONFIGURAÇÃO BÁSICA
// -------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho para o JSON da conta de serviço
const SERVICE_ACCOUNT_FILE = path.join(__dirname, "..", "..", "credentials", "service-account.json");

// Autenticação com o Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_FILE,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

export async function getSheetsMetadata(spreadsheetId) {
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))' });
  return (response.data.sheets || []).map(item => item.properties);
}

export async function readSheets(spreadsheetId, ranges) {
  const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, valueRenderOption: 'UNFORMATTED_VALUE' });
  return response.data.valueRanges || [];
}

export async function clearSheetsRanges(spreadsheetId, ranges) {
  if (!ranges.length) return;
  await sheets.spreadsheets.values.batchClear({ spreadsheetId, resource: { ranges } });
}

export async function writeSheets(spreadsheetId, data) {
  if (!data.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, resource: { valueInputOption: 'RAW', data } });
}

export async function ensureSheet(spreadsheetId, sheetName, columnCount = 2, rowCount) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,gridProperties(columnCount,rowCount)))",
  });
  const existing = response.data.sheets?.find(item => item.properties?.title?.trim() === sheetName.trim());
  if (existing) {
    const grid = existing.properties.gridProperties;
    const updates = {};
    if (grid.columnCount < columnCount) updates.columnCount = columnCount;
    if (rowCount !== undefined && grid.rowCount < rowCount) updates.rowCount = rowCount;
    if (Object.keys(updates).length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ updateSheetProperties: { properties: { sheetId: existing.properties.sheetId, gridProperties: updates }, fields: Object.keys(updates).map(key => `gridProperties.${key}`).join(",") } }] } });
    }
    return existing.properties.title;
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests: [{ addSheet: { properties: { title: sheetName, gridProperties: { rowCount: rowCount ?? 1000, columnCount } } } }] },
  });
  return sheetName;
}

export async function setSheetNumberFormat(spreadsheetId, sheetId, columnIndex) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: Number(sheetId),
            startRowIndex: 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      }],
    },
  });
}

export async function getSheetTitleById(spreadsheetId, sheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const sheet = response.data.sheets?.find(
    (item) => item.properties?.sheetId === Number(sheetId)
  );
  if (!sheet?.properties?.title) {
    throw new Error(`[Sheets] Aba com gid ${sheetId} nao encontrada.`);
  }
  return sheet.properties.title;
}

async function resolveSheetTitle(spreadsheetId, requestedName) {
  const req = String(requestedName ?? "");
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });

  const titles = (res.data.sheets || [])
    .map((s) => s?.properties?.title)
    .filter(Boolean);

  if (titles.includes(req)) return req;

  const byTrim = titles.find((t) => t.trim() === req.trim());
  return byTrim || req;
}

function quoteSheetTitle(sheetTitle) {
  const escaped = String(sheetTitle).replace(/'/g, "''");
  return `'${escaped}'`;
}

async function normalizeRange(spreadsheetId, rangeOrSheet, fallbackA1 = "A:ZZ") {
  const raw = String(rangeOrSheet ?? "");

  if (!raw.includes("!")) {
    const realTitle = await resolveSheetTitle(spreadsheetId, raw);
    return `${quoteSheetTitle(realTitle)}!${fallbackA1}`;
  }

  const [sheetPart, a1Part] = raw.split("!");
  const unquotedSheet = sheetPart.replace(/^'+|'+$/g, "");
  const realTitle = await resolveSheetTitle(spreadsheetId, unquotedSheet);
  const safeA1 = a1Part || fallbackA1;
  return `${quoteSheetTitle(realTitle)}!${safeA1}`;
}


// ---------------------------------------------------
// 🔹 FUNÇÃO: LIMPAR ABA INTEIRA
// ---------------------------------------------------
export async function clearSheet(spreadsheetId, sheetName) {
  try {
    const range = await normalizeRange(spreadsheetId, sheetName, "A:ZZ");

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });

    console.log(`[Sheets] Aba "${sheetName}" foi limpa com sucesso.`);
  } catch (err) {
    console.error("❌ Erro ao limpar aba:", err);
    throw err;
  }
}


// ---------------------------------------------------
// 🔹 FUNÇÃO: ESCREVER CABEÇALHO
// ---------------------------------------------------
export async function writeHeader(spreadsheetId, sheetName, headerArray) {
  try {
    const range = await normalizeRange(spreadsheetId, `${sheetName}!A1`, "A1");

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      resource: {
        values: [headerArray],
      },
    });

    console.log(`[Sheets] Cabeçalho escrito na aba "${sheetName}".`);
  } catch (err) {
    console.error("❌ Erro ao escrever cabeçalho:", err);
    throw err;
  }
}


// ---------------------------------------------------
// 🔹 FUNÇÃO: ADICIONAR LINHAS
// ---------------------------------------------------
export async function appendRows(spreadsheetId, range, values, options = {}) {
  if (!spreadsheetId || !values?.length) {
    console.warn("[Sheets] Nenhum dado enviado para appendRows.");
    return;
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      insertDataOption: options.insertDataOption ?? "INSERT_ROWS",
      resource: { values },
    });

    console.log(`[Sheets] ${values.length} linhas adicionadas em ${range}.`);
  } catch (err) {
    console.error("❌ Erro ao adicionar linhas no Sheets:", err);
    throw err;
  }
}


// ---------------------------------------------------
// 🔹 FUNÇÃO: LER DADOS DA PLANILHA
// ---------------------------------------------------
export async function readSheet(spreadsheetId, range, options = {}) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      ...options,
    });

    return res.data.values || [];
  } catch (err) {
    console.error("❌ Erro ao ler dados do Sheets:", err);
    throw err;
  }
}

// ---------------------------------------------------
// 🔹 FUNÇÃO: SOBRESCREVER VALORES (writeSheet)
// ---------------------------------------------------
export async function writeSheet(spreadsheetId, range, values) {
  if (!spreadsheetId || !values?.length) {
    console.warn("[Sheets] Nenhum dado enviado para writeSheet.");
    return;
  }

  try {
    const safeRange = await normalizeRange(spreadsheetId, range, "A:ZZ");

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: safeRange,     // ex: 'jfBairros!C2:C10'
      valueInputOption: "RAW",
      resource: {
        values,             // deve ser array de arrays: [[val1],[val2],...]
      },
    });

    console.log(`[Sheets] Valores atualizados em ${safeRange}.`);
  } catch (err) {
    console.error("❌ Erro ao escrever no Sheets:", err);
    throw err;
  }
}