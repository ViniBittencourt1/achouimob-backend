import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoCatalogo } from "../../_1Jf/tipos-alugueis.js";
import { createRemaxSearchBatches } from "../../remax/paginacao-api.js";
import { aguardarBuscaLocacaoRemax } from "../../remax/busca-locacao.js";
import { REMAX_SEARCH_ENDPOINT, requestRemaxSearch } from "../../niteroi/nitRemax/extractor.js";

const origin = "https://www.remax.com.br";
const cityId = 6579726;
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
const fail = message => { throw new Error(`[ubaRemax] ${message}; dados preservados.`); };
const campos = [
  "ListingKey", "MLSID", "CityID", "ProvinceID", "City", "Province", "TransactionTypeUID",
  "OnHoldListing", "IsViewable", "IsRegionalOffice", "ShortLinks", "ListingDescriptions",
  "FullAddress", "LocalZone", "HidePricePublic", "ListingPrice", "ListingCurrency",
  "NumberOfBedrooms", "NumberOfBathrooms", "TotalNumberOfLivingRooms", "TotalNumOfRooms",
  "LivingArea", "TotalArea", "LotSize2", "ParkingSpaces", "NumberOfGarages",
  "CommElevators", "ListingImages", "RegionId",
].map(key => `content/${key}`).join(",");

function transacao(negociacao) {
  if (negociacao === "venda") return 261;
  if (negociacao === "locacao") return 260;
  return fail("Negociacao invalida");
}

export function validarUrlRemaxUba(value, negociacao) {
  const url = new URL(value);
  const expected = {
    City: String(cityId), Province: "9512", CountryId: "55", ListingClass: "-1",
    TransactionTypeUID: String(transacao(negociacao)),
  };
  if (url.origin !== origin || url.pathname !== "/listings" || url.hash ||
      Object.entries(expected).some(([key, val]) => url.searchParams.get(key) !== val) ||
      [...url.searchParams.keys()].some(key => ![...Object.keys(expected), "Country", "CityNM", "ProvinceNM"].includes(key)) ||
      [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) fail(`Busca fora de Uba ou finalidade: ${url.href}`);
  return url;
}

export function isBuscaRemaxUba(body, negociacao) {
  const atoms = [
    "content/TenantId eq 6", "content/MacroRegionId eq 55", "content/OnHoldListing eq false",
    "content/IsRegionalOffice eq false", "content/IsViewable eq true",
    "content/ProvinceID eq 9512", `content/CityID eq ${cityId}`,
    `content/TransactionTypeUID eq ${transacao(negociacao)}`,
  ];
  const parts = typeof body?.filter === "string" ? body.filter.split(/\s+and\s+/).map(compact) : [];
  return body?.count === true && body.skip === 0 && body.top === 24 && body.search === "*" &&
    atoms.every(atom => parts.includes(atom)) && parts.every(atom => atoms.includes(atom));
}

function numero(value, field, inteiro = false) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      value > Number.MAX_SAFE_INTEGER || (inteiro && !Number.isSafeInteger(value))) fail(`${field} invalido: ${value}`);
  return value;
}

export function parseRemaxUba(record, negociacao, now = new Date().toISOString()) {
  const c = record?.content;
  if (!c || c.CityID !== cityId || c.ProvinceID !== 9512 || c.TransactionTypeUID !== transacao(negociacao) ||
      c.OnHoldListing !== false || c.IsViewable !== true || c.IsRegionalOffice !== false ||
      typeof c.ListingKey !== "string" || !c.ListingKey || c.ListingKey.includes("|") ||
      !/^\d+-\d+$/.test(c.MLSID ?? "")) fail("Registro fora da cidade, finalidade ou identidade");
  const links = c.ShortLinks?.filter(link => link.LanguageCode === "pt-BR") ?? [];
  if (links.length !== 1 || typeof links[0].ShortLink !== "string") fail(`Link publico ausente: ${c.MLSID}`);
  const url = new URL(links[0].ShortLink, origin);
  const path = url.pathname.split("/").filter(Boolean);
  const idx = path.indexOf(negociacao === "locacao" ? "alugar" : "venda", 3);
  if (url.origin !== origin || path[0] !== "pt-br" || path[1] !== "imoveis" ||
      idx < 3 || idx > 4 || path[idx + 1] !== "uba" || path.at(-1) !== c.MLSID ||
      ![idx + 3, idx + 4].includes(path.length) || url.hash || url.search) fail(`Link fora de Uba ou finalidade: ${c.MLSID}`);
  const tipoFonte = decodeURIComponent(path.slice(2, idx).join(" ")).replace(/-/g, " ");
  const tipoImovel = resolverTipoCatalogo(tipoFonte);
  if (!tipoImovel) console.warn(`[ubaRemax] ${c.MLSID}: tipo fora do catalogo "${tipoFonte}"; campo vazio.`);
  const descriptions = c.ListingDescriptions?.filter(d => d.LanguageCode === "pt-BR" &&
    String(d.DescriptionTypeUID) === "1113") ?? [];
  if (descriptions.length !== 1) fail(`Titulo ausente ou ambiguo: ${c.MLSID}`);
  const titulo = compact(load(descriptions[0].Description).text());
  if (!titulo || !compact(c.FullAddress)) fail(`Titulo ou localizacao ausente: ${c.MLSID}`);
  if (c.HidePricePublic !== true && c.HidePricePublic !== false) fail(`Indicador de preco ausente: ${c.MLSID}`);
  let preco = 0;
  if (c.HidePricePublic || c.ListingPrice === null || c.ListingPrice === undefined) {
    console.warn(`[ubaRemax] ${c.MLSID}: preco ausente ou oculto; valor zero.`);
  } else {
    if (c.ListingCurrency !== "BRL") fail(`Moeda invalida: ${c.MLSID}`);
    preco = numero(c.ListingPrice, "preco");
  }
  const cityMatches = new Set(cidades.filter(city => normalizarBairro(city.nome) === normalizarBairro(c.City) &&
    city.estado === "MG" && normalizarBairro(c.Province) === "minas gerais").map(city => city.slug));
  const cidade = cityMatches.size === 1 ? cityMatches.values().next().value : "";
  if (!cidade) console.warn(`[ubaRemax] ${c.MLSID}: cidade sem correspondencia unica "${c.City}/${c.Province}"; campo vazio.`);
  const areas = [
    numero(c.LivingArea, "area util"), numero(c.TotalArea, "area total"), numero(c.LotSize2, "area lote"),
  ];
  const areaValor = areas.find(value => value > 0) ?? (areas.includes(0) ? 0 : null);
  if (c.MLSID === "860511003-15" && areaValor === 2582740000) {
    console.warn("[ubaRemax] 860511003-15: area 2582740000 m2 preservada conforme site e confirmacao; revisar cadastro.");
  }
  const images = [...(c.ListingImages ?? [])].sort((a, b) => Number(a.Order) - Number(b.Order));
  const image = images[0]?.FileName;
  if (image && (!/^[\w.-]+$/.test(image) || !Number.isSafeInteger(c.RegionId) || c.RegionId < 1)) fail(`Foto invalida: ${c.MLSID}`);
  return {
    linkReal: url.href, titulo, preco, localizacao: compact(c.FullAddress), tipoImovel,
    bairro: normalizarBairro(c.LocalZone).replace(/ /g, "-"), cidade,
    dormitorioValor: numero(c.NumberOfBedrooms, "quartos", true),
    banheiroValor: numero(c.NumberOfBathrooms, "banheiros", true),
    ambienteValor: numero(c.TotalNumberOfLivingRooms, "salas", true) ?? numero(c.TotalNumOfRooms, "ambientes", true),
    areaValor, garagemValor: numero(c.ParkingSpaces, "vagas", true) ?? numero(c.NumberOfGarages, "garagens", true),
    elevadorValor: numero(c.CommElevators, "elevadores", true),
    codigoBase: c.MLSID, linkCard: url.href, corretor: "RE/MAX",
    dataInclusao: now, dataExclusao: "", linkFoto: image ? `https://cdn.gryphtech.com/userimages/${c.RegionId}/LargeWM/${image}` : "",
    atualizadoEm: now,
  };
}

export async function coletarRemaxUba(browser, project, negociacao, {
  anteriores = new Map(), onCount = async () => {}, requestSearch = requestRemaxSearch,
} = {}) {
  const base = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlRemaxUba(base, negociacao);
  const page = await browser.newPage();
  try {
    const pending = page.waitForRequest(request => {
      if (request.url() !== REMAX_SEARCH_ENDPOINT || request.method() !== "POST") return false;
      const body = request.postData();
      if (!body?.trim().startsWith("{")) return false;
      return isBuscaRemaxUba(JSON.parse(body), negociacao);
    }, { timeout: 90000 });
    pending.catch(() => {});
    const response = await page.goto(base, { waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) fail(`HTTP ${response?.status()} na busca`);
    if (negociacao === "locacao") await aguardarBuscaLocacaoRemax(page, base);
    const body = { ...JSON.parse((await pending).postData()), select: campos };
    const read = async () => {
      const batches = createRemaxSearchBatches(requestSearch, { cityId, transactionType: transacao(negociacao) });
      const items = [];
      let total;
      for (let pg = 0; pg < Math.max(1, Math.ceil((total ?? 0) / body.top)); pg++) {
        const result = await batches({ ...body, skip: pg * body.top });
        if (total === undefined) total = result["@odata.count"];
        if (result["@odata.count"] !== total || result.value.length !== Math.min(body.top, total - items.length)) fail("Lote incompleto ou total mudou");
        items.push(...result.value);
      }
      const parsed = items.map(record => parseRemaxUba(record, negociacao));
      if (new Set(parsed.map(item => item.linkReal)).size !== total ||
          new Set(parsed.map(item => item.codigoBase)).size !== total) fail("Links ou codigos repetidos");
      return { total, items, parsed };
    };
    const first = await read();
    await page.waitForFunction(total => {
      const cards = document.querySelectorAll(".listing-card");
      if (total === 0) return cards.length === 0 &&
        Array.from(document.querySelectorAll("h5")).some(e => e.textContent.trim() === "Desculpe, nenhum imóvel corresponde aos seus critérios de pesquisa.");
      return cards.length === Math.min(total, 24) && Array.from(document.querySelectorAll("p")).some(e => {
        const match = e.textContent.match(/^(\d[\d.]*)\s+N[uú]mero total de correspond[eê]ncias/i);
        return match && Number(match[1].replace(/\./g, "")) === total;
      });
    }, { timeout: 60000 }, first.total);
    const visible = await page.$$eval(".listing-card", cards => cards.map(card => card.querySelector("a")?.href));
    const links = new Set(first.parsed.map(item => item.linkReal));
    if (new Set(visible).size !== visible.length || visible.some(link => !links.has(link))) fail("Pagina diverge da API filtrada");
    const final = await read();
    const signature = data => JSON.stringify(data.parsed.map(({ dataInclusao, atualizadoEm, ...item }) => item)
      .sort((a, b) => a.codigoBase.localeCompare(b.codigoBase)));
    if (first.total !== final.total || signature(first) !== signature(final)) fail("Dados mudaram entre leituras");
    // RE/MAX rewrites the transaction in the URL; the intercepted API request is validated instead.
    for (const item of first.parsed) {
      const old = anteriores.get(item.linkReal);
      if (old?.dataInclusao) item.dataInclusao = old.dataInclusao;
    }
    await onCount(first.total);
    console.log(`[ubaRemax] ${negociacao}: ${first.parsed.length}/${first.total} validados na API e pagina oficial.`);
    return { imoveis: first.parsed, totalEsperado: first.total, vazioConfirmado: first.total === 0 };
  } finally { await page.close(); }
}
