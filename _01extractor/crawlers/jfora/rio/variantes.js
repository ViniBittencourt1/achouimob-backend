import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const origens = {
  rioBaez: "https://www.grupobaez.com.br",
  rioLopa: "https://lopaimoveis.com.br",
  rioCj: "https://www.cjimoveisrj.com.br",
};
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = element => (element?.textContent || "").replace(/\s+/g, " ").trim();
const normalizar = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const pausar = ms => new Promise(resolve => setTimeout(resolve, ms));
const documento = html => new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
const falhar = (project, message) => new Error(`[${project.collection}] ${message}; nenhuma gravacao realizada.`);

export function projetoVariante(project, negociacao) {
  if (!["venda", "locacao"].includes(negociacao) || !Object.hasOwn(origens, project.collection)) {
    throw falhar(project, "Projeto ou negociacao nao suportados pelas variantes");
  }
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  const configured = { ...project, url, negociacao };
  validarUrlVariante(url, configured, 1);
  return configured;
}

export function validarUrlVariante(value, project, pagina) {
  let url;
  try { url = new URL(value); } catch { throw falhar(project, "URL de listagem invalida"); }
  const cj = project.collection === "rioCj";
  const finalidade = project.negociacao === "venda" ? "a-venda" : "para-alugar";
  const inicial = `/imoveis/${finalidade}${cj ? "/todos/" : ""}`;
  const keys = cj ? ["disponibilidade", "categoria", "pagina"] : ["pagina", "ordernar-por", "ordenar-por"];
  const queryValida = [...url.searchParams.keys()].every(key => keys.includes(key) && url.searchParams.getAll(key).length === 1);
  const porQuery = cj && url.pathname === "/imoveis/"
    && url.searchParams.get("disponibilidade") === finalidade && url.searchParams.get("categoria") === "todos";
  const porRota = url.pathname === inicial && (!cj || !url.searchParams.has("disponibilidade") && !url.searchParams.has("categoria"));
  const numero = url.searchParams.get("pagina");
  if (url.origin !== origens[project.collection] || url.username || url.password || url.hash
    || !queryValida || !(porRota || porQuery)
    || numero !== null && !/^[1-9]\d*$/.test(numero)
    || pagina !== undefined && Number(numero || 1) !== pagina) {
    throw falhar(project, `Origem, finalidade ou pagina invalidas: ${url.href}`);
  }
  return url.href;
}

export function linkCanonicoVariante(value, project) {
  let url;
  try { url = new URL(value, project.url); } catch { throw falhar(project, "Link de imovel invalido"); }
  if (url.origin !== origens[project.collection] || url.username || url.password || !/^\/imovel\/[^/]+(?:\/[^/]+)?\/?$/.test(url.pathname)) {
    throw falhar(project, `Card fora da origem ou rota de imovel: ${url.href}`);
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

export function extrairTotalVariante(html, project) {
  const d = documento(html);
  try {
    const headings = [...d.querySelectorAll("h1")].map(texto);
    const paginaAtual = Number(new URL(project.url).searchParams.get("pagina") || 1);
    const pattern = project.collection === "rioCj"
      ? /^([\d.]+)\s+im[oó]ve(?:l|is)\s+(à venda|para alugar|para loca[çc][aã]o)(?:\s+Página\s+([1-9]\d*)\s*\/\s*([1-9]\d*))?\s*$/i
      : /^([\d.]+)\s+im[oó]ve(?:l|is)\s+(à venda|para alugar|para loca[çc][aã]o)\s*$/i;
    const resultados = headings.map(value => value.match(pattern)).filter(Boolean);
    if (resultados.length !== 1) throw falhar(project, "Contador ausente ou ambiguo (possivel barreira do site)");
    const [, numero, finalidade, pagina, paginas] = resultados[0];
    if (pagina && (Number(pagina) !== paginaAtual || Number(pagina) > Number(paginas))) {
      throw falhar(project, "Pagina do contador diverge da URL");
    }
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(numero)) throw falhar(project, "Contador invalido");
    const venda = normalizar(finalidade) === "a venda";
    if (venda !== (project.negociacao === "venda")) throw falhar(project, "Contador de outra finalidade");
    const total = Number(numero.replace(/\./g, ""));
    if (!Number.isSafeInteger(total)) throw falhar(project, "Total fora do intervalo seguro");
    return total;
  } finally { d.defaultView.close(); }
}

export function lerPaginaVariante(html, project, atual = project.url) {
  validarUrlVariante(atual, project);
  const total = extrairTotalVariante(html, { ...project, url: atual });
  const d = documento(html);
  try {
    // O CJ repete os mesmos imoveis no layout de lista e no de grade.
    const roots = project.collection === "rioCj"
      ? [...d.querySelectorAll(".list-properties article.item-grid .inside-item")]
      : [...d.querySelectorAll(".thumbnail_one")].filter(card => card.querySelector("a.property-card-link[href]"));
    const cards = roots.map(card => {
      const anchor = card.querySelector(project.collection === "rioCj" ? "figcaption a.ab-t-l.full[href]" : "a.property-card-link[href]");
      if (!anchor) throw falhar(project, "Card sem link principal");
      return { href: linkCanonicoVariante(anchor.getAttribute("href"), project), html: card.outerHTML };
    });
    if (new Set(cards.map(card => card.href)).size !== cards.length) throw falhar(project, "Links repetidos na mesma pagina");
    if (cards.length > total || total > 0 && !cards.length || total === 0 && cards.length) {
      throw falhar(project, `Contador e cards inconsistentes: ${cards.length}/${total}`);
    }
    const pagina = Number(new URL(atual).searchParams.get("pagina") || 1);
    const proximas = new Set();
    for (const anchor of d.querySelectorAll('a[href*="pagina="]')) {
      const url = new URL(anchor.getAttribute("href"), atual);
      validarUrlVariante(url.href, project);
      if (Number(url.searchParams.get("pagina")) === pagina + 1) proximas.add(url.href);
    }
    if (proximas.size > 1) throw falhar(project, "Paginacao seguinte ambigua");
    return { total, cards, next: [...proximas][0] || "" };
  } finally { d.defaultView.close(); }
}

function numero(value) {
  const match = String(value || "").match(/\d[\d.,]*/);
  if (!match) return 0;
  const raw = match[0];
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, ""));
}

export function precoVariante(value, finalidade, negociacao, project) {
  const label = normalizar(finalidade);
  const amounts = [...String(value).matchAll(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{1,2})?)(?![\d.,])/gi)]
    .map(match => Number(match[1].replace(/\./g, "").replace(",", ".")));
  if (!amounts.length && /consulta|consulte|sob consulta/i.test(value)) return null;
  const mixed = label === "venda e locacao";
  const valid = mixed || negociacao === "venda" && label === "venda" || negociacao === "locacao" && ["locacao", "aluguel"].includes(label);
  if (!valid || amounts.length !== (mixed ? 2 : 1)) throw falhar(project, `Preco ou finalidade ambiguos: "${finalidade}: ${value}"`);
  const result = amounts[mixed && negociacao === "locacao" ? 1 : 0];
  if (!Number.isFinite(result) || result <= 0) throw falhar(project, "Preco invalido");
  return result;
}

function resolverCidade(value, project, link) {
  const match = value.match(/^(.*?)(?:\s*[-/]\s*([A-Z]{2}))?$/);
  const nome = normalizar(match?.[1]);
  const uf = match?.[2];
  const matches = cidades.filter(cidade => normalizar(cidade.nome) === nome && (!uf || cidade.estado === uf));
  const slugs = new Set(matches.map(cidade => cidade.slug));
  if (slugs.size === 1) return [...slugs][0];
  console.warn(`[${project.collection}] Cidade sem correspondencia unica no catalogo: "${value}" (${link})`);
  return "";
}

export function parseCardVariante(html, project, negociacao = project.negociacao, now = new Date()) {
  const d = documento(html);
  try {
    const cj = project.collection === "rioCj";
    const anchor = d.querySelector(cj ? "figcaption a.ab-t-l.full[href]" : "a.property-card-link[href]");
    if (!anchor) throw falhar(project, "Card sem link");
    const linkReal = linkCanonicoVariante(anchor.getAttribute("href"), project);
    const titulo = texto(d.querySelector(cj ? ".tit-area .tit" : ".property_card_heading .color-primary"));
    const tituloNormal = normalizar(titulo);
    const finalidadeTitulo = negociacao === "venda" ? /a venda|venda ou locacao/ : /para alugar|para locacao|venda ou locacao/;
    if (!finalidadeTitulo.test(tituloNormal)) throw falhar(project, `Titulo de outra finalidade: "${titulo}"`);
    const data = d.querySelector(".property-card-footer [data-city]");
    const address = d.querySelector(".property_card_address");
    const localizacao = cj ? texto(d.querySelector(".tit-area .tit-list:not(.tit)")) : (address?.getAttribute("title") || texto(address));
    const partes = cj ? localizacao.split(",").map(value => value.trim()) : [];
    const cityAddress = localizacao.match(/,\s*([^,]+-[A-Z]{2})$/)?.[1] || "";
    const cidadeNome = cj ? partes.slice(1).join(", ").trim() : data?.getAttribute("data-city") || cityAddress;
    const bairroNome = cj ? partes[0] || "" : data?.getAttribute("data-block") || localizacao.slice(0, localizacao.lastIndexOf(",")).split(" - ").pop()?.trim() || "";
    const cidade = resolverCidade(cidadeNome, project, linkReal);
    const bairroCatalogo = resolverBairroNiteroi(bairroNome, cidade);
    if (bairroNome && !bairroCatalogo) console.warn(`[${project.collection}] Bairro fora do catalogo: "${bairroNome}" (${cidade}; ${linkReal})`);
    const tipoNome = cj ? titulo.split(/\s+(?:à venda|para alugar|para loca[çc][aã]o|para venda ou loca[çc][aã]o)\b/i)[0] : data?.getAttribute("data-property-type") || titulo.split(/\s+(?:à venda|para alugar)\b/i)[0];
    const tipoImovel = resolverTipoNiteroi(tipoNome);
    if (!tipoImovel) console.warn(`[${project.collection}] Tipo fora do catalogo: "${tipoNome}" (${linkReal})`);
    const caracteristicas = [...d.querySelectorAll(cj ? ".lk-infos span.txt" : ".thum_data li")];
    const metrica = (pattern, icon) => numero(texto(caracteristicas.find(element => cj ? element.querySelector(icon) : pattern.test(texto(element)))));
    const priceArea = d.querySelector(".price-area");
    const finalidade = cj ? texto(priceArea?.querySelector(".price-txt")) : negociacao === "venda" ? "Venda" : "Locação";
    const transaction = data?.getAttribute("data-transaction");
    if (!cj && transaction && transaction !== (negociacao === "venda" ? "sell" : "rent")) throw falhar(project, "Card Praedium de outra finalidade");
    let preco;
    try {
      preco = precoVariante(texto(d.querySelector(cj ? ".price-area .price" : ".property_pricing")), finalidade, negociacao, project);
    } catch (error) {
      throw falhar(project, `Falha no preco do card ${linkReal}: ${error.message}`);
    }
    const codigoBase = cj ? texto(d.querySelector(".buttons-area span")) : data?.getAttribute("data-code") || linkReal.match(/-id-(\d+)\/?$/)?.[1] || "";
    if (!titulo || !localizacao || !codigoBase) {
      throw falhar(project, `Card sem titulo, localizacao ou codigo (${linkReal}; titulo=${Boolean(titulo)}, localizacao=${Boolean(localizacao)}, codigo=${Boolean(codigoBase)})`);
    }
    const image = d.querySelector("img");
    let linkFoto = "";
    const imageSrc = image?.getAttribute("data-src") || image?.getAttribute("src");
    if (imageSrc) {
      const imageUrl = new URL(imageSrc, project.url);
      if (["http:", "https:"].includes(imageUrl.protocol)) linkFoto = imageUrl.href;
    }
    const timestamp = now.toISOString();
    return {
      linkReal, titulo, preco, localizacao, tipoImovel,
      bairro: bairroCatalogo || bairroNome, cidade,
      dormitorioValor: metrica(/quarto|dormit/i, ".fa-bed"),
      banheiroValor: metrica(/banheiro/i, ".fa-bath"),
      ambienteValor: 0,
      areaValor: metrica(/m²|m2/i, ".fa-expand"),
      garagemValor: metrica(/vaga|garagem/i, ".fa-car-side"),
      elevadorValor: 0, codigoBase, linkCard: linkReal, corretor: project.displayName,
      dataInclusao: timestamp, dataExclusao: "", linkFoto, atualizadoEm: timestamp,
    };
  } finally { d.defaultView.close(); }
}

async function carregar(page, url, project) {
  validarUrlVariante(url, project);
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      if (!response) throw falhar(project, "Navegacao sem resposta HTTP");
      const status = response.status();
      if (!response.ok()) {
        const error = falhar(project, `HTTP ${status} em ${url}`);
        error.transitorio = [408, 429, 500, 502, 503, 504].includes(status);
        throw error;
      }
      validarUrlVariante(page.url(), project, Number(new URL(url).searchParams.get("pagina") || 1));
      const snapshot = lerPaginaVariante(await page.content(), project, page.url());
      console.log(`[${project.collection}/${project.negociacao}] Pagina ${new URL(url).searchParams.get("pagina") || 1}: ${snapshot.cards.length} cards, total ${snapshot.total}.`);
      return snapshot;
    } catch (error) {
      const transitorio = error.transitorio || error.name === "TimeoutError"
        || /net::ERR_(?:CONNECTION|TIMED_OUT|EMPTY_RESPONSE|NETWORK)|ECONNRESET|ETIMEDOUT|fetch failed|UND_ERR_SOCKET/i.test(error.message);
      if (!transitorio || tentativa === 3) throw error;
      console.warn(`[${project.collection}/${project.negociacao}] Retry transitorio ${tentativa}/2: ${error.message}`);
      await pausar(500 * tentativa);
    }
  }
}

function conferirTotal(snapshot, expected, project) {
  if (snapshot.total !== expected) throw falhar(project, `Total instavel: esperado ${expected}, recebido ${snapshot.total}`);
}

export async function contarVariante(browser, project, negociacao) {
  const configured = projetoVariante(project, negociacao);
  const page = await browser.newPage();
  try {
    const first = await carregar(page, configured.url, configured);
    conferirTotal(await carregar(page, configured.url, configured), first.total, configured);
    return first.total;
  } finally { await page.close(); }
}

export async function coletarVariante(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  const configured = projetoVariante(project, negociacao);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || typeof primeiraPagina !== "boolean") {
    throw falhar(project, "totalEsperado ou primeiraPagina invalidos");
  }
  const page = await browser.newPage();
  try {
    const items = [];
    const links = new Set();
    const visitadas = new Set();
    let url = configured.url;
    // Cada pagina deve trazer ao menos um link novo; o limite tambem protege contra loops.
    const limite = Math.max(1, totalEsperado);
    while (url) {
      if (visitadas.has(url) || visitadas.size >= limite) throw falhar(project, "Loop ou limite de paginacao");
      visitadas.add(url);
      const snapshot = await carregar(page, url, configured);
      conferirTotal(snapshot, totalEsperado, configured);
      for (const card of snapshot.cards) {
        if (links.has(card.href)) throw falhar(project, `Link repetido entre paginas: ${card.href}`);
        links.add(card.href);
        items.push(parseCardVariante(card.html, configured));
      }
      if (items.length > totalEsperado) throw falhar(project, "Coleta excedeu totalEsperado");
      if (primeiraPagina) break;
      if (items.length === totalEsperado && snapshot.next) throw falhar(project, "Paginacao adicional apos total esperado");
      if (items.length < totalEsperado && !snapshot.next) throw falhar(project, `Coleta incompleta: ${items.length}/${totalEsperado}`);
      url = snapshot.next;
      if (url) await pausar(300);
    }
    conferirTotal(await carregar(page, configured.url, configured), totalEsperado, configured);
    if (!primeiraPagina && items.length !== totalEsperado) throw falhar(project, `Contagem inexata: ${items.length}/${totalEsperado}`);
    console.log(`[${project.collection}/${negociacao}] Validacao ${primeiraPagina ? "parcial (primeira pagina)" : "completa"}: ${items.length}/${totalEsperado}, links unicos.`);
    return items;
  } finally { await page.close(); }
}
