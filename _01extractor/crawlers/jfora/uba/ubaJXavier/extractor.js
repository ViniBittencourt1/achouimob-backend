import { load } from "cheerio";
import fs from "node:fs";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoNiteroi } from "../../niteroi/tipoImovel.js";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalize = value => normalizarBairro(value);
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();

const tiposJXavier = {
  "imovel comercial residencial": "casa",
  "imovel outros": "predio",
  "terraco": "cobertura",
  "apartamento cobertura": "cobertura",
  "ponto comercial residencial": "ponto",
  "terreno rural": "terreno",
  "barracao": "galpao",
};

export function validarUrlJXavier(value, negociacao, pageNumber = 1) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("Negociacao J Xavier invalida.");
  const url = new URL(value);
  const pathname = negociacao === "venda" ? "/sale" : "/rent";
  const finalidade = negociacao === "venda" ? "V" : "L";
  if (url.origin !== "https://www.jxavier.com.br" || url.pathname !== pathname ||
      url.searchParams.get("finalidade") !== finalidade ||
      Number(url.searchParams.get("page") || 1) !== pageNumber) {
    throw new Error(`[ubaJXavier] Busca fora da finalidade ou pagina esperada: ${url.href}; dados preservados.`);
  }
  return url;
}

export function lerContagemJXavier(html) {
  const $ = load(html);
  const counters = $("p").toArray().map(element => compact($(element).text()))
    .filter(text => /^Exibindo de /i.test(text));
  if (counters.length !== 1) throw new Error("[ubaJXavier] Contador de resultados ausente ou ambiguo; dados preservados.");
  const match = counters[0].match(/^Exibindo de (\d+) at[eé] (\d+) de (\d+) resultados$/i);
  if (!match) throw new Error("[ubaJXavier] Contador de resultados invalido; dados preservados.");
  const [start, end, total] = match.slice(1).map(Number);
  if (!Number.isSafeInteger(total) || start < 1 || end < start || end > total) {
    throw new Error("[ubaJXavier] Intervalo de resultados invalido; dados preservados.");
  }
  return { start, end, total };
}

export function parsePrecoJXavier(text) {
  if (/valor a combinar|sob consulta/i.test(text)) return null;
  const match = compact(text).match(/^(?:Valor\s*:\s*)?R\$\s*(\d+(?:\.\d{3})*)(?:,(\d{2}))?$/i);
  if (!match) throw new Error(`[ubaJXavier] Preco nao identificado: ${compact(text)}; dados preservados.`);
  return Number(`${match[1].replace(/\./g, "")}.${match[2] || "00"}`);
}

function parseNumero(value, area = false) {
  const text = compact(value);
  if (!text) return null;
  const match = text.match(/^\d+(?:[.,]\d+)*$/);
  if (!match) throw new Error(`[ubaJXavier] Caracteristica numerica invalida: ${text}`);
  const normalized = area && /^\d{1,3}(?:[.,]\d{3})+$/.test(text)
    ? text.replace(/[.,]/g, "") : text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".") : text;
  const result = Number(normalized);
  if (!Number.isFinite(result) || result < 0 || (!area && !Number.isSafeInteger(result))) {
    throw new Error("[ubaJXavier] Caracteristica numerica invalida.");
  }
  return result;
}

function caracteristicas($, root) {
  const result = { areaValor: null, dormitorioValor: null, banheiroValor: null, garagemValor: null };
  root.find("li").each((_index, element) => {
    const row = $(element);
    const text = compact(row.text());
    const icon = row.find("img").attr("src") || "";
    const number = text.match(/^([\d.,]+)\s*(?:m[²2]|dormit[oó]rio|banheiro|vaga|garagem)/i)?.[1]
      || (/\/(?:area|bedroom|bathroom|garage|car)\.svg/.test(icon) ? text.match(/^([\d.,]+)/)?.[1] : null);
    if (number === null || number === undefined) return;
    if (/m[²2]/i.test(text)) result.areaValor = parseNumero(number, true);
    else if (/dormit[oó]rio/i.test(text) || /\/bedroom\.svg/.test(icon)) result.dormitorioValor = parseNumero(number);
    else if (/banheiro/i.test(text) || /\/bathroom\.svg/.test(icon)) result.banheiroValor = parseNumero(number);
    else if (/vaga|garagem/i.test(text) || /\/(?:garage|car)\.svg/.test(icon)) result.garagemValor = parseNumero(number);
  });
  return result;
}

function localizacaoJXavier(lines, codigoBase) {
  const address = lines.map(compact).filter(Boolean);
  const last = address.at(-1);
  const match = last?.match(/^(.+)\s+-\s+([^,]+),\s*([A-Z]{2})$/);
  if (!match || address.length < 2) throw new Error(`[ubaJXavier] Localizacao nao identificada: ${address.join(" - ")}`);
  const [, bairro, cidade] = match;
  let uf = match[3];
  if (codigoBase === "8650" && normalize(cidade) === "campestre" && uf === "AL") {
    console.warn("[ubaJXavier] Anuncio 8650: Campestre/AL corrigida para Campestre/MG conforme confirmacao; endereco original do site inconsistente.");
    uf = "MG";
    address[address.length - 1] = last.replace(/AL$/, "MG");
  }
  const city = cidades.find(item => normalize(item.nome) === normalize(cidade) && item.estado === uf);
  if (!city) throw new Error(`[ubaJXavier] Cidade fora do catalogo: ${cidade}, ${uf}`);
  return { localizacao: address.join(" - "), cidade: city.slug, bairro: normalize(bairro).replace(/ /g, "-") };
}

export function extrairListagemJXavier(html, negociacao, pageNumber = 1, now = new Date().toISOString()) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("Negociacao J Xavier invalida.");
  const $ = load(html);
  const count = lerContagemJXavier(html);
  if (count.start !== (pageNumber - 1) * 8 + 1 || count.end !== Math.min(pageNumber * 8, count.total)) {
    throw new Error("[ubaJXavier] Intervalo nao corresponde a pagina solicitada; dados preservados.");
  }
  const grid = $('div[class~="grid"][class~="sm:grid-cols-2"]').filter((_index, element) =>
    $(element).find('h3 a[href*="/detail?id="]').length > 0);
  if (grid.length !== 1) throw new Error("[ubaJXavier] Listagem principal ausente ou ambigua; dados preservados.");
  const seen = new Set();
  const imoveis = grid.find('h3 a[href*="/detail?id="]').toArray().map(element => {
    const title = $(element);
    const card = title.parent().parent().parent();
    const url = new URL(title.attr("href"), "https://www.jxavier.com.br");
    const codigoBase = url.searchParams.get("id");
    if (url.origin !== "https://www.jxavier.com.br" || url.pathname !== "/detail" || !/^\d+$/.test(codigoBase || "") || seen.has(codigoBase)) {
      throw new Error("[ubaJXavier] Link ausente, invalido ou repetido; dados preservados.");
    }
    seen.add(codigoBase);
    const status = card.children(".relative").find("span").toArray()
      .map(span => normalize($(span).text())).filter(text => /^(venda|locacao)$/.test(text));
    if (status.length !== 1 || status[0] !== (negociacao === "venda" ? "venda" : "locacao")) {
      throw new Error(`[ubaJXavier] Card ${codigoBase} fora da finalidade solicitada; dados preservados.`);
    }
    const tipoTexto = normalize(title.text());
    const tipoImovel = Object.hasOwn(tiposJXavier, tipoTexto)
      ? tiposJXavier[tipoTexto] : resolverTipoNiteroi(compact(title.text()));
    if (!tipoImovel) throw new Error(`[ubaJXavier] Tipo de imovel fora do catalogo: ${compact(title.text())}`);
    const priceText = card.find("li").toArray().map(item => compact($(item).text()))
      .find(text => /^(?:Valor\s*:|Valor a combinar|Sob consulta)/i.test(text));
    const address = card.find("h4 a").first().html()?.split(/<br\s*\/?>/i).map(fragment => load(fragment).text()) || [];
    const image = card.find("img").first().attr("src") || "";
    return {
      linkReal: url.href, titulo: compact(title.text()), preco: parsePrecoJXavier(priceText || ""),
      ...localizacaoJXavier(address, codigoBase), tipoImovel, ...caracteristicas($, card),
      ambienteValor: null, elevadorValor: null, codigoBase, linkCard: 0, corretor: "J Xavier",
      dataInclusao: now, dataExclusao: "", linkFoto: !image || /\/noimage\.jpg(?:$|\?)/.test(image) ? "" : new URL(image, url).href,
      atualizadoEm: now,
    };
  });
  if (imoveis.length !== count.end - count.start + 1) throw new Error("[ubaJXavier] Quantidade de cards diferente do contador; dados preservados.");
  return { ...count, imoveis };
}

export function extrairDetalhesJXavier(html, item, negociacao) {
  const $ = load(html);
  const heading = $("h2").filter((_index, element) => $(element).next("h3").length > 0);
  const root = heading.parent().parent();
  const rows = root.find("li").toArray().map(element => compact($(element).text()));
  const ids = rows.filter(text => /^ID \d+$/.test(text));
  const finalidade = rows.find(text => /^Finalidade:/.test(text))?.match(/^Finalidade:\s*(Venda|Loca[cç][aã]o)$/i)?.[1];
  if (heading.length !== 1 || ids.length !== 1 || ids[0] !== `ID ${item.codigoBase}` ||
      normalize(finalidade) !== (negociacao === "venda" ? "venda" : "locacao")) {
    throw new Error(`[ubaJXavier] Detalhes ${item.codigoBase} fora do imovel ou finalidade esperada; dados preservados.`);
  }
  const details = caracteristicas($, root);
  if (rows.some(text => normalize(text) === "elevador")) details.elevadorValor = 1;
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null));
}

async function lerPagina(browser, url, validate) {
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[ubaJXavier] HTTP ${response?.status()} em ${url}; dados preservados.`);
    validate(page.url());
    return await page.content();
  } finally { await page.close(); }
}

export async function coletarJXavier(browser, project, negociacao, {
  anteriores = new Map(), enriquecer = true, onCount = async () => {},
} = {}) {
  const baseUrl = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlJXavier(baseUrl, negociacao);
  const read = async number => {
    const url = new URL(baseUrl);
    url.searchParams.set("order", "0");
    if (number > 1) url.searchParams.set("page", String(number));
    const html = await lerPagina(browser, url.href, value => validarUrlJXavier(value, negociacao, number));
    return extrairListagemJXavier(html, negociacao, number);
  };
  const first = await read(1);
  await onCount(first.total);
  const pages = Math.ceil(first.total / 8);
  if (pages > 150) throw new Error("[ubaJXavier] Limite de paginacao atingido; dados preservados.");
  const imoveis = [];
  const seen = new Set();
  for (let number = 1; number <= pages; number++) {
    const batch = number === 1 ? first : await read(number);
    if (batch.total !== first.total) throw new Error("[ubaJXavier] Total mudou durante a coleta; dados preservados.");
    for (const item of batch.imoveis) {
      if (seen.has(item.codigoBase)) throw new Error("[ubaJXavier] Imovel repetido entre paginas; dados preservados.");
      seen.add(item.codigoBase);
      imoveis.push(item);
    }
    console.log(`[ubaJXavier] ${negociacao} pagina ${number}/${pages}: ${imoveis.length}/${first.total}.`);
  }
  if (imoveis.length !== first.total) throw new Error("[ubaJXavier] Coleta incompleta; dados preservados.");
  const final = await read(1);
  if (final.total !== first.total || final.imoveis.map(item => item.codigoBase).join("|") !== first.imoveis.map(item => item.codigoBase).join("|")) {
    throw new Error("[ubaJXavier] Listagem mudou entre inicio e fim; dados preservados.");
  }
  for (const item of imoveis) {
    const old = anteriores.get(item.linkReal);
    if (old) {
      item.dataInclusao = old.dataInclusao || item.dataInclusao;
      for (const field of ["areaValor", "dormitorioValor", "banheiroValor", "garagemValor", "ambienteValor", "elevadorValor"]) {
        if (item[field] === null) item[field] = old[field] ?? null;
      }
    } else if (enriquecer) {
      const html = await lerPagina(browser, item.linkReal, value => {
        if (value !== item.linkReal) throw new Error("[ubaJXavier] Detalhes redirecionados; dados preservados.");
      });
      Object.assign(item, extrairDetalhesJXavier(html, item, negociacao));
      console.log(`[ubaJXavier] Detalhes ${item.codigoBase} validados.`);
    }
  }
  return { imoveis, totalEsperado: first.total };
}
