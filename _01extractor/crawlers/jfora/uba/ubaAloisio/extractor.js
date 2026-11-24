import fs from "node:fs";
import https from "node:https";
import { checkServerIdentity } from "node:tls";
import { load } from "cheerio";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoCatalogo, resolverTipoCatalogoInicioTitulo } from "../../_1Jf/tipos-alugueis.js";

const origin = "https://www.aloisioteixeiraimoveis.com.br";
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
const fail = message => { throw new Error(`[ubaAloisio] ${message}; dados preservados.`); };
const normalizar = value => normalizarBairro(value);

function finalidade(mode) {
  if (mode === "venda") return "Venda";
  if (mode === "locacao") return "Locação";
  return fail("Negociacao invalida");
}

export function validarUrlAloisio(value, mode, pagina) {
  finalidade(mode);
  const url = new URL(value, origin);
  if (url.origin !== origin || url.username || url.password || url.hash) fail(`Origem inesperada: ${url.href}`);
  if (pagina !== undefined) {
    if (!Number.isSafeInteger(pagina) || pagina < 1 ||
        url.pathname.replace(/\/$/, "") !== `/imovel/${mode}` ||
        (url.searchParams.get("pag") ?? "1") !== String(pagina) ||
        [...url.searchParams.keys()].some(key => key !== "pag") ||
        url.searchParams.getAll("pag").length > 1) fail("Paginacao fora da finalidade");
  } else if (!/^\/imovel\/[1-9]\d*\/[^/]+$/.test(url.pathname) || url.search ||
      !url.pathname.includes(`-${mode}-`)) fail("Detalhe fora da finalidade");
  return url;
}

export function verificarCertificadoAloisio(hostname, cert) {
  const error = checkServerIdentity(hostname, cert);
  if (hostname === new URL(origin).hostname && error?.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
    console.warn("[ubaAloisio] AVISO HTTPS: nome do certificado divergente; excecao autorizada somente para este dominio. Cadeia e validade continuam verificadas.");
    return undefined;
  }
  return error;
}

export async function fetchAloisio(value, mode, pagina) {
  const url = validarUrlAloisio(value, mode, pagina);
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      agent: false, checkServerIdentity: verificarCertificadoAloisio,
      signal: AbortSignal.timeout(60000),
      headers: { Accept: "text/html", "Accept-Encoding": "identity" },
    }, response => {
      if (response.statusCode !== 200 || !/^text\/html\b/i.test(response.headers["content-type"] ?? "")) {
        response.resume();
        reject(new Error(`[ubaAloisio] HTTP ${response.statusCode} ou conteudo inesperado; redirecionamentos nao permitidos. Dados preservados.`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) response.destroy(new Error("[ubaAloisio] HTML acima do limite; dados preservados."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try {
          const bytes = Buffer.concat(chunks);
          const charset = response.headers["content-type"].match(/charset=["']?([\w-]+)/i)?.[1] ??
            bytes.toString("ascii").match(/charset=["']?([\w-]+)/i)?.[1];
          if (!charset || !["iso-8859-1", "windows-1252", "utf-8"].includes(charset.toLowerCase())) fail("Codificacao desconhecida");
          resolve(new TextDecoder(charset).decode(bytes));
        } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
  });
}

function numero(value, area = false) {
  const text = compact(value);
  if (!text || text === "-") return null;
  const match = text.match(area ? /^(\d+(?:\.\d{3})*)(?:,(\d+))?\s*m[²2]$/i : /^(\d+)(?:\s+vagas?)?$/i);
  if (!match) return fail(`Caracteristica invalida: ${text}`);
  const result = Number(area ? `${match[1].replace(/\./g, "")}.${match[2] ?? "0"}` : match[1]);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail(`Numero fora do limite: ${text}`);
  return result;
}

function preco(value) {
  const text = compact(value);
  if (/^(?:Consulte|Sob Consulta|Consultar)$/i.test(text)) {
    console.warn("[ubaAloisio] Preco sob consulta; campo desconhecido.");
    return null;
  }
  const match = text.match(/^R\$\s*(\d+(?:\.\d{3})*),(\d{2})$/);
  if (!match) return fail(`Preco invalido ou ausente: ${text}`);
  const result = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail("Preco fora do limite");
  return result;
}

function caracteristicas($, elements) {
  const fields = new Map();
  elements.each((_i, element) => {
    const root = $(element);
    if (root.children("span").length !== 1) return;
    const label = compact(root.clone().children().remove().end().text()).replace(/:$/, "");
    if (fields.has(label)) fail(`Caracteristica repetida: ${label}`);
    fields.set(label, compact(root.children("span").text()));
  });
  return fields;
}

function foto(value) {
  if (!value) return "";
  const url = new URL(value, origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) fail("Foto invalida");
  return /(?:semfoto|noimage)\./i.test(url.pathname) ? "" : url.href;
}

export function resolverTipoTituloAloisio(titulo) {
  return resolverTipoCatalogoInicioTitulo(titulo);
}

export function extrairListagemAloisio(html, mode, pagina = 1) {
  const $ = load(html);
  const canonical = $('link[rel="canonical"]');
  if (canonical.length !== 1) fail("Canonical da listagem ausente/repetido");
  validarUrlAloisio(canonical.attr("href"), mode, pagina);
  const totalNode = $(".lista_imoveis_paginacao .fontepadrao_cor_grande");
  const match = compact(totalNode.text()).match(/^Imóveis Encontrados:\s*(\d+)$/);
  if (totalNode.length !== 1 || !match || !Number.isSafeInteger(Number(match[1]))) fail("Contador ausente/invalido");
  const total = Number(match[1]);
  const roots = $(".imoveis_listar");
  if ((total === 0 && (roots.length || mode !== "locacao" || pagina !== 1)) ||
      (total > 0 && (!roots.length || roots.length > total))) fail("Listagem vazia ou contador divergente");
  const pages = new Set();
  $(".lista_imoveis_paginacao a[href]").each((_i, element) => {
    const url = new URL($(element).attr("href"), origin);
    const pg = Number(url.searchParams.get("pag"));
    validarUrlAloisio(url.href, mode, pg);
    pages.add(pg);
  });
  const active = $(".lipagina-btn-paginacao-atual");
  if (total > 0 && (active.length !== 1 || compact(active.text()) !== String(pagina))) fail("Pagina ativa divergente");
  const imoveis = roots.toArray().map(element => {
    const card = $(element);
    const anchors = card.find('a[href*="/imovel/"]');
    const linkReal = validarUrlAloisio(anchors.first().attr("href"), mode).href;
    if (anchors.length !== 2 || anchors.toArray().some(a => new URL($(a).attr("href"), origin).href !== linkReal)) fail("Links do card divergentes");
    const info = card.find(".conteudo1").clone();
    const location = compact(info.find("h2").text());
    const local = location.match(/^(.*),\s*([^,]+)\s*\/\s*([A-Z]{2})$/);
    const codigoBase = compact(info.find("span").text()).match(/^# Ref:\s*(.+)$/)?.[1];
    info.children("h2, span, br").remove();
    const tipoFonte = compact(info.text()).match(new RegExp(`^(.+) para ${finalidade(mode)}$`))?.[1];
    if (!local || !codigoBase || !tipoFonte) fail("Identidade/localizacao/tipo ausente no card");
    const fields = caracteristicas($, card.find(".itens"));
    return {
      linkReal, codigoBase, tipoFonte, localizacao: location,
      bairroFonte: compact(local[1]), cidadeFonte: compact(local[2]), uf: local[3],
      preco: preco(card.find(".valor").text()),
      dormitorioValor: numero(fields.get("Quartos")), banheiroValor: numero(fields.get("Banheiros")),
      garagemValor: numero(fields.get("Vagas")), areaValor: numero(fields.get("Área Total") ?? fields.get("Área"), true),
      linkFoto: foto(card.find(".imagem img").attr("src")),
    };
  });
  if (new Set(imoveis.map(i => i.linkReal)).size !== imoveis.length) fail("Cards repetidos");
  return { total, pages: [...pages].sort((a, b) => a - b), imoveis };
}

export function extrairDetalhesAloisio(html, item, mode, now = new Date().toISOString()) {
  const $ = load(html);
  const canonical = $('link[rel="canonical"]');
  if (canonical.length !== 1 || validarUrlAloisio(canonical.attr("href"), mode).href !== item.linkReal) fail("Identidade do detalhe divergente");
  const titleNode = $(".blm_pesquisando_item h1");
  const titulo = compact(titleNode.text());
  const prefix = `${item.tipoFonte} para ${finalidade(mode)}, ${item.cidadeFonte} / ${item.uf}`;
  if (titleNode.length !== 1 || !(titulo === prefix || titulo.startsWith(`${prefix},`)) ||
      compact($(".imovel_detalhes_titulo2").text()) !== item.localizacao) fail(`Finalidade/tipo/localizacao do detalhe divergente: ${item.codigoBase}`);
  const fields = caracteristicas($, $(".imodet_item1_cx .imodet_item1"));
  if (fields.get("Código") !== item.codigoBase || (fields.get("Bairro") ?? "") !== item.bairroFonte ||
      preco($(".imodet_item1val").text()) !== item.preco) fail(`Codigo/bairro/preco divergente: ${item.codigoBase}`);
  const values = {
    dormitorioValor: numero(fields.get("Dormitórios")), banheiroValor: numero(fields.get("Banheiros")),
    garagemValor: numero(fields.get("Vaga") ?? fields.get("Vagas")), areaValor: numero(fields.get("Área Total"), true),
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== item[key]) fail(`Caracteristica divergente: ${item.codigoBase}, ${key}`);
  }
  const matches = new Set(cidades.filter(c => normalizar(c.nome) === normalizar(item.cidadeFonte) &&
    c.estado === item.uf).map(c => c.slug));
  const cidade = matches.size === 1 ? matches.values().next().value : "";
  const tipoImovel = resolverTipoCatalogo(item.tipoFonte) || resolverTipoTituloAloisio(titulo);
  if (!cidade) console.warn(`[ubaAloisio] ${item.codigoBase}: cidade fora do catalogo "${item.cidadeFonte}/${item.uf}"; campo vazio.`);
  if (!tipoImovel) console.warn(`[ubaAloisio] ${item.codigoBase}: tipo fora do catalogo "${item.tipoFonte}"; campo vazio.`);
  if (!item.bairroFonte) console.warn(`[ubaAloisio] ${item.codigoBase}: bairro ausente; campo vazio.`);
  const endereco = fields.get("Endereço");
  const complemento = fields.get("Complemento");
  return {
    linkReal: item.linkReal, titulo, preco: item.preco,
    localizacao: [endereco, complemento, item.localizacao].filter(Boolean).join(", "),
    tipoImovel, bairro: normalizar(item.bairroFonte).replace(/ /g, "-"), cidade,
    ...values, ambienteValor: numero(fields.get("Salas")), elevadorValor: null,
    codigoBase: item.codigoBase, linkCard: item.linkReal, corretor: "Aloisio",
    dataInclusao: now, dataExclusao: "", atualizadoEm: now,
    linkFoto: foto($(".imovel_detalhes_imagem1 img").attr("src")) || item.linkFoto,
  };
}

export async function coletarAloisio(_browser, project, mode, {
  anteriores = new Map(), onCount = async () => {}, request = fetchAloisio,
} = {}) {
  const base = mode === "venda" ? project.urlVendas : project.urlLocacao;
  validarUrlAloisio(base, mode, 1);
  const listing = async () => {
    const imoveis = [];
    let total;
    for (let pg = 1; ; pg++) {
      const url = new URL(base);
      if (pg > 1) url.searchParams.set("pag", String(pg));
      const result = extrairListagemAloisio(await request(url.href, mode, pg), mode, pg);
      if (total !== undefined && result.total !== total) fail("Contador mudou durante a paginacao");
      total = result.total;
      imoveis.push(...result.imoveis);
      if (imoveis.length > total || new Set(imoveis.map(i => i.linkReal)).size !== imoveis.length ||
          new Set(imoveis.map(i => i.codigoBase)).size !== imoveis.length) fail("Paginacao repetida ou acima do total");
      if (imoveis.length === total) {
        if (result.pages.some(page => page > pg)) fail("Paginacao acima do contador");
        return { total, imoveis };
      }
      if (!result.pages.includes(pg + 1)) fail("Paginacao incompleta");
    }
  };
  const first = await listing();
  const imoveis = [];
  for (const item of first.imoveis) {
    const record = extrairDetalhesAloisio(await request(item.linkReal, mode), item, mode);
    if (anteriores.get(item.linkReal)?.dataInclusao) record.dataInclusao = anteriores.get(item.linkReal).dataInclusao;
    imoveis.push(record);
  }
  if (JSON.stringify(first) !== JSON.stringify(await listing())) fail("Listagem mudou durante a coleta");
  await onCount(first.total);
  return { imoveis, totalEsperado: first.total, vazioConfirmado: mode === "locacao" && first.total === 0 };
}
