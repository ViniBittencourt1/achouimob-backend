import fs from "node:fs";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoNiteroi, resolverTipoPrefixoCatalogo } from "../tipoImovel.js";
import { verificarSiteDesativado } from "../../_utils/siteDesativado.js";

// Site Next.js da plataforma Arbo: o __NEXT_DATA__ traz o total e todos os ids da busca (locations);
// a rolagem infinita busca os detalhes em lotes de 10 ids nesta API.
export const API_SELFSPIN = "https://api-site.arboimoveis.com.br/api/imoveis-replica/get-imoveis-new";
export const LOTE_SELFSPIN = 10;

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalizar = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const texto = value => String(value ?? "").trim();
const tag = project => `[${project.collection}Locacao]`;

function validarUrl(project) {
  const url = new URL(project.url);
  if (url.hostname !== "www.selfspin.com.br" || !url.pathname.startsWith("/imoveis/para-alugar/")) {
    throw new Error(`${tag(project)} A coleta SelfSpin exige /imoveis/para-alugar/ em www.selfspin.com.br.`);
  }
}

function numero(value, field, project) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${tag(project)} ${field} invalido: ${value}`);
  return result;
}

export function resolverCidadeSelfSpin(nome, uf, catalog = cidades) {
  const slugs = new Set(catalog.filter(city => normalizar(city.nome) === normalizar(nome) && city.estado === texto(uf).toUpperCase()).map(city => city.slug));
  return slugs.size === 1 ? slugs.values().next().value : "";
}

export function extrairEstadoSelfSpin(html, project) {
  const match = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`${tag(project)} __NEXT_DATA__ ausente na listagem; base preservada.`);
  const props = JSON.parse(match[1])?.props?.pageProps;
  if (!props || props.request_filters?.tipovar !== "para-alugar") throw new Error(`${tag(project)} Listagem fora de aluguel; base preservada.`);
  const total = props.count;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`${tag(project)} Total de alugueis ausente na listagem.`);
  if (!Array.isArray(props.locations)) throw new Error(`${tag(project)} Lista de ids ausente na listagem.`);
  const ids = props.locations.map(item => item?.id);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error(`${tag(project)} Lista de ids invalida ou repetida; base preservada.`);
  }
  return { total, ids, center: props.request_filters?.center };
}

export function buildUrlApiSelfSpin(ids, { order = "mais_relevantes", center } = {}) {
  const url = new URL(API_SELFSPIN);
  url.searchParams.set("where", JSON.stringify({ id: { inq: ids } }));
  url.searchParams.set("order", order);
  url.searchParams.set("tipovar", "para-alugar");
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) url.searchParams.set("center", JSON.stringify(center));
  return url.href;
}

export function mapearImovelSelfSpin(item, project, now = new Date()) {
  if (!item || typeof item !== "object") throw new Error(`${tag(project)} Imovel invalido na API.`);
  if (item.imv_ativo !== true || normalizar(item.tipo_negocio?.tpng_nome) !== "locacao") {
    throw new Error(`${tag(project)} Imovel inativo ou fora de locacao (${item.id}); base preservada.`);
  }
  const codigoBase = texto(item.imv_cod_gaia);
  const tipoExtraido = texto(item.tipo_imovel?.timv_nome);
  const tituloApi = texto(item.imv_titulo);
  // Alguns titulos da API omitem o tipo ("para locacao, Bairro, ..."); o card do site exibe o tipo antes.
  const titulo = /^para\s/i.test(tituloApi) && tipoExtraido ? `${tipoExtraido} ${tituloApi}` : tituloApi;
  if (!codigoBase || !titulo) throw new Error(`${tag(project)} Codigo ou titulo ausente (${item.id}).`);
  const link = new URL(texto(item.url_amiga), project.url);
  if (link.origin !== new URL(project.url).origin || !link.pathname.startsWith("/imovel/")) {
    throw new Error(`${tag(project)} Link inesperado: ${item.url_amiga}`);
  }
  const linkReal = link.href;
  const valor = item.imv_preco_locacao;
  const preco = item.imv_ocultar_preco || valor === null || valor === undefined || Number(valor) === 0 ? null : numero(valor, "preco", project);
  const nomeCidade = texto(item.imv_cidade);
  const uf = texto(item.imv_estado).toUpperCase();
  const cidade = resolverCidadeSelfSpin(nomeCidade, uf);
  if (!cidade) console.warn(`${tag(project)} Cidade sem correspondencia unica: "${nomeCidade}" / ${uf} (${linkReal})`);
  const bairroExtraido = texto(item.imv_bairro);
  const bairro = resolverBairroNiteroi(bairroExtraido, cidade);
  if (!bairro) console.warn(`${tag(project)} Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade || nomeCidade}; ${linkReal})`);
  // Tipos fora do catalogo (ex.: "Laje") usam o inicio do titulo ("Loja para locacao, ...").
  const tipoImovel = resolverTipoNiteroi(tipoExtraido) || resolverTipoPrefixoCatalogo(tipoExtraido)
    || resolverTipoPrefixoCatalogo(titulo.split(/\s+para\s+/i)[0]);
  if (!tipoImovel) console.warn(`${tag(project)} Tipo sem correspondencia unica: "${tipoExtraido}" (${linkReal})`);
  const endereco = item.imv_hide_address_wl ? "" : texto(item.imv_endereco);
  const numeroEndereco = endereco && /^\d+[A-Za-z]?$/.test(texto(item.imv_end_numero)) ? texto(item.imv_end_numero) : "";
  const localizacao = [endereco, numeroEndereco, bairroExtraido, nomeCidade, uf].filter(Boolean).join(", ");
  const foto = texto(item.fotos?.[0]?.imvft_url || item.fotos?.[0]?.fallback);
  const linkFoto = foto ? new URL(foto, project.url) : null;
  if (linkFoto && !["https:", "http:"].includes(linkFoto.protocol)) throw new Error(`${tag(project)} Foto invalida: ${linkReal}`);
  const timestamp = now.toISOString();
  return {
    linkReal, titulo, preco, localizacao, tipoImovel: tipoImovel || tipoExtraido,
    bairro: bairro || bairroExtraido, cidade: cidade || nomeCidade,
    dormitorioValor: numero(item.imv_qtd_dorm, "quartos", project),
    banheiroValor: numero(item.imv_qtd_banheiros, "banheiros", project),
    ambienteValor: 0,
    areaValor: numero(item.imv_area_util, "area util", project) || numero(item.imv_area_total, "area total", project),
    garagemValor: numero(item.imv_qtd_vagas, "vagas", project), elevadorValor: 0,
    codigoBase, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "",
    linkFoto: linkFoto?.href || "", atualizadoEm: timestamp,
  };
}

export async function fetchJsonSelfSpin(url) {
  const response = await fetch(url, { headers: { Accept: "application/json, text/plain, */*", From: "NEXT" }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  return response.json();
}

async function carregarListagem(browser, project, { check = false } = {}) {
  validarUrl(project);
  const page = await browser.newPage();
  try {
    // Sem cache para que a segunda carga (contar -> coletar) traga a listagem atual, nao um 304.
    await page.setCacheEnabled(false);
    const response = await page.goto(project.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) throw new Error(`${tag(project)} HTTP ${response?.status()} na listagem; base preservada.`);
    await verificarSiteDesativado(page, project.collection, { salvar: !check });
    const estado = extrairEstadoSelfSpin(await page.content(), project);
    if (estado.ids.length !== estado.total) {
      throw new Error(`${tag(project)} Total exibido (${estado.total}) difere da lista de ids (${estado.ids.length}); base preservada.`);
    }
    return { page, estado };
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function buscarLote(page, url, project, tentativas = 3) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      try {
        return await page.evaluate(fetchJsonSelfSpin, url);
      } catch (error) {
        if (!/Failed to fetch|fetch failed|net::ERR_|TimeoutError|AbortError|(?:timed out|timeout|aborted)/i.test(`${error.name}: ${error.message}`)) throw error;
        console.warn(`${tag(project)} Falha de rede no navegador (tentativa ${tentativa}/${tentativas}): ${error.message}. Consultando o mesmo lote pelo Node.`);
        return await fetchJsonSelfSpin(url);
      }
    } catch (error) {
      const detalhe = error.cause?.code ? `${error.message} (${error.cause.code})` : error.message;
      if (tentativa >= tentativas) throw new Error(`${tag(project)} Falha na API apos ${tentativas} tentativas: ${detalhe}; base preservada.`, { cause: error });
      console.warn(`${tag(project)} Falha na API (tentativa ${tentativa}/${tentativas}): ${detalhe}. Repetindo o mesmo lote em ${2000 * tentativa}ms.`);
      await new Promise(resolve => setTimeout(resolve, 2000 * tentativa));
    }
  }
}

export async function contar(browser, project, { check = false } = {}) {
  const { page, estado } = await carregarListagem(browser, project, { check });
  await page.close();
  return estado.total;
}

export async function coletar(browser, project, { totalEsperado, check = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error(`${tag(project)} Precontagem obrigatoria.`);
  const { page, estado } = await carregarListagem(browser, project, { check });
  const records = new Map();
  try {
    if (estado.total !== totalEsperado) {
      throw new Error(`${tag(project)} Total mudou durante a coleta: ${totalEsperado} -> ${estado.total}; base preservada.`);
    }
    const order = new URL(project.url).searchParams.get("order") || "mais_relevantes";
    const lotes = Math.ceil(estado.ids.length / LOTE_SELFSPIN);
    for (let index = 0; index < lotes; index++) {
      const ids = estado.ids.slice(index * LOTE_SELFSPIN, (index + 1) * LOTE_SELFSPIN);
      const data = await buscarLote(page, buildUrlApiSelfSpin(ids, { order, center: estado.center }), project);
      if (!Array.isArray(data)) throw new Error(`${tag(project)} Resposta da API invalida; base preservada.`);
      const recebidos = new Set(data.map(item => item?.id));
      if (data.length !== ids.length || recebidos.size !== ids.length || ids.some(id => !recebidos.has(id))) {
        throw new Error(`${tag(project)} Lote ${index + 1}/${lotes} incompleto (${data.length}/${ids.length}); base preservada.`);
      }
      const porId = new Map(data.map(item => [item.id, item]));
      for (const id of ids) {
        const record = mapearImovelSelfSpin(porId.get(id), project);
        if (records.has(record.linkReal)) throw new Error(`${tag(project)} Imovel repetido: ${record.linkReal}; base preservada.`);
        records.set(record.linkReal, record);
      }
      console.log(`${tag(project)} Lote ${index + 1}/${lotes}: ${records.size}/${totalEsperado} alugueis (${(totalEsperado ? records.size / totalEsperado * 100 : 100).toFixed(1)}%).`);
      if (check) return [...records.values()];
    }
  } finally { await page.close(); }
  if (records.size !== totalEsperado) throw new Error(`${tag(project)} Coleta incompleta: ${records.size}/${totalEsperado}; base preservada.`);
  return [...records.values()];
}
