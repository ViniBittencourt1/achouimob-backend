import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverBairroPorIndicacao } from "../../_utils/bairroIndicacao.js";
import { resolverTipoCatalogo, resolverTipoCatalogoInicioTitulo, resolverTipoCatalogoTextoAnuncio } from "../../_1Jf/tipos-alugueis.js";

const origin = "https://corretoracidadecarinho.com.br";
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
const texto = value => compact(load(String(value ?? "")).text());
const fail = message => { throw new Error(`[ubaCidade] ${message}; dados preservados.`); };

function finalidade(negociacao) {
  if (negociacao === "venda") return { id: 31, slug: "para-vender" };
  if (negociacao === "locacao") return { id: 30, slug: "para-alugar" };
  return fail("Negociacao invalida");
}

export function validarUrlCidade(value, negociacao, page = 1) {
  const expected = finalidade(negociacao);
  const url = new URL(value);
  const path = `/pesquisa-de-imoveis/${page === 1 ? "" : `page/${page}/`}`;
  if (url.origin !== origin || url.pathname !== path || url.hash ||
      url.searchParams.get("status") !== expected.slug ||
      [...url.searchParams].length !== 1) fail(`Rota fora da finalidade ou pagina: ${url.href}`);
  return url;
}

export async function fetchCidade({ url, json = false }) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), cache: "no-store" });
  if (!response.ok || response.url !== url) {
    throw new Error(`[ubaCidade] HTTP ${response.status} ou redirecionamento em ${url}; dados preservados.`);
  }
  if (!json) return { html: await response.text() };
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("[ubaCidade] API sem lista; dados preservados.");
  // Somente os campos publicos usados na coleta saem da sessao do navegador.
  return {
    total: response.headers.get("x-wp-total"), pages: response.headers.get("x-wp-totalpages"),
    rows: rows.map(row => ({
      id: row.id, type: row.type, status: row.status, link: row.link, title: row.title?.rendered,
      modified: row.modified_gmt,
      statuses: row["im\u00f3vel-estados"], types: row["im\u00f3vel-tipos"], cities: row["im\u00f3veis-cidades"],
      terms: row._embedded?.["wp:term"]?.flat().map(term => ({
        id: term.id, name: term.name, slug: term.slug, taxonomy: term.taxonomy,
      })),
      photo: row._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? "",
      meta: Object.fromEntries([
        "price", "price_prefix", "price_postfix", "size", "size_postfix",
        "lot_size", "lot_size_postfix", "bedrooms", "bathrooms", "garage", "id", "address",
      ].map(key => [key, row.property_meta?.[`REAL_HOMES_property_${key}`]])),
    })),
  };
}

export function extrairListagemCidade(html, negociacao, pagina = 1) {
  const $ = load(html);
  const expected = finalidade(negociacao);
  const counter = $(".rh_pagination__stats");
  const match = compact(counter.text()).match(/^(\d+) para (\d+) de (\d+) Im[oó]veis$/i);
  if (counter.length !== 1 || !match) fail("Contador da listagem ausente ou invalido");
  const [start, end, total] = match.slice(1).map(Number);
  if (!Number.isSafeInteger(total) || total < 1 || start !== (pagina - 1) * 6 + 1 ||
      end !== Math.min(pagina * 6, total) || start > end) fail("Intervalo da listagem incorreto");
  const cards = $("article.rh_list_card");
  if (cards.length !== end - start + 1) fail("Listagem incompleta");
  const ids = [], links = [];
  cards.each((_index, element) => {
    const card = $(element);
    const status = normalizarBairro(card.find(".status").text());
    const id = card.find("[data-property-id]").attr("data-property-id");
    const link = card.find("h3 a").attr("href");
    if (status !== normalizarBairro(expected.slug.replace(/-/g, " ")) || !/^[1-9]\d*$/.test(id ?? "") || !link) {
      fail("Card fora da identidade ou finalidade");
    }
    ids.push(Number(id)); links.push(link);
  });
  if (new Set(ids).size !== ids.length || new Set(links).size !== links.length) fail("Cards repetidos");
  return { total, ids, links };
}

export function indisponivelCidade(titulo) {
  return /\b(?:indisponivel|vendid[oa]s?|alugad[oa]s?)\b/.test(normalizarBairro(texto(titulo)));
}

function numero(value, field, id, { area = false } = {}) {
  const raw = compact(value);
  if (!raw) return null;
  const text = area ? raw.replace(/^aprox\.?\s*/i, "") : raw;
  let result;
  if (area && text.includes(",")) {
    if (/^\d+(?:\.\d{3})*(?:,\d+)$/.test(text)) result = Number(text.replace(/\./g, "").replace(",", "."));
  } else if (area && /^\d{1,3}(?:\.\d{3})+$/.test(text)) result = Number(text.replace(/\./g, ""));
  else if (/^\d+(?:\.\d+)?$/.test(text)) result = Number(text);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER || result < 0 ||
      (!area && !Number.isSafeInteger(result))) {
    console.warn(`[ubaCidade] ${id}: ${field} sem quantidade numerica valida "${raw}"; campo null para revisao.`);
    return null;
  }
  return result;
}

function termos(row, key, taxonomy) {
  if (!Array.isArray(row[key]) || !Array.isArray(row.terms)) return fail(`Taxonomia ausente: ${row.id}, ${key}`);
  const terms = row.terms.filter(term => term.taxonomy === taxonomy);
  if (terms.length !== row[key].length ||
      terms.some(term => !row[key].includes(term.id) || !compact(term.name)) ||
      new Set(terms.map(term => term.id)).size !== terms.length) fail(`Taxonomia incompleta: ${row.id}, ${key}`);
  return terms;
}

export function resolverBairroCidade({ cidade, endereco = "", titulo = "", linkReal = "" }) {
  return resolverBairroPorIndicacao({
    cidade, endereco, titulo, linkReal, origin, caminho: "property", projeto: "ubaCidade",
  });
}

export function parseImovelCidade(row, negociacao, now = new Date().toISOString()) {
  const expected = finalidade(negociacao);
  const url = new URL(row.link);
  const titulo = texto(row.title);
  const status = termos(row, "statuses", "property-status");
  if (!Number.isSafeInteger(row.id) || row.id < 1 || row.type !== "property" || row.status !== "publish" ||
      !titulo || !status.some(term => term.id === expected.id && term.slug === expected.slug) ||
      status.some(term => ![30, 31].includes(term.id)) ||
      url.origin !== origin || !/^\/property\/[^/]+\/$/.test(url.pathname) || url.hash || url.search || !row.meta) fail(`Registro invalido: ${row.id}`);
  if (indisponivelCidade(titulo)) return null;
  const typeNames = termos(row, "types", "property-type").map(term => texto(term.name));
  const slugs = new Set(typeNames.map(name => resolverTipoCatalogo(name)));
  const tipoPrincipal = slugs.size === 1 ? slugs.values().next().value : "";
  const cabecalhoTipo = titulo.split(/\s+para\s+(?:venda|loca[cç][aã]o)\b|,\s*(?:bairro|[aá]rea|terreno)\b/i)[0];
  const tipoImovel = tipoPrincipal || resolverTipoCatalogoInicioTitulo(titulo) ||
    resolverTipoCatalogoTextoAnuncio(cabecalhoTipo) ||
    resolverTipoCatalogoTextoAnuncio(decodeURIComponent(url.pathname.split("/")[2]));
  if (!tipoImovel) console.warn(`[ubaCidade] ${row.id}: tipo ausente ou fora do catalogo "${typeNames.join(", ")}"; campo vazio.`);
  const cityTerms = termos(row, "cities", "property-city");
  const cityName = cityTerms.length === 1 ? texto(cityTerms[0].name) : "";
  const match = cityName.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
  const cityMatches = new Set(match ? cidades.filter(c =>
    normalizarBairro(c.nome) === normalizarBairro(match[1]) && c.estado === match[2]).map(c => c.slug) : []);
  const cidade = cityMatches.size === 1 ? cityMatches.values().next().value : "";
  if (!cidade) console.warn(`[ubaCidade] ${row.id}: cidade ausente ou fora do catalogo "${cityName}"; campo vazio.`);
  const meta = row.meta;
  const codigoBase = compact(meta.id);
  if (!codigoBase) fail(`Codigo publico ausente: ${row.id}`);
  const rawPrice = compact(meta.price);
  let preco = 0;
  const otherPrice = (negociacao === "venda" && /\b(mes|mensal)\b/.test(normalizarBairro(meta.price_postfix))) ||
    (negociacao === "locacao" && /\bvenda\b/.test(normalizarBairro(meta.price_postfix)));
  if (!rawPrice || otherPrice) console.warn(`[ubaCidade] ${row.id}: preco ${negociacao} nao informado; valor zero.`);
  else {
    if (!/^\d+(?:\.\d+)?$/.test(rawPrice)) fail(`Preco invalido: ${row.id}, ${rawPrice}`);
    preco = Number(rawPrice);
    if (!Number.isFinite(preco) || preco > Number.MAX_SAFE_INTEGER) fail(`Preco fora do limite: ${row.id}`);
    if (preco === 1) console.warn(`[ubaCidade] ${row.id}: preco R$ 1 preservado conforme cadastro do site.`);
  }
  let areaValor = null;
  for (const key of ["size", "lot_size"]) {
    if (!compact(meta[key])) continue;
    if (!/^(?:aprox\s*)?m[²2](?:\s*(?:aprox\.?|aproximadamente))?$/i.test(compact(meta[`${key}_postfix`]))) {
      console.warn(`[ubaCidade] ${row.id}: unidade de area desconhecida "${meta[`${key}_postfix`]}"; campo null.`);
      break;
    }
    areaValor = numero(meta[key], key, row.id, { area: true });
    break;
  }
  let linkFoto = "";
  if (row.photo) {
    const photo = new URL(row.photo);
    if (!["http:", "https:"].includes(photo.protocol)) fail(`Foto invalida: ${row.id}`);
    linkFoto = photo.href;
  }
  return {
    linkReal: url.href, titulo, preco,
    localizacao: [compact(meta.address), cityName].filter(Boolean).join(", "),
    tipoImovel, bairro: resolverBairroCidade({ cidade, endereco: meta.address, titulo, linkReal: url.href }), cidade,
    dormitorioValor: numero(meta.bedrooms, "quartos", row.id),
    banheiroValor: numero(meta.bathrooms, "banheiros", row.id),
    ambienteValor: null, areaValor,
    garagemValor: numero(meta.garage, "vagas", row.id), elevadorValor: null,
    codigoBase, linkCard: url.href, corretor: "Cidade",
    dataInclusao: now, dataExclusao: "", linkFoto, atualizadoEm: now,
  };
}

export async function coletarCidade(browser, project, negociacao, {
  anteriores = new Map(), onCount = async () => {},
} = {}) {
  const expected = finalidade(negociacao);
  const base = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlCidade(base, negociacao);
  const page = await browser.newPage();
  try {
    const response = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) fail(`HTTP ${response?.status()} na listagem`);
    validarUrlCidade(page.url(), negociacao);
    const request = (url, json = false) => page.evaluate(fetchCidade, { url, json });
    const read = async () => {
      const all = [];
      let total, pages;
      for (let pg = 1; pg <= (pages ?? 1); pg++) {
        const url = new URL("/wp-json/wp/v2/properties", origin);
        url.search = new URLSearchParams({
          per_page: "100", page: String(pg), _embed: "wp:term,wp:featuredmedia",
          "im\u00f3vel-estados": String(expected.id), orderby: "date", order: "desc",
        }).toString();
        const result = await request(url.href, true);
        if (!/^[1-9]\d*$/.test(result.total ?? "") || !/^[1-9]\d*$/.test(result.pages ?? "") ||
            !Number.isSafeInteger(Number(result.total)) || Number(result.pages) !== Math.ceil(Number(result.total) / 100) ||
            (total !== undefined && (Number(result.total) !== total || Number(result.pages) !== pages))) fail("Contagem invalida ou mudou na API");
        total = Number(result.total); pages = Number(result.pages);
        if (!Array.isArray(result.rows) || result.rows.length !== Math.min(100, total - (pg - 1) * 100)) fail("Pagina da API incompleta");
        all.push(...result.rows);
      }
      if (new Set(all.map(row => row.id)).size !== total || new Set(all.map(row => row.link)).size !== total) fail("API com identidades repetidas");
      for (const pg of new Set([1, Math.ceil(total / 6)])) {
        const url = new URL(base);
        if (pg > 1) url.pathname += `page/${pg}/`;
        validarUrlCidade(url.href, negociacao, pg);
        const listing = extrairListagemCidade((await request(url.href)).html, negociacao, pg);
        const slice = all.slice((pg - 1) * 6, pg * 6);
        if (listing.total !== total || JSON.stringify(listing.ids) !== JSON.stringify(slice.map(row => row.id)) ||
            JSON.stringify(listing.links) !== JSON.stringify(slice.map(row => row.link))) fail("API diverge da listagem oficial");
      }
      return all;
    };
    const rows = await read();
    const imoveis = [], excluidos = [];
    for (const row of rows) {
      const parsed = parseImovelCidade(row, negociacao);
      if (!parsed) { excluidos.push(row.id); continue; }
      const old = anteriores.get(parsed.linkReal);
      if (old?.dataInclusao) parsed.dataInclusao = old.dataInclusao;
      imoveis.push(parsed);
    }
    if (!imoveis.length || new Set(imoveis.map(item => item.codigoBase)).size !== imoveis.length) fail("Base ativa vazia ou codigos repetidos");
    if (JSON.stringify(rows) !== JSON.stringify(await read())) fail("Dados mudaram durante a coleta");
    console.log(`[ubaCidade] ${rows.length} anuncios no site; ${excluidos.length} indisponiveis excluidos (${excluidos.join(", ")}); ${imoveis.length} ativos.`);
    const semBairro = imoveis.filter(item => !item.bairro).length;
    if (semBairro) console.warn(`[ubaCidade] ${semBairro} ativos sem bairro univoco no endereco, titulo ou link; campo vazio para revisao.`);
    await onCount(imoveis.length);
    return { imoveis, totalEsperado: imoveis.length, totalSite: rows.length, excluidos };
  } finally { await page.close(); }
}
