import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { projetosLocacaoImobBrasil, getProjetoLocacaoImobBrasil } from "./locacaoImobBrasilProjetos.js";
import { ordenarProjetos } from '../../../../crawler-order.cjs';
import { contarAntesDaLocacaoImobBrasil } from "./locacaoContagem.js";
import { sincronizarLocacao } from "./locacaoSincronizacao.js";
import { USER_AGENT_TRIADE } from "../triade/extractor.js";
import { USER_AGENT_FLUXO } from "../fluxo/extractor.js";
import { USER_AGENT_POSITIVO } from "../positivo/extractor.js";
import { USER_AGENT_RVNEGOCIOS } from "../rvNegocios/extractor.js";
import { USER_AGENT_DECISAO } from "../decisao/config.js";
import { USER_AGENT_IMPERIAL } from "../imperial/config.js";
import { USER_AGENT_FONTES } from "../fontes/config.js";

export const SPREADSHEET_LOCACAO_IMOBBRASIL = JF_SPREADSHEET_ID;
const outputDir = fileURLToPath(new URL("../../../../crawler/", import.meta.url));

export async function loadProjetoImobBrasil(projeto) {
  const extractor = await import(`../${projeto.folder}/${projeto.extractorFile ?? "extractor.js"}`);
  const parser = await import(`../${projeto.folder}/parser.js`);
  const sheets = await import(`../${projeto.folder}/sheets.js`);
  const functions = { extract: extractor[projeto.extractor], consolidate: parser.consolidateData, exportToSheets: sheets.exportToSheets };
  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== "function") throw new Error(`[${projeto.collection}] Funcao ausente: ${name}`);
  }
  return functions;
}

export async function runProjetoImobBrasil(nome) {
  const projeto = getProjetoLocacaoImobBrasil(nome);
  const functions = await loadProjetoImobBrasil(projeto);
  const outputPath = path.join(outputDir, `${projeto.collection}Locacao.json`);
  const existeJson = fs.existsSync(outputPath);
  const existing = existeJson ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  const codes = new Set(existing.map(item => String(item.codigoBase)));
  const modos = ["jfLider", "jfDecisao", "jfTriade", "jfFluxo", "jfImperial", "jfPositivo", "jfRVNegocios", "jfFontes"].includes(projeto.collection)
    ? [true]
    : process.env.CRAWLER_HEADLESS === "true" ? [true, false] : [undefined];
  let result;
  let totalEsperado;
  for (const [attempt, headlessOverride] of modos.entries()) {
    let browser;
    try {
      browser = await abrirBrowser({ headlessOverride });
      totalEsperado = await contarAntesDaLocacaoImobBrasil(browser, {
        projeto: projeto.collection,
        url: projeto.url,
        ...(projeto.collection === "jfDecisao" ? { userAgent: USER_AGENT_DECISAO } : {}),
        ...(projeto.collection === "jfImperial" ? { userAgent: USER_AGENT_IMPERIAL } : {}),
        ...(projeto.collection === "jfTriade" ? { userAgent: USER_AGENT_TRIADE } : {}),
        ...(projeto.collection === "jfFluxo" ? { userAgent: USER_AGENT_FLUXO } : {}),
        ...(projeto.collection === "jfPositivo" ? { userAgent: USER_AGENT_POSITIVO } : {}),
        ...(projeto.collection === "jfRVNegocios" ? { userAgent: USER_AGENT_RVNEGOCIOS } : {}),
        ...(projeto.collection === "jfFontes" ? { userAgent: USER_AGENT_FONTES } : {}),
      });
      result = await functions.extract(browser, new Set(), { baseUrl: projeto.url, strict: true, totalEsperado });
      break;
    } catch (error) {
      if (!error.code?.endsWith("_BLOCKED") || attempt === modos.length - 1) throw error;
      console.warn(`[${projeto.collection}Locacao] Bloqueio detectado em modo headless.`);
    } finally {
      if (browser) await browser.close();
    }
  }

  const imoveis = result.imoveisRaspados;
  const destination = { spreadsheetId: SPREADSHEET_LOCACAO_IMOBBRASIL, sheetName: projeto.collection };
  if (!Array.isArray(imoveis)) throw new Error("Resultado de extracao invalido. Dados anteriores preservados.");
  if (!imoveis.length) {
    if (!result.semImoveisConfirmado) throw new Error("Coleta vazia sem confirmacao do site. Dados anteriores preservados.");
    await sincronizarLocacao({ imoveis, anteriores: existing, imobiliaria: projeto.collection, outputPath, exportToSheets: functions.exportToSheets, spreadsheetId: destination.spreadsheetId, vazioConfirmado: true, totalEsperado });
    return;
  }
  if (imoveis.some(item => !item.linkReal || !Number.isFinite(item.preco))) {
    throw new Error("Imovel sem link ou preco valido. Dados anteriores preservados.");
  }
  const unique = Array.from(new Map(imoveis.map(item => [item.linkReal, item])).values());
  await sincronizarLocacao({ imoveis: unique, anteriores: existingMap, imobiliaria: projeto.collection, outputPath, exportToSheets: functions.exportToSheets, spreadsheetId: destination.spreadsheetId, totalEsperado });
  console.log(`[${projeto.collection}Locacao] Concluido. imoveis salvos: ${unique.length}; JSON: ${outputPath}`);
}

export async function main(args = process.argv.slice(2)) {
  const check = args.includes("--check");
  const todos = args.includes("--todos");
  const nomes = args.filter(arg => !arg.startsWith("--"));
  if (!nomes.length && !check && !todos) throw new Error("Informe um projeto, --todos ou --check.");
  const projetos = ordenarProjetos(todos || (check && !nomes.length) ? projetosLocacaoImobBrasil : nomes.map(getProjetoLocacaoImobBrasil));
  const failures = [];
  for (const projeto of projetos) {
    try {
      if (check) {
        await loadProjetoImobBrasil(projeto);
        console.log(`[OK] ${projeto.collection}: ${projeto.url}`);
      } else if (todos) {
        const code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), projeto.folder], { stdio: "inherit" });
          child.once("error", reject);
          child.once("exit", resolve);
        });
        if (code !== 0) throw new Error(`Execucao encerrada com codigo ${code}`);
      } else {
        await runProjetoImobBrasil(projeto.folder);
      }
    } catch (error) {
      failures.push(projeto.collection);
      console.error(`[${projeto.collection}Locacao] ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Projetos com falha: ${failures.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[LocacaoImobBrasil]", error.message);
    process.exitCode = 1;
  });
}