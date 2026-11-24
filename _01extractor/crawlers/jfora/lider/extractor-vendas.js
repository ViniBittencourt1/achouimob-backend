import * as cheerio from "cheerio";
import { mapImovelLiderVendaSite, mapImovelLiderLocacaoSite } from "./extractor-locacao.js";
import { parseTotalVendas, validarUrlContagemVendas } from "../_utils/vendasContagem.js";

export const URL_VENDAS_LIDER = "https://www.lidernegociosimob.com.br/comprar";
export const URL_LOCACAO_LIDER = "https://www.lidernegociosimob.com.br/alugar";
const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function validarLinkImovel(value) {
  const url = new URL(value, URL_VENDAS_LIDER);
  if (url.origin !== new URL(URL_VENDAS_LIDER).origin || !/^\/imovel\/[^/]+$/.test(url.pathname)) {
    throw new Error("[Lider] Link de imovel invalido; base preservada.");
  }
  return url.href;
}

export function lerListagemLiderVendas(html, url, pagina) {
  return lerListagemLider(html, url, pagina, "venda");
}

export function lerListagemLiderLocacao(html, url, pagina) {
  return lerListagemLider(html, url, pagina, "locacao");
}

function lerListagemLider(html, url, pagina, modo) {
  const venda = modo === "venda";
  const base = new URL(venda ? URL_VENDAS_LIDER : URL_LOCACAO_LIDER);
  const project = { collection: "jfLider", kind: "lider", url: URL_VENDAS_LIDER, selector: ".ct-lista-topo__total", pattern: "^\\s*(\\d+|\\d{1,3}(?:\\.\\d{3})+)\\s+imove(?:l|is)\\s*$" };
  if (venda) validarUrlContagemVendas(project, url);
  if (new URL(url).origin !== base.origin || new URL(url).pathname !== base.pathname || new URL(url).searchParams.has("finalidade")) {
    throw new Error(`[Lider] Listagem fora de ${modo}; base preservada.`);
  }
  if (Number(new URL(url).searchParams.get("pagina") || 1) !== pagina) throw new Error("[Lider] Pagina redirecionada; base preservada.");
  const $ = cheerio.load(html);
  const heading = venda ? /^imoveis a venda(?=\s|\d|$)/ : /^imoveis para alugar(?=\s|\d|$)/;
  if (!heading.test(normalize($("h1").text()))) throw new Error(`[Lider] Listagem fora de ${venda ? "vendas" : "locacao"}; base preservada.`);
  const label = $(project.selector).text();
  let total;
  if (venda) total = parseTotalVendas(label, project);
  else {
    const match = normalize(label).match(/^(\d+|\d{1,3}(?:\.\d{3})+)\s+imove(?:l|is)$/);
    total = match ? Number(match[1].replace(/\./g, "")) : NaN;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("[Lider] Total de alugueis nao identificado; base preservada.");
  }
  const links = $("article.ct-card a.ct-card__titulo").map((_, element) => {
    const href = $(element).attr("href");
    if (!href) throw new Error("[Lider] Card sem link; base preservada.");
    return validarLinkImovel(href);
  }).get();
  if ($("article.ct-card").length !== links.length || new Set(links).size !== links.length) throw new Error("[Lider] Cards invalidos ou duplicados; base preservada.");
  const next = $("a[href]").toArray().map(element => new URL($(element).attr("href"), url))
    .find(link => link.origin === base.origin && link.pathname === base.pathname && Number(link.searchParams.get("pagina")) === pagina + 1);
  return { total, links, next: next?.href };
}

export function parseDetalheLiderVenda(html, linkReal) {
  return parseDetalheLider(html, linkReal, "venda");
}

export function parseDetalheLiderLocacao(html, linkReal) {
  return parseDetalheLider(html, linkReal, "locacao");
}

function parseDetalheLider(html, linkReal, modo) {
  const venda = modo === "venda";
  validarLinkImovel(linkReal);
  const $ = cheerio.load(html);
  const listings = $('script[type="application/ld+json"]').toArray().flatMap(element => JSON.parse($(element).text()));
  const listing = listings.find(item => item["@type"] === "RealEstateListing");
  if (!listing || listing.url !== linkReal) {
    throw new Error(`[Lider] Detalhe ausente ou fora de ${venda ? "vendas" : "locacao"} em ${linkReal}; base preservada.`);
  }
  const codigo = $(".ct-ficha__codigo").first().text().replace(/^C[oó]digo\s*/i, "").trim();
  if (!codigo || !listing.name || listing.offers?.priceCurrency !== "BRL") throw new Error(`[Lider] Detalhe sem codigo, titulo ou moeda valida em ${linkReal}; base preservada.`);
  // Em anuncios mistos o JSON-LD pode informar outra negociacao; usar o rotulo visivel.
  const priceBlock = $(".ct-ficha__valor > div, .ct-ficha__valor > ul > li").filter((_, element) =>
    normalize($(element).children("small, span").first().text()) === (venda ? "venda" : "aluguel")).first().clone();
  if (!priceBlock.length) throw new Error(`[Lider] Detalhe fora de ${venda ? "vendas" : "locacao"} em ${linkReal}; base preservada.`);
  priceBlock.children("small, span").remove();
  priceBlock.find("em").remove();
  const priceMatch = priceBlock.text().trim().match(/^R\$\s*(\d[\d.]*)(?:,(\d{2}))?$/);
  const preco = priceMatch ? Number(`${priceMatch[1].replace(/\./g, "")}.${priceMatch[2] || "0"}`) : NaN;
  const attributes = new Map($(".ct-resumo__item").toArray().map(element => {
    const label = normalize($(element).find("small").text());
    const text = $(element).find("strong").text();
    const match = text.match(/\d[\d.]*(?:,\d+)?/);
    return [label, match ? Number(match[0].replace(/\./g, "").replace(",", ".")) : 0];
  }));
  const local = $(".ct-ficha__lugar").first().clone();
  local.find(".ct-ficha__codigo").remove();
  const [bairro, cidade, estado] = local.text().split("·").map(value => value.trim()).filter(Boolean);
  const address = listing.about?.address;
  const item = {
    finalidade: modo,
    codigo,
    titulo: listing.name,
    [venda ? "valor_venda" : "valor_locacao"]: preco,
    tipo: $(".ct-ficha__tipo").first().text().trim(),
    bairro,
    cidade: address?.addressLocality || cidade,
    estado: address?.addressRegion || estado,
    endereco_completo: address?.streetAddress,
    quartos: attributes.get("dormitorios") ?? attributes.get("dormitorio"),
    banheiros: attributes.get("banheiros") ?? attributes.get("banheiro"),
    salas: attributes.get("salas") ?? attributes.get("sala"),
    vagas_garagem: attributes.get("vagas") ?? attributes.get("vaga"),
    metragem_util: listing.about?.floorSize?.value ?? attributes.get("area"),
    comodidades: $(".ct-comodidades").text(),
    capa_url: Array.isArray(listing.image) ? listing.image[0] : listing.image,
  };
  if (!item.cidade || !item.bairro || !Number.isFinite(preco)) {
    throw new Error(`[Lider] Localizacao ou preco de ${modo} invalido em ${linkReal}; base preservada.`);
  }
  return venda ? mapImovelLiderVendaSite(item, linkReal) : mapImovelLiderLocacaoSite(item, linkReal);
}

async function acessar(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!response?.ok()) {
    const error = new Error(`[Lider] HTTP ${response?.status()} em ${url}; base preservada.`);
    if (response?.status() === 403 || response?.status() === 429) error.code = "LIDER_BLOCKED";
    throw error;
  }
  if (page.url() !== url) throw new Error(`[Lider] Redirecionamento inesperado para ${page.url()}; base preservada.`);
  return page.content();
}

export async function extractLiderVendasData(browser, existingCodes = new Set(), { totalEsperado } = {}) {
  return extractLiderSiteData(browser, existingCodes, { totalEsperado, modo: "venda" });
}

export async function extractLiderLocacaoData(browser, existingCodes = new Set(), { totalEsperado } = {}) {
  return extractLiderSiteData(browser, existingCodes, { totalEsperado, modo: "locacao" });
}

export async function contarLiderLocacaoSite(browser) {
  const page = await browser.newPage();
  try {
    const html = await acessar(page, URL_LOCACAO_LIDER);
    return lerListagemLiderLocacao(html, page.url(), 1).total;
  } finally { await page.close(); }
}

async function extractLiderSiteData(browser, existingCodes, { totalEsperado, modo }) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error(`[Lider] Precontagem de ${modo === "venda" ? "vendas" : "locacao"} obrigatoria.`);
  const rotulo = modo === "venda" ? "LiderVendas" : "LiderLocacao";
  const page = await browser.newPage();
  const links = new Set();
  const imoveisRaspados = [];
  try {
    let url = modo === "venda" ? URL_VENDAS_LIDER : URL_LOCACAO_LIDER;
    for (let pagina = 1; ; pagina++) {
      const state = lerListagemLider(await acessar(page, url), url, pagina, modo);
      if (state.total !== totalEsperado) throw new Error(`[Lider] Contagem alterada: ${totalEsperado} -> ${state.total} em ${url}; base preservada.`);
      for (const link of state.links) {
        if (links.has(link)) throw new Error("[Lider] Imovel repetido entre paginas; base preservada.");
        links.add(link);
      }
      console.log(`[${rotulo}] Pagina ${pagina}: ${links.size}/${totalEsperado} imoveis.`);
      if (links.size === totalEsperado && !state.next) break;
      if (!state.links.length || links.size >= totalEsperado || !state.next || pagina >= 100) throw new Error("[Lider] Paginacao incompleta ou inconsistente; base preservada.");
      url = state.next;
    }
    const codes = new Set();
    for (const link of links) {
      const imovel = parseDetalheLider(await acessar(page, link), link, modo);
      if (codes.has(imovel.codigoBase)) throw new Error("[Lider] Codigo duplicado; base preservada.");
      codes.add(imovel.codigoBase);
      imoveisRaspados.push(imovel);
      if (imoveisRaspados.length % 10 === 0) console.log(`[${rotulo}] Detalhes: ${imoveisRaspados.length}/${totalEsperado}.`);
    }
    console.log(`[${rotulo}] ${imoveisRaspados.length}/${totalEsperado} detalhes coletados.`);
    return {
      imoveisRaspados,
      novosImoveis: imoveisRaspados.filter(item => !existingCodes.has(String(item.codigoBase))),
      semImoveisConfirmado: totalEsperado === 0,
    };
  } finally { await page.close(); }
}
