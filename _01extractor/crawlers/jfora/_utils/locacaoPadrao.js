import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { projetosLocacaoPadrao, buildUrlLocacao, getProjetoLocacao } from "./locacaoPadraoProjetos.js";
import { ordenarProjetos } from '../../../../crawler-order.cjs';
import { contarAntesDaLocacaoPadrao } from "./locacaoContagem.js";
import { sincronizarLocacao, enriquecerLocacao } from "./locacaoSincronizacao.js";

export const SPREADSHEET_LOCACAO = JF_SPREADSHEET_ID;
const outputDir = fileURLToPath(new URL("../../../../crawler/", import.meta.url));

export async function loadProjetoLocacao(projeto) {
  const extractor = await import(`../${projeto.folder}/extractor.js`);
  const internal = await import(`../${projeto.folder}/extractor-00-rotaInterna.js`);
  const parser = await import(`../${projeto.folder}/parser.js`);
  const sheets = await import(`../${projeto.folder}/sheets.js`);
  const functions = {
    extract: extractor[projeto.extractor],
    enrich: internal.enrichImoveisWithInternalData,
    consolidate: parser.consolidateData,
    exportToSheets: sheets.exportToSheets,
  };
  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== "function") throw new Error(`[${projeto.collection}] Funcao ausente: ${name}`);
  }
  return functions;
}

export function validateImoveisLocacao(imoveis) {
  if (!Array.isArray(imoveis) || !imoveis.length) {
    throw new Error("Nenhum aluguel extraido. JSON e planilha anteriores preservados.");
  }
  if (imoveis.some(item => !item.linkReal || (item.preco !== null && !Number.isFinite(item.preco)))) {
    throw new Error("Aluguel sem link ou preco valido. JSON e planilha anteriores preservados.");
  }
  return Array.from(new Map(imoveis.map(item => [item.linkReal, item])).values());
}

export async function runProjetoLocacao(nome) {
  const projeto = getProjetoLocacao(nome);
  const functions = await loadProjetoLocacao(projeto);
  const outputPath = path.join(outputDir, `${projeto.collection}Locacao.json`);
  const existingData = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf-8")) : [];
  const existingDataMap = new Map(existingData.map(item => [item.linkReal, item]));
  const url = buildUrlLocacao(projeto.urlVenda);
  console.log(`[${projeto.collection}Locacao] Iniciando: ${url}`);
  let browser;
  let imoveis;
  let emptyConfirmed = false;
  let totalEsperado;
  const options = { negociacao: "locacao" };
  if (projeto.allowConfirmedEmpty) {
    options.onEmptyConfirmed = () => { emptyConfirmed = true; };
  }
  try {
    browser = await abrirBrowser();
    totalEsperado = await contarAntesDaLocacaoPadrao(browser, { projeto: projeto.collection, url, allowConfirmedEmpty: projeto.allowConfirmedEmpty });
    if (projeto.collection === "jfRibeiroArrabal") options.totalEsperado = totalEsperado;
    const extraidos = await functions.extract(browser, [url], options);
    imoveis = Array.isArray(extraidos) && !extraidos.length && (emptyConfirmed || totalEsperado === 0)
      ? []
      : validateImoveisLocacao(extraidos);
    if (imoveis.length) await enriquecerLocacao(browser, imoveis, functions.enrich, { negociacao: "aluguel" });
  } finally {
    if (browser) await browser.close();
  }

  await sincronizarLocacao({ imoveis, anteriores: existingDataMap, imobiliaria: projeto.collection, outputPath, exportToSheets: functions.exportToSheets, spreadsheetId: SPREADSHEET_LOCACAO, totalEsperado, vazioConfirmado: emptyConfirmed || totalEsperado === 0 });
  console.log(`[${projeto.collection}Locacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPath}`);
}

export async function main(args = process.argv.slice(2)) {
  const check = args.includes("--check");
  const todos = args.includes("--todos");
  const nomes = args.filter(arg => !arg.startsWith("--"));
  if (!nomes.length && !check && !todos) {
    throw new Error("Informe um projeto, --todos para coletar o lote ou --check para validar os modulos.");
  }
  const projetos = ordenarProjetos(todos || (check && !nomes.length)
    ? projetosLocacaoPadrao
    : nomes.map(getProjetoLocacao));
  const failures = [];
  for (const projeto of projetos) {
    try {
      if (check) {
        await loadProjetoLocacao(projeto);
        console.log(`[OK] ${projeto.collection}: ${buildUrlLocacao(projeto.urlVenda)}`);
      } else {
        await runProjetoLocacao(projeto.folder);
      }
    } catch (error) {
      failures.push(projeto.collection);
      console.error(`[${projeto.collection}Locacao] Erro: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Projetos com falha: ${failures.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[LocacaoPadrao]", error.message);
    process.exitCode = 1;
  });
}