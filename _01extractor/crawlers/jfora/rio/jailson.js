import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const ORIGIN = "https://jaylsonimobiliaria.com.br";
const INDEX_PATH = "/indice-imoveis.json";
const PAGE_SIZE = 24;
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = value => normalizar(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const falhar = message => new Error(`[rioJailson] ${message}; dados anteriores preservados.`);

function urlBase(project, negociacao) {
  const value = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  let url;
  try { url = new URL(value); } catch { throw falhar("URL de listagem invalida"); }
  const search = negociacao === "venda" ? "" : "?negocio=aluguel";
  if (!["venda", "locacao"].includes(negociacao) || url.origin !== ORIGIN || url.username || url.password
    || url.pathname !== "/imoveis" || url.search !== search || url.hash) {
    throw falhar(`Origem, finalidade ou rota invalidas: ${url.href}`);
  }
  return url.href;
}

function lerValor(value, name) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw falhar(`${name} invalido`);
  return number;
}

function validarIndice(data) {
  if (!Array.isArray(data)) throw falhar("Indice de imoveis invalido");
  const ids = new Set();
  for (const item of data) {
    if (!item || typeof item !== "object" || !texto(item.id) || !texto(item.slug)
      || !texto(item.code) || !texto(item.title) || !texto(item.typeLabel) || !texto(item.type)
      || !texto(item.neighborhood) || ids.has(String(item.id))) {
      throw falhar("Registro incompleto ou identificador repetido no indice");
    }
    ids.add(String(item.id));
    lerValor(item.priceSale, "Preco de venda");
    lerValor(item.priceRent, "Preco de aluguel");
    lerValor(item.bedrooms, "Quartos");
    lerValor(item.parking, "Vagas");
    lerValor(item.areaUsable, "Area");
  }
  return data;
}

function filtrarNegociacao(data, negociacao) {
  const priceKey = negociacao === "venda" ? "priceSale" : "priceRent";
  return data.filter(item => item[priceKey] > 0);
}

function linkDoImovel(item, negociacao) {
  const url = new URL(`/imovel/${encodeURIComponent(item.slug)}${negociacao === "locacao" ? "?negocio=aluguel" : ""}`, ORIGIN);
  if (url.origin !== ORIGIN || !/^\/imovel\/[^/]+$/.test(url.pathname)
    || url.search !== (negociacao === "locacao" ? "?negocio=aluguel" : "")) {
    throw falhar(`Link de imovel invalido: ${item.slug}`);
  }
  return url.href;
}

export function parseIndiceJailson(data, negociacao, now = new Date(), primeiraPagina = false) {
  if (!["venda", "locacao"].includes(negociacao) || !(now instanceof Date) || Number.isNaN(now.getTime())
    || typeof primeiraPagina !== "boolean") {
    throw falhar("Finalidade, data ou paginacao invalida");
  }
  const anuncios = filtrarNegociacao(validarIndice(data), negociacao);
  const records = (primeiraPagina ? anuncios.slice(0, PAGE_SIZE) : anuncios).map(item => {
    const cidade = "rio-de-janeiro-rj";
    const linkReal = linkDoImovel(item, negociacao);
    const bairro = resolverBairroNiteroi(item.neighborhood, cidade) || slug(item.neighborhood);
    const tipo = resolverTipoNiteroi(item.typeLabel) || resolverTipoNiteroi(item.type) || slug(item.type);
    const image = texto(item.img);
    if (image && !/^https?:\/\//i.test(image)) throw falhar(`Imagem invalida: ${linkReal}`);
    const codigoBase = texto(item.code);
    if (!bairro || !tipo || !codigoBase) throw falhar(`Dados de catalogo ou codigo ausentes: ${linkReal}`);
    const timestamp = now.toISOString();
    return {
      linkReal, titulo: texto(item.title),
      preco: lerValor(negociacao === "venda" ? item.priceSale : item.priceRent, "Preco"),
      localizacao: [texto(item.street), texto(item.neighborhood), "Rio de Janeiro - RJ"].filter(Boolean).join(", "),
      tipoImovel: tipo, bairro, cidade,
      dormitorioValor: lerValor(item.bedrooms, "Quartos"), banheiroValor: 0, ambienteValor: 0,
      areaValor: lerValor(item.areaUsable, "Area"), garagemValor: lerValor(item.parking, "Vagas"), elevadorValor: 0,
      codigoBase, linkCard: linkReal, corretor: "Jailson",
      dataInclusao: timestamp, dataExclusao: "", linkFoto: image, atualizadoEm: timestamp,
    };
  });
  if (new Set(records.map(record => record.linkReal)).size !== records.length) {
    throw falhar(`Links repetidos na coleta de ${negociacao}`);
  }
  return records;
}

async function obterIndice(page, project, negociacao) {
  const base = urlBase(project, negociacao);
  const pageResponse = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!pageResponse || !pageResponse.ok()) throw falhar(`HTTP ${pageResponse?.status?.() || "invalido"} em ${base}`);
  const response = await page.evaluate(async path => {
    const result = await fetch(path, { cache: "no-store" });
    if (!result.ok) throw new Error(`HTTP ${result.status} no indice`);
    return result.json();
  }, INDEX_PATH).catch(error => { throw falhar(`Falha ao carregar indice: ${error.message}`); });
  return validarIndice(response);
}

export async function contarJailson(browser, project, negociacao) {
  const page = await browser.newPage();
  try {
    const data = await obterIndice(page, project, negociacao);
    return filtrarNegociacao(data, negociacao).length;
  } finally { await page.close(); }
}

export async function coletarJailson(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Total esperado invalido");
  const page = await browser.newPage();
  try {
    const data = await obterIndice(page, project, negociacao);
    const records = parseIndiceJailson(data, negociacao, new Date(), primeiraPagina);
    if (filtrarNegociacao(data, negociacao).length !== totalEsperado) {
      throw falhar(`Total alterado durante a coleta: esperado ${totalEsperado}`);
    }
    if (!primeiraPagina && records.length !== totalEsperado) throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
    return records;
  } finally { await page.close(); }
}
