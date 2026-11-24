import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverBairroPorIndicacao } from "../../_utils/bairroIndicacao.js";
import { resolverTipoCatalogo, resolverTipoCatalogoInicioTitulo, resolverTipoCatalogoTextoAnuncio } from "../../_1Jf/tipos-alugueis.js";

const origin = "https://nogueiracarvalhoimoveis.com.br";
const api = `${origin}/wp-json/wp/v2/`;
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
const textoHtml = value => compact(load(String(value ?? "")).text());
const tituloComparavel = value => compact(value).replace(/\u00d7/g, "x")
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
const fail = message => { throw new Error(`[ubaNogueira] ${message}; dados preservados.`); };

function finalidade(negociacao) {
  if (negociacao === "venda") return { id: 16, nome: "Para Vender" };
  if (negociacao === "locacao") return { id: 11, nome: "Para Alugar" };
  return fail("Negociacao invalida");
}

export function validarUrlNogueira(value) {
  const url = new URL(value);
  if (url.href !== `${origin}/filtrando-imoveis/`) fail(`Rota inesperada: ${url.href}`);
  return url;
}

export async function fetchNogueira(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), cache: "no-store" });
  if (!response.ok || response.url !== url) {
    throw new Error(`[ubaNogueira] HTTP ${response.status} ou redirecionamento em ${url}; dados preservados.`);
  }
  return {
    body: await response.text(),
    total: response.headers.get("x-wp-total"),
    pages: response.headers.get("x-wp-totalpages"),
  };
}

export async function lerColecaoNogueira(request, endpoint) {
  const all = [];
  let total, pages;
  for (let page = 1; page <= (pages ?? 1); page++) {
    const url = new URL(endpoint, api);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await request(url.href);
    if (!/^[1-9]\d*$/.test(response.total ?? "") || !/^[1-9]\d*$/.test(response.pages ?? "")) {
      fail("Contagem ausente, invalida ou vazia na API");
    }
    const nextTotal = Number(response.total);
    const nextPages = Number(response.pages);
    if (!Number.isSafeInteger(nextTotal) || nextPages !== Math.ceil(nextTotal / 100) ||
        (total !== undefined && (total !== nextTotal || pages !== nextPages))) fail("Contagem mudou na paginacao");
    total = nextTotal; pages = nextPages;
    const rows = JSON.parse(response.body);
    if (!Array.isArray(rows) || rows.length !== Math.min(100, total - (page - 1) * 100)) fail("Pagina incompleta");
    all.push(...rows);
  }
  if (new Set(all.map(row => row.id)).size !== total ||
      all.some(row => !Number.isSafeInteger(row.id) || row.id < 1)) fail("Identidade repetida ou invalida na API");
  return all;
}

export function validarRegistrosNogueira(rows, negociacao, tipos) {
  const expected = finalidade(negociacao);
  const links = new Set();
  return rows.map(row => {
    const url = new URL(row.link);
    const titulo = textoHtml(row.title?.rendered);
    const typeIds = row["tipo-do-imovel"];
    if (row.type !== "imoveis" || row.status !== "publish" || !titulo ||
        JSON.stringify(row["status-do-imovel"]) !== JSON.stringify([expected.id]) ||
        JSON.stringify(row["_situacao-do-imovel"]) !== "[65]" ||
        !Array.isArray(typeIds) || typeIds.length !== 1 || !tipos.has(typeIds[0]) ||
        url.origin !== origin || !/^\/imoveis\/[^/]+\/$/.test(url.pathname) ||
        url.search || url.hash || links.has(url.href)) fail(`Registro fora da identidade, finalidade, tipo ou situacao: ${row.id}`);
    links.add(url.href);
    return { id: row.id, titulo, linkReal: url.href, tipoFonte: tipos.get(typeIds[0]) };
  });
}

function moeda(value) {
  const match = compact(value).match(/^R\$\s*(\d+(?:\.\d{3})*),(\d{2})$/);
  if (!match) return fail(`Preco invalido: ${value}`);
  const result = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail("Preco fora do limite");
  return result;
}

export function precoNogueira(value, negociacao, descricao, id) {
  finalidade(negociacao);
  if (negociacao === "venda") return moeda(value);
  const matches = [...descricao.matchAll(/\b(?:aluguel|loca[cç][aã]o)\s*(?:mensal)?\s*[:=-]\s*(R\$\s*\d+(?:\.\d{3})*,\d{2})(?![\d.,])/gi)];
  const values = new Set(matches.map(match => moeda(match[1])));
  if (values.size > 1) fail(`Mais de um valor de aluguel: ${id}`);
  if (values.size === 1) return values.values().next().value;
  console.warn(`[ubaNogueira] ${id}: sem preco explicito de aluguel; preco vazio. Valor geral/venda nao utilizado.`);
  return null;
}

function numero(value, area = false) {
  const text = compact(value).replace(/\s*m[2²]$/, "").trim();
  if (!text) return null;
  const match = text.match(area ? /^(\d+(?:\.\d{3})*)(?:,(\d+))?$/ : /^(\d+)$/);
  if (!match) return fail(`Caracteristica numerica invalida: ${value}`);
  const result = Number(area ? `${match[1].replace(/\./g, "")}.${match[2] ?? "0"}` : match[1]);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail(`Caracteristica fora do limite: ${value}`);
  return result;
}

export function localizacaoNogueira(nome, uf, bairro, endereco, id) {
  const matches = new Set(cidades.filter(c => normalizarBairro(c.nome) === normalizarBairro(nome) &&
    (!uf || c.estado === uf.toUpperCase())).map(c => c.slug));
  const cidade = matches.size === 1 ? matches.values().next().value : "";
  if (!cidade) console.warn(`[ubaNogueira] ${id}: cidade ausente, ambigua ou fora do catalogo "${nome}/${uf}"; campo vazio para revisao.`);
  return {
    cidade, bairro: normalizarBairro(bairro).replace(/ /g, "-"),
    localizacao: [endereco, bairro, [nome, uf].filter(Boolean).join("/")].filter(Boolean).join(", "),
  };
}

export function extrairDetalhesNogueira(html, item, negociacao, now = new Date().toISOString()) {
  const $ = load(html);
  if (!$("body").hasClass(`postid-${item.id}`)) fail(`Detalhe fora da identidade ${item.id}`);
  const field = (id, selector = ".jet-listing-dynamic-field__content") => {
    const elements = $(`[data-id="${id}"] ${selector}`);
    if (!elements.length) return fail(`Campo estrutural ausente: ${id}, anuncio ${item.id}`);
    const values = new Set(elements.toArray().map(e => compact($(e).text())));
    if (values.size !== 1) fail(`Versoes divergentes do campo ${id}, anuncio ${item.id}`);
    return values.values().next().value;
  };
  if (tituloComparavel(field("d9d2473")) !== tituloComparavel(item.titulo) ||
      field("85795dc", ".jet-listing-dynamic-terms") !== finalidade(negociacao).nome ||
      field("774db6b", ".jet-listing-dynamic-terms") !== item.tipoFonte) fail(`Detalhe divergente: ${item.id}`);
  const cabecalhoTipo = item.titulo.split(/\s+para\s+(?:venda|loca[cç][aã]o)\b|,\s*(?:bairro|[aá]rea|terreno)\b/i)[0];
  const tipoImovel = resolverTipoCatalogo(item.tipoFonte) || resolverTipoCatalogoInicioTitulo(item.titulo) ||
    resolverTipoCatalogoTextoAnuncio(cabecalhoTipo) ||
    resolverTipoCatalogoTextoAnuncio(decodeURIComponent(new URL(item.linkReal).pathname.split("/")[2]));
  if (!tipoImovel) console.warn(`[ubaNogueira] ${item.id}: tipo fora do catalogo "${item.tipoFonte}"; campo vazio para revisao.`);
  const codigo = field("ce8f6c7");
  if (!codigo) console.warn(`[ubaNogueira] ${item.id}: codigo publico ausente; identidade usa ID publico do WordPress.`);
  const endereco = [field("1984da0").replace(/,\s*$/, ""), field("561d8ca").replace(/^n[ºo]\s*/i, "")]
    .filter(Boolean).join(", ");
  const bairroFonte = field("ab2bea3");
  const localizacao = localizacaoNogueira(field("06d44a1"), field("1b048ff"), bairroFonte, endereco, item.id);
  const resolverBairro = values => resolverBairroPorIndicacao({
    cidade: localizacao.cidade, origin, caminho: "imoveis", projeto: "ubaNogueira", ...values,
  });
  const bairroCatalogado = resolverBairro({ endereco: bairroFonte });
  const bairroComplementar = bairroCatalogado || resolverBairro({ endereco, titulo: item.titulo, linkReal: item.linkReal });
  if (bairroComplementar) localizacao.bairro = bairroComplementar;
  else if (!localizacao.bairro) console.warn(`[ubaNogueira] ${item.id}: bairro nao encontrado no detalhe, titulo ou link; campo vazio para revisao.`);
  const image = $("img.swiper-slide-image").first();
  const src = image.attr("data-src") || image.attr("src");
  let linkFoto = "";
  if (src) {
    const url = new URL(src, origin);
    if (!["http:", "https:"].includes(url.protocol)) fail(`Foto invalida: ${item.id}`);
    linkFoto = url.href;
  }
  return {
    linkReal: item.linkReal, titulo: item.titulo,
    preco: precoNogueira(field("a30e6b9"), negociacao, field("b98874e"), item.id),
    ...localizacao,
    tipoImovel,
    dormitorioValor: numero(field("9c1ab7a")), banheiroValor: numero(field("9c5efda")),
    ambienteValor: null, areaValor: numero(field("3853eab"), true) ?? numero(field("51b5bb1"), true),
    garagemValor: numero(field("34b866d")), elevadorValor: null,
    codigoBase: codigo || String(item.id), linkCard: item.linkReal, corretor: "Nogueira",
    dataInclusao: now, dataExclusao: "", linkFoto, atualizadoEm: now,
  };
}

export async function coletarNogueira(browser, project, negociacao, {
  anteriores = new Map(), onCount = async () => {},
} = {}) {
  const expected = finalidade(negociacao);
  const base = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlNogueira(base);
  const page = await browser.newPage();
  try {
    const response = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) fail(`HTTP ${response?.status()} na listagem`);
    validarUrlNogueira(page.url());
    const request = url => page.evaluate(fetchNogueira, url);
    const terms = await lerColecaoNogueira(request, "tipo-do-imovel");
    if (terms.some(t => !compact(t.name))) fail("Categoria sem nome");
    const tipos = new Map(terms.map(t => [t.id, textoHtml(t.name)]));
    const endpoint = `imoveis?status-do-imovel=${expected.id}`;
    const read = async () => validarRegistrosNogueira(await lerColecaoNogueira(request, endpoint), negociacao, tipos);
    const first = await read();
    await onCount(first.length);
    const imoveis = [];
    for (const item of first) {
      const { body } = await request(item.linkReal);
      const parsed = extrairDetalhesNogueira(body, item, negociacao);
      const old = anteriores.get(item.linkReal);
      if (old?.dataInclusao) parsed.dataInclusao = old.dataInclusao;
      imoveis.push(parsed);
      if (imoveis.length % 25 === 0 || imoveis.length === first.length) {
        console.log(`[ubaNogueira] ${negociacao}: ${imoveis.length}/${first.length} detalhes validados.`);
      }
    }
    const final = await read();
    if (JSON.stringify(first) !== JSON.stringify(final) || imoveis.length !== first.length) fail("Listagem mudou ou coleta incompleta");
    if (new Set(imoveis.map(item => item.codigoBase)).size !== imoveis.length) fail("Codigos repetidos");
    return { imoveis, totalEsperado: first.length };
  } finally { await page.close(); }
}
