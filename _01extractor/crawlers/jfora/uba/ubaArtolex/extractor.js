import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoCatalogo } from "../../_1Jf/tipos-alugueis.js";

const origin = "https://www.artolex.com.br";
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
const fail = message => { throw new Error(`[ubaArtolex] ${message}; dados preservados.`); };

function interesse(negociacao) {
  if (negociacao === "venda") return "comprar";
  if (negociacao === "locacao") return "alugar";
  return fail("Negociacao invalida");
}

export function validarUrlArtolex(value, negociacao, pagina = 1) {
  const expected = interesse(negociacao);
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== "/" || url.hash ||
      url.searchParams.get("a") !== "busca" || url.searchParams.get("interesse") !== expected ||
      (url.searchParams.get("pg") ?? "1") !== String(pagina) ||
      [...url.searchParams.keys()].some(key => !["a", "interesse", "pg"].includes(key)) ||
      ["a", "interesse", "pg"].some(key => url.searchParams.getAll(key).length > 1)) fail(`Rota fora da finalidade ou pagina: ${url.href}`);
  return url;
}

export async function fetchArtolex(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), cache: "no-store" });
  if (!response.ok || response.url !== url) {
    throw new Error(`[ubaArtolex] HTTP ${response.status} ou redirecionamento em ${url}; dados preservados.`);
  }
  const bytes = await response.arrayBuffer();
  const preview = new TextDecoder().decode(bytes);
  const charset = response.headers.get("content-type")?.match(/charset=["']?([\w-]+)/i)?.[1] ??
    preview.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset || !["iso-8859-1", "windows-1252", "utf-8"].includes(charset.toLowerCase())) {
    throw new Error(`[ubaArtolex] Codificacao ausente ou nao reconhecida: ${charset}; dados preservados.`);
  }
  return new TextDecoder(charset).decode(bytes);
}

function validarModalidade(value, negociacao) {
  interesse(negociacao);
  if (!["ALUGUEL", "VENDA", "ALUGUEL / VENDA"].includes(value) ||
      !value.includes(negociacao === "venda" ? "VENDA" : "ALUGUEL")) fail(`Anuncio fora da finalidade: ${value}`);
}

export function precoArtolex(value, negociacao, modalidade, codigo) {
  validarModalidade(modalidade, negociacao);
  const text = compact(value);
  if (text === "(A COMBINAR)") {
    console.warn(`[ubaArtolex] ${codigo}: preco ${negociacao} nao informado; valor zero conforme confirmado.`);
    return 0;
  }
  const match = text.match(/^R\$\s*(\d+(?:\.\d{3})*),(\d{2})(\s*\/\s*M[eê]s)?$/i);
  if (!match) return fail(`Preco invalido: ${text}`);
  const result = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail(`Preco fora do limite: ${text}`);
  if ((negociacao === "venda" && match[3]) ||
      (negociacao === "locacao" && modalidade === "ALUGUEL / VENDA" && !match[3])) {
    console.warn(`[ubaArtolex] ${codigo}: preco exibido pertence a outra finalidade; ${negociacao} com valor zero.`);
    return 0;
  }
  return result;
}

function numero(value, area = false) {
  const text = compact(value);
  if (["N/D", "-", "(Não Disponível)"].includes(text)) return null;
  const match = text.match(area ? /^(\d+(?:\.\d{3})*)(?:,(\d+))?\s*M(?:ts|t)?[²2]$/i : /^(\d+)$/);
  if (!match) return fail(`Caracteristica invalida: ${text}`);
  const result = Number(area ? `${match[1].replace(/\./g, "")}.${match[2] ?? "0"}` : match[1]);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail(`Caracteristica fora do limite: ${text}`);
  return result;
}

function imagem(value) {
  if (!value) return "";
  const url = new URL(value, origin);
  if (!["http:", "https:"].includes(url.protocol)) return fail("Foto invalida");
  return url.href;
}

export function extrairListagemArtolex(html, negociacao, pagina = 1) {
  const $ = load(html);
  interesse(negociacao);
  const cards = $("li.well").filter((_i, element) => $(element).find(".property-info").length > 0);
  if (!cards.length || cards.length > 10) fail(`Listagem vazia ou tamanho inesperado na pagina ${pagina}`);
  const pagination = $(".pagination");
  let paginas = 1;
  if (pagination.length) {
    if (pagination.length !== 1 || compact(pagination.find("li.active").text()) !== String(pagina)) fail("Pagina ativa inesperada");
    const numbers = new Set([pagina]);
    pagination.find("a[href*='pg=']").each((_i, element) => {
      const url = new URL($(element).attr("href"), origin);
      const pg = url.searchParams.get("pg");
      if (url.origin !== origin || url.pathname !== "/" || !/^[1-9]\d*$/.test(pg ?? "") ||
          !["busca", negociacao === "venda" ? "venda" : "locacao"].includes(url.searchParams.get("a")) ||
          url.searchParams.get("interesse") !== interesse(negociacao)) fail("Paginacao fora da finalidade");
      numbers.add(Number(pg));
    });
    paginas = Math.max(...numbers);
    if (!Number.isSafeInteger(paginas) || numbers.size !== paginas) fail("Paginacao incompleta");
  }
  if (pagina > paginas || (pagina < paginas && cards.length !== 10)) fail("Pagina incompleta");
  const links = new Set();
  const imoveis = cards.toArray().map(element => {
    const card = $(element);
    const anchor = card.find(".property-info h3 a");
    const url = new URL(anchor.attr("href"), origin);
    const featured = card.find("a.property-featured-image");
    const code = url.searchParams.get("id");
    const location = compact(card.find(".location").text()).match(/^(.+?)\s*\/\s*([A-Z]{2})\s*\[C[oó]d:\s*(\d+)\]$/);
    const titulo = compact(anchor.text());
    const separator = titulo.indexOf(" - ");
    const modalidade = compact(card.find(".price .label-info").text());
    validarModalidade(modalidade, negociacao);
    if (anchor.length !== 1 || featured.length !== 1 ||
        new URL(featured.attr("href"), origin).href !== url.href ||
        url.origin !== origin || url.pathname !== "/" || url.hash ||
        url.searchParams.get("a") !== "ver" || !/^[1-9]\d*$/.test(code ?? "") ||
        [...url.searchParams.keys()].some(key => !["a", "id"].includes(key)) ||
        ["a", "id"].some(key => url.searchParams.getAll(key).length !== 1) ||
        !location || location[3] !== code || separator < 1 || links.has(url.href)) fail("Identidade ou localizacao invalida/repetida");
    links.add(url.href);
    return {
      linkReal: url.href, codigoBase: code, titulo, modalidade,
      tipoFonte: titulo.slice(0, separator), bairroFonte: titulo.slice(separator + 3),
      cidadeFonte: location[1].trim(), uf: location[2],
      precoFonte: compact(card.find(".price .label-success").text()),
      dormitorioValor: numero(card.find(".beds strong").text()),
      banheiroValor: numero(card.find(".baths strong").text()),
      areaValor: numero(card.find(".area strong").text(), true),
      garagemValor: numero(card.find(".parking strong").text()),
      linkFoto: imagem(card.find(".property-featured-image img").attr("src")),
    };
  });
  return { paginas, imoveis };
}

export function extrairDetalhesArtolex(html, item, negociacao, now = new Date().toISOString()) {
  const $ = load(html);
  const root = $(".single-property");
  const header = compact(root.find("h2.page-title .location").text());
  const prefix = `${item.tipoFonte} - `;
  const suffix = ` - ${item.bairroFonte}, ${item.cidadeFonte} / ${item.uf}`;
  if (root.length !== 1 || !header.startsWith(prefix) || !header.endsWith(suffix)) fail(`Endereco ou tipo divergente: ${item.codigoBase}`);
  const specs = root.children(".property-amenities");
  const feature = selector => {
    const element = specs.find(selector);
    if (element.length !== 1) return fail(`Caracteristica ausente/repetida: ${selector}`);
    return compact(element.clone().children("strong").remove().end().text());
  };
  if (feature(".area:first-child") !== item.codigoBase ||
      compact(root.children(".label-info").text()) !== item.modalidade ||
      compact(root.children(".label-success").text()) !== item.precoFonte) fail(`Identidade, modalidade ou preco mudou: ${item.codigoBase}`);
  validarModalidade(item.modalidade, negociacao);
  const fields = {
    dormitorioValor: numero(feature(".beds")), banheiroValor: numero(feature(".baths")),
    areaValor: numero(feature(".area:nth-child(2)"), true), garagemValor: numero(feature(".parking")),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== item[key]) fail(`Caracteristica mudou entre card e detalhe: ${item.codigoBase}, ${key}`);
  }
  const tipoImovel = resolverTipoCatalogo(item.tipoFonte);
  if (!tipoImovel) console.warn(`[ubaArtolex] ${item.codigoBase}: tipo fora do catalogo "${item.tipoFonte}"; campo vazio para revisao.`);
  const matches = new Set(cidades.filter(c => normalizarBairro(c.nome) === normalizarBairro(item.cidadeFonte) &&
    c.estado === item.uf).map(c => c.slug));
  const cidade = matches.size === 1 ? matches.values().next().value : "";
  if (!cidade) console.warn(`[ubaArtolex] ${item.codigoBase}: cidade fora do catalogo ou ambigua "${item.cidadeFonte}/${item.uf}"; campo vazio.`);
  return {
    linkReal: item.linkReal, titulo: item.titulo,
    preco: precoArtolex(item.precoFonte, negociacao, item.modalidade, item.codigoBase),
    localizacao: header.slice(prefix.length), tipoImovel,
    bairro: normalizarBairro(item.bairroFonte).replace(/ /g, "-"), cidade,
    dormitorioValor: fields.dormitorioValor, banheiroValor: fields.banheiroValor,
    ambienteValor: null, areaValor: fields.areaValor, garagemValor: fields.garagemValor, elevadorValor: null,
    codigoBase: item.codigoBase, linkCard: item.linkReal, corretor: "Artolex",
    dataInclusao: now, dataExclusao: "", linkFoto: item.linkFoto, atualizadoEm: now,
  };
}

export async function coletarArtolex(browser, project, negociacao, {
  anteriores = new Map(), onCount = async () => {},
} = {}) {
  const base = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlArtolex(base, negociacao);
  const page = await browser.newPage();
  try {
    const response = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) fail(`HTTP ${response?.status()} na listagem`);
    validarUrlArtolex(page.url(), negociacao);
    const request = url => page.evaluate(fetchArtolex, url);
    const listing = async () => {
      const items = [];
      let paginas;
      for (let pg = 1; pg <= (paginas ?? 1); pg++) {
        const url = new URL(base);
        url.searchParams.set("pg", String(pg));
        validarUrlArtolex(url.href, negociacao, pg);
        const result = extrairListagemArtolex(await request(url.href), negociacao, pg);
        if (paginas !== undefined && result.paginas !== paginas) fail("Quantidade de paginas mudou");
        paginas = result.paginas;
        items.push(...result.imoveis);
      }
      if (new Set(items.map(item => item.linkReal)).size !== items.length ||
          new Set(items.map(item => item.codigoBase)).size !== items.length) fail("Identidades repetidas na paginacao");
      return items;
    };
    const first = await listing();
    await onCount(first.length);
    const imoveis = [];
    for (const item of first) {
      const parsed = extrairDetalhesArtolex(await request(item.linkReal), item, negociacao);
      const old = anteriores.get(item.linkReal);
      if (old?.dataInclusao) parsed.dataInclusao = old.dataInclusao;
      imoveis.push(parsed);
    }
    if (JSON.stringify(first) !== JSON.stringify(await listing())) fail("Listagem mudou durante a coleta");
    return { imoveis, totalEsperado: first.length };
  } finally { await page.close(); }
}
