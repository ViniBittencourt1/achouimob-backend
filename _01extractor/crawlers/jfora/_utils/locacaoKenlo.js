import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { projetosLocacaoKenlo, getProjetoLocacaoKenlo } from "./locacaoKenloProjetos.js";
import { ordenarProjetos } from '../../../../crawler-order.cjs';
import { loadCamposKenlo, extractKenloLocacao } from "./locacaoKenloExtractor.js";
import { contarAntesDaLocacaoKenlo } from "./locacaoContagem.js";
import { sincronizarLocacao } from "./locacaoSincronizacao.js";

export const SPREADSHEET_LOCACAO_KENLO = JF_SPREADSHEET_ID;
const outputDir = fileURLToPath(new URL("../../../../crawler/", import.meta.url));

export async function loadProjetoKenlo(projeto) {
  const fields = await loadCamposKenlo(projeto);
  const parser = await import(`../${projeto.folder}/parser.js`);
  const sheets = await import(`../${projeto.folder}/sheets.js`);
  if (typeof parser.consolidateData !== "function" || typeof sheets.exportToSheets !== "function") throw new Error(`[${projeto.collection}] Modulos de consolidacao/Sheets invalidos.`);
  return { fields, consolidate: parser.consolidateData, exportToSheets: sheets.exportToSheets };
}

export async function runProjetoKenlo(nome) {
  const projeto = getProjetoLocacaoKenlo(nome);
  const functions = await loadProjetoKenlo(projeto);
  const outputPath = path.join(outputDir, `${projeto.collection}Locacao.json`);
  const existeJson = fs.existsSync(outputPath);
  const existing = existeJson ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal, item]));
  let browser;
  let result;
  let totalEsperado;
  try {
    browser = await abrirBrowser(["jfMoura", "jfCrispi", "jfNunes", "jfVivaBem"].includes(projeto.collection) ? { headlessOverride: true } : undefined);
    totalEsperado = await contarAntesDaLocacaoKenlo(browser, { projeto: projeto.collection, url: projeto.url, zeroIfUnavailable: projeto.zeroIfUnavailable });
    result = await extractKenloLocacao(browser, projeto, functions.fields);
  } catch (error) {
    if (!projeto.zeroIfUnavailable || error.code !== 'LOCACAO_UNAVAILABLE') throw error;
    console.warn(`[${projeto.collection}Locacao] Listagem indisponivel: ${error.message}`);
    result = { imoveisRaspados: [], semImoveisConfirmado: true };
  } finally { if (browser) await browser.close(); }
  const destination = { spreadsheetId: SPREADSHEET_LOCACAO_KENLO, sheetName: projeto.collection };
  if (!result.imoveisRaspados.length) {
    if (!result.semImoveisConfirmado) throw new Error("Coleta vazia nao confirmada. Dados anteriores preservados.");
    await sincronizarLocacao({ imoveis: [], anteriores: existing, imobiliaria: projeto.collection, outputPath, exportToSheets: functions.exportToSheets, spreadsheetId: destination.spreadsheetId, vazioConfirmado: true, totalEsperado });
    return 0;
  }
  await sincronizarLocacao({ imoveis: result.imoveisRaspados, anteriores: existingMap, imobiliaria: projeto.collection, outputPath, exportToSheets: functions.exportToSheets, spreadsheetId: destination.spreadsheetId, totalEsperado });
  console.log(`[${projeto.collection}Locacao] Concluido. imoveis salvos: ${result.imoveisRaspados.length}; JSON: ${outputPath}`);
}

export async function main(args = process.argv.slice(2)) {
  const check = args.includes("--check");
  const todos = args.includes("--todos");
  const names = args.filter(arg => !arg.startsWith("--"));
  if (!names.length && !check && !todos) throw new Error("Informe um projeto, --todos ou --check.");
  const projects = ordenarProjetos(todos || (check && !names.length) ? projetosLocacaoKenlo : names.map(getProjetoLocacaoKenlo));
  const failures = [];
  for (const project of projects) {
    try {
      if (check) {
        await loadProjetoKenlo(project);
        console.log(`[OK] ${project.collection}: ${project.url}`);
      } else if (todos) {
        const code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), project.folder], { stdio: "inherit" });
          child.once("error", reject);
          child.once("exit", resolve);
        });
        if (code !== 0) throw new Error(`Execucao encerrada com codigo ${code}`);
      } else {
        await runProjetoKenlo(project.folder);
      }
    } catch (error) {
      failures.push(project.collection);
      console.error(`[${project.collection}Locacao] ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Projetos com falha: ${failures.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[LocacaoKenlo]", error.message); process.exitCode = 1; });
}