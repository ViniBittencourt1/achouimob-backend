import * as cheerio from "cheerio";
import { URL_LOCACAO_LIDER, mapImovelLiderLocacaoImobBrasil, mapImovelLiderVendaImobBrasil } from "./extractor-locacao.js";
import { appendLegacyAddress, extractLegacyAddress } from "../_utils/enrichLegacyAddress.js";
import { parseTotalLocacaoImobBrasil } from "../_utils/locacaoContagem.js";
import { parseTotalVendas } from "../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../_utils/vendasContagemProjetos.js";
import { verificarSiteDesativado } from "../_utils/siteDesativado.js";

export const USER_AGENT_LIDER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
export const URL_VENDAS_LIDER = "https://www.lidernegociosimob.com.br/imovel/venda";
const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function lerListagemLiderLocacao(html, url, pagina) {
  return lerListagemLider(html, url, pagina, "locacao");
}

export function lerListagemLiderVendas(html, url, pagina) {
  return lerListagemLider(html, url, pagina, "venda");
}

function lerListagemLider(html, url, pagina, modo) {
  const base = new URL(modo === "venda" ? URL_VENDAS_LIDER : URL_LOCACAO_LIDER);
  const current = new URL(url);
  if (current.origin !== base.origin || current.pathname.replace(/\/$/, "") !== base.pathname ||
      [...current.searchParams.keys()].some(key => key !== "pag") || Number(current.searchParams.get("pag") || 1) !== pagina) {
    throw new Error(`[Lider] Listagem fora de ${modo} ou pagina redirecionada; base preservada.`);
  }
  const $ = cheerio.load(html);
  if (normalize($("h1").text()) !== `imoveis disponiveis, ${modo}`) throw new Error(`[Lider] Listagem fora de ${modo}; base preservada.`);
  const label = $(".topsearch__total").filter((_, el) => /im[o\u00f3]veis\s+encontrados/i.test($(el).text())).first();
  const total = modo === "venda"
    ? parseTotalVendas(label.text(), projetoContagemVendas("jfLider"))
    : parseTotalLocacaoImobBrasil(label.find("strong,b").first().text());
  const records = [];
  $(".imovelcard").each((_, el) => {
    const card = $(el);
    // A paginacao tambem usa a classe imovelcard, mas nao tem referencia.
    if (!card.find(".imovelcard__info__ref").length) return;
    if (normalize(card.find(".imovelcard__info__tag").text()) !== modo) throw new Error(`[Lider] Card fora de ${modo}; base preservada.`);
    const href = card.find("a[href]").first().attr("href");
    if (!href) throw new Error("[Lider] Card sem link; base preservada.");
    const linkReal = new URL(href, URL_LOCACAO_LIDER).href;
    const reference = card.find(".imovelcard__info__ref").text().match(/^Ref:\s*(\S+)\s*-\s*(.+)$/i);
    const localText = card.find(".imovelcard__info__local").text().trim();
    const local = localText.match(/^(.+),\s*([^/]+)\s*\/\s*(\w+)$/);
    const priceText = card.find(".imovelcard__valor__valor").text().trim();
    const price = priceText.match(/^R\$\s*(\d[\d.]*)(?:,(\d{2}))?$/);
    const sobConsulta = modo === "venda" && /^(?:consulte|sob consulta)$/i.test(priceText);
    if (!reference || !localText || (!price && !sobConsulta)) throw new Error("[Lider] Card sem referencia, localizacao ou preco valido; base preservada.");
    const features = new Map(card.find(".imovelcard__info__feature").toArray().map(element => {
      const feature = $(element);
      const match = feature.find("b").text().match(/\d[\d.]*(?:,\d+)?/);
      return [normalize(feature.text().replace(feature.find("b").text(), "")), match ? Number(match[0].replace(/\./g, "").replace(",", ".")) : 0];
    }));
    const featureValue = regex => [...features].find(([name]) => regex.test(name))?.[1] || 0;
    const mapImovel = modo === "venda" ? mapImovelLiderVendaImobBrasil : mapImovelLiderLocacaoImobBrasil;
    records.push(mapImovel({
      finalidade: modo, codigo: reference[1], titulo: `${reference[2]} ${card.find(".imovelcard__info__local").text()}`,
      tipo: reference[2], bairro: local ? local[1].trim() : localText, cidade: local ? local[2].trim() : "", estado: local?.[3] || "",
      [modo === "venda" ? "valor_venda" : "valor_locacao"]: sobConsulta ? null : Number(`${price[1].replace(/\./g, "")}.${price[2] || "0"}`),
      quartos: featureValue(/dormitorio/), banheiros: featureValue(/banheiro/), vagas_garagem: featureValue(/vaga/),
      salas: featureValue(/sala/), metragem_util: featureValue(/util/), metragem_total: featureValue(/total/),
      capa_url: card.find("img").first().attr("src") || "",
    }, linkReal));
  });
  const next = $("a[href]").toArray().map(el => new URL($(el).attr("href"), url)).find(link =>
    link.origin === current.origin && link.pathname.replace(/\/$/, "") === base.pathname && Number(link.searchParams.get("pag")) === pagina + 1);
  return { total, records, next: next?.href };
}

async function acessar(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!response?.ok()) {
    const error = new Error(`[Lider] HTTP ${response?.status()} em ${url}; base preservada.`);
    if ([403, 429].includes(response?.status())) error.code = "LIDER_BLOCKED";
    throw error;
  }
  return page.content();
}

export async function contarLiderLocacaoSite(browser, { salvar = false } = {}) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT_LIDER);
    const html = await acessar(page, URL_LOCACAO_LIDER);
    await verificarSiteDesativado(page, "jfLider", { salvar });
    return lerListagemLiderLocacao(html, page.url(), 1).total;
  } finally { await page.close(); }
}

export async function extractLiderLocacaoData(browser, existingCodes = new Set(), { totalEsperado } = {}) {
  return extractLiderData(browser, existingCodes, { totalEsperado, modo: "locacao" });
}

export async function extractLiderVendasData(browser, existingCodes = new Set(), { totalEsperado } = {}) {
  return extractLiderData(browser, existingCodes, { totalEsperado, modo: "venda" });
}

async function extractLiderData(browser, existingCodes, { totalEsperado, modo }) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error(`[Lider] Precontagem de ${modo} obrigatoria.`);
  const page = await browser.newPage();
  const records = new Map();
  const codes = new Map();
  try {
    await page.setUserAgent(USER_AGENT_LIDER);
    let url = modo === "venda" ? URL_VENDAS_LIDER : URL_LOCACAO_LIDER;
    let pagina = 1;
    while (url) {
      const listing = lerListagemLider(await acessar(page, url), page.url(), pagina++, modo);
      if (listing.total !== totalEsperado) throw new Error("[Lider] Contagem alterada; base preservada.");
      let added = 0;
      for (const item of listing.records) {
        const previous = records.get(item.linkReal);
        if (previous) {
          if (previous.codigoBase !== item.codigoBase || previous.preco !== item.preco) throw new Error("[Lider] Anuncio repetido divergente; base preservada.");
          continue;
        }
        if (codes.has(item.codigoBase)) throw new Error("[Lider] Codigo duplicado em links distintos; base preservada.");
        records.set(item.linkReal, item);
        codes.set(item.codigoBase, item.linkReal);
        added++;
      }
      url = listing.next;
      // O site conta anuncios unicos, mas pagina linhas duplicadas e encerra os links antes do fim.
      if (!url && records.size < totalEsperado && listing.records.length === 15) {
        const next = new URL(page.url());
        next.searchParams.set("pag", String(pagina));
        url = next.href;
      }
      if (records.size > totalEsperado || (url && !added)) throw new Error("[Lider] Paginacao inconsistente; base preservada.");
    }
    if (records.size !== totalEsperado) throw new Error(`[Lider] Coleta incompleta: ${records.size}/${totalEsperado} links unicos; base preservada.`);
    for (const item of records.values()) {
      const html = await acessar(page, item.linkReal);
      if (page.url() !== item.linkReal) throw new Error("[Lider] Detalhe redirecionado; base preservada.");
      item.localizacao = appendLegacyAddress(item.localizacao, extractLegacyAddress(html));
    }
    const imoveisRaspados = [...records.values()];
    return { imoveisRaspados, novosImoveis: imoveisRaspados.filter(item => !existingCodes.has(String(item.codigoBase))), semImoveisConfirmado: totalEsperado === 0 };
  } finally { await page.close(); }
}
