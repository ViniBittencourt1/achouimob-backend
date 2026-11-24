import fs from "node:fs";
import { resolverBairroCatalogo } from "../_utils/bairroCatalogo.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const SITE_ORIGIN = "https://www.mgimoveis.rio.br";
const API_URL = "https://api-site.arboimoveis.com.br/api/imoveis-replica/get-imoveis-new";
const API_BATCH_SIZE = 50;
const PAGE_SIZE = 10;
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8",
));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = value => normalizar(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const falhar = message => new Error(`[rioMg] ${message}; dados anteriores preservados.`);

function urlBase(project, negociacao) {
  const value = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  let url;
  try { url = new URL(value); } catch { throw falhar("URL de listagem invalida"); }
  const path = negociacao === "venda" ? "/imoveis/a-venda/brasil" : "/imoveis/para-alugar/brasil";
  if (!["venda", "locacao"].includes(negociacao) || url.origin !== SITE_ORIGIN || url.username || url.password
    || url.pathname !== path || url.search !== "?order=mais_relevantes" || url.hash) {
    throw falhar(`Origem, finalidade ou rota invalidas: ${url.href}`);
  }
  return url.href;
}

export function validarEstadoMg(props, project, negociacao, heading = "") {
  if (!props || !["venda", "locacao"].includes(negociacao)) throw falhar("Estado da busca ou finalidade invalida");
  urlBase(project, negociacao);
  const tipovar = negociacao === "venda" ? "a-venda" : "para-alugar";
  const total = props.count;
  const locations = props.locations;
  const center = props.geometry?.location;
  const headingEsperado = `${total} imoveis ${negociacao === "venda" ? "a venda" : "para alugar"}`;
  const ids = Array.isArray(locations) ? locations.map(item => item?.id) : [];
  const codes = Array.isArray(locations) ? locations.map(item => texto(item?.imv_cod_gaia)) : [];
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(locations) || locations.length !== total
    || props.totalPages !== Math.ceil(total / PAGE_SIZE) || props.isNational !== true
    || props.request_filters?.cidade !== "brasil" || props.request_filters?.tipovar !== tipovar
    || props.request_filters?.order !== "mais_relevantes"
    || !Number.isFinite(center?.lat) || !Number.isFinite(center?.lng)
    || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== total
    || codes.some(code => !code) || new Set(codes).size !== total
    || normalizar(heading) !== headingEsperado) {
    throw falhar("Contagem, finalidade ou identificadores da busca invalidos");
  }
  return { total, locations, center, order: props.request_filters.order, tipovar };
}

export function buildUrlApiMg(locations, { order, tipovar, center }) {
  if (!Array.isArray(locations) || !locations.length || order !== "mais_relevantes"
    || !["a-venda", "para-alugar"].includes(tipovar)
    || !center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw falhar("Parametros invalidos para a API MG");
  }
  const ids = locations.map(item => item.id);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw falhar("Lote de identificadores invalido");
  }
  const url = new URL(API_URL);
  url.searchParams.set("where", JSON.stringify({ id: { inq: ids } }));
  url.searchParams.set("order", order);
  url.searchParams.set("tipovar", tipovar);
  url.searchParams.set("center", JSON.stringify(center));
  return url.href;
}

function resolverCidade(nome, uf, caminhoCidade, caminhoUf, linkReal) {
  const matches = cidades.filter(cidade => normalizar(cidade.nome) === normalizar(nome)
    && cidade.estado === texto(uf).toUpperCase());
  const slugs = new Set(matches.map(cidade => cidade.slug));
  if (slugs.size !== 1) throw falhar(`Cidade ausente ou ambigua no catalogo: ${nome}/${uf} (${linkReal})`);
  const cidade = [...slugs][0];
  if (caminhoCidade !== slug(nome) || caminhoUf !== texto(uf).toLowerCase()) {
    throw falhar(`Link e cidade do anuncio divergentes: ${linkReal}`);
  }
  return cidade;
}

function numero(value, campo, linkReal) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw falhar(`${campo} invalido: ${linkReal}`);
  return result;
}

function linkCanonico(item, negociacao) {
  let url;
  try { url = new URL(texto(item.url_amiga)); } catch { throw falhar(`Link invalido: ${item.imv_cod_gaia}`); }
  const segments = url.pathname.split("/").filter(Boolean);
  const operations = negociacao === "venda" ? ["venda", "venda-e-locacao"] : ["locacao", "venda-e-locacao"];
  if (url.origin !== SITE_ORIGIN || url.username || url.password || url.search || url.hash
    || segments.length !== 7 || segments[0] !== "imovel" || !segments[1] || !operations.includes(segments[2])
    || !segments[3] || !/^[a-z]{2}$/i.test(segments[4]) || !segments[5]
    || segments[6] !== texto(item.imv_cod_gaia)) {
    throw falhar(`Link fora da origem ou finalidade: ${url.href}`);
  }
  return { url, segments };
}

export function mapearImovelMg(item, project, negociacao, now = new Date()) {
  if (!item || typeof item !== "object" || !["venda", "locacao"].includes(negociacao)) {
    throw falhar("Imovel ou finalidade invalida na API");
  }
  const link = linkCanonico(item, negociacao);
  const linkReal = link.url.href;
  const negocio = normalizar(item.tipo_negocio?.tpng_nome);
  const negociosValidos = negociacao === "venda" ? ["venda", "venda e locacao"] : ["locacao", "venda e locacao"];
  if (item.imv_ativo !== true || !negociosValidos.includes(negocio)) {
    throw falhar(`Imovel inativo ou fora da finalidade (${item.imv_cod_gaia})`);
  }
  const codigoBase = texto(item.imv_cod_gaia);
  const titulo = texto(item.imv_titulo);
  const tipoNome = texto(item.tipo_imovel?.timv_nome);
  const bairroNome = texto(item.imv_bairro);
  const cidadeNome = texto(item.imv_cidade);
  const uf = texto(item.imv_estado).toUpperCase();
  if (!codigoBase || !titulo || !tipoNome || !bairroNome || !cidadeNome || !/^[A-Z]{2}$/.test(uf)) {
    throw falhar(`Codigo ou dados de endereco ausentes (${codigoBase || "sem codigo"})`);
  }
  const cidade = resolverCidade(cidadeNome, uf, link.segments[3], link.segments[4], linkReal);
  const bairro = resolverBairroCatalogo(bairroNome, cidade) || slug(bairroNome);
  const tipoImovel = resolverTipoNiteroi(tipoNome) || tipoNome;
  const valor = negociacao === "venda" ? item.imv_preco_venda : item.imv_preco_locacao;
  const preco = item.imv_ocultar_preco ? null : numero(valor, "Preco", linkReal);
  if (preco !== null && preco <= 0) throw falhar(`Preco ausente ou invalido (${codigoBase})`);
  const numeroEndereco = numero(item.imv_end_numero, "Numero do endereco", linkReal);
  const endereco = item.imv_hide_address_wl || item.imobiliaria?.imb_hidden_address
    ? "" : [texto(item.imv_endereco), numeroEndereco > 0 ? String(numeroEndereco) : ""].filter(Boolean).join(", ");
  const foto = texto(item.fotos?.[0]?.imvft_url || item.fotos?.[0]?.fallback);
  let linkFoto = "";
  if (foto) {
    const urlFoto = new URL(foto, SITE_ORIGIN);
    if (!["http:", "https:"].includes(urlFoto.protocol)) throw falhar(`Imagem invalida (${codigoBase})`);
    linkFoto = urlFoto.href;
  }
  const timestamp = now.toISOString();
  return {
    linkReal, titulo, preco,
    localizacao: [bairroNome, `${cidadeNome}/${uf}`, endereco].filter(Boolean).join(", "),
    tipoImovel, bairro, cidade,
    dormitorioValor: numero(item.imv_qtd_dorm, "Quartos", linkReal),
    banheiroValor: numero(item.imv_qtd_banheiros, "Banheiros", linkReal),
    ambienteValor: 0,
    areaValor: numero(item.imv_area_util, "Area util", linkReal) || numero(item.imv_area_total, "Area total", linkReal),
    garagemValor: numero(item.imv_qtd_vagas, "Vagas", linkReal), elevadorValor: 0,
    codigoBase, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "", linkFoto, atualizadoEm: timestamp,
  };
}

async function carregarEstado(page, project, negociacao) {
  const url = urlBase(project, negociacao);
  await page.setCacheEnabled(false);
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!response || response.status() < 200 || response.status() >= 400) {
    throw falhar(`HTTP ${response?.status?.() || "invalido"} na listagem`);
  }
  const atual = new URL(page.url());
  if (atual.origin !== SITE_ORIGIN || atual.pathname !== new URL(url).pathname) {
    throw falhar(`Listagem redirecionada: ${atual.href}`);
  }
  const props = await page.evaluate(() => {
    const data = JSON.parse(document.querySelector("#__NEXT_DATA__")?.textContent || "{}");
    const heading = document.querySelector('h1[class*="Title_resultTitle__"]')?.textContent || "";
    return { props: data.props?.pageProps, heading };
  });
  return validarEstadoMg(props.props, project, negociacao, props.heading);
}

async function buscarLote(locations, estado, negociacao) {
  const url = buildUrlApiMg(locations, estado);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { From: "NEXT", "Content-Type": "application/json", Accept: "application/json" },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw Object.assign(new Error(`API HTTP ${response.status}`), { status: response.status });
      const data = await response.json();
      const expected = new Map(locations.map(item => [item.id, texto(item.imv_cod_gaia)]));
      if (!Array.isArray(data) || data.length !== locations.length
        || new Set(data.map(item => item?.id)).size !== locations.length
        || data.some(item => !expected.has(item.id) || expected.get(item.id) !== texto(item.imv_cod_gaia))) {
        throw falhar(`API retornou lote incompleto ou divergente (${negociacao})`);
      }
      return data;
    } catch (error) {
      if (error.status && error.status < 500 && error.status !== 429) throw falhar(error.message);
      lastError = error;
      if (attempt < 3) {
        console.warn(`[rioMg] Falha na API (${attempt}/3): ${error.message}. Tentando novamente.`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw falhar(`Falha na API apos 3 tentativas: ${lastError?.message || "erro desconhecido"}`);
}

export async function contarMg(browser, project, negociacao) {
  const page = await browser.newPage();
  try { return (await carregarEstado(page, project, negociacao)).total; }
  finally { await page.close(); }
}

export async function coletarMg(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || typeof primeiraPagina !== "boolean") {
    throw falhar("Total esperado ou modo de coleta invalido");
  }
  const page = await browser.newPage();
  try {
    const estado = await carregarEstado(page, project, negociacao);
    if (estado.total !== totalEsperado) {
      throw Object.assign(falhar(`Total mudou durante a coleta: ${totalEsperado} -> ${estado.total}`), {
        code: "MG_TOTAL_ALTERADO",
      });
    }
    const locations = primeiraPagina ? estado.locations.slice(0, PAGE_SIZE) : estado.locations;
    const records = [];
    const links = new Set();
    const totalLotes = Math.ceil(locations.length / API_BATCH_SIZE);
    for (let offset = 0; offset < locations.length; offset += API_BATCH_SIZE) {
      const batch = locations.slice(offset, offset + API_BATCH_SIZE);
      const items = await buscarLote(batch, estado, negociacao);
      const mapped = items.map(item => mapearImovelMg(item, project, negociacao));
      for (const record of mapped) {
        if (links.has(record.linkReal)) throw falhar(`Link duplicado: ${record.linkReal}`);
        links.add(record.linkReal);
        records.push(record);
      }
      console.log(`[rioMg/${negociacao}] Lote ${Math.floor(offset / API_BATCH_SIZE) + 1}/${totalLotes}: ${records.length}/${locations.length}.`);
    }
    if (!primeiraPagina && records.length !== totalEsperado) {
      throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
    }
    return records;
  } finally { await page.close(); }
}
