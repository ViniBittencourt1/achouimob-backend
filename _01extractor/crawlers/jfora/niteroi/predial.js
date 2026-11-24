import { load } from "cheerio";
import fs from "node:fs";
import { resolverBairroNiteroi } from "./bairro.js";
import { resolverTipoNiteroi } from "./tipoImovel.js";

const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8",
));
const normalizar = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const cidadesPorNome = new Map(cidades.map(({ nome, slug }) => [normalizar(nome), slug]));
const limitePagina = 12;

function urlPredial(project, negociacao, pagina = 1) {
  const url = new URL(project.url);
  if (url.origin !== "https://www.predialimobiliaria.com" || url.pathname !== "/imoveis" ||
      !["venda", "locacao"].includes(negociacao)) {
    throw new Error(`[${project.collection}] URL ou negociacao Predial invalida.`);
  }
  url.search = "";
  url.searchParams.set("finalidade", negociacao === "venda" ? "venda" : "aluguel");
  if (pagina > 1) url.searchParams.set("pagina", String(pagina));
  return url;
}

export function readSnapshotPredial(html, pageUrl) {
  const $ = load(html);
  const heading = $("h1").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const count = text.match(/(\d[\d.]*)\s+im[oó]veis?\s+encontrados?/i);
  const cards = $("article.cartao.imovel-cartao").toArray().map(element => {
    const root = $(element);
    const anchor = root.find("h3 a[href]").first();
    const href = anchor.attr("href");
    if (!href) throw new Error("[Predial] Card sem link de detalhes.");
    const url = new URL(href, pageUrl);
    if (url.origin !== "https://www.predialimobiliaria.com" || !url.pathname.startsWith("/imoveis/")) {
      throw new Error(`[Predial] Card fora da origem esperada: ${url.href}`);
    }
    return { href: url.href, html: $.html(element) };
  });
  const pages = $("a[href*='pagina=']").toArray().map(element =>
    Number(new URL($(element).attr("href"), pageUrl).searchParams.get("pagina")),
  ).filter(Number.isSafeInteger);
  return {
    heading,
    text,
    total: count ? Number(count[1].replace(/\./g, "")) :
      /nenhum im[oó]vel|nenhum resultado|nao encontramos/i.test(text) ? 0 : NaN,
    cards,
    maxPage: Math.max(1, ...pages),
  };
}

export function resolverLocalizacaoPredial(linkReal, titulo, localizacaoFonte) {
  const partesLocalizacao = localizacaoFonte.split(/\s*[·,]\s*/).filter(Boolean);
  const caminho = normalizar(decodeURIComponent(new URL(linkReal).pathname));
  const niteroiNoLink = /(?:^|[/-])niteroi(?=$|[/-])/.test(caminho);
  const cidadeIndex = niteroiNoLink
    ? partesLocalizacao.findLastIndex(part => normalizar(part) === "niteroi")
    : partesLocalizacao.findIndex(part => cidadesPorNome.has(normalizar(part)));
  const tituloLocalizacao = titulo.match(/\s[-–]\s*([^,]+),\s*([^/]+)\/([A-Z]{2})\s*$/i);
  const cidadeNome = niteroiNoLink ? "Niterói"
    : cidadeIndex >= 0 ? partesLocalizacao[cidadeIndex] : tituloLocalizacao?.[2] || "";
  const cidade = niteroiNoLink ? "niteroi-rj" : cidadesPorNome.get(normalizar(cidadeNome)) || "";
  const bairroFonte = cidadeIndex > 0 ? partesLocalizacao[cidadeIndex - 1] : tituloLocalizacao?.[1] || "";
  const localizacao = localizacaoFonte || (tituloLocalizacao
    ? `${bairroFonte} · ${cidadeNome} · ${niteroiNoLink ? "RJ" : tituloLocalizacao[3].toUpperCase()}`
    : "");
  const bairro = resolverBairroNiteroi(bairroFonte, cidade) || bairroFonte;
  return { cidade, bairro, localizacao };
}

export function parsePredialCard(html, negociacao, now = new Date()) {
  const $ = load(html);
  const article = $("article.cartao.imovel-cartao").first();
  const anchor = article.find("h3 a[href]").first();
  const linkReal = new URL(anchor.attr("href"), "https://www.predialimobiliaria.com").href;
  const titulo = anchor.text().trim();
  const tipoFonte = article.find(".topo-cartao > span").first().text().trim().split(/\s+em\s+/i)[0].trim();
  const tipoImovel = resolverTipoNiteroi(tipoFonte) || tipoFonte;
  const { cidade, bairro, localizacao } = resolverLocalizacaoPredial(
    linkReal, titulo, article.find(".cartao-endereco").text().trim(),
  );
  const codigoBase = article.find(".codigo-imovel").first().text().trim();
  const cardText = article.text().replace(/\s+/g, " ");
  const displayedPrice = article.find(".preco").first().text();
  const rentPrice = cardText.match(/aluguel\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  const priceText = negociacao === "locacao" && rentPrice ? rentPrice[1] : displayedPrice;
  const priceMatch = priceText.match(/([\d.]+(?:,\d{1,2})?)/);
  const parseMetric = pattern => {
    const match = article.find(".fatos span").toArray().map(element => $(element).text().trim())
      .map(value => value.match(pattern)).find(Boolean);
    return match ? Number(match[1].replace(/\./g, "").replace(",", ".")) : 0;
  };
  const image = article.find(".cartao-imagem img").first().attr("src");
  if (!anchor.attr("href") || !titulo || !codigoBase || !cidade || !tipoImovel) {
    throw new Error(`[Predial] Card sem campos essenciais (${codigoBase || linkReal}).`);
  }
  return {
    linkReal,
    titulo,
    preco: priceMatch ? Number(priceMatch[1].replace(/\./g, "").replace(",", ".")) : null,
    localizacao,
    tipoImovel,
    bairro,
    cidade,
    dormitorioValor: parseMetric(/(\d+)\s+(?:quartos?|dormit[oó]rios?)/i),
    banheiroValor: parseMetric(/(\d+)\s+banheiros?/i),
    ambienteValor: 0,
    areaValor: parseMetric(/([\d.,]+)\s*m(?:²|2)/i),
    garagemValor: parseMetric(/(\d+)\s+vagas?/i),
    elevadorValor: 0,
    codigoBase,
    linkCard: linkReal,
    corretor: "Predial Imobiliária",
    dataInclusao: now.toISOString(),
    dataExclusao: "",
    linkFoto: image ? new URL(image, "https://www.predialimobiliaria.com").href : "",
    atualizadoEm: now.toISOString(),
  };
}

async function carregarPagina(page, project, negociacao, pagina) {
  const url = urlPredial(project, negociacao, pagina);
  const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!response?.ok()) throw new Error(`[${project.collection}] HTTP ${response?.status()} na listagem Predial.`);
  const actual = new URL(page.url());
  if (actual.origin !== url.origin || actual.pathname !== url.pathname ||
      actual.searchParams.get("finalidade") !== url.searchParams.get("finalidade")) {
    throw new Error(`[${project.collection}] Predial retornou fora da finalidade ${negociacao}.`);
  }
  await page.waitForFunction(() => {
    const body = document.body?.innerText || "";
    return document.querySelectorAll("article.cartao.imovel-cartao").length > 0 ||
      /0 im[oó]veis? encontrados?/i.test(body);
  }, { timeout: 30000 });
  const snapshot = readSnapshotPredial(await page.content(), page.url());
  const finalidade = negociacao === "venda" ? /à venda|a venda/i : /para alugar|aluguel/i;
  if (!finalidade.test(snapshot.heading) || !Number.isSafeInteger(snapshot.total) || snapshot.total < 0) {
    throw new Error(`[${project.collection}] Cabecalho ou total Predial invalido: "${snapshot.heading}".`);
  }
  return snapshot;
}

export async function contar(browser, project) {
  const negociacao = new URL(project.url).searchParams.get("finalidade") === "aluguel" ? "locacao" : "venda";
  const page = await browser.newPage();
  try {
    const snapshot = await carregarPagina(page, project, negociacao, 1);
    return snapshot.total;
  } finally { await page.close(); }
}

async function coletarPredial(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) {
    throw new Error(`[${project.collection}] Total Predial invalido.`);
  }
  const page = await browser.newPage();
  try {
    const items = new Map();
    let pagina = 1;
    let maxPage = 1;
    do {
      const snapshot = await carregarPagina(page, project, negociacao, pagina);
      if (snapshot.total !== totalEsperado) {
        throw Object.assign(new Error(`[${project.collection}] Total mudou durante a coleta: ${totalEsperado} -> ${snapshot.total}.`), { code: "KENLO_TOTAL_ALTERADO" });
      }
      maxPage = Math.max(maxPage, snapshot.maxPage);
      for (const card of snapshot.cards) {
        if (items.has(card.href)) continue;
        items.set(card.href, parsePredialCard(card.html, negociacao));
      }
      console.log(`[${project.collection}] Pagina ${pagina}/${maxPage}: ${items.size}/${totalEsperado}.`);
      if (primeiraPagina || items.size >= totalEsperado) break;
      if (!snapshot.cards.length || pagina >= maxPage) {
        throw new Error(`[${project.collection}] Paginacao incompleta: ${items.size}/${totalEsperado}.`);
      }
      pagina++;
    } while (true);
    if (!primeiraPagina && items.size !== totalEsperado) {
      throw new Error(`[${project.collection}] Coleta incompleta: ${items.size}/${totalEsperado}; dados anteriores preservados.`);
    }
    return [...items.values()];
  } finally { await page.close(); }
}

export async function coletarVendas(browser, project, options = {}) {
  return coletarPredial(browser, project, "venda", options);
}

export async function coletar(browser, project, { totalEsperado } = {}) {
  return coletarPredial(browser, project, "locacao", { totalEsperado });
}
