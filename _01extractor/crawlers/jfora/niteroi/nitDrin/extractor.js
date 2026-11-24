import fs from "node:fs";
import { JSDOM } from "jsdom";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoPrefixoCatalogo } from "../tipoImovel.js";
import { lerContagemVendasDOM, parseTotalVendas, validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { project } from "./config.js";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalizar = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function numero(value) {
  const text = value.trim().replace(/\s*m²$/, "");
  if (!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(text)) throw new Error(`[nitDrin] Numero nao reconhecido: ${value}`);
  return Number(text.replace(/\./g, "").replace(",", "."));
}

export function resolverTipoDrin(value) {
  return resolverTipoPrefixoCatalogo(value);
}

export function buildUrlDrin(pageNumber) {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error("[nitDrin] Pagina invalida.");
  const url = new URL(project.url);
  const params = new URLSearchParams(url.hash.replace(/^#\/?\?/, ""));
  params.set("page", String(pageNumber));
  url.hash = `/?${params.toString()}`;
  return url.href;
}

export function parseCardDrin(html, now = new Date()) {
  const dom = new JSDOM(html, { url: project.url });
  try {
    const doc = dom.window.document;
    const text = selector => doc.querySelector(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
    const anchor = doc.querySelector('a[href^="/imovel/"], a[href^="https://www.drinimoveis.com.br/imovel/"]');
    if (!anchor) throw new Error("[nitDrin] Card sem link de imovel.");
    const link = new URL(anchor.href);
    if (link.origin !== new URL(project.url).origin || !/^\/imovel\/[^/]+\/[^/]+\/?$/.test(link.pathname)) {
      throw new Error(`[nitDrin] Link fora da origem: ${link.href}`);
    }
    link.hash = "";
    link.search = "";
    const linkReal = link.href;
    const heading = doc.querySelector("h2.pagina-titulo")?.cloneNode(true);
    heading?.querySelector(".detalhe-localizacao")?.remove();
    const titulo = heading?.textContent.replace(/\s+/g, " ").trim();
    const codigoBase = doc.querySelector(".icons-codigo")?.closest("li")?.querySelector("strong")?.textContent.trim();
    if (!titulo || !codigoBase) throw new Error(`[nitDrin] Titulo ou codigo ausente: ${linkReal}`);
    const sale = [...doc.querySelectorAll("li")].find(item => normalizar(item.querySelector(".descricao-transacao")?.textContent || "") === "venda");
    if (!sale) throw new Error(`[nitDrin] Card sem preco de venda: ${linkReal}`);
    const priceText = sale.querySelector(".valor-transacao")?.textContent.trim() || "";
    let preco;
    if (/^R\$\s*\d/.test(priceText)) preco = numero(priceText.replace(/^R\$\s*/, ""));
    else if (/consult/i.test(sale.textContent)) preco = null;
    else throw new Error(`[nitDrin] Preco de venda nao reconhecido: ${linkReal}`);
    const localizacao = text('.detalhe-localizacao f[ng-if*="imovel.localizacao.length"]') || text(".detalhe-localizacao");
    const location = localizacao.match(/^(.*),\s*([^,]+)\s*-\s*([A-Z]{2})$/i);
    const nomeCidade = location?.[2]?.trim() || "";
    const uf = location?.[3]?.toUpperCase();
    const candidates = cidades.filter(item => normalizar(item.nome) === normalizar(nomeCidade) && item.estado === uf);
    const slugs = new Set(candidates.map(item => item.slug));
    const cidade = slugs.size === 1 ? slugs.values().next().value : nomeCidade;
    if (slugs.size !== 1) console.warn(`[nitDrin] Cidade sem correspondencia unica: "${localizacao}" (${linkReal})`);
    const bairroExtraido = location?.[1]?.split(/\s+-\s+/).at(-1)?.trim() || "";
    const bairro = resolverBairroNiteroi(bairroExtraido, cidade);
    if (!bairro) console.warn(`[nitDrin] Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade}; ${linkReal})`);
    const tipoExtraido = doc.querySelector("li .fa-home")?.closest("li")?.textContent.trim() || "";
    const tipoImovel = resolverTipoDrin(tipoExtraido);
    if (!tipoImovel) console.warn(`[nitDrin] Tipo sem correspondencia unica: "${tipoExtraido}" (${linkReal})`);
    const feature = name => {
      const value = text(`li[ng-if^="imovel.${name} "] strong`);
      return value ? numero(value) : 0;
    };
    const image = doc.querySelector(".resultado-imovel-img img");
    const imageUrl = image?.getAttribute("data-flickity-lazyload") || image?.getAttribute("fallback-src") || image?.getAttribute("src");
    const timestamp = now.toISOString();
    return {
      linkReal, titulo, preco, localizacao, tipoImovel: tipoImovel || tipoExtraido,
      bairro: bairro || bairroExtraido, cidade,
      dormitorioValor: feature("dormitorios"), banheiroValor: feature("banheiros"),
      ambienteValor: feature("salas"),
      areaValor: feature("areaUtil") || feature("areaTotal") || feature("areaTerreno"),
      garagemValor: feature("garagem"), elevadorValor: feature("elevadores"),
      codigoBase, linkCard: linkReal, corretor: project.displayName,
      dataInclusao: timestamp, dataExclusao: "",
      linkFoto: imageUrl ? new URL(imageUrl, project.url).href : "", atualizadoEm: timestamp,
    };
  } finally { dom.window.close(); }
}

export function lerListagemDrin() {
  return [...document.querySelectorAll(".box-imovel.ng-scope")].map(item => item.outerHTML);
}

export async function extractDrinSales(browser, { totalEsperado, somentePrimeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error("[nitDrin] Precontagem obrigatoria.");
  const config = projetoContagemVendas(project.collection);
  const pages = Math.max(1, Math.ceil(totalEsperado / 15));
  const records = new Map();
  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    const page = await browser.newPage();
    try {
      const response = await page.goto(buildUrlDrin(pageNumber), { waitUntil: "networkidle2", timeout: 90000 });
      if (!response?.ok()) throw new Error(`[nitDrin] HTTP ${response?.status()} na pagina ${pageNumber}; base preservada.`);
      validarUrlContagemVendas(config, page.url());
      const params = new URLSearchParams(new URL(page.url()).hash.replace(/^#\/?\?/, ""));
      if (Number(params.get("page")) !== pageNumber) throw new Error("[nitDrin] Redirecionamento para outra pagina; base preservada.");
      await page.waitForFunction(lerContagemVendasDOM, { timeout: 45000 }, config);
      const info = await page.evaluate(lerContagemVendasDOM, config);
      if (!info || parseTotalVendas(info.label, config) !== totalEsperado) throw new Error("[nitDrin] Contagem mudou; base preservada.");
      const cards = await page.evaluate(lerListagemDrin);
      const expectedCards = totalEsperado === 0 ? 0 : Math.min(15, totalEsperado - (pageNumber - 1) * 15);
      if (cards.length !== expectedCards) throw new Error(`[nitDrin] Pagina incompleta: ${cards.length}/${expectedCards}; base preservada.`);
      for (const html of cards) {
        const record = parseCardDrin(html);
        if (records.has(record.linkReal)) throw new Error("[nitDrin] Imovel repetido entre paginas; base preservada.");
        records.set(record.linkReal, record);
      }
      console.log(`[nitDrin] Pagina ${pageNumber}/${pages}: ${records.size}/${totalEsperado} imoveis unicos (${(totalEsperado ? records.size / totalEsperado * 100 : 100).toFixed(1)}%).`);
      if (somentePrimeiraPagina) return [...records.values()];
    } finally { await page.close(); }
  }
  if (records.size !== totalEsperado) throw new Error("[nitDrin] Coleta incompleta; base preservada.");
  return [...records.values()];
}
