import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoNiteroi } from "../../niteroi/tipoImovel.js";

const origin = "https://www.carloscorretordeimoveis.com";
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();

function modalidade(negociacao) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("[ubaCarlos] Negociacao invalida.");
  return negociacao === "venda" ? "Venda" : "Aluguel";
}

export function validarUrlCarlos(value, negociacao) {
  const expected = modalidade(negociacao);
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== "/imoveis.php" || url.hash ||
      url.searchParams.get("tipo_negocio") !== expected ||
      [...url.searchParams].some(([key, val]) =>
        key !== "tipo_negocio" && (!["busca", "tipo_imovel", "quartos", "preco_min", "preco_max"].includes(key) || val !== ""))) {
    throw new Error(`[ubaCarlos] Listagem fora da finalidade ou com filtros inesperados: ${url.href}; dados preservados.`);
  }
  return url;
}

export function parsePrecoCarlos(value) {
  const match = compact(value).match(/^R\$\s*(\d+(?:\.\d{3})*),(\d{2})$/);
  if (!match) throw new Error(`[ubaCarlos] Preco invalido: ${compact(value)}; dados preservados.`);
  const result = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) throw new Error("[ubaCarlos] Preco fora do limite.");
  return result;
}

function numero(value, field, area = false) {
  const text = compact(value);
  const match = area ? text.match(/^(\d+(?:[.,]\d+)?)\s*m²$/) : text.match(/^(\d+)$/);
  if (!match) throw new Error(`[ubaCarlos] ${field} invalido: ${text}; dados preservados.`);
  const result = Number(match[1].replace(",", "."));
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) throw new Error(`[ubaCarlos] ${field} fora do limite.`);
  return result;
}

function foto(value) {
  if (!value) return "";
  const url = new URL(value, origin);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("[ubaCarlos] Foto invalida; dados preservados.");
  return url.href;
}

export function extrairListagemCarlos(html, negociacao) {
  const expected = modalidade(negociacao);
  const $ = load(html);
  const counter = $(".results-count");
  const match = compact(counter.text()).match(/^(\d+) im[oó]veis encontrados$/);
  if (counter.length !== 1 || !match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
    throw new Error("[ubaCarlos] Contagem ausente, invalida ou vazia; dados preservados.");
  }
  const total = Number(match[1]);
  const grid = $(".cars-grid");
  const cards = grid.find(".car-card");
  if (grid.length !== 1 || cards.length !== total) throw new Error("[ubaCarlos] Listagem incompleta; dados preservados.");
  const links = new Set();
  const codes = new Set();
  const imoveis = cards.toArray().map(element => {
    const card = $(element);
    const anchor = card.find("a.car-title");
    const url = new URL(anchor.attr("href"), origin);
    const id = url.searchParams.get("id");
    const code = compact(card.find(".card-content > div").first().find("span").last().text()).match(/^#(\d+)$/)?.[1];
    if (anchor.length !== 1 || !compact(anchor.text()) || url.origin !== origin || url.pathname !== "/imovel.php" ||
        !/^[1-9]\d*$/.test(id ?? "") || url.hash || [...url.searchParams.keys()].some(key => key !== "id") ||
        !code || /^0+$/.test(code) || links.has(url.href) || codes.has(code)) {
      throw new Error("[ubaCarlos] Identidade invalida ou repetida; dados preservados.");
    }
    links.add(url.href);
    codes.add(code);
    const statuses = card.find(".card-badges .badge-item").toArray().map(e => compact($(e).text()))
      .filter(text => ["Venda", "Aluguel"].includes(text));
    if (statuses.length !== 1 || statuses[0] !== expected) throw new Error("[ubaCarlos] Card fora da finalidade; dados preservados.");
    const tipoImovel = resolverTipoNiteroi(compact(card.find(".car-brand").text()));
    if (!tipoImovel) throw new Error("[ubaCarlos] Tipo fora do catalogo; dados preservados.");
    return {
      linkReal: url.href, codigoBase: code, titulo: compact(anchor.text()), tipoImovel,
      preco: parsePrecoCarlos(card.find(".car-price").text()),
      linkFoto: foto(card.find(".card-img-wrapper img").first().attr("src")),
    };
  });
  return { total, imoveis };
}

export function localizacaoCarlos(value, codigoBase) {
  const localizacao = compact(value);
  const separator = localizacao.lastIndexOf(",");
  if (separator < 1) throw new Error(`[ubaCarlos] Localizacao ausente ou invalida: ${codigoBase}; dados preservados.`);
  const bairroNome = localizacao.slice(0, separator).trim();
  const cityRaw = localizacao.slice(separator + 1).trim();
  let nome = cityRaw.replace(/\s*\|\s*C[oó]d\.\s*:\s*\d+$/i, "").trim();
  let uf;
  const suffix = nome.match(/^(.*?)\s*[/\-]\s*([A-Z]{2})$/i);
  if (suffix) { nome = suffix[1].trim(); uf = suffix[2].toUpperCase(); }
  if (normalizarBairro(nome) === "dores do turvo especifica") {
    console.warn(`[ubaCarlos] ${codigoBase}: Dores do Turvo Especifica normalizada para Dores do Turvo/MG conforme confirmado.`);
    nome = "Dores do Turvo"; uf = "MG";
  }
  if (codigoBase === "55" && nome === "S") {
    console.warn("[ubaCarlos] 55: cidade S normalizada para Sao Geraldo/MG conforme titulo e confirmacao.");
    nome = "Sao Geraldo"; uf = "MG";
  }
  if (codigoBase === "1059" && normalizarBairro(nome.replace(/\s*\/\s*/g, " ")) === "uba tocantins") {
    console.warn("[ubaCarlos] 1059 (id=352): cidade Uba/Tocantins normalizada para Tocantins/MG conforme confirmado.");
    nome = "Tocantins"; uf = "MG";
  }
  let cidade;
  if (normalizarBairro(nome) === "ubari") cidade = cityRaw;
  else {
    const matches = new Set(cidades.filter(c => normalizarBairro(c.nome) === normalizarBairro(nome) &&
      (!uf || c.estado === uf)).map(c => c.slug));
    cidade = matches.size === 1 ? matches.values().next().value : "";
    if (!cidade) console.warn(`[ubaCarlos] ${codigoBase}: cidade fora do catalogo ou ambigua "${cityRaw}"; campo vazio para revisao manual.`);
  }
  return { localizacao, cidade, bairro: normalizarBairro(bairroNome).replace(/ /g, "-") };
}

export function extrairDetalhesCarlos(html, item, negociacao, now = new Date().toISOString()) {
  const expected = modalidade(negociacao);
  const $ = load(html);
  const title = $(".property-title-block");
  const code = compact(title.children("div").first().text()).match(/^C[oó]d:\s*(\d+)$/)?.[1];
  if (title.length !== 1 || code !== item.codigoBase || compact(title.find("h1.property-name").text()) !== item.titulo) {
    throw new Error(`[ubaCarlos] Detalhes fora da identidade ${item.codigoBase}; dados preservados.`);
  }
  const specs = new Map();
  $(".specs-section .spec-item").each((_index, element) => {
    const label = normalizarBairro($(element).find(".spec-label").text());
    if (!label || specs.has(label)) throw new Error("[ubaCarlos] Caracteristica ausente ou repetida; dados preservados.");
    specs.set(label, compact($(element).find(".spec-val").text()));
  });
  if (specs.get("modalidade") !== expected ||
      resolverTipoNiteroi(specs.get("tipo")) !== item.tipoImovel) throw new Error("[ubaCarlos] Detalhes fora da finalidade ou tipo; dados preservados.");
  const statuses = $(".gallery-box .badge-status").toArray().map(e => compact($(e).text()));
  if (!statuses.length || statuses.some(status => status !== "Ativo")) throw new Error("[ubaCarlos] Imovel indisponivel; dados preservados.");
  const preco = parsePrecoCarlos($(".price-tag-value").text());
  if (preco !== item.preco) throw new Error("[ubaCarlos] Preco mudou entre listagem e detalhes; dados preservados.");
  return {
    linkReal: item.linkReal, titulo: item.titulo, preco,
    ...localizacaoCarlos(title.find(".property-meta").text(), code), tipoImovel: item.tipoImovel,
    dormitorioValor: numero(specs.get("quartos"), "quartos"),
    banheiroValor: null, ambienteValor: null,
    areaValor: numero(specs.get("area"), "area", true),
    garagemValor: numero(specs.get("vagas"), "vagas"), elevadorValor: null,
    codigoBase: code, linkCard: item.linkReal, corretor: "Carlos",
    dataInclusao: now, dataExclusao: "", linkFoto: item.linkFoto, atualizadoEm: now,
  };
}

export async function fetchDetalheCarlos(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`[ubaCarlos] HTTP ${response.status} em ${url}; dados preservados.`);
  if (response.url !== url) throw new Error(`[ubaCarlos] Detalhe redirecionado: ${response.url}; dados preservados.`);
  return response.text();
}

export async function coletarCarlos(browser, project, negociacao, {
  anteriores = new Map(), onCount = async () => {},
} = {}) {
  const base = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlCarlos(base, negociacao);
  const page = await browser.newPage();
  try {
    const read = async (url, validate) => {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (!response?.ok()) throw new Error(`[ubaCarlos] HTTP ${response?.status()} em ${url}; dados preservados.`);
      validate(page.url());
      return page.content();
    };
    const listing = async () => extrairListagemCarlos(await read(base, url => validarUrlCarlos(url, negociacao)), negociacao);
    const first = await listing();
    await onCount(first.total);
    const imoveis = [];
    for (const item of first.imoveis) {
      const html = await page.evaluate(fetchDetalheCarlos, item.linkReal);
      const parsed = extrairDetalhesCarlos(html, item, negociacao);
      const old = anteriores.get(item.linkReal);
      if (old?.dataInclusao) parsed.dataInclusao = old.dataInclusao;
      imoveis.push(parsed);
      if (imoveis.length % 25 === 0 || imoveis.length === first.total) {
        console.log(`[ubaCarlos] ${negociacao}: ${imoveis.length}/${first.total} detalhes validados.`);
      }
    }
    const final = await listing();
    const signature = data => JSON.stringify(data.imoveis.map(item => [item.linkReal, item.codigoBase, item.preco, item.titulo, item.tipoImovel]));
    if (final.total !== first.total || signature(first) !== signature(final) || imoveis.length !== first.total) {
      throw new Error("[ubaCarlos] Listagem mudou ou coleta incompleta; dados preservados.");
    }
    return { imoveis, totalEsperado: first.total };
  } finally { await page.close(); }
}
