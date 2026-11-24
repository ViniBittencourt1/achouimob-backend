import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoNiteroi } from "../../niteroi/tipoImovel.js";

const origin = "https://www.montezzi.com.br";
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();

export function validarUrlMontezzi(value, negociacao, pageNumber = 1) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("[ubaMontezzi] Negociacao invalida.");
  const url = new URL(value);
  const allowed = ["finalidade", "page", "pagesize", "keywords", "categoria", "cidade", "valor", "quartos", "garagens", "banheiros", "lancamento", "ordem"];
  if (url.origin !== origin || url.pathname !== "/imovel-lista.php" || url.hash ||
      url.searchParams.get("finalidade") !== negociacao ||
      Number(url.searchParams.get("page") ?? 1) !== pageNumber ||
      Number(url.searchParams.get("pagesize") ?? 8) !== 8 ||
      [...url.searchParams].some(([key, val]) => !allowed.includes(key) ||
        (["keywords", "lancamento"].includes(key) && val !== "") ||
        (["categoria", "cidade", "valor", "quartos", "garagens", "banheiros"].includes(key) && val !== "0") ||
        (key === "ordem" && val !== "codigo"))) {
    throw new Error(`[ubaMontezzi] Listagem fora da finalidade, pagina ou filtros esperados: ${url.href}; dados preservados.`);
  }
  return url;
}

export function parsePrecoMontezzi(value) {
  const text = compact(value);
  if (/^a combinar$/i.test(text)) return null;
  const match = text.match(/^R\$\s*(\d+(?:\.\d{3})*),(\d{2})$/);
  if (!match) throw new Error(`[ubaMontezzi] Preco invalido: ${text}; dados preservados.`);
  const result = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
  if (!Number.isFinite(result)) throw new Error("[ubaMontezzi] Preco fora do limite.");
  return result;
}

function location(title, codigoBase) {
  const parts = title.split(" - ");
  if (parts.length < 3) throw new Error(`[ubaMontezzi] Titulo/localizacao invalido: ${title}`);
  const tipo = parts.shift();
  const nomeCidade = parts.pop();
  const bairroNome = parts.join(" - ");
  let cidade;
  let bairro = normalizarBairro(bairroNome).replace(/ /g, "-");
  if (codigoBase === "5285" && normalizarBairro(nomeCidade) === "indefinida" && normalizarBairro(bairroNome) === "indefinido") {
    console.warn("[ubaMontezzi] Anuncio 5285 sem localizacao: cidade e bairro vazios conforme confirmado.");
    cidade = "";
    bairro = "";
  } else if (["diamante de uba", "ubari"].includes(normalizarBairro(nomeCidade))) cidade = "uba-mg";
  else {
    const matches = new Set(cidades.filter(city => normalizarBairro(city.nome) === normalizarBairro(nomeCidade)).map(city => city.slug));
    if (matches.size !== 1) throw new Error(`[ubaMontezzi] Cidade fora do catalogo ou ambigua: ${nomeCidade}`);
    cidade = matches.values().next().value;
  }
  const tipoImovel = normalizarBairro(tipo) === "kitinet" ? "loft" : resolverTipoNiteroi(tipo);
  if (!tipoImovel) throw new Error(`[ubaMontezzi] Tipo fora do catalogo: ${tipo}`);
  return { localizacao: `${bairroNome} - ${nomeCidade}`, cidade, bairro, tipoImovel };
}

function features($, rows) {
  const values = { dormitorioValor: null, banheiroValor: null, garagemValor: null, areaValor: null };
  rows.each((_index, element) => {
    const text = compact($(element).text());
    let match = text.match(/^(\d+)\s+(quartos?|banheiros?|vagas?|garagens?)$/i);
    if (match) {
      const key = /^quarto/i.test(match[2]) ? "dormitorioValor" : /^banheiro/i.test(match[2]) ? "banheiroValor" : "garagemValor";
      values[key] = Number(match[1]);
      return;
    }
    match = text.match(/^(\d+(?:[.,]\d+)?)\s*m[²2]\s*area\s+(terreno|construida)$/i);
    if (match) {
      const area = Number(match[1].replace(",", "."));
      if (!Number.isFinite(area)) throw new Error("[ubaMontezzi] Area invalida.");
      if (match[2].toLowerCase() === "construida" || values.areaValor === null) values.areaValor = area;
    }
  });
  return values;
}

export function extrairListagemMontezzi(html, negociacao, pageNumber = 1, now = new Date().toISOString()) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("[ubaMontezzi] Negociacao invalida.");
  const $ = load(html);
  const counters = $("h1,h2,h3,h4,h5").toArray().map(e => compact($(e).text())).filter(t => /^Selecionamos /.test(t));
  const match = counters.length === 1 ? counters[0].match(/^Selecionamos (\d+) im[oó]veis: exibindo de (\d+) a (\d+)$/) : null;
  if (!match) throw new Error("[ubaMontezzi] Contador ausente ou invalido; dados preservados.");
  const [total, start, end] = match.slice(1).map(Number);
  if (!Number.isSafeInteger(total) || total < 1 || start !== (pageNumber - 1) * 8 + 1 || end !== Math.min(total, pageNumber * 8)) {
    throw new Error("[ubaMontezzi] Intervalo da pagina invalido; dados preservados.");
  }
  const cards = $(".deals-list-content .inner-box");
  if (cards.length !== end - start + 1) throw new Error("[ubaMontezzi] Pagina incompleta; dados preservados.");
  const imoveis = cards.toArray().map(element => {
    const card = $(element);
    const anchor = card.find(".title-text h4 a").first();
    const url = new URL(anchor.attr("href"), origin);
    const codigoBase = url.searchParams.get("codimo");
    if (url.origin !== origin || url.pathname !== "/imovel-detalhe.php" || !/^[1-9]\d*$/.test(codigoBase ?? "") ||
        [...url.searchParams.keys()].some(key => key !== "codimo") ||
        compact(card.find(".category").text()) !== `Cod: ${codigoBase}`) {
      throw new Error("[ubaMontezzi] Link ou codigo invalido; dados preservados.");
    }
    if (normalizarBairro(card.find(".buy-btn").text()) !== negociacao) throw new Error("[ubaMontezzi] Card fora da finalidade; dados preservados.");
    const titulo = compact(anchor.text());
    const image = card.find(".image-box figure.image img").attr("src");
    const photo = image ? new URL(image, origin) : null;
    if (photo && !["https:", "http:"].includes(photo.protocol)) throw new Error("[ubaMontezzi] Foto invalida.");
    return {
      linkReal: url.href, titulo, preco: parsePrecoMontezzi(card.find(".price-info h4").text()),
      ...location(titulo, codigoBase), ...features($, card.find(".more-details li")),
      ambienteValor: null, elevadorValor: null, codigoBase, linkCard: url.href, corretor: "Montezzi",
      dataInclusao: now, dataExclusao: "", linkFoto: photo?.href || "", atualizadoEm: now,
    };
  });
  return { total, start, end, imoveis };
}

export function extrairDetalhesMontezzi(html, item, negociacao) {
  const $ = load(html);
  const header = $(".top-details");
  const headingLines = (header.find(".left-column h3").html() || "").split(/<br\s*\/?>/i)
    .map(fragment => compact(load(fragment).text())).filter(Boolean);
  const categories = header.find("ul.category li").toArray().map(e => compact($(e).text()));
  const root = $(".details-box.content-widget");
  const ids = root.find("li").toArray().map(e => compact($(e).text())).filter(t => /^Código do imóvel:/.test(t));
  if (header.length !== 1 || headingLines[0] !== item.titulo ||
      categories[0] !== `Cód: ${item.codigoBase}` || normalizarBairro(categories[1]) !== negociacao ||
      ids.length !== 1 || ids[0] !== `Código do imóvel: ${item.codigoBase}`) {
    throw new Error(`[ubaMontezzi] Detalhes ${item.codigoBase} fora do imovel ou finalidade; dados preservados.`);
  }
  const result = Object.fromEntries(Object.entries(features($, root.find("ul.list > li"))).filter(([, value]) => value !== null));
  if (headingLines.length > 1) result.localizacao = [...headingLines.slice(1), item.localizacao].join(" - ");
  return result;
}

async function read(browser, url, validate) {
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[ubaMontezzi] HTTP ${response?.status()} em ${url}; dados preservados.`);
    validate(page.url());
    return await page.content();
  } finally { await page.close(); }
}

export async function coletarMontezzi(browser, project, negociacao, {
  anteriores = new Map(), enriquecer = true, onCount = async () => {},
} = {}) {
  const base = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlMontezzi(base, negociacao);
  const listing = async number => {
    const url = new URL(base);
    url.searchParams.set("page", String(number));
    url.searchParams.set("pagesize", "8");
    return extrairListagemMontezzi(await read(browser, url.href, value => validarUrlMontezzi(value, negociacao, number)), negociacao, number);
  };
  const first = await listing(1);
  const pages = Math.ceil(first.total / 8);
  if (pages > 150) throw new Error("[ubaMontezzi] Limite de paginas atingido; dados preservados.");
  await onCount(first.total);
  const imoveis = [];
  const seen = new Set();
  for (let number = 1; number <= pages; number++) {
    const batch = number === 1 ? first : await listing(number);
    if (batch.total !== first.total) throw new Error("[ubaMontezzi] Contagem mudou; dados preservados.");
    for (const item of batch.imoveis) {
      if (seen.has(item.codigoBase)) console.warn(`[ubaMontezzi] Ocorrencia repetida ${item.codigoBase} preservada conforme site.`);
      seen.add(item.codigoBase);
      const old = anteriores.get(item.linkReal);
      if (old) {
        item.dataInclusao = old.dataInclusao || item.dataInclusao;
        for (const field of ["dormitorioValor", "banheiroValor", "garagemValor", "areaValor", "ambienteValor", "elevadorValor"]) {
          if (item[field] === null) item[field] = old[field] ?? null;
        }
      }
      imoveis.push(item);
    }
    console.log(`[ubaMontezzi] ${negociacao} pagina ${number}/${pages}: ${imoveis.length}/${first.total}.`);
  }
  const final = await listing(1);
  if (final.total !== first.total || final.imoveis.map(i => i.codigoBase).join("|") !== first.imoveis.map(i => i.codigoBase).join("|") ||
      imoveis.length !== first.total) throw new Error("[ubaMontezzi] Listagem mudou ou coleta incompleta; dados preservados.");
  const details = new Map();
  if (enriquecer) for (const item of imoveis) {
    if (anteriores.has(item.linkReal)) continue;
    if (!details.has(item.linkReal)) {
      const html = await read(browser, item.linkReal, value => {
        if (value !== item.linkReal) throw new Error("[ubaMontezzi] Detalhes redirecionados; dados preservados.");
      });
      details.set(item.linkReal, extrairDetalhesMontezzi(html, item, negociacao));
    }
    Object.assign(item, details.get(item.linkReal));
  }
  return { imoveis, totalEsperado: first.total };
}
