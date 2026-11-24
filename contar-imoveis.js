import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ordenarProjetos } from "./crawler-order.cjs";
import { projetosContagemVendas } from "./_01extractor/crawlers/jfora/_utils/vendasContagemProjetos.js";
import { contarAntesDasVendas, parseTotalVendas, validarUrlContagemVendas } from "./_01extractor/crawlers/jfora/_utils/vendasContagem.js";
import { load } from "cheerio";
import * as contagem from "./_01extractor/crawlers/jfora/_utils/locacaoContagem.js";
import { projetosLocacaoPadrao, buildUrlLocacao } from "./_01extractor/crawlers/jfora/_utils/locacaoPadraoProjetos.js";
import { projetosLocacaoImobBrasil } from "./_01extractor/crawlers/jfora/_utils/locacaoImobBrasilProjetos.js";
import { projetosLocacaoKenlo } from "./_01extractor/crawlers/jfora/_utils/locacaoKenloProjetos.js";
import { projetosLocacaoDiversos } from "./_01extractor/crawlers/jfora/_utils/locacaoDiversosProjetos.js";
import { projetosSemRotaLocacao } from "./_01extractor/crawlers/jfora/_utils/locacaoPreparacao.js";
import { projetosNiteroiLocacao } from "./_01extractor/crawlers/jfora/niteroi/locacao/projects.js";
import { carregarPlataforma } from "./_01extractor/crawlers/jfora/niteroi/locacao/runLocacao.js";
import { abrirBrowser } from "./_01extractor/services/puppeteerPool.js";
import { JF_SPREADSHEET_ID } from "./_01extractor/crawlers/jfora/_utils/jfSheetsConfig.js";
import { NITEROI_SPREADSHEET_ID } from "./_01extractor/crawlers/jfora/niteroi/projects.js";
import { projetosRioHabilitados, RIO_SPREADSHEET_ID } from "./_01extractor/crawlers/jfora/rio/projects.js";
import { contarKenloRio } from "./_01extractor/crawlers/jfora/rio/kenlo.js";

const root = new URL("./_01extractor/crawlers/jfora/", import.meta.url);
const contadoresPorTipo = {
  padrao: contagem.contarAntesDaLocacaoPadrao,
  imobbrasil: contagem.contarAntesDaLocacaoImobBrasil,
  kenlo: contagem.contarAntesDaLocacaoKenlo,
  acervo: contagem.contarAntesDaLocacaoAcervo,
  colibex: contagem.contarAntesDaLocacaoColibex,
  soares: contagem.contarAntesDaLocacaoSoares,
  start: contagem.contarAntesDaLocacaoStart,
  toc2: contagem.contarAntesDaLocacaoToc2,
  invest: contagem.contarAntesDaLocacaoInvest,
  mega: contagem.contarAntesDaLocacaoMega,
  remax: contagem.contarAntesDaLocacaoRemax,
  couto: contagem.contarAntesDaLocacaoCouto,
};

export function listarContagens() {
  const vendas = projetosContagemVendas.filter(project => !project.collection.startsWith("rio")).map(project => ({ ...project, tipo: "venda" }));
  const grupos = [
    ...projetosLocacaoPadrao.map(project => ({ ...project, kind: "padrao", url: buildUrlLocacao(project.urlVenda) })),
    ...projetosLocacaoImobBrasil.map(project => ({ ...project, kind: "imobbrasil" })),
    ...projetosLocacaoKenlo.map(project => ({ ...project, kind: "kenlo" })),
    ...projetosLocacaoDiversos.map(project => ({ ...project, kind: project.folder === "oliveira" ? "kenlo" : project.folder })),
    ...projetosSemRotaLocacao.map(project => ({ ...project, kind: "sem-rota" })),
  ];
  const alugueisJf = projetosContagemVendas.filter(project => project.collection.startsWith("jf")).map(project => {
    const group = grupos.find(item => item.collection === project.collection);
    return { ...(group ?? project), tipo: "aluguel", individual: !group };
  });
  const alugueisNit = projetosNiteroiLocacao.map(project => ({ ...project, tipo: "aluguel" }));
  const rio = projetosRioHabilitados.flatMap(project => [
    ...(project.urlVendas && (!project.negociacoes || project.negociacoes.includes("venda")) ? [{ ...project, tipo: "venda", url: project.urlVendas }] : []),
    ...(project.urlLocacao && (!project.negociacoes || project.negociacoes.includes("locacao")) ? [{ ...project, tipo: "aluguel", url: project.urlLocacao }] : []),
  ]);
  return ordenarProjetos([...vendas, ...alugueisJf, ...alugueisNit, ...rio]);
}

export async function contarProjeto(browser, project) {
  if (project.collection.startsWith("rio")) {
    const negociacao = project.tipo === "venda" ? "venda" : "locacao";
    if (project.kind === "remax") {
      const { contarRemaxRio } = await import("./_01extractor/crawlers/jfora/rio/remax.js");
      return contarRemaxRio(browser, project, negociacao);
    }
    if (project.kind === "lopes") {
      const { contarLopes } = await import("./_01extractor/crawlers/jfora/rio/lopes.js");
      return contarLopes(browser, project, negociacao);
    }
    if (project.kind === "privilegio") {
      const { contarPrivilegio } = await import("./_01extractor/crawlers/jfora/rio/privilegio.js");
      return contarPrivilegio(browser, project, negociacao);
    }
    if (project.kind === "novaEpoca") {
      const { contarNovaEpoca } = await import("./_01extractor/crawlers/jfora/rio/novaEpoca.js");
      return contarNovaEpoca(browser, project, negociacao);
    }
    if (project.kind === "kenlo") return contarKenloRio(browser, project, negociacao);
    if (project.kind === "midas") {
      const { contarMidasRio } = await import("./_01extractor/crawlers/jfora/rio/midas.js");
      return contarMidasRio(browser, project, negociacao);
    }
    if (project.kind === "apsa") {
      const { contarApsa } = await import("./_01extractor/crawlers/jfora/rio/apsa.js");
      return contarApsa(browser, project, negociacao);
    }
    if (project.kind === "atlantica") {
      const { contarAtlantica } = await import("./_01extractor/crawlers/jfora/rio/atlantica.js");
      return contarAtlantica(browser, project, negociacao);
    }
    if (project.kind === "homeHub") {
      const { contarHomeHub } = await import("./_01extractor/crawlers/jfora/rio/homeHub.js");
      return contarHomeHub(browser, project, negociacao);
    }
    const { contarVariante } = await import("./_01extractor/crawlers/jfora/rio/variantes.js");
    return contarVariante(browser, project, negociacao);
  }
  if (project.tipo === "venda") {
    try { return await contarAntesDasVendas(browser, { projeto: project.collection, salvar: false }); }
    catch (error) {
      if (!["imobbrasil", "imperial", "imobbrasilClassico", "kenlo"].includes(project.kind) ||
          !/HTTP 403|ERR_NAME_NOT_RESOLVED/.test(error.message)) throw error;
      console.warn(`[${project.collection}] ${error.message} Conferindo contador no HTML via HTTP.`);
      const response = await fetch(project.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} na contagem HTML de ${project.collection}.`);
      validarUrlContagemVendas(project, response.url);
      const $ = load(await response.text());
      const labels = $(project.selector).toArray().map(element => project.parentText ? $(element).parent().text() : $(element).text());
      const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const label = labels.find(value => new RegExp(project.pattern, "i").test(normalize(value)));
      return parseTotalVendas(label, project);
    }
  }
  if (project.collection.startsWith("nit")) {
    return (await carregarPlataforma(project.kind)).contar(browser, project);
  }
  if (project.kind === "sem-rota") {
    console.warn(`[${project.collection}] Sem rota de aluguel configurada; quantidade 0 conforme cadastro.`);
    return 0;
  }
  if (project.collection === "jfHolder") {
    const { contarHolder } = await import(new URL("holder/extractor.js", root));
    return contarHolder(browser, "locacao");
  }
  let url = project.url;
  if (project.individual) {
    const module = await import(new URL(`${project.folder}/locacao.js`, root));
    url = module.linksBuscaLocacao?.[0] ?? module.opcoesLocacao?.baseUrl;
    if (!url) {
      const extractor = await import(new URL(`${project.folder}/extractor-locacao.js`, root));
      url = extractor[`URL_LOCACAO_${project.folder.toUpperCase()}`];
    }
  }
  const contar = contadoresPorTipo[project.kind];
  if (!contar || !url) throw new Error(`Contador de aluguel nao configurado: ${project.collection}.`);
  try { return await contar(browser, { ...project, projeto: project.collection, url, salvar: false }); }
  catch (error) {
    if (project.kind !== "imobbrasil" || !/HTTP 403/.test(error.message)) throw error;
    console.warn(`[${project.collection}] ${error.message} Conferindo contador no HTML via HTTP.`);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} na contagem HTML de ${project.collection}.`);
    const destination = new URL(response.url);
    const expected = new URL(url);
    if (destination.origin !== expected.origin || destination.pathname.replace(/\/+$/, "") !== "/imovel/locacao") {
      throw new Error("Contagem HTML redirecionada para fora da locacao.");
    }
    const $ = load(await response.text());
    const selector = project.collection === "jfImperial" ? ".grid-3 strong" : ".topsearch__total strong,.topsearch__total b";
    const label = $(selector).toArray().find(element => /im[o\u00f3]veis\s+encontrados/i.test($(element).parent().text()));
    return contagem.parseTotalLocacaoImobBrasil(label ? $(label).text() : "");
  }
}

export async function contarImoveis(args = process.argv.slice(2), deps = {}) {
  const names = args.filter(arg => !arg.startsWith("--"));
  const resultArg = args.find(arg => arg.startsWith("--resultado="));
  if ((!args.includes("--todos") && !names.length) || (args.includes("--todos") && names.length) ||
      args.some(arg => arg.startsWith("--") && arg !== "--todos" && !arg.startsWith("--resultado="))) {
    throw new Error("Use --todos ou nomes de projetos; --resultado=caminho salva o resumo em JSON.");
  }
  const all = listarContagens();
  for (const name of names) {
    if (!all.some(project => [project.collection, project.folder].some(value => value?.toLowerCase() === name.toLowerCase()))) {
      throw new Error(`Projeto de contagem desconhecido: ${name}`);
    }
  }
  const projects = args.includes("--todos") ? all : all.filter(project =>
    names.some(name => [project.collection, project.folder].some(value => value?.toLowerCase() === name.toLowerCase())));
  const results = [];
  let next = 0;
  const saveResults = () => {
    if (resultArg) fs.writeFileSync(resultArg.slice("--resultado=".length), `${JSON.stringify(results, null, 2)}\n`);
  };
  const worker = async () => {
    while (next < projects.length) {
      const project = projects[next++];
      let browser;
      let result;
      try {
        console.log(`CONTAGEM_INICIO=${project.collection} ${project.tipo}`);
        browser = await (deps.abrirBrowser ?? abrirBrowser)({
          headlessOverride: true,
          hostResolverRules: project.hostResolverRules ?? (project.collection === "nitKiffer" ? "MAP www.kifferimoveis.com.br 170.82.174.30" : undefined),
        });
        const total = await (deps.contarProjeto ?? contarProjeto)(browser, project);
        if (!Number.isSafeInteger(total) || total < 0) throw new Error("Quantidade retornada invalida.");
        result = { projeto: project.collection, tipo: project.tipo, total, status: "ok", salvo: false };
      } catch (error) {
        result = { projeto: project.collection, tipo: project.tipo, status: "erro", mensagem: error.message };
        console.error(`CONTAGEM_ERRO=${JSON.stringify(result)}`);
      } finally {
        if (browser) {
          try { await browser.close(); }
          catch (error) {
            result = { projeto: project.collection, tipo: project.tipo, status: "erro", mensagem: `Falha ao fechar navegador: ${error.message}` };
            console.error(`CONTAGEM_ERRO=${JSON.stringify(result)}`);
          }
        }
      }
      results.push(result);
      console.log(`CONTAGEM_RESULTADO=${JSON.stringify(result)}`);
      saveResults();
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, projects.length) }, worker));
  for (const [prefix, id] of [["jf", JF_SPREADSHEET_ID], ["nit", NITEROI_SPREADSHEET_ID], ["rio", RIO_SPREADSHEET_ID]]) {
    for (const tipo of ["venda", "aluguel"]) {
      const batch = results.filter(item => item.status === "ok" && item.projeto.startsWith(prefix) && item.tipo === tipo);
      if (!batch.length) continue;
      try {
        await (deps.registrarTotaisImoveis ?? contagem.registrarTotaisImoveis)(
          batch.map(item => ({ projeto: item.projeto, total: item.total })), id, tipo === "venda" ? "Vendas" : "Locacao");
        for (const item of batch) item.salvo = true;
      } catch (error) {
        console.error(`[Contagem] Falha ao salvar lote ${prefix}/${tipo}: ${error.message}`);
        for (const item of batch) item.erroSalvamento = error.message;
      }
      saveResults();
    }
  }
  const saved = results.filter(item => item.salvo).length;
  console.log(`CONTAGEM_RESUMO=${JSON.stringify({ projetos: results.length, consultados: results.filter(item => item.status === "ok").length, salvos: saved, falhas: results.length - saved })}`);
  if (saved !== results.length) process.exitCode = 1;
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  contarImoveis().catch(error => { console.error(`[CONTAGEM] ${error.message}`); process.exitCode = 1; });
}
