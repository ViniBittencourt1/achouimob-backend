import { backendEnvPath as ISOLATED_BACKEND_ENV } from '../../../../backend-paths.cjs';
//node src/crawlers/jfora/_check/_jfCheck.js
// Orquestrador: verifica bairros, cidades e tipos de imóvel em maiúsculas e exporta para a aba _jfCheck do Google Sheets
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { appendRows, clearSheet, writeHeader } from "../../../services/googleSheets.js";
import { listarCidadesMaiusculas } from "./jfCidades.js";

dotenv.config({ path: ISOLATED_BACKEND_ENV });

// Inicialização segura do Firebase
if (!getApps().length) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const credPath = path.join(__dirname, "..", "..", "..", "..", "credentials", "firebase-key.json");
  initializeApp({
    credential: cert(credPath),
  });
}

const db = getFirestore();

async function getMaiusculos(colecao) {
  const snapshot = await db.collection(colecao).get();
  const arr = [];
  // Para todas as coleções, verifica campos relevantes
  const camposMaiusculos = [
    'nome', 'bairro', 'tipoImovel', 'cidade'
  ];
  snapshot.forEach(doc => {
    const data = doc.data();
    const algumMaiusculo = camposMaiusculos.some(
      campo => data[campo] && typeof data[campo] === 'string' && data[campo] === data[campo].toUpperCase()
    );
    if (algumMaiusculo) {
      arr.push({ ...data, _colecao: colecao });
    }
  });
  return arr;
}

async function main() {
  const bairros = await getMaiusculos("bairros");
  const tiposImovel = await getMaiusculos("tiposImovel");
  const imoveis = await getMaiusculos("jfAna");
  // Checa cidade maiúscula em todas as coleções relevantes
  const cidades = await listarCidadesMaiusculas(["bairros", "cidades", "tiposImovel", "jfAna"]);
  const todos = [...bairros, ...cidades, ...tiposImovel, ...imoveis];

  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    console.warn("[Sheets] SPREADSHEET_ID não definido. Pulando envio.");
    return;
  }
  const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const ABA = "_jfCheck";

  await clearSheet(SPREADSHEET_ID, ABA);
  const header = [
    "colecao",
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
    "atualizadoEm"
  ];
  await writeHeader(SPREADSHEET_ID, ABA, header);

  function formatTimestamp(timestampObject) {
    if (
      timestampObject &&
      typeof timestampObject === "object" &&
      timestampObject._seconds !== undefined &&
      timestampObject._nanoseconds !== undefined
    ) {
      const milliseconds =
        timestampObject._seconds * 1000 + timestampObject._nanoseconds / 1000000;
      const date = new Date(milliseconds);
      return date.toLocaleString("pt-BR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    }
    return timestampObject instanceof Date ? timestampObject.toISOString() : timestampObject ?? "";
  }

  const linhas = todos.map(item => [
    item._colecao || "",
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
    formatTimestamp(item.dataInclusao),
    formatTimestamp(item.dataExclusao),
    item.linkFoto ?? "",
    formatTimestamp(item.atualizadoEm)
  ]);
  await appendRows(SPREADSHEET_ID, `${ABA}!A2`, linhas);
}

main();
