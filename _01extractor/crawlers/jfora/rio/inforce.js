import fs from "node:fs";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const tamanhoPagina = 100;
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const falhar = (project, message) => new Error(`[${project.collection}] ${message}; dados anteriores preservados.`);

function erroTotal(project, message) {
  return Object.assign(falhar(project, message), { code: "INFORCE_TOTAL_ALTERADO" });
}

function validarProjeto(project, negociacao) {
  const config = project?.inforce;
  if (project?.kind !== "inforce" || !config || !["search", "sergioCastro"].includes(config.schema)
    || !config.endpoint || !config.siteOrigin || !config.imageBaseUrl
    || !["id", "codigo"].includes(config.routeIdentifier)
    || !project.negociacoes?.includes(negociacao)) {
    throw falhar(project ?? { collection: "Inforce" }, "Projeto, API ou finalidade invalidos");
  }
  for (const value of [config.endpoint, config.siteOrigin, config.imageBaseUrl]) {
    if (new URL(value).protocol !== "https:") throw falhar(project, "URL HTTPS invalida");
  }
}

export function urlBuscaInforce(project, negociacao, pagina) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(pagina) || pagina < 1) throw falhar(project, "Pagina invalida");

  const url = new URL(project.inforce.endpoint);
  const finalidade = negociacao === "locacao" ? "aluguel" : "venda";
  if (project.inforce.schema === "sergioCastro") {
    const parametros = {
      Finalidade: finalidade,
      Tipos: "",
      ValorMin: "0",
      ValorMax: "60000000",
      AreaMin: "0",
      AreaMax: "100000",
      Caracteristica: "[]",
      Anuncio: "[]",
      AutoSuggest: "[]",
      HasMapa: "false",
      Page: String(pagina),
      PageSize: String(tamanhoPagina),
      Natureza: '["Residencial", "Mista"]',
      changeFinalidade: finalidade,
      [negociacao === "venda" ? "changeNaturezaMobile" : "changeNatureza"]: "Residencial",
    };
    for (const [key, value] of Object.entries(parametros)) url.searchParams.set(key, value);
  } else {
    url.searchParams.set("finalidade", finalidade);
    url.searchParams.set("page", String(pagina));
    url.searchParams.set("pagesize", String(tamanhoPagina));
  }
  return url.href;
}

function numero(value, campo, project) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw falhar(project, `${campo} invalido`);
  }
  return value;
}

function obterCampo(item, campo, legado) {
  return item[campo] === undefined ? item[legado] : item[campo];
}

function validarResposta(data, project, pagina) {
  const legado = project.inforce.schema === "sergioCastro";
  const total = legado ? data?.totalCount : data?.total;
  const page = data?.page;
  const pagesize = data?.pagesize;
  if (!data || !Number.isSafeInteger(total) || total < 0
    || page !== pagina || pagesize !== tamanhoPagina || !Array.isArray(data.items)) {
    throw falhar(project, `Resposta invalida na pagina ${pagina}`);
  }
  const esperados = Math.max(0, Math.min(tamanhoPagina, total - (pagina - 1) * tamanhoPagina));
  if (data.items.length !== esperados) {
    throw falhar(project, `Pagina ${pagina} incompleta: ${data.items.length}/${esperados}`);
  }
  return { total, items: data.items };
}

export async function buscarPaginaInforce(project, negociacao, pagina, fetcher = fetch) {
  const url = urlBuscaInforce(project, negociacao, pagina);
  let response;
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    response = await fetcher(url, { signal: AbortSignal.timeout(60000), redirect: "error" });
    if (response.ok || !(response.status === 429 || response.status >= 500 && response.status <= 599) || tentativa === 5) break;
    console.warn(`[${project.collection}] HTTP ${response.status} na pagina ${pagina}; nova tentativa ${tentativa + 1}/5.`);
    await new Promise(resolve => setTimeout(resolve, tentativa * 3000));
  }
  if (!response.ok) throw falhar(project, `HTTP ${response.status} na pagina ${pagina}`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw falhar(project, `JSON invalido na pagina ${pagina}`);
  }
  return validarResposta(data, project, pagina);
}

export function mapearInforce(item, project, negociacao, now = new Date()) {
  validarProjeto(project, negociacao);
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw falhar(project, "Anuncio invalido ou incompleto");
  }
  const legado = project.inforce.schema === "sergioCastro";
  const id = obterCampo(item, "id", "ID");
  const codigo = texto(obterCampo(item, "codigo", "Codigo"));
  const slug = texto(obterCampo(item, "url", "UrlTrack"));
  const tipo = texto(obterCampo(item, "tipo", "TipoNome"));
  const bairroNome = texto(obterCampo(item, "bairro", "BairroNome"));
  const cidadeNome = texto(obterCampo(item, "cidade", "CidadeNome"));
  const estado = texto(obterCampo(item, "estadoSigla", "EstadoSigla")).toUpperCase();
  if (!Number.isSafeInteger(id) || id < 1
    || !legado && item.tipoAnuncio !== "Imovel"
    || !/^[A-Za-z0-9._-]+$/.test(codigo) || !slug || /[\/?#\\]/.test(slug)
    || !tipo || !bairroNome || !cidadeNome || !/^[A-Z]{2}$/.test(estado)) {
    throw falhar(project, `Anuncio invalido ou incompleto: ${codigo || "sem codigo"}`);
  }

  const campoPreco = negociacao === "venda" ? "valorVenda" : "valorLocacao";
  const campoPrecoLegado = negociacao === "venda" ? "ValorVenda" : "ValorLocacao";
  const precoOriginal = obterCampo(item, campoPreco, campoPrecoLegado);
  const ocultarValor = item.ocultarValor === true || item.OcultarValor === true;
  if (precoOriginal === null || precoOriginal === undefined || precoOriginal === "") {
    if (!ocultarValor) throw falhar(project, `Preco ausente: ${codigo}`);
  }
  const preco = ocultarValor ? 0 : numero(precoOriginal, "Preco", project);
  const imagemCampo = obterCampo(item, "imagens", "Imagens");
  if (!Array.isArray(imagemCampo)) throw falhar(project, `Imagens invalidas: ${codigo}`);
  const imagem = imagemCampo[0];
  if (imagem !== undefined && !/^\d+$/.test(String(imagem))) throw falhar(project, `Imagem invalida: ${codigo}`);

  const matches = cidades.filter(city => normalizar(city.nome) === normalizar(cidadeNome) && city.estado === estado);
  const slugs = new Set(matches.map(city => city.slug));
  const cidade = slugs.size === 1 ? [...slugs][0] : cidadeNome;
  const routeId = project.inforce.routeIdentifier === "id" ? id : codigo;
  const suffix = `${project.inforce.routeIdentifierPrefix ?? ""}${routeId}`;
  const linkReal = new URL(`/imovel/${slug}/${suffix}`, project.inforce.siteOrigin).href;
  if (slugs.size !== 1) console.warn(`[${project.collection}] Cidade fora do catalogo: "${cidadeNome} - ${estado}" (${linkReal})`);
  const bairro = resolverBairroNiteroi(bairroNome, cidade) || bairroNome;
  const tipoImovel = resolverTipoPrefixoCatalogo(tipo) || tipo;
  const timestamp = now.toISOString();
  const quartosOriginal = obterCampo(item, "quartos", "QtdQuarto");
  let quartos;
  if (quartosOriginal === -1) {
    quartos = 0;
    console.warn(`[${project.collection}] Quartos informados como -1; tratado como nao informado: ${linkReal}`);
  } else quartos = numero(quartosOriginal, "Quartos", project);
  const endereco = legado ? texto(item.EnderecoLogradouro) : "";

  return {
    linkReal,
    titulo: `${tipo} - ${bairroNome}, ${cidadeNome} - ${estado}`,
    preco,
    localizacao: `${endereco ? `${endereco}, ` : ""}${bairroNome}, ${cidadeNome} - ${estado}`,
    tipoImovel,
    bairro,
    cidade,
    dormitorioValor: quartos,
    banheiroValor: numero(obterCampo(item, "banheiros", "QtdWcTotal"), "Banheiros", project),
    ambienteValor: 0,
    areaValor: numero(obterCampo(item, "areaConstruida", "AreaUtil"), "Area", project),
    garagemValor: numero(obterCampo(item, "vagas", "QtdVaga"), "Vagas", project),
    elevadorValor: 0,
    codigoBase: codigo,
    linkCard: linkReal,
    corretor: project.displayName,
    dataInclusao: timestamp,
    dataExclusao: "",
    linkFoto: imagem === undefined ? "" : `${project.inforce.imageBaseUrl}/${imagem}.jpg`,
    atualizadoEm: timestamp,
  };
}

export async function contarInforce(_browser, project, negociacao, { buscar = buscarPaginaInforce } = {}) {
  const primeira = await buscar(project, negociacao, 1);
  if (project.inforce.schema === "sergioCastro") return primeira.total;
  const segunda = await buscar(project, negociacao, 2);
  return Math.max(primeira.total, segunda.total);
}

export async function coletarInforce(_browser, project, negociacao, { totalEsperado, primeiraPagina = false }, { buscar = buscarPaginaInforce } = {}) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar(project, "Precontagem invalida");
  const agora = new Date();
  if (primeiraPagina || totalEsperado === 0) {
    const data = await buscar(project, negociacao, 1);
    if (data.total > totalEsperado) throw erroTotal(project, `Total mudou: ${totalEsperado} -> ${data.total}`);
    return data.items.map(item => mapearInforce(item, project, negociacao, agora));
  }

  const registros = new Map();
  const paginas = Math.ceil(totalEsperado / tamanhoPagina);
  for (let pagina = 1; pagina <= paginas; pagina++) {
    const data = await buscar(project, negociacao, pagina);
    if (data.total > totalEsperado) throw erroTotal(project, `Total mudou na pagina ${pagina}: ${totalEsperado} -> ${data.total}`);
    for (const raw of data.items) {
      const item = mapearInforce(raw, project, negociacao, agora);
      if (registros.has(item.linkReal)) throw falhar(project, `Imovel repetido: ${item.linkReal}`);
      registros.set(item.linkReal, item);
    }
    console.log(`[${project.collection}] Pagina ${pagina}/${paginas}: ${registros.size}/${totalEsperado}.`);
  }
  if (registros.size !== totalEsperado) throw erroTotal(project, `Coleta incompleta: ${registros.size}/${totalEsperado}`);
  return [...registros.values()];
}
