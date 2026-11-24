import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { abrirBrowser } from "../../../../services/puppeteerPool.js";
import { registrarTotalLocacao } from "../../_utils/locacaoContagem.js";
import { sincronizarLocacao } from "../../_utils/locacaoSincronizacao.js";
import { NITEROI_SPREADSHEET_ID } from "../projects.js";
import { exportToSheets } from "../sheets.js";
import { getProjetoNiteroiLocacao, projetosNiteroiLocacao } from "./projects.js";

// A aba "retirados" da planilha de Niteroi ja guarda o historico de vendas, com outro cabecalho.
export const ABA_RETIRADOS_LOCACAO_NITEROI = "retiradosLocacao";

const plataformas = {
  kenlo: () => import("./kenlo.js"),
  imobbrasil: () => import("./imobBrasil.js"),
  siciliano: () => import("./siciliano.js"),
  gustavo: () => import("./gustavo.js"),
  selfspin: () => import("./selfspin.js"),
  remax: () => import("./remax.js"),
  realiza: () => import("./realiza.js"),
  predial: () => import("./predial.js"),
};

export async function carregarPlataforma(kind) {
  const loader = plataformas[kind];
  if (!loader) throw new Error(`Plataforma de aluguel sem coletor: ${kind}`);
  const module = await loader();
  if (typeof module.contar !== "function" || typeof module.coletar !== "function") throw new Error(`Coletor de aluguel invalido: ${kind}`);
  return module;
}

export function caminhoJsonLocacao(collection) {
  return fileURLToPath(new URL(`../../../../../crawler/${collection}Locacao.json`, import.meta.url));
}

export async function runNiteroiLocacao(name, { check = process.argv.includes("--check"), deps = {} } = {}) {
  const project = getProjetoNiteroiLocacao(name);
  const plataforma = deps.plataforma ?? await carregarPlataforma(project.kind);
  const outputPath = deps.outputPath ?? caminhoJsonLocacao(project.collection);
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : [];
  if (!Array.isArray(previous)) throw new Error(`[${project.collection}Locacao] JSON anterior invalido.`);
  const tag = `[${project.collection}Locacao]`;
  console.log(`${tag} Iniciando raspagem de alugueis em segundo plano, sem janela de navegador.`);
  const browser = await (deps.abrirBrowser ?? abrirBrowser)({ headlessOverride: true, hostResolverRules: project.hostResolverRules });
  let totalEsperado;
  let records;
  try {
    const maxTentativas = ["kenlo", "predial"].includes(project.kind) ? 3 : 1;
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        totalEsperado = await plataforma.contar(browser, project, { check });
        if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error(`${tag} Total de alugueis invalido.`);
        console.log(`${tag} Total disponivel antes da raspagem: ${totalEsperado}.`);
        if (!check) await (deps.registrarTotalLocacao ?? registrarTotalLocacao)(project.collection, totalEsperado, NITEROI_SPREADSHEET_ID);
        records = await plataforma.coletar(browser, project, {
          totalEsperado, check, anteriores: new Map(previous.map(item => [item.linkReal, item])),
        });
        break;
      } catch (error) {
        if (error.code !== "KENLO_TOTAL_ALTERADO" || tentativa >= maxTentativas) throw error;
        console.warn(`${tag} ${error.message} Descartando coleta parcial e recontando para reiniciar do zero (tentativa ${tentativa + 1}/${maxTentativas}).`);
      }
    }
  } finally { await browser.close(); }
  // Coletores podem informar anúncios vistos no total do site, mas indisponíveis (vendidos/locados).
  const excluidos = Number.isSafeInteger(records.excluidos) && records.excluidos > 0 ? records.excluidos : 0;
  const totalValido = totalEsperado - excluidos;
  if (check) {
    console.log(`${tag} CHECK: ${records.length}/${totalValido} alugueis validados${excluidos ? ` (${excluidos} indisponiveis excluidos)` : ""}; nenhum dado salvo ou publicado.`);
    return records;
  }
  if (records.length !== totalValido) throw new Error(`${tag} Coleta incompleta: ${records.length}/${totalValido}; base preservada.`);
  console.log(`${tag} Coleta completa. Salvando ${records.length} alugueis...`);
  const result = await (deps.sincronizarLocacao ?? sincronizarLocacao)({
    imoveis: [...records], anteriores: previous, imobiliaria: project.collection, outputPath,
    exportToSheets: deps.exportToSheets ?? exportToSheets, spreadsheetId: NITEROI_SPREADSHEET_ID,
    vazioConfirmado: totalValido === 0, totalEsperado: totalValido,
    abaRetirados: ABA_RETIRADOS_LOCACAO_NITEROI, exportOptions: { negociacao: "aluguel" },
  });
  console.log(`${tag} Concluido.`);
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const check = args.includes("--check");
  const todos = args.includes("--todos");
  const names = args.filter(arg => !arg.startsWith("--"));
  if (!names.length && !todos) throw new Error("Informe um projeto ou --todos.");
  const projects = todos ? projetosNiteroiLocacao : names.map(getProjetoNiteroiLocacao);
  const failures = [];
  for (const project of projects) {
    try {
      if (projects.length > 1) {
        const code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), project.collection, ...(check ? ["--check"] : [])], { stdio: "inherit" });
          child.once("error", reject);
          child.once("exit", resolve);
        });
        if (code !== 0) throw new Error(`Execucao encerrada com codigo ${code}`);
      } else {
        await runNiteroiLocacao(project.collection, { check });
      }
    } catch (error) {
      failures.push(project.collection);
      console.error(`[${project.collection}Locacao] ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Projetos com falha: ${failures.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[NiteroiLocacao]", error.message); process.exitCode = 1; });
}
