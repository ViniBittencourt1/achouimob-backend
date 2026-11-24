import { ensureSheet, readSheet } from "../../../services/googleSheets.js";
import { carregarEstadoKenloLocacao, readSnapshotKenloLocacao, validateKenloPage } from "./locacaoKenloExtractor.js";
import { JF_SPREADSHEET_ID } from "./jfSheetsConfig.js";
import { NITEROI_SPREADSHEET_ID } from "../niteroi/projects.js";
import { installRemaxSearchBatches } from "../remax/paginacao-api.js";
import { aguardarBuscaLocacaoRemax } from "../remax/busca-locacao.js";
import { verificarSiteDesativado } from "./siteDesativado.js";

export const SPREADSHEET_CONTAGEM_LOCACAO = "11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk";
let pendingWrite = Promise.resolve();

export function parseTotalLocacaoPadrao(text) {
  const match = String(text).match(/\(\s*(\d+|\d{1,3}(?:\.\d{3})+)\s*\)/);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis nao identificado em #title--label; contagem anterior preservada.");
  return total;
}

export function parseTotalLocacaoImobBrasil(text) {
  const normalized = String(text).trim();
  const total = /^(\d+|\d{1,3}(?:\.\d{3})+)$/.test(normalized) ? Number(normalized.replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis nao identificado em .topsearch__total strong; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoImobBrasil(browser, { projeto, url, salvar = true, userAgent }) {
  const search = new URL(url);
  if (projeto === "jfLider" && search.origin === "https://www.lidernegociosimob.com.br" && search.pathname === "/imovel/locacao" && !search.search) {
    const { contarLiderLocacao } = await import("../lider/extractor-locacao.js");
    const total = await contarLiderLocacao(browser, { salvar });
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  }
  if (search.pathname !== "/imovel/locacao") throw new Error("A contagem exige uma URL de locacao.");
  const page = await browser.newPage();
  try {
    if (userAgent) await page.setUserAgent(userAgent);
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
      const error = new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
      if (status === 403 || status === 429) error.code = `${projeto.replace(/^jf/, "").toUpperCase()}_BLOCKED`;
      throw error;
    }
    await verificarSiteDesativado(page, projeto, { salvar });
    const selector = projeto === "jfImperial" ? ".grid-3 strong" : ".topsearch__total strong,.topsearch__total b";
    await page.waitForSelector(selector, { timeout: 30000 });
    const label = await page.$$eval(selector, elements => elements.find(element => /im[o\u00f3]veis\s+encontrados/i.test(element.parentElement?.textContent || ""))?.textContent || "");
    const total = parseTotalLocacaoImobBrasil(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export async function contarAntesDaLocacaoKenlo(browser, { projeto, url, zeroIfUnavailable = false, salvar = true }) {
  if (new URL(url).pathname !== "/imoveis/para-alugar") throw new Error("A contagem exige uma URL de locacao.");
  const page = await browser.newPage();
  try {
    let total;
    try {
      total = (await carregarEstadoKenloLocacao(page, url, { projeto, salvar })).state.total;
    } catch (error) {
      if (projeto !== "jfMultimoveis" || !zeroIfUnavailable || error.code !== "LOCACAO_UNAVAILABLE") throw error;
      console.warn(`[${projeto}Locacao] Contagem zero por indisponibilidade, conforme configurado.`);
      total = 0;
    }
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoAcervo(text) {
  const match = String(text).match(/^\s*(\d+|\d{1,3}(?:\.\d{3})+)\s+im[o\u00f3]ve(?:l|is)\s+para\s+alugar\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis nao identificado em Title_resultTitle__; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoAcervo(browser, { projeto, url, salvar = true }) {
  if (!new URL(url).pathname.startsWith("/imoveis/para-alugar/")) throw new Error("A contagem exige uma URL de locacao.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    const selector = 'h1[class*="Title_resultTitle__"]';
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForSelector(selector, { timeout: 30000 });
    const label = await page.$eval(selector, element => element.textContent);
    const total = parseTotalLocacaoAcervo(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoColibex(text) {
  const match = String(text).match(/(?:^|\s)(\d+|\d{1,3}(?:\.\d{3})+)\s+resultados?\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis nao identificado antes de resultados; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoColibex(browser, { projeto, url, salvar = true }) {
  const search = new URL(url);
  const transacao = (search.searchParams.get("transacao") || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (search.pathname !== "/pesquisa" || transacao !== "locacao") throw new Error("A contagem exige uma URL de locacao.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
      const error = new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
      if (status === 403 || status === 429) error.code = `${projeto.replace(/^jf/, "").toUpperCase()}_BLOCKED`;
      throw error;
    }
    const selector = "span.heading-color.fw600";
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForSelector(selector, { timeout: 30000 });
    const label = await page.$$eval(selector, elements => elements.map(element => element.textContent).find(text => /\bresultados?\s*$/i.test(text)) || "");
    const total = parseTotalLocacaoColibex(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoSoares(text) {
  const match = String(text).match(/^\s*Encontramos\s+(\d+|\d{1,3}(?:\.\d{3})+)\s+resultados?\s+para\s+sua\s+busca\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis Soares nao identificado no aviso de resultados; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoSoares(browser, { projeto, url, salvar = true }) {
  const search = new URL(url);
  const params = new URLSearchParams(search.hash.replace(/^#\/?\?/, ""));
  if (search.pathname.replace(/\/+$/, "") !== "/imoveis/aluguel" || params.get("tipoNegocio") !== "AA") throw new Error("A contagem exige uma URL de locacao Soares com tipoNegocio=AA.");
  const { validateSoaresLocacaoPage } = await import("../soares/extractor-locacao.js");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForFunction(() => Array.from(document.querySelectorAll("p span.bold.ng-binding")).some(element => /^\s*Encontramos\s+[\d.]+\s+resultados?\s+para\s+sua\s+busca\s*$/i.test(element.parentElement?.textContent || "")), { timeout: 30000 });
    const info = await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll("p span.bold.ng-binding")).find(element => /^\s*Encontramos\s+[\d.]+\s+resultados?\s+para\s+sua\s+busca\s*$/i.test(element.parentElement?.textContent || ""));
      return { label: span?.parentElement.textContent || "", heading: (document.querySelector("h1.destaque-titulo") || document.querySelector("h1"))?.textContent || "" };
    });
    const total = parseTotalLocacaoSoares(info.label);
    if (validateSoaresLocacaoPage(page.url(), info.heading) !== total) throw new Error("Total de resultados Soares difere do titulo de aluguel; contagem anterior preservada.");
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoStart(text) {
  const match = String(text).match(/^\s*(\d+|\d{1,3}(?:\.\d{3})+)\s+im[o\u00f3]ve(?:l|is)\s+encontrados?\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis Start nao identificado em h4.top15.left15; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoStart(browser, { projeto, url, salvar = true }) {
  const search = new URL(url);
  if (search.pathname !== "/imoveis.php" || search.searchParams.get("negocio") !== "2") throw new Error("A contagem exige uma URL de locacao Start com negocio=2.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
      const error = new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
      if (status === 403 || status === 429) error.code = "START_BLOCKED";
      throw error;
    }
    const destination = new URL(page.url());
    if (destination.pathname !== "/imoveis.php" || destination.searchParams.get("negocio") !== "2") throw new Error("Busca Start retornou fora da locacao; contagem anterior preservada.");
    const selector = "h4.top15.left15";
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForSelector(selector, { timeout: 30000 });
    const label = await page.$eval(selector, element => element.textContent);
    const total = parseTotalLocacaoStart(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoToc2(text) {
  const match = String(text).match(/^\s*(\d+|\d{1,3}(?:\.\d{3})+)\s+Encontrados?\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis TOC2 nao identificado em Properties_qtd1__; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoToc2(browser, { projeto, url, salvar = true }) {
  if (!new URL(url).pathname.startsWith("/imoveis/aluguel/")) throw new Error("A contagem exige uma URL de locacao TOC2.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    if (!new URL(page.url()).pathname.startsWith("/imoveis/aluguel/")) throw new Error("Busca TOC2 retornou fora de aluguel; contagem anterior preservada.");
    const selector = 'h2[class*="Properties_qtd1__"]';
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForFunction(selector => {
      const text = document.querySelector(selector)?.textContent || "";
      return /^\s*[\d.]+\s+Encontrados?\s*$/i.test(text) && (document.querySelector('[class*="ListPiecesProperties_card_horizontal1"] a[href*="/imovel/"]') !== null || /^\s*0\s+Encontrados?\s*$/i.test(text));
    }, { timeout: 30000 }, selector);
    const label = await page.$eval(selector, element => element.textContent);
    const total = parseTotalLocacaoToc2(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoInvest(text) {
  const normalized = String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = normalized.match(/^\s*Locacao\s*-\s*(\d+|\d{1,3}(?:\.\d{3})+)\s+Imove(?:l|is)\s+encontrados?\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis Invest nao identificado no titulo de locacao; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoInvest(browser, { projeto, url, salvar = true }) {
  const search = new URL(url);
  if (search.pathname.toLowerCase() !== "/resultadobusca.aspx" || search.searchParams.get("fin") !== "2") throw new Error("A contagem exige uma URL de locacao Invest com fin=2.");
  const page = await browser.newPage();
  try {
    let response;
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
        const status = response?.status() ?? 0;
        if (status >= 500) throw new Error(`HTTP ${status} na contagem de ${projeto}.`);
        break;
      } catch (error) {
        const transient = /net::ERR_|TimeoutError|Navigation timeout|HTTP 5\d\d/i.test(error.message);
        if (!transient || tentativa >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 3000 * tentativa));
      }
    }
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    const destination = new URL(page.url());
    if (destination.pathname.toLowerCase() !== "/resultadobusca.aspx" || destination.searchParams.get("fin") !== "2") throw new Error("Busca Invest retornou fora da locacao; contagem anterior preservada.");
    const selector = "#ContentPlaceHolder1_lblQuantidadeImoveisEncontrados h1";
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForSelector(selector, { timeout: 30000 });
    const label = await page.$eval(selector, element => element.textContent);
    const total = parseTotalLocacaoInvest(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoMega(text) {
  const normalized = String(text).trim();
  const total = /^(\d+|\d{1,3}(?:\.\d{3})+)$/.test(normalized) ? Number(normalized.replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis Mega nao identificado na faceta de resultados; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoMega(browser, { projeto, url, salvar = true }) {
  const search = new URL(url);
  if (search.pathname !== "/imovel/" || search.searchParams.get("_acao") !== "alugar") throw new Error("A contagem exige uma URL de locacao Mega com _acao=alugar.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    const destination = new URL(page.url());
    if (destination.pathname !== "/imovel/" || destination.searchParams.get("_acao") !== "alugar") throw new Error("Busca Mega retornou fora da locacao; contagem anterior preservada.");
    const selector = '.wpgb-facet[data-facet="10"][data-grid="4"] .wpgb-result-count';
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForSelector(selector, { timeout: 30000 });
    const label = await page.$eval(selector, element => element.textContent);
    const total = parseTotalLocacaoMega(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

export function parseTotalLocacaoRemax(text) {
  const normalized = String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = normalized.match(/^\s*(\d+|\d{1,3}(?:\.\d{3})+)\s+Numero\s+total\s+de\s+correspondencias\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis RE/MAX nao identificado no aviso de correspondencias; contagem anterior preservada.");
  return total;
}

export async function contarLocacaoRemaxFiltrada(browser, url, { projeto, salvar = true } = {}) {
  const search = new URL(url);
  const cityId = Number(search.searchParams.get("City"));
  if (search.origin !== "https://www.remax.com.br" || search.pathname !== "/listings" ||
      search.searchParams.get("TransactionTypeUID") !== "260" || !Number.isSafeInteger(cityId) || cityId < 1) {
    throw new Error("A contagem exige uma URL de locacao RE/MAX com cidade e TransactionTypeUID=260.");
  }
  const page = await browser.newPage();
  let api;
  try {
    api = await installRemaxSearchBatches(page, { cityId, transactionType: 260 });
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem RE/MAX; contagem anterior preservada.`);
    if (projeto) await verificarSiteDesativado(page, projeto, { salvar });
    try {
      await aguardarBuscaLocacaoRemax(page, url);
    } catch (error) {
      throw new Error(`Busca RE/MAX nao estabilizou na locacao ou cidade esperada. URL recebida: ${page.url()}; contagem anterior preservada.`, { cause: error });
    }
    const destination = new URL(page.url());
    if (destination.origin !== search.origin || destination.pathname !== search.pathname ||
        destination.searchParams.get("City") !== search.searchParams.get("City") ||
        destination.searchParams.get("TransactionTypeUID") !== "260") throw new Error(`Busca RE/MAX retornou fora da locacao ou cidade. URL recebida: ${page.url()}; contagem anterior preservada.`);
    const total = await api.waitUntilReady();
    await page.waitForFunction(expected => Array.from(document.querySelectorAll("p")).some(element => {
      const match = (element.textContent || "").match(/^\s*([\d.]+)\s+N[u\u00fa]mero\s+total\s+de\s+correspond[e\u00ea]ncias\s*$/i);
      return match && Number(match[1].replace(/\./g, "")) === expected;
    }), { timeout: 30000 }, total);
    api.assertHealthy();
    return total;
  } finally {
    try { if (api) await api.close(); }
    finally { await page.close(); }
  }
}

export async function contarAntesDaLocacaoRemax(browser, { projeto, url, salvar = true }) {
  const total = await contarLocacaoRemaxFiltrada(browser, url, { projeto, salvar });
  if (salvar) await registrarTotalLocacao(projeto, total);
  return total;
}

export function parseTotalLocacaoCouto(text) {
  const match = String(text).match(/\bde\s+(\d+|\d{1,3}(?:\.\d{3})+)\s+resultados?\s*$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total de alugueis Couto nao identificado em .pagesNav; contagem anterior preservada.");
  return total;
}

export async function contarAntesDaLocacaoCouto(browser, { projeto, url, salvar = true }) {
  const search = new URL(url);
  if (search.pathname !== "/search" || search.searchParams.get("acao") !== "s3" || search.searchParams.get("finalidade_s") !== "3") throw new Error("A contagem exige uma URL de locacao Couto com acao=s3 e finalidade_s=3.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    const destination = new URL(page.url());
    if (destination.pathname !== "/search" || destination.searchParams.get("acao") !== "s3" || destination.searchParams.get("finalidade_s") !== "3") throw new Error("Busca Couto retornou fora da locacao; contagem anterior preservada.");
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForSelector(".pagesNav", { timeout: 30000 });
    const label = await page.$$eval(".pagesNav", elements => elements.map(element => element.textContent).find(text => /\bde\s+[\d.]+\s+resultados?\s*$/i.test(text || "")) || "");
    const total = parseTotalLocacaoCouto(label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}

async function gravarContagensRetorno(entries, spreadsheetId, negociacao) {
  const tipo = negociacao === "Vendas" ? "venda" : negociacao === "Locacao" ? "aluguel" : "";
  if (!tipo) throw new Error("Negociacao invalida para contagem.");
  const title = await ensureSheet(spreadsheetId, "retorno", 3);
  const range = `'${title.replace(/'/g, "''")}'`;
  const rows = await readSheet(spreadsheetId, `${range}!A:C`, { valueRenderOption: "UNFORMATTED_VALUE" });
  const colunaNegociacao = String(rows[0]?.[2] ?? "").trim();
  if (rows.length && (rows[0][0] !== "Projeto" || rows[0][1] !== "Quantidade" ||
      !["", "negociacao", "tipo"].includes(colunaNegociacao))) {
    throw new Error("Cabecalho de retorno incompativel; contagens preservadas.");
  }
  const byProject = new Map();
  const legadas = [];
  rows.slice(1).forEach((row, index) => {
    if (!String(row[0] ?? "").trim()) return;
    const atual = String(row[2] ?? "").trim().toLowerCase() || "venda";
    if (!["venda", "aluguel"].includes(atual)) throw new Error(`Negociacao invalida na linha ${index + 2} de retorno; contagens preservadas.`);
    byProject.set(`${row[0]}__${atual}`, index + 2);
    // A aba retorno recebia somente vendas antes da unificacao.
    if (!String(row[2] ?? "").trim()) legadas.push({ range: `${range}!C${index + 2}`, values: [["venda"]] });
  });
  let nextRow = Math.max(2, rows.length + 1);
  const data = [...new Map(entries.map(entry => [entry.projeto, entry])).values()].map(entry => {
    const row = byProject.get(`${entry.projeto}__${tipo}`) ?? nextRow++;
    return { range: `${range}!A${row}:C${row}`, values: [[entry.projeto, entry.total, tipo]] };
  });
  if (!rows.length || colunaNegociacao !== "tipo") {
    data.unshift({ range: `${range}!A1:C1`, values: [["Projeto", "Quantidade", "tipo"]] });
  }
  const { writeSheets } = await import('../../../services/googleSheets.js');
  await writeSheets(spreadsheetId, [...legadas, ...data]);
  console.log(`[Contagem] ${entries.length} contagem(ns) de ${tipo} registrada(s) em retorno.`);
}

export async function registrarTotalImoveis(projeto, total, spreadsheetId, negociacao) {
  if (!projeto || !spreadsheetId || !Number.isSafeInteger(total) || total < 0) throw new Error("Projeto ou total de imoveis invalido.");
  const writing = pendingWrite.catch(() => {}).then(async () => {
    await gravarContagensRetorno([{ projeto, total }], spreadsheetId, negociacao);
  });
  pendingWrite = writing;
  await writing;
}

export async function registrarTotalLocacao(projeto, total, spreadsheetId = /^jf/i.test(projeto) ? JF_SPREADSHEET_ID : /^nit/i.test(projeto) ? NITEROI_SPREADSHEET_ID : SPREADSHEET_CONTAGEM_LOCACAO) {
  return registrarTotalImoveis(projeto, total, spreadsheetId, 'Locacao');
}

export async function registrarTotaisImoveis(entries, spreadsheetId, negociacao) {
  if (!spreadsheetId || !Array.isArray(entries) || entries.some(item => !item.projeto || !Number.isSafeInteger(item.total) || item.total < 0)) throw new Error('Projetos ou totais invalidos.');
  if (!entries.length) return;
  const writing = pendingWrite.catch(() => {}).then(async () => {
    await gravarContagensRetorno(entries, spreadsheetId, negociacao);
  });
  pendingWrite = writing;
  await writing;
}

export async function contarAntesDaLocacaoPadrao(browser, { projeto, url, allowConfirmedEmpty = false, salvar = true }) {
  if (new URL(url).searchParams.get("negociacao") !== "locacao") throw new Error("A contagem exige uma URL de locacao.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status} na contagem de ${projeto}; contagem anterior preservada.`);
    await verificarSiteDesativado(page, projeto, { salvar });
    await page.waitForFunction(allowEmpty => /\(\s*[\d.]+\s*\)/.test(document.querySelector("#title--label")?.textContent || "") || (allowEmpty && /O filtro n[a\u00e3]o retornou nenhum im[o\u00f3]vel/i.test(document.body.innerText)), { timeout: 30000 }, allowConfirmedEmpty);
    const info = await page.evaluate(() => ({ label: document.querySelector("#title--label")?.textContent || "", text: document.body.innerText }));
    const total = !info.label.match(/\(\s*[\d.]+\s*\)/) && allowConfirmedEmpty && /O filtro n[a\u00e3]o retornou nenhum im[o\u00f3]vel/i.test(info.text)
      ? 0 : parseTotalLocacaoPadrao(info.label);
    if (salvar) await registrarTotalLocacao(projeto, total);
    return total;
  } finally {
    await page.close();
  }
}