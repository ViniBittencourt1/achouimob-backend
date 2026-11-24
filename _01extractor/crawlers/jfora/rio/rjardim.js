import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { resolverBairroCatalogo } from "../_utils/bairroCatalogo.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const ORIGIN = "https://rjardim.com.br";
const PAGE_SIZE = 12;
const REQUEST_TIMEOUT = 60000;
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8",
));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = value => normalizar(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const slugAcentuado = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const falhar = (message, code) => Object.assign(
  new Error(`[rioRJardim] ${message}; dados anteriores preservados.`),
  { rjardim: true, ...(code ? { code } : {}) },
);
const documento = html => new JSDOM(html, { virtualConsole: new VirtualConsole() });

function urlBusca(project, negociacao) {
  if (!["venda", "locacao"].includes(negociacao)) throw falhar("Negociacao invalida");
  const raw = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  let url;
  try { url = new URL(raw); } catch { throw falhar("URL de busca invalida"); }
  const expected = new URLSearchParams({
    compra: negociacao === "venda" ? "comprar" : "alugar",
    localizacao: "", preco: "0,0", "preco-min": "0", "preco-max": "",
  });
  const actual = [...url.searchParams.entries()];
  if (url.origin !== ORIGIN || url.username || url.password || url.pathname !== "/imoveis/"
    || url.hash || actual.length !== [...expected].length
    || [...expected].some(([key, value]) => url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value)) {
    throw falhar(`Origem, filtros ou finalidade da busca invalidos: ${url.href}`);
  }
  return url.href;
}

function falhaHttp(status, operation) {
  if (status < 500 && status !== 429) throw falhar(`HTTP ${status} em ${operation}`);
  return Object.assign(new Error(`HTTP ${status} em ${operation}`), { status });
}

async function buscarHtml(url, options, operation) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!response.ok) throw falhaHttp(response.status, operation);
      return await response.text();
    } catch (error) {
      if (error.rjardim) throw error;
      lastError = error;
      if (attempt < 3) {
        console.warn(`[rioRJardim] Falha em ${operation} (${attempt}/3): ${error.message}. Tentando novamente.`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw falhar(`Falha em ${operation} apos 3 tentativas: ${lastError?.message || "erro desconhecido"}`);
}

async function validarBusca(project, negociacao) {
  const url = urlBusca(project, negociacao);
  const html = await buscarHtml(url, { headers: { Accept: "text/html" } }, "pagina de busca");
  const dom = documento(html);
  try {
    const form = dom.window.document.querySelector("#busca_form");
    const compra = texto(form?.querySelector('[name="compra"]')?.value);
    const scripts = [...dom.window.document.querySelectorAll("script")].map(script => script.textContent);
    const calls = scripts.flatMap(script => [...script.matchAll(/busca_simples\(\s*(['"])(.*?)\1\s*\)/g)].map(match => match[2]));
    const expectedUrl = new URL(url);
    const validCall = calls.some(value => {
      try {
        const called = new URL(value, ORIGIN);
        return called.origin === expectedUrl.origin && called.pathname === expectedUrl.pathname
          && called.search === expectedUrl.search;
      } catch { return false; }
    });
    if (!form || compra !== (negociacao === "venda" ? "comprar" : "alugar") || !validCall) {
      throw falhar("Formulario ou finalidade da pagina divergente");
    }
  } finally { dom.window.close(); }
  return url;
}

function validarLink(value) {
  let url;
  try { url = new URL(value, ORIGIN); } catch { throw falhar(`Link de imovel invalido: ${value}`); }
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash
    || segments[0] !== "imovel" || segments.length < 3 || !segments[1] || !segments.at(-1)) {
    throw falhar(`Link fora da origem ou rota de imovel: ${url.href}`);
  }
  return { linkReal: url.href, codigoBase: decodeURIComponent(segments.at(-1)), path: segments[1] };
}

function resolverCidade(path, linkReal) {
  const matches = cidades.flatMap(cidade => {
    if (cidade.estado !== "RJ") return [];
    const keys = new Set([slug(cidade.nome), slugAcentuado(cidade.nome)]);
    return [...keys].filter(key => key.length > 2
      && (path.includes(`-${key}-`) || path.endsWith(`-${key}`)))
      .map(key => ({ cidade, key }));
  }).sort((a, b) => b.key.length - a.key.length);
  const longest = matches[0]?.key.length || 0;
  const best = new Map(matches.filter(match => match.key.length === longest)
    .map(match => [match.cidade.slug, match.cidade]));
  if (best.size !== 1) throw falhar(`Cidade ausente ou ambigua no link: ${linkReal}`);
  return [...best.values()][0];
}

function lerTotal(doc) {
  const counts = [...doc.querySelectorAll("script")].flatMap(script => {
    if (!script.textContent.includes("#quantos")) return [];
    return [...script.textContent.matchAll(/#quantos['"]\)\.html\(\s*['"]([\d.]+)['"]\s*\)/g)]
      .map(match => Number(match[1].replace(/\./g, "")));
  });
  if (counts.length !== 1 || !Number.isSafeInteger(counts[0]) || counts[0] < 0) {
    throw falhar("Contador de anuncios ausente ou invalido");
  }
  return counts[0];
}

function lerCard(element) {
  const links = [...element.querySelectorAll("a[href]")].map(anchor => validarLink(anchor.getAttribute("href")).linkReal);
  const uniqueLinks = [...new Set(links)];
  if (uniqueLinks.length !== 1) throw falhar("Card sem link unico");
  const locationElement = element.querySelector(".location");
  if (!locationElement) throw falhar(`Localizacao ausente: ${uniqueLinks[0]}`);
  const locationCopy = locationElement.cloneNode(true);
  for (const br of locationCopy.querySelectorAll("br")) br.replaceWith("\n");
  const location = locationCopy.textContent.split("\n").map(texto).filter(Boolean);
  const img = element.querySelector(".imagem-destaque img");
  const image = texto(img?.getAttribute("src") || img?.getAttribute("data-src"));
  const card = {
    linkReal: uniqueLinks[0],
    typeName: texto(element.querySelector(".tipo-imovel")?.textContent),
    business: normalizar(element.querySelector(".tipo-negocio")?.textContent),
    priceText: texto(element.querySelector(".preco")?.textContent),
    bairroNome: location[0] || "",
    endereco: location[1] || "",
    image,
    features: [...element.querySelectorAll(".box li")].map(item => texto(item.textContent)),
  };
  if (!card.typeName || !card.business || !card.bairroNome || !card.priceText) {
    throw falhar(`Card incompleto: ${uniqueLinks[0]}`);
  }
  return card;
}

export function parsePaginaRjardim(html, project, negociacao, page) {
  if (project?.collection !== "rioRJardim" || !["venda", "locacao"].includes(negociacao)
    || !Number.isSafeInteger(page) || page < 1) {
    throw falhar("Projeto, negociacao ou pagina invalidos");
  }
  urlBusca(project, negociacao);
  const dom = documento(html);
  try {
    const doc = dom.window.document;
    const total = lerTotal(doc);
    const active = [...doc.querySelectorAll(".paginacao a.ativo[data-p]")];
    const expectedCards = total === 0 ? 0 : Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE);
    const roots = [...doc.querySelectorAll('article[id="imoveis-destaques"]')];
    if (total > 0 && (active.length !== 1 || Number(active[0].getAttribute("data-p")) !== page)
      || roots.length !== expectedCards) {
      throw falhar(`Pagina, contador e cards divergentes na pagina ${page}: ${roots.length}/${expectedCards}`);
    }
    const cards = roots.map(lerCard);
    if (new Set(cards.map(card => card.linkReal)).size !== cards.length) {
      throw falhar(`Links repetidos na pagina ${page}`);
    }
    return { total, cards };
  } finally { dom.window.close(); }
}

function numero(value, field, linkReal) {
  const match = String(value ?? "").match(/\d[\d.,]*/);
  if (!match) return 0;
  const raw = match[0];
  const parsed = Number(raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d+\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw falhar(`${field} invalido: ${linkReal}`);
  return parsed;
}

function preco(value, linkReal) {
  const match = String(value ?? "").match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{1,2})?)/i);
  if (!match) throw falhar(`Preco ausente: ${linkReal}`);
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) throw falhar(`Preco invalido: ${linkReal}`);
  return parsed;
}

function metrica(features, pattern, linkReal) {
  return numero(features.find(value => pattern.test(value)), "Caracteristica", linkReal);
}

export function parseDetalheLocacaoRjardim(html, linkReal) {
  const expected = validarLink(linkReal).linkReal;
  const dom = documento(html);
  try {
    const doc = dom.window.document;
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
    const title = texto(doc.querySelector('meta[property="og:title"]')?.getAttribute("content"));
    const expectedTitle = /para alugar|para locacao/i.test(normalizar(title));
    const canonicalLink = canonical ? validarLink(canonical).linkReal : "";
    const labels = [...doc.querySelectorAll("#preco-mobile .row .col-5 p")].map(element => normalizar(element.textContent));
    const values = [...doc.querySelectorAll("#preco-mobile .row .col-7 p")].map(element => texto(element.textContent));
    const rentalIndex = labels.findIndex(label => label.startsWith("valor aluguel"));
    if (canonicalLink !== expected || !expectedTitle || rentalIndex < 0 || !values[rentalIndex]) {
      throw falhar(`Detalhe de aluguel ausente ou divergente: ${expected}`);
    }
    return { title, price: preco(values[rentalIndex], expected) };
  } finally { dom.window.close(); }
}

export async function mapearCardRjardim(card, project, negociacao, now = new Date()) {
  if (!card || project?.collection !== "rioRJardim" || !["venda", "locacao"].includes(negociacao)
    || !(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw falhar("Card, projeto, negociacao ou data invalidos");
  }
  const { linkReal, codigoBase, path } = validarLink(card.linkReal);
  const typeName = texto(card.typeName);
  const bairroNome = texto(card.bairroNome);
  const cidadeInfo = resolverCidade(path, linkReal);
  const tipoImovel = resolverTipoNiteroi(typeName);
  if (!tipoImovel || !bairroNome) throw falhar(`Tipo ou bairro ausente no catalogo: ${linkReal} (${typeName})`);
  const business = normalizar(card.business);
  let priceText = card.priceText;
  let title = "";
  if (negociacao === "venda") {
    if (business !== "venda") throw falhar(`Card fora da finalidade venda: ${linkReal}`);
  } else if (business === "aluguel") {
    if (path.includes("venda-para-alugar")) throw falhar(`Preco de aluguel nao confirmado no card: ${linkReal}`);
  } else if (business === "venda" && path.includes("venda-para-alugar")) {
    const html = await buscarHtml(linkReal, { headers: { Accept: "text/html" } }, `detalhe de aluguel ${codigoBase}`);
    const details = parseDetalheLocacaoRjardim(html, linkReal);
    priceText = `R$ ${details.price}`;
    title = details.title;
  } else {
    throw falhar(`Card fora da finalidade locacao: ${linkReal}`);
  }
  const features = card.features || [];
  const dormitorioValor = metrica(features, /quarto|dormit/i, linkReal);
  const banheiroValor = metrica(features, /banheiro/i, linkReal);
  const garagemValor = metrica(features, /vaga|garagem/i, linkReal);
  const areaValor = metrica(features, /m²|m2/i, linkReal);
  const cidade = cidadeInfo.slug;
  const bairro = resolverBairroCatalogo(bairroNome, cidade) || slug(bairroNome);
  const negocioTitulo = negociacao === "venda" ? "à venda" : "para alugar";
  title ||= `${typeName}${dormitorioValor ? ` ${dormitorioValor} quartos` : ""} ${negocioTitulo} ${bairroNome} - ${cidadeInfo.nome}`;
  const photo = texto(card.image);
  let linkFoto = "";
  if (photo) {
    let imageUrl;
    try { imageUrl = new URL(photo, ORIGIN); } catch { throw falhar(`Imagem invalida: ${linkReal}`); }
    if (!["http:", "https:"].includes(imageUrl.protocol)) throw falhar(`Imagem invalida: ${linkReal}`);
    linkFoto = imageUrl.href;
  }
  const timestamp = now.toISOString();
  return {
    linkReal, titulo: title, preco: preco(priceText, linkReal),
    localizacao: [card.endereco, bairroNome, `${cidadeInfo.nome} - ${cidadeInfo.estado}`].filter(Boolean).join(", "),
    tipoImovel, bairro, cidade,
    dormitorioValor, banheiroValor, ambienteValor: 0, areaValor,
    garagemValor, elevadorValor: 0, codigoBase, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "", linkFoto, atualizadoEm: timestamp,
  };
}

async function buscarPagina(project, negociacao, page, referer) {
  const compra = negociacao === "venda" ? "comprar" : "alugar";
  const body = new URLSearchParams({
    compra, localizacao: "", preco: "0,", "preco-min": "0", "preco-max": "",
    tipo: "", quartos: "", suites: "", banheiros: "", vaga: "", area: ",",
    "area-min": "", "area-max": "", condominio: "", filtros: "",
  }).toString();
  const url = new URL(`/ajax/busca/${page}`, ORIGIN).href;
  const html = await buscarHtml(url, {
    method: "POST",
    headers: {
      Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest", Referer: referer,
    },
    body,
  }, `pagina ${page}`);
  return parsePaginaRjardim(html, project, negociacao, page);
}

export async function contarRjardim(_browser, project, negociacao) {
  const referer = await validarBusca(project, negociacao);
  return (await buscarPagina(project, negociacao, 1, referer)).total;
}

export async function coletarRjardim(_browser, project, negociacao, {
  totalEsperado, primeiraPagina = false,
} = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || typeof primeiraPagina !== "boolean") {
    throw falhar("Total esperado ou modo de coleta invalido");
  }
  const referer = urlBusca(project, negociacao);
  const pages = primeiraPagina ? 1 : Math.max(1, Math.ceil(totalEsperado / PAGE_SIZE));
  const records = [];
  const links = new Set();
  for (let page = 1; page <= pages; page++) {
    const result = await buscarPagina(project, negociacao, page, referer);
    if (result.total !== totalEsperado) {
      throw falhar(`Total mudou na pagina ${page}: ${totalEsperado} -> ${result.total}`, "RJARDIM_TOTAL_ALTERADO");
    }
    for (const card of result.cards) {
      const record = await mapearCardRjardim(card, project, negociacao);
      if (links.has(record.linkReal)) throw falhar(`Link duplicado: ${record.linkReal}`);
      links.add(record.linkReal);
      records.push(record);
    }
    console.log(`[rioRJardim/${negociacao}] Pagina ${page}/${pages}: ${records.length}/${totalEsperado}.`);
  }
  if (!primeiraPagina && records.length !== totalEsperado) {
    throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
  }
  return records;
}
