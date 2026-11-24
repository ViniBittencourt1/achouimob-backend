import fs from "node:fs";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoNiteroi, resolverTipoPrefixoCatalogo } from "../tipoImovel.js";
import { validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { project } from "./config.js";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalizar = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const texto = value => String(value ?? "").trim();

function numero(value, field) {
  const text = texto(value).replace(/^R\$\s*/, "");
  if (!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(text)) throw new Error(`[nitRealiza] ${field} invalido: ${value}`);
  const result = Number(text.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(result)) throw new Error(`[nitRealiza] ${field} fora do limite numerico.`);
  return result;
}

function feature(value, field) {
  if (value === null || value === undefined || value === "") return 0;
  return numero(value, field);
}

export function parseImovelRealiza(item, now = new Date(), { negociacao = "venda", projeto = project } = {}) {
  if (!["venda", "aluguel"].includes(negociacao)) throw new Error("[nitRealiza] Negociacao invalida.");
  if (!item || typeof item !== "object" || normalizar(item.finalidade) !== negociacao) throw new Error(`[nitRealiza] Anuncio fora de ${negociacao}; base preservada.`);
  const codigoBase = texto(item.codigo);
  const slug = texto(item.url_amigavel);
  const titulo = texto(item.titulo);
  if (!/^\d+$/.test(codigoBase) || !slug || /[/?#]/.test(slug) || !titulo) throw new Error("[nitRealiza] Codigo, link ou titulo invalido.");
  const linkReal = new URL(`/imovel/${slug}/${codigoBase}`, projeto.url).href;
  const price = texto(item.valor);
  const preco = /^(?:sob consulta|consulte)$/i.test(price) ? null : numero(price, "preco");
  const nomeCidade = texto(item.cidade);
  const uf = texto(item.estado).toUpperCase();
  const slugs = new Set(cidades.filter(city => normalizar(city.nome) === normalizar(nomeCidade) && city.estado === uf).map(city => city.slug));
  const cidade = slugs.size === 1 ? slugs.values().next().value : nomeCidade;
  if (slugs.size !== 1) console.warn(`[${projeto.collection}] Cidade sem correspondencia unica: "${nomeCidade}" / ${uf} (${linkReal})`);
  const bairroExtraido = texto(item.bairro);
  const bairro = resolverBairroNiteroi(bairroExtraido, cidade);
  if (!bairro) console.warn(`[${projeto.collection}] Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade}; ${linkReal})`);
  const tipoExtraido = texto(item.tipo);
  const tipoImovel = resolverTipoNiteroi(tipoExtraido) || resolverTipoPrefixoCatalogo(tipoExtraido);
  if (!tipoImovel) console.warn(`[${projeto.collection}] Tipo sem correspondencia unica: "${tipoExtraido}" (${linkReal})`);
  const localizacao = [
    texto(item.endereco), /^\d+[A-Za-z]?$/.test(texto(item.numero)) ? texto(item.numero) : "",
    bairroExtraido, nomeCidade, uf,
  ].filter(Boolean).join(", ");
  const image = texto(item.urlfotoprincipalp) || texto(item.fotos?.[0]?.urlp);
  const linkFoto = image ? new URL(image, projeto.url) : null;
  if (linkFoto && !["https:", "http:"].includes(linkFoto.protocol)) throw new Error(`[nitRealiza] Foto invalida: ${linkReal}`);
  const area = feature(item.areainterna, "area interna") || feature(item.areaprincipal, "area principal") || feature(item.arealote, "area lote");
  if (area && texto(item.tipomedida) !== "m²") throw new Error(`[nitRealiza] Unidade de area nao suportada: ${item.tipomedida} (${linkReal})`);
  const timestamp = now.toISOString();
  return {
    linkReal, titulo, preco, localizacao, tipoImovel: tipoImovel || tipoExtraido,
    bairro: bairro || bairroExtraido, cidade,
    dormitorioValor: feature(item.numeroquartos, "quartos"),
    banheiroValor: feature(item.numerobanhos, "banheiros"),
    ambienteValor: feature(item.numerosalas, "salas"), areaValor: area,
    garagemValor: feature(item.numerovagas, "vagas"), elevadorValor: 0,
    codigoBase, linkCard: linkReal, corretor: projeto.displayName,
    dataInclusao: timestamp, dataExclusao: "",
    linkFoto: linkFoto?.href || "", atualizadoEm: timestamp,
  };
}

export function buildUrlRealiza(pageNumber, projeto = project) {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error("[nitRealiza] Pagina invalida.");
  const url = new URL(projeto.url);
  url.searchParams.set("pagina", String(pageNumber));
  return url.href;
}

export function isRealizaListingResponse(response, pageNumber, { negociacao = "venda", projeto = project } = {}) {
  const request = response.request();
  const url = new URL(response.url());
  if (url.origin !== new URL(projeto.url).origin || url.pathname !== "/retornar-imoveis-disponiveis" || request.method() !== "POST") return false;
  const params = new URLSearchParams(request.postData());
  return params.get("finalidade") === negociacao && params.get("numeropagina") === String(pageNumber) && params.get("numeroregistros") === "20";
}

export async function fetchRealizaPage(endpoint, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`[nitRealiza] API HTTP ${response.status}; base preservada.`);
  return response.json();
}

export async function extractRealizaSales(browser, { totalEsperado, somentePrimeiraPagina = false,
  negociacao = "venda", projeto = project } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error("[nitRealiza] Precontagem obrigatoria.");
  if (!["venda", "aluguel"].includes(negociacao)) throw new Error("[nitRealiza] Negociacao invalida.");
  const config = negociacao === "venda" ? projetoContagemVendas(project.collection) : null;
  const records = new Map();
  const pages = Math.max(1, Math.ceil(totalEsperado / 20));
  const page = await browser.newPage();
  try {
    const listing = page.waitForResponse(response => isRealizaListingResponse(response, 1, { negociacao, projeto }), { timeout: 60000 });
    listing.catch(() => {});
    const response = await page.goto(buildUrlRealiza(1, projeto), { waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[nitRealiza] HTTP ${response?.status()} na listagem; base preservada.`);
    if (config) validarUrlContagemVendas(config, page.url());
    else if (new URL(page.url()).origin !== new URL(projeto.url).origin || new URL(page.url()).pathname !== "/aluguel/") throw new Error("[nitRealiza] Redirecionamento fora de aluguel.");
    if (new URL(page.url()).searchParams.get("pagina") !== "1") throw new Error("[nitRealiza] Pagina redirecionada; base preservada.");
    const initial = await listing;
    if (!initial.ok()) throw new Error(`[nitRealiza] API HTTP ${initial.status()}; base preservada.`);
    const params = new URLSearchParams(initial.request().postData());
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      params.set("numeropagina", String(pageNumber));
      const data = await page.evaluate(fetchRealizaPage, initial.url(), params.toString());
      const expected = totalEsperado ? Math.min(20, totalEsperado - (pageNumber - 1) * 20) : 0;
      if (!data || data.quantidade !== totalEsperado || !Array.isArray(data.lista) || data.lista.length !== expected) {
        throw new Error(`[nitRealiza] Contagem alterada ou pagina incompleta; base preservada.`);
      }
      for (const item of data.lista) {
        const record = parseImovelRealiza(item, new Date(), { negociacao, projeto });
        if (records.has(record.linkReal)) throw new Error("[nitRealiza] Imovel repetido entre paginas; base preservada.");
        records.set(record.linkReal, record);
      }
      console.log(`[nitRealiza] Pagina ${pageNumber}/${pages}: ${records.size}/${totalEsperado} imoveis unicos (${(totalEsperado ? records.size / totalEsperado * 100 : 100).toFixed(1)}%).`);
      if (somentePrimeiraPagina) return [...records.values()];
    }
  } finally { await page.close(); }
  if (records.size !== totalEsperado) throw new Error("[nitRealiza] Coleta incompleta; base preservada.");
  return [...records.values()];
}
