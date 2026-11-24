import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { coletarPaginasKenloVendas } from "../_utils/vendasKenloPaginacao.js";
import { extrairCandidatoBairroDoTitulo, resolverBairroDoTitulo } from "./nitAmin/bairroTitulo.js";
import { resolverTipoNiteroi, resolverTipoNiteroiDoLink } from "./tipoImovel.js";
import { resolverBairroNiteroi, resolverBairroNiteroiDoLink } from "./bairro.js";

const cidadesPath = fileURLToPath(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url));
const cidades = JSON.parse(fs.readFileSync(cidadesPath, "utf8"));
const cidadesPorNome = new Map(cidades.map(({ nome, slug }) => [normalizar(nome), slug]));

// A Nova usa o WAF GoCache, que bloqueia o IP (HTTP 429) quando a paginacao e rapida demais.
const INTERVALO_ENTRE_PAGINAS_MS = { nitNova: 4000 };

function normalizar(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function numeroDoTexto(value) {
  const match = String(value ?? "").match(/\d[\d.]*/);
  if (!match) return 0;
  // Ranges in launch listings use a decimal point ("123.35 a 365.16 m²"); otherwise the dot is a thousands separator.
  if (/^\d+\.\d{1,2}$/.test(match[0])) return Math.round(Number(match[0]));
  return Number(match[0].replace(/\./g, ""));
}

function precoDoTexto(value) {
  const match = String(value ?? "").match(/\d+(?:\.\d{3})*(?:,\d{1,2})?/);
  return match ? Number(match[0].replace(/\./g, "").replace(",", ".")) : null;
}

export function readSnapshotNiteroi() {
  const cards = new Map();
  const roots = [
    ...document.querySelectorAll('a.card-with-buttons[href*="/imovel/"], a.card_split_vertically[href*="/imovel/"], a.card-with-buttons[href*="/empreendimento/"], a.card_split_vertically[href*="/empreendimento/"]'),
    ...document.querySelectorAll('.card.card-listing'),
  ];
  for (const root of roots) {
    const linkSelector = 'a[href*="/imovel/"], a[href*="/empreendimento/"]';
    const anchor = root.matches(linkSelector) ? root : root.querySelector(linkSelector);
    if (!anchor) continue;
    const url = new URL(anchor.href);
    url.search = "";
    url.hash = "";
    cards.set(url.href, { href: url.href, html: root.outerHTML });
  }
  const next = Array.from(document.querySelectorAll('a.btn-next[href]')).find(anchor =>
    /ver\s+mais/i.test(anchor.textContent) &&
    !anchor.getAttribute("data-action") &&
    anchor.getAttribute("aria-disabled") !== "true"
  );
  return {
    heading: document.querySelector("h1")?.textContent || "",
    text: document.body.innerText || "",
    cards: [...cards.values()],
    next: next?.href || "",
  };
}

export function parseNiteroiCard(cardHtml, { baseUrl, displayName, projectName, now = new Date() }) {
  const dom = new JSDOM(cardHtml);
  try {
  const document = dom.window.document;
  const anchor = document.querySelector('a[href*="/imovel/"], a[href*="/empreendimento/"]');
  if (!anchor) throw new Error(`[${displayName}] Card sem link.`);

  const linkReal = new URL(anchor.getAttribute("href"), baseUrl).href;
  const legacyTitle = document.querySelector("h3.card-text")?.textContent.trim() || "";
  const tipoExtraido = document.querySelector(".card-with-buttons__title, .card_split_vertically__type")?.textContent.trim()
    || legacyTitle.split(/\s+em\s+/i)[0]
    || "";
  const localizacao = document.querySelector(".card-with-buttons__heading, .card_split_vertically__location, h2.card-title")?.textContent.trim() || "";
  const empreendimento = new URL(linkReal).pathname.startsWith("/empreendimento/");
  const partesLocalizacao = localizacao.split(/\s+-\s+/).map(value => value.trim()).filter(Boolean);
  let bairro = empreendimento ? "" : partesLocalizacao[0] || "";
  const image = document.querySelector("img.cards_digital_carousel-image, img.card-img-top, .card-carousel img");
  const cidadeDaImagem = (image?.getAttribute("alt") || "").split(",").pop().replace(/\s+-\s+[A-Z]{2}\s*$/, "").trim();
  const cidadeNome = empreendimento
    ? cidadeDaImagem
    : partesLocalizacao[1] || legacyTitle.split(/\s+em\s+/i)[1] || "";
  const cidade = cidadesPorNome.get(normalizar(cidadeNome)) || normalizar(cidadeNome).replace(/\s+/g, "-");
  const caracteristicas = Array.from(document.querySelectorAll("ul li, div.values div.value p, div.value p"), element => element.textContent.trim());
  const encontrar = pattern => numeroDoTexto(caracteristicas.find(value => pattern.test(value)));
  const timestamp = now.toISOString();
  const titulo = [tipoExtraido, localizacao && `em ${localizacao}`].filter(Boolean).join(" ");
  const slugTipo = resolverTipoNiteroi(tipoExtraido)
    || (projectName === "nitNova" ? resolverTipoNiteroiDoLink(linkReal) : "");
  if (!slugTipo && (tipoExtraido || projectName === "nitNova")) {
    console.warn(`[${projectName || displayName}] Tipo sem correspondencia unica no catalogo: "${tipoExtraido}" (${linkReal})`);
  }
  let tipoImovel = slugTipo || tipoExtraido;
  if (["nitAmin", "nitKiffer"].includes(projectName) && !tipoImovel.trim()) {
    tipoImovel = resolverTipoNiteroiDoLink(linkReal);
  }
  if (["nitAmin", "nitKiffer"].includes(projectName) && !bairro.trim()) {
    bairro = resolverBairroDoTitulo(titulo, cidade) || extrairCandidatoBairroDoTitulo(titulo);
  }
  if (["nitImob2000", "nitLopes", "nitFlora", "nitNova"].includes(projectName)) {
    const slugBairro = resolverBairroNiteroi(bairro, cidade)
      || (projectName === "nitNova" ? resolverBairroNiteroiDoLink(linkReal, cidade) : "");
    if (!slugBairro && (bairro.trim() || projectName === "nitNova")) {
      console.warn(`[${projectName}] Bairro sem correspondencia unica no catalogo: "${bairro}" (${cidade}; ${linkReal})`);
    }
    bairro = slugBairro || bairro;
  }

  return {
    linkReal,
    titulo,
    preco: precoDoTexto(document.querySelector(".card-with-buttons__value, .card_split_vertically__value, span.h-money.location")?.textContent),
    localizacao,
    tipoImovel,
    bairro,
    cidade,
    dormitorioValor: encontrar(/quarto|dormit/i),
    banheiroValor: encontrar(/banheiro/i) || encontrar(/suite/i),
    ambienteValor: 0,
    areaValor: encontrar(/m²|m2/i),
    garagemValor: encontrar(/vaga|garagem/i),
    elevadorValor: 0,
    codigoBase: document.querySelector(".card-with-buttons__code, .card_split_vertically__code, small.reference")?.textContent.trim() || "",
    linkCard: linkReal,
    corretor: displayName,
    dataInclusao: timestamp,
    dataExclusao: "",
    linkFoto: image?.getAttribute("src") || image?.getAttribute("data-fallback") || "",
    atualizadoEm: timestamp,
  };
  } finally { dom.window.close(); }
}

export function buildNiteroiSalesLinks(projectName, baseUrl) {
  if (!["nitKiffer", "nitAmin", "nitLopes", "nitNova"].includes(projectName)) return [baseUrl];

  const priceRanges = [
    "0~500000",
    "500001~1000000",
    projectName === "nitLopes" ? "1000001~" : "1000001~100000000",
  ];
  return priceRanges.map(priceRange => {
    const url = new URL(baseUrl);
    url.searchParams.set("preco-de-venda", priceRange);
    return url.href.replace(/%7e/gi, "~");
  });
}

export async function extractNiteroiSales(browser, { projectName, displayName, baseUrl, totalEsperado }) {
  if (projectName === "nitPredial") {
    const { coletarVendas } = await import("./predial.js");
    return coletarVendas(browser, { collection: projectName, url: baseUrl }, { totalEsperado });
  }
  const links = buildNiteroiSalesLinks(projectName, baseUrl);
  const porFaixaDePreco = links.length > 1;
  if (links.length > 1) console.log(`[${projectName}] Coleta dividida em ${links.length} faixas de preco.`);
  const cards = await coletarPaginasKenloVendas(browser, links, {
    projeto: projectName,
    readSnapshot: readSnapshotNiteroi,
    cardSelector: 'a.card-with-buttons[href*="/imovel/"], a.card_split_vertically[href*="/imovel/"], a.card-with-buttons[href*="/empreendimento/"], a.card_split_vertically[href*="/empreendimento/"], .card.card-listing a[href*="/imovel/"]',
    totalEsperado,
    // Na Flora, a ordenacao explicita pode servir catalogos divergentes entre paginas.
    ordenacaoInicial: projectName === "nitFlora" ? null : "recentes",
    maxTentativas: 2,
    maxTentativasPagina: 5,
    retryDelayMs: 3000,
    allowPartialRoutes: porFaixaDePreco,
    ordenacoesAlternativas: porFaixaDePreco ? ["maior-valor", "menor-valor"] : [],
    esperaBloqueioMs: 60000,
    intervaloEntrePaginasMs: INTERVALO_ENTRE_PAGINAS_MS[projectName] ?? 0,
    recargasTotalDivergente: projectName === "nitNova" ? 4 : projectName === "nitFlora" ? 2 : 0,
    esperaTotalDivergenteMs: projectName === "nitNova" ? 15000 : 0,
  });

  return cards.map(card => parseNiteroiCard(card, { baseUrl, displayName, projectName }));
}
