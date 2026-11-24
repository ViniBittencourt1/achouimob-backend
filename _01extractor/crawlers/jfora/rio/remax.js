import { createRemaxSearchBatches } from "../remax/paginacao-api.js";
import { parseRemaxRecord, requestRemaxSearch } from "../niteroi/nitRemax/extractor.js";
import { abrirBrowser } from "../../../services/puppeteerPool.js";

const falhar = message => new Error(`[rioRemax] ${message}; dados anteriores preservados.`);
const tamanhoLote = 100;
const slug = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function recuperarLink(raw, body, request, browserFactory) {
  const data = raw.content;
  if (!data || !Number.isSafeInteger(data.PropertyTypeUID) || !/^\d+-\d+$/.test(data.MLSID || "") || !slug(data.City)) {
    throw falhar(`Nao foi possivel recuperar link do anuncio ${data?.ListingKey ?? "(sem chave)"}`);
  }
  const exemplos = await request({ ...body, top: 20, filter: `${body.filter} and content/PropertyTypeUID eq ${data.PropertyTypeUID}` });
  if (!Array.isArray(exemplos?.value)) throw falhar("Resposta invalida ao recuperar tipo do anuncio");
  const finalidade = data.TransactionTypeUID === 260 ? "alugar" : "venda";
  const pattern = new RegExp(`^pt-br/imoveis/(.+)/${finalidade}/[^/]+/(?:[^/]+/)?\\d+-\\d+/?$`);
  const tipos = new Set(exemplos.value.flatMap(item => (item.content?.ShortLinks || [])
    .filter(link => link.LanguageCode === "pt-BR")
    .map(link => typeof link.ShortLink === "string" ? link.ShortLink.match(pattern)?.[1] : null)
    .filter(Boolean)));
  if (tipos.size !== 1) throw falhar(`Tipo ambiguo ao recuperar link do anuncio ${data.ListingKey}`);
  const link = `https://www.remax.com.br/pt-br/imoveis/${[...tipos][0]}/${finalidade}/${slug(data.City)}/${data.MLSID}`;
  const browser = await browserFactory({ headlessOverride: true });
  try {
    const page = await browser.newPage();
    const response = await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!response?.ok() || new URL(page.url()).origin !== "https://www.remax.com.br") throw falhar(`Pagina de anuncio inacessivel: ${link}`);
    await page.waitForFunction(code => new RegExp(`(?:^|\\D)${code}(?!\\d)`).test(document.title) && document.title.includes("RE/MAX"), { timeout: 45000 }, data.MLSID);
  } finally { await browser.close(); }
  console.warn(`[rioRemax] Link ausente na API recuperado e confirmado na pagina: ${link}`);
  return { ...raw, content: { ...data, ShortLinks: [...(data.ShortLinks || []), { LanguageCode: "pt-BR", ShortLink: link }] } };
}

export function buscaRemaxRio(project, negociacao) {
  if (project?.collection !== "rioRemax" || project.kind !== "remax" || !["venda", "locacao"].includes(negociacao)) {
    throw falhar("Projeto ou negociacao invalida");
  }
  const url = new URL(negociacao === "venda" ? project.urlVendas : project.urlLocacao);
  const transactionType = negociacao === "venda" ? 261 : 260;
  const parametros = { Country: "Brasil", CountryId: "55", Province: "9517", ListingClass: "-1", TransactionTypeUID: String(transactionType) };
  if (url.origin !== "https://www.remax.com.br" || url.pathname !== "/listings"
    || url.hash || [...url.searchParams.keys()].some(key => /^city/i.test(key))
    || Object.entries(parametros).some(([key, value]) => url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value)) throw falhar("Rota inesperada");
  const filter = `content/TenantId eq 6 and content/MacroRegionId eq 55 and content/OnHoldListing eq false and content/IsRegionalOffice eq false and content/IsViewable eq true and content/ProvinceID eq 9517 and content/TransactionTypeUID eq ${transactionType}`;
  const body = {
    count: true, skip: 0, top: tamanhoLote, searchMode: "any", queryType: "full",
    scoringProfile: "", searchFields: "*", search: "*", filter, minimumCoverage: 0,
    orderby: "content/LastUpdatedOnWeb desc",
  };
  return { body, transactionType, url: url.href };
}

export async function contarRemaxRio(_browser, project, negociacao, { request = requestRemaxSearch } = {}) {
  const { body } = buscaRemaxRio(project, negociacao);
  const data = await request({ ...body, top: 1 });
  const total = data?.["@odata.count"];
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(data.value)
    || data.value.length !== Math.min(total, 1)) throw falhar("Contagem invalida");
  return total;
}

export async function coletarRemaxRio(_browser, project, negociacao, { totalEsperado, primeiraPagina = false }, { request = requestRemaxSearch, browserFactory = abrirBrowser } = {}) {
  const { body, transactionType, url } = buscaRemaxRio(project, negociacao);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem invalida");
  const read = createRemaxSearchBatches(request, { cityId: null, provinceId: 9517, transactionType });
  const records = [];
  const links = new Set();
  const paginas = primeiraPagina ? 1 : Math.max(1, Math.ceil(totalEsperado / tamanhoLote));
  const now = new Date();
  for (let pagina = 0; pagina < paginas; pagina++) {
    const data = await read({ ...body, skip: pagina * tamanhoLote });
    const expected = Math.min(tamanhoLote, Math.max(0, totalEsperado - records.length));
    if (data["@odata.count"] !== totalEsperado || data.value.length !== expected) throw falhar("Total alterado ou lote incompleto");
    for (const raw of data.value) {
      const registro = raw.content?.ShortLinks?.some(link => link.LanguageCode === "pt-BR" && typeof link.ShortLink === "string")
        ? raw : await recuperarLink(raw, body, request, browserFactory);
      const item = parseRemaxRecord(registro, now, { ...project, url, provinceId: 9517, transactionType });
      if (!item.bairro || !item.cidade) throw falhar(`Bairro ou cidade ausente: ${item.linkReal}`);
      if (links.has(item.linkReal)) throw falhar(`Link repetido: ${item.linkReal}`);
      links.add(item.linkReal);
      item.corretor = project.displayName;
      records.push(item);
    }
    console.log(`[rioRemax] Lote ${pagina + 1}/${paginas}: ${records.length}/${totalEsperado} imoveis.`);
  }
  if (!primeiraPagina && records.length !== totalEsperado) throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
  return records;
}
