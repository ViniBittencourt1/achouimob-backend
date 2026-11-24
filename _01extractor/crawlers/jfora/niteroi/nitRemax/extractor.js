import { load } from "cheerio";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoNiteroi } from "../tipoImovel.js";
import { createRemaxSearchBatches } from "../../remax/paginacao-api.js";
import { scrapeFranquias } from "../../remax/extractor-00-rotaInterna.js";
import { validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import { project } from "./config.js";
import fs from "node:fs";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalizarCidade = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const REMAX_SEARCH_ENDPOINT = "https://www.remax.com.br/search/listing-search/docs/search";

export function isNiteroiSearch(body, transactionType = 261) {
  const filter = body?.filter;
  return body?.count === true && body.skip === 0 && body.top === 24
    && typeof filter === "string" && !/\bor\b/i.test(filter)
    && /content\/CityID\s+eq\s+6580792\b/.test(filter)
    && /content\/ProvinceID\s+eq\s+9517\b/.test(filter)
    && [260, 261].includes(transactionType)
    && new RegExp(`content/TransactionTypeUID\\s+eq\\s+${transactionType}\\b`).test(filter);
}

export function isNiteroiSalesSearch(body) { return isNiteroiSearch(body); }

function number(value, field) {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) throw new Error(`[nitRemax] ${field} invalido: ${value}`);
  return parsed;
}

export function parseRemaxRecord(record, now = new Date(), projeto = project) {
  const project = projeto;
  const prefixo = `[${project.collection}]`;
  const finalidade = project.transactionType === 260 ? "alugar" : "venda";
  const data = record?.content;
  const buscaEstadual = project.cityId === undefined && project.provinceId === 9517 && project.collection === "rioRemax";
  if (!data || (!buscaEstadual && data.CityID !== project.cityId) || data.ProvinceID !== project.provinceId || data.TransactionTypeUID !== project.transactionType) {
    throw new Error(`${prefixo} Anuncio fora da localidade ou de ${project.transactionType === 260 ? "locacao" : "vendas"}; base preservada.`);
  }
  if (data.OnHoldListing !== false || data.IsViewable !== true) throw new Error("[nitRemax] Anuncio indisponivel; base preservada.");
  const codigoBase = data.MLSID;
  const shortLink = data.ShortLinks?.find(item => item.LanguageCode === "pt-BR")?.ShortLink;
  if (typeof codigoBase !== "string" || !/^\d+-\d+$/.test(codigoBase) || typeof shortLink !== "string") throw new Error(`${prefixo} Codigo ou link ausente: chave ${data.ListingKey}, codigo ${codigoBase}, link ${shortLink}.`);
  const link = new URL(shortLink, project.url);
  const match = link.pathname.match(new RegExp(`^/pt-br/imoveis/([^/]+(?:/[^/]+)*)/${finalidade}/([^/]+)/(?:[^/]+/)?(\\d+-\\d+)/?$`));
  const cidadeNome = buscaEstadual ? String(data.City || "").trim() : "Niterói";
  const cidadesCorrespondentes = new Set(cidades.filter(item => item.estado === "RJ" && normalizarCidade(item.nome) === normalizarCidade(cidadeNome)).map(item => item.slug));
  const cidade = buscaEstadual ? (cidadesCorrespondentes.size === 1 ? [...cidadesCorrespondentes][0] : cidadeNome) : "niteroi-rj";
  if (!cidadeNome || link.origin !== new URL(project.url).origin || !match || match[3] !== codigoBase
    || normalizarCidade(decodeURIComponent(match[2])) !== normalizarCidade(cidadeNome) || link.search || link.hash) {
    throw new Error(`${prefixo} Link ou cidade incompativel com ${project.transactionType === 260 ? "locacao" : "vendas"}: ${link.href}; cidade: ${cidadeNome}; codigo: ${codigoBase}.`);
  }
  const linkReal = link.href;
  const tipoExtraido = decodeURIComponent(match[1]).replace(/[-/]+/g, " ").trim();
  const tipoImovel = resolverTipoNiteroi(tipoExtraido);
  if (!tipoImovel) console.warn(`${prefixo} Tipo sem correspondencia unica: "${tipoExtraido}" (${linkReal})`);
  const bairroExtraido = String(data.LocalZone || data.District || "").trim();
  const bairro = resolverBairroNiteroi(bairroExtraido, cidade);
  if (!bairro) console.warn(`${prefixo} Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade}; ${linkReal})`);
  const description = data.ListingDescriptions?.find(item => item.LanguageCode === "pt-BR" && String(item.DescriptionTypeUID) === "1113")?.Description;
  const titulo = description ? load(description).text().replace(/\s+/g, " ").trim() : `${tipoExtraido} ${finalidade === "alugar" ? "para alugar" : "a venda"} em ${bairroExtraido || "Niteroi"}`;
  const localizacao = String(data.FullAddress || "").trim();
  if (!localizacao) throw new Error(`[nitRemax] Localizacao ausente: ${linkReal}`);
  if (data.HidePricePublic !== true && (data.ListingPrice === null || data.ListingPrice === undefined || data.ListingCurrency !== "BRL")) {
    throw new Error(`[nitRemax] Preco ou moeda ausente: ${linkReal}`);
  }
  const preco = data.HidePricePublic === true ? null : number(data.ListingPrice, "preco");
  const images = [...(data.ListingImages || [])].sort((a, b) => Number(a.Order) - Number(b.Order));
  const image = images[0]?.FileName;
  if (image && (!/^[\w.-]+$/.test(image) || !Number.isSafeInteger(data.RegionId))) throw new Error(`[nitRemax] Foto invalida: ${linkReal}`);
  const timestamp = now.toISOString();
  const elevadorTexto = typeof data.CommElevators === "string" ? normalizarCidade(data.CommElevators) : "";
  const semElevador = elevadorTexto === "nao";
  const elevadorInformado = buscaEstadual && elevadorTexto === "sim";
  if (elevadorInformado) console.warn(`[rioRemax] Elevador informado como "Sim", quantidade nao especificada: ${linkReal}`);
  return {
    linkReal, titulo, preco, localizacao, tipoImovel: tipoImovel || tipoExtraido,
    bairro: bairro || bairroExtraido, cidade,
    dormitorioValor: number(data.NumberOfBedrooms, "quartos"),
    banheiroValor: number(data.NumberOfBathrooms, "banheiros"),
    ambienteValor: number(data.TotalNumberOfLivingRooms, "salas") || number(data.TotalNumOfRooms, "ambientes"),
    areaValor: number(data.LivingArea, "area util") || number(data.TotalArea, "area total") || number(data.LotSize2, "area lote"),
    garagemValor: number(data.ParkingSpaces, "vagas") || number(data.NumberOfGarages, "garagens"),
    elevadorValor: semElevador ? 0 : elevadorInformado ? 1 : number(data.CommElevators, "elevadores"),
    codigoBase, linkCard: linkReal, corretor: "",
    dataInclusao: timestamp, dataExclusao: "",
    linkFoto: image ? `https://cdn.gryphtech.com/userimages/${data.RegionId}/LargeWM/${image}` : "",
    atualizadoEm: timestamp,
  };
}

export async function requestRemaxSearch(body) {
  const response = await fetch(REMAX_SEARCH_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`[nitRemax] API HTTP ${response.status}; base preservada.`);
  return response.json();
}

export async function extractNiteroiRemax(browser, {
  totalEsperado, somentePrimeiraPagina = false, existingDataMap = new Map(), projeto = project,
} = {}) {
  const project = projeto;
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error("[nitRemax] Precontagem obrigatoria.");
  const page = await browser.newPage();
  let body;
  try {
    const listing = page.waitForRequest(request => {
      if (request.url() !== REMAX_SEARCH_ENDPOINT || request.method() !== "POST") return false;
      try { return isNiteroiSearch(JSON.parse(request.postData()), project.transactionType); } catch { return false; }
    }, { timeout: 60000 });
    listing.catch(() => {});
    const response = await page.goto(project.url, { waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[nitRemax] HTTP ${response?.status()} na busca; base preservada.`);
    if (project.transactionType === 261) validarUrlContagemVendas(project, page.url());
    else validarBuscaLocacaoRemax(project, page.url());
    body = JSON.parse((await listing).postData());
  } finally { await page.close(); }
  const read = createRemaxSearchBatches(requestRemaxSearch, { cityId: project.cityId, transactionType: project.transactionType });
  const records = [];
  const links = new Set();
  const pages = Math.max(1, Math.ceil(totalEsperado / body.top));
  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    const data = await read({ ...body, skip: (pageNumber - 1) * body.top });
    const expected = Math.min(body.top, Math.max(0, totalEsperado - records.length));
    if (data["@odata.count"] !== totalEsperado || data.value.length !== expected) throw new Error("[nitRemax] Total alterado ou lote incompleto; base preservada.");
    for (const raw of data.value) {
      const item = parseRemaxRecord(raw, new Date(), project);
      if (project.transactionType === 260) {
        item.dataInclusao = existingDataMap.get(item.linkReal)?.dataInclusao || item.dataInclusao;
        item.corretor = project.displayName;
      }
      if (links.has(item.linkReal)) throw new Error("[nitRemax] Link repetido; base preservada.");
      links.add(item.linkReal);
      records.push(item);
    }
    console.log(`[nitRemax] Lote ${pageNumber}/${pages}: ${records.length}/${totalEsperado} imoveis unicos (${(totalEsperado ? records.length / totalEsperado * 100 : 100).toFixed(1)}%).`);
    if (somentePrimeiraPagina) break;
  }
  if (!somentePrimeiraPagina && records.length !== totalEsperado) throw new Error("[nitRemax] Coleta incompleta; base preservada.");
  if (project.transactionType === 260) return records;
  const cached = new Map([...existingDataMap].filter(([, item]) => item.corretor && /^Remax\s+\S/i.test(item.corretor)));
  await scrapeFranquias(browser, records, cached);
  if (records.some(item => !item.corretor)) throw new Error("[nitRemax] Franquia ausente; base preservada.");
  return records;
}

export function validarBuscaLocacaoRemax(project, destination = project.url) {
  const url = new URL(destination);
  if (url.origin !== "https://www.remax.com.br" || url.pathname !== "/listings"
    || url.searchParams.get("TransactionTypeUID") !== "260"
    || url.searchParams.get("City") !== "6580792" || url.searchParams.get("Province") !== "9517") {
    throw new Error("[nitRemax] Busca fora da locacao de Niteroi; base preservada.");
  }
}

export async function extractNiteroiRemaxSales(browser, options = {}) {
  return extractNiteroiRemax(browser, { ...options, projeto: project });
}
