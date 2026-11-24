import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const PAGE_SIZE = 20;
const origin = "https://www.atlanticaimoveis.com";
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const texto = element => (element?.textContent || "").replace(/\s+/g, " ").trim();
const normalizar = value => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const falhar = message => new Error(`[rioAtlantica] ${message}; dados anteriores preservados.`);
const documento = html => new JSDOM(html, { virtualConsole: new VirtualConsole() });

function urlBase(project, negociacao) {
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlAtlantica(url, project, negociacao, 1);
  return url;
}

export function validarUrlAtlantica(value, project, negociacao, pagina) {
  let url;
  try { url = new URL(value); } catch { throw falhar("URL de listagem invalida"); }
  const path = negociacao === "venda" ? "/venda/" : "/aluguel/";
  const page = url.searchParams.get("pagina");
  if (!["venda", "locacao"].includes(negociacao) || url.origin !== origin || url.username || url.password
    || url.hash || url.pathname !== path || [...url.searchParams.keys()].some(key => key !== "pagina")
    || url.searchParams.getAll("pagina").length !== 1 || !/^[1-9]\d*$/.test(page || "")
    || pagina !== undefined && Number(page) !== pagina) {
    throw falhar(`Origem, finalidade ou pagina invalidas: ${url.href}`);
  }
  const expected = new URL(negociacao === "venda" ? project.urlVendas : project.urlLocacao);
  if (expected.origin !== origin || expected.pathname !== path) throw falhar("Configuracao de origem ou finalidade invalida");
  return url.href;
}

function extrairTotal(html, project, negociacao) {
  const d = documento(html);
  try {
    const headings = [...d.window.document.querySelectorAll("h1")].map(texto);
    const matches = headings.map(value => value.match(/^([\d.]+)\s+im[oó]ve(?:l|is)\s+(à venda|para alugar)\b/i)).filter(Boolean);
    if (matches.length !== 1) throw falhar("Total ausente ou ambiguo (a pagina pode nao ter carregado)");
    const [, raw, finalidade] = matches[0];
    if (normalizar(finalidade) !== (negociacao === "venda" ? "a venda" : "para alugar")
      || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(raw)) {
      throw falhar("Total ou finalidade invalidos");
    }
    const total = Number(raw.replace(/\./g, ""));
    if (!Number.isSafeInteger(total)) throw falhar("Total fora do intervalo seguro");
    return total;
  } finally { d.window.close(); }
}

function parseNumero(value) {
  const match = String(value ?? "").match(/\d[\d.,]*/);
  if (!match) return 0;
  const raw = match[0];
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\./g, ""));
}

function parsePreco(value) {
  const match = String(value ?? "").match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{1,2})?)/i);
  if (!match) {
    if (/consulte|sob consulta/i.test(value)) return null;
    throw falhar(`Preco ausente ou invalido: "${value}"`);
  }
  const price = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(price) || price < 0) throw falhar("Preco invalido");
  return price;
}

function resolverCidade(nome, link) {
  const matches = cidades.filter(cidade => cidade.estado === "RJ" && normalizar(cidade.nome) === normalizar(nome));
  const slugs = new Set(matches.map(cidade => cidade.slug));
  if (slugs.size === 1) return slugs.values().next().value;
  console.warn(`[rioAtlantica] Cidade sem correspondencia unica no catalogo: "${nome}" (${link})`);
  return "";
}

function slug(value) {
  return normalizar(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function linkCanonico(value, baseUrl) {
  let url;
  try { url = new URL(value, baseUrl); } catch { throw falhar("Link de imovel invalido"); }
  if (url.origin !== origin || url.username || url.password || !/^\/imovel\/[^/]+\/\d+\/?$/.test(url.pathname)) {
    throw falhar(`Card fora da origem ou rota de imovel: ${url.href}`);
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

export function parseCardAtlantica(html, project, negociacao, now = new Date()) {
  const d = documento(html);
  try {
    const card = d.window.document.querySelector("a[href]");
    if (!card) throw falhar("Card sem link principal");
    const linkReal = linkCanonico(card.getAttribute("href"), negociacao === "venda" ? project.urlVendas : project.urlLocacao);
    const titulo = texto(card.querySelector(".card-title"));
    const tipoMatch = titulo.match(/^(.*?)\s+(?:à venda|para alugar)\b/i);
    const finalidadeValida = negociacao === "venda" ? /à venda/i.test(titulo) : /para alugar/i.test(titulo);
    if (!titulo || !tipoMatch || !finalidadeValida) throw falhar(`Titulo ou finalidade invalidos: "${titulo}"`);

    const endereco = texto(card.querySelector(".card-text"));
    const local = endereco.match(/^(.+?)\s*\|\s*(.+)$/);
    if (!local) throw falhar(`Localizacao invalida: "${endereco}"`);
    const [, bairroNome, cidadeNome] = local;
    const cidade = resolverCidade(cidadeNome, linkReal);
    const bairro = resolverBairroNiteroi(bairroNome, cidade) || slug(bairroNome);
    const caracteristicas = [...card.querySelectorAll(".card-footer .container-icon")].map(texto);
    if (caracteristicas.length < 4) throw falhar(`Caracteristicas incompletas: ${linkReal}`);

    const image = card.querySelector("img.img-imovel");
    const imageSource = image?.getAttribute("data-src") || image?.getAttribute("src") || "";
    let linkFoto = "";
    if (imageSource) {
      const foto = new URL(imageSource, linkReal);
      if (!["http:", "https:"].includes(foto.protocol)) throw falhar(`Foto invalida: ${linkReal}`);
      linkFoto = foto.href;
    }
    const codigoBase = linkReal.match(/\/(\d+)\/?$/)?.[1] || "";
    if (!codigoBase || !bairroNome || !cidadeNome) throw falhar(`Card sem codigo ou localizacao: ${linkReal}`);
    const timestamp = now.toISOString();
    const tipo = tipoMatch[1].trim();
    const tipoImovel = resolverTipoNiteroi(tipo) || tipo;
    return {
      linkReal, titulo, preco: parsePreco(texto(card.querySelector(".preco-imovel-card"))),
      localizacao: `${bairroNome}, ${cidadeNome} - RJ`, tipoImovel, bairro, cidade,
      dormitorioValor: parseNumero(caracteristicas[1]),
      banheiroValor: parseNumero(caracteristicas[3]),
      ambienteValor: 0, areaValor: parseNumero(caracteristicas[0]),
      garagemValor: parseNumero(caracteristicas[2]), elevadorValor: 0,
      codigoBase, linkCard: linkReal, corretor: project.displayName,
      dataInclusao: timestamp, dataExclusao: "", linkFoto, atualizadoEm: timestamp,
    };
  } finally { d.window.close(); }
}

function lerPagina(html, project, negociacao, url) {
  validarUrlAtlantica(url, project, negociacao);
  const total = extrairTotal(html, project, negociacao);
  const d = documento(html);
  try {
    const cards = [...d.window.document.querySelectorAll("#container-resultado-busca a[href]")];
    const pagina = Number(new URL(url).searchParams.get("pagina"));
    const esperados = Math.min(PAGE_SIZE, Math.max(0, total - (pagina - 1) * PAGE_SIZE));
    if (cards.length !== esperados) throw falhar(`Pagina ${pagina} incompleta: ${cards.length}/${esperados}`);
    const records = cards.map(card => parseCardAtlantica(card.outerHTML, project, negociacao));
    const links = records.map(record => record.linkReal);
    if (new Set(links).size !== links.length) throw falhar(`Links repetidos na pagina ${pagina}`);
    return { total, records };
  } finally { d.window.close(); }
}

async function carregar(page, url, project, negociacao) {
  validarUrlAtlantica(url, project, negociacao);
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!response) throw falhar(`Navegacao sem resposta HTTP: ${url}`);
  if (!response.ok()) throw falhar(`HTTP ${response.status()} em ${url}`);
  validarUrlAtlantica(page.url(), project, negociacao, Number(new URL(url).searchParams.get("pagina")));
  await page.waitForFunction(() => {
    const heading = document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "";
    return /^\d[\d.]*\s+im[oó]ve(?:l|is)\s+(?:à venda|para alugar)\b/i.test(heading);
  }, { timeout: 60000 });
  return lerPagina(await page.content(), project, negociacao, page.url());
}

export async function contarAtlantica(browser, project, negociacao) {
  const url = urlBase(project, negociacao);
  const page = await browser.newPage();
  try {
    return (await carregar(page, url, project, negociacao)).total;
  } finally { await page.close(); }
}

export async function coletarAtlantica(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || typeof primeiraPagina !== "boolean") {
    throw falhar("totalEsperado ou primeiraPagina invalidos");
  }
  const base = new URL(urlBase(project, negociacao));
  const pages = Math.max(1, Math.ceil(totalEsperado / PAGE_SIZE));
  const page = await browser.newPage();
  try {
    const records = [];
    const links = new Set();
    for (let pagina = 1; pagina <= (primeiraPagina ? 1 : pages); pagina++) {
      const url = new URL(base);
      url.searchParams.set("pagina", String(pagina));
      const snapshot = await carregar(page, url.href, project, negociacao);
      if (snapshot.total !== totalEsperado) throw falhar(`Total alterado na pagina ${pagina}: ${snapshot.total}/${totalEsperado}`);
      for (const record of snapshot.records) {
        if (links.has(record.linkReal)) throw falhar(`Link repetido entre paginas: ${record.linkReal}`);
        links.add(record.linkReal);
        records.push(record);
      }
      console.log(`[rioAtlantica/${negociacao}] Pagina ${pagina}/${pages}: ${records.length}/${totalEsperado}.`);
    }
    if (!primeiraPagina && records.length !== totalEsperado) {
      throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
    }
    return records;
  } finally { await page.close(); }
}
