import fs from "node:fs";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const pageSize = 20;
const cities = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const text = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalize = value => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const fail = (project, message) => new Error(`[${project.collection}] ${message}; dados anteriores preservados.`);

function unstable(project, message) {
  return Object.assign(fail(project, message), { code: "UNIVERSAL_TOTAL_ALTERADO" });
}

function validateProject(project, negotiation, page) {
  if (!["universal", "renascenca"].includes(project?.kind) || !project.universal
    || !["venda", "locacao"].includes(negotiation) || !project.negociacoes?.includes(negotiation)
    || !Number.isSafeInteger(page) || page < 1) {
    throw fail(project ?? { collection: "Universal" }, "Projeto, finalidade ou pagina invalidos");
  }
  const { endpoint, siteOrigin, schema } = project.universal;
  if (!["imoview", "renascenca"].includes(schema) || !endpoint || !siteOrigin) {
    throw fail(project, "Configuracao Universal invalida");
  }
  for (const value of [endpoint, siteOrigin]) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw fail(project, "URL HTTPS invalida");
  }
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.origin !== siteOrigin || endpointUrl.hash || endpointUrl.search
    || project.kind === "universal" && schema !== "imoview"
    || project.kind === "renascenca" && schema !== "renascenca") {
    throw fail(project, "Origem ou endpoint inesperado");
  }
}

function parametrosImoview(project, negotiation, page) {
  const params = {
    finalidade: negotiation === "venda" ? "venda" : "aluguel",
    codigounidade: "",
    codigosimoveis: "",
    codigoTipo: { codigo: ["0"], nome: ["imoveis"] },
    codigocidade: "todas-as-cidades",
    codigoregiao: 0,
    codigosbairros: 0,
    endereco: 0,
    numeroquartos: "0-quartos",
    numerovagas: "0-vaga-ou-mais",
    numerobanhos: "0-banheiro-ou-mais",
    numerosuite: "0-suite-ou-mais",
    numerovaranda: 0,
    numeroelevador: 0,
    valorde: "0",
    valorate: "0",
    areade: 0,
    areaate: 0,
    extras: 0,
    extends: false,
    mobiliado: false,
    dce: false,
    piscina: false,
    sauna: false,
    salaofestas: false,
    academia: false,
    boxDespejo: false,
    portaria24h: false,
    aceitafinanciamento: false,
    arealazer: false,
    quartoqtdeexata: false,
    vagaqtdexata: false,
    destaque: 0,
    opcaoimovel: 4,
    retornomapa: false,
    retornomapaapp: false,
    numeropagina: page,
    numeroregistros: pageSize,
    ordenacao: project.universal.ordenacao ?? "",
    pagina: String(page),
  };
  if (project.universal.condominio) {
    params.codigocondominio = "0";
    params.condominio = { codigo: 0, nome: "", nomeUrl: "todos-os-condominios" };
  }
  return params;
}

function parametrosRenascenca(negotiation, page) {
  return {
    finalidade: negotiation === "venda" ? "venda" : "aluguel",
    codigounidade: "",
    codigocondominio: 0,
    codigoproprietario: 0,
    codigocaptador: 0,
    codigosimovei: 0,
    tipos: [],
    codigoTipo: [],
    codigocidade: 0,
    codigoregiao: 0,
    bairros: [{ cidade: "", codigo: "", estado: "", estadoUrl: "", nome: "Todos", nomeUrl: "todos-os-bairros", regiao: "" }],
    codigosbairros: [],
    endereco: "",
    edificio: "",
    numeroquartos: "0-quartos",
    numerovagas: "0-vagas",
    numerobanhos: "0-banheiros",
    numerosuite: "0-suites",
    numerovaranda: 0,
    numeroelevador: 0,
    valorde: 0,
    valorate: 0,
    areade: 0,
    areaate: 0,
    areaexternade: 0,
    areaexternaate: 0,
    extras: [],
    caracteristicas: [],
    destaque: 1,
    opcaoimovel: { codigo: 0, nome: "", nomeUrl: "todas-as-opcoes" },
    codigoOpcaoimovel: 0,
    retornomapaapp: false,
    numeropagina: String(page),
    numeroregistros: pageSize,
    ordenacao: "",
    codigoempreendimentomae: "",
    cidades: [],
    condominio: { codigo: 0, nome: "", nomeUrl: "todos-os-condominios" },
  };
}

function appendFormValue(form, key, value) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const childKey = value[index] && typeof value[index] === "object" ? `${key}[${index}]` : `${key}[]`;
      appendFormValue(form, childKey, value[index]);
    }
  } else if (value && typeof value === "object") {
    for (const [child, childValue] of Object.entries(value)) appendFormValue(form, `${key}[${child}]`, childValue);
  } else {
    form.append(key, value === null || value === undefined ? "" : String(value));
  }
}

export function bodyBuscaUniversal(project, negotiation, page) {
  validateProject(project, negotiation, page);
  const values = project.universal.schema === "renascenca"
    ? parametrosRenascenca(negotiation, page)
    : { imovel: parametrosImoview(project, negotiation, page) };
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) appendFormValue(form, key, value);
  return form.toString();
}

export async function buscarPaginaUniversal(project, negotiation, page, fetcher = fetch) {
  validateProject(project, negotiation, page);
  let response;
  const referer = negotiation === "venda" ? project.urlVendas : project.urlLocacao;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      response = await fetcher(project.universal.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Origin": project.universal.siteOrigin,
          "Referer": referer,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: bodyBuscaUniversal(project, negotiation, page),
        signal: AbortSignal.timeout(60000),
        redirect: "error",
      });
    } catch (error) {
      if (attempt === 5) {
        throw new Error(`[${project.collection}] Falha de rede na pagina ${page}; dados anteriores preservados.`, { cause: error });
      }
      console.warn(`[${project.collection}] Falha de rede na pagina ${page}; nova tentativa ${attempt + 1}/5: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      continue;
    }
    if (response.ok || !(response.status === 429 || response.status >= 500 && response.status <= 599) || attempt === 5) break;
    console.warn(`[${project.collection}] HTTP ${response.status} na pagina ${page}; nova tentativa ${attempt + 1}/5.`);
    await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
  if (!response.ok) throw fail(project, `HTTP ${response.status} na pagina ${page}`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw fail(project, `JSON invalido na pagina ${page}`);
  }
  const total = data?.quantidade;
  const items = data?.lista;
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(items)) {
    throw fail(project, `Resposta invalida na pagina ${page}`);
  }
  const expected = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize));
  if (items.length !== expected) throw unstable(project, `Pagina ${page} incompleta: ${items.length}/${expected}`);
  return { total, items };
}

function decimal(value, field, project) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  const raw = text(value);
  const normalized = raw.replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  const result = Number(normalized);
  if (!raw || !Number.isFinite(result) || result < 0) throw fail(project, `${field} invalido: ${raw || "ausente"}`);
  return result;
}

function price(value, project) {
  const raw = text(value);
  if (/^(?:sob consulta|consulte)$/i.test(raw)) return null;
  return decimal(value, "Preco", project);
}

function mapearCidade(nome, estado, linkReal, project) {
  const matches = new Set(cities.filter(item => normalize(item.nome) === normalize(nome)
    && item.estado === estado).map(item => item.slug));
  if (matches.size === 1) return [...matches][0];
  console.warn(`[${project.collection}] Cidade fora do catalogo: "${nome} - ${estado}" (${linkReal})`);
  return nome;
}

function mapearRegistroUniversal(item, project, negotiation, now = new Date()) {
  const code = text(item?.codigo);
  const slug = text(project.universal.schema === "renascenca" ? item?.url_amigavel : item?.titulo);
  const type = text(item?.tipo);
  const neighborhood = text(item?.bairro);
  const cityName = text(item?.cidade);
  const state = text(item?.estado).toUpperCase();
  if (!/^[A-Za-z0-9-]+$/.test(code) || !slug || !type || !neighborhood || !cityName || !/^[A-Z]{2}$/.test(state)) {
    throw fail(project, `Anuncio incompleto ou invalido: ${code || "sem codigo"}`);
  }
  const expectedFinalidade = negotiation === "venda" ? "venda" : "aluguel";
  if (project.universal.schema === "renascenca"
    ? Number(item.codigofinalidade) !== (negotiation === "venda" ? 2 : 1)
    : normalize(item.finalidade) !== expectedFinalidade) {
    throw fail(project, `Finalidade inesperada no anuncio ${code}`);
  }
  const origin = project.universal.siteOrigin;
  const linkPath = project.universal.schema === "renascenca"
    ? `/imovel/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`
    : `/imovel/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`;
  const linkReal = new URL(linkPath, origin).href;
  const cidade = mapearCidade(cityName, state, linkReal, project);
  const bairro = resolverBairroNiteroi(neighborhood, cidade) || neighborhood;
  const tipoImovel = resolverTipoPrefixoCatalogo(type) || type;
  const address = text(item.endereco);
  const number = text(item.numero);
  const area = normalize(type).includes("terreno") || normalize(type).includes("sitio")
    ? item.arealote ?? item.areainterna
    : item.areainterna ?? item.areaprincipal ?? item.areaprincipaltratado ?? item.arealote;
  const photo = project.universal.schema === "renascenca"
    ? text(item.fotos?.[0]?.urlp || item.fotos?.[0]?.url)
    : text(item.urlfotoprincipalp || item.urlfotoprincipal);
  if (photo) {
    let photoUrl;
    try { photoUrl = new URL(photo); } catch { throw fail(project, `Foto invalida: ${code}`); }
    if (photoUrl.protocol !== "https:" || photoUrl.username || photoUrl.password) throw fail(project, `Foto invalida: ${code}`);
  }
  const timestamp = now.toISOString();
  return {
    linkReal,
    titulo: project.universal.schema === "renascenca"
      ? text(item.titulo)
      : `${type} - ${neighborhood}, ${cityName} - ${state}`,
    preco: price(item.valor, project),
    localizacao: [address ? `${address}${number ? `, ${number}` : ""}` : "", neighborhood, `${cityName} - ${state}`].filter(Boolean).join(", "),
    tipoImovel,
    bairro,
    cidade,
    dormitorioValor: decimal(item.numeroquartos, "Quartos", project),
    banheiroValor: decimal(item.numerobanhos, "Banheiros", project),
    ambienteValor: 0,
    areaValor: decimal(area, "Area", project),
    garagemValor: decimal(item.numerovagas, "Vagas", project),
    elevadorValor: 0,
    codigoBase: code,
    linkCard: linkReal,
    corretor: project.displayName,
    dataInclusao: timestamp,
    dataExclusao: "",
    linkFoto: photo,
    atualizadoEm: timestamp,
  };
}

export function mapearUniversal(item, project, negotiation, now = new Date()) {
  validateProject(project, negotiation, 1);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw fail(project, "Data invalida");
  return mapearRegistroUniversal(item, project, negotiation, now);
}

export async function contarUniversal(_browser, project, negotiation, { buscar = buscarPaginaUniversal } = {}) {
  return (await buscar(project, negotiation, 1)).total;
}

export async function coletarUniversal(_browser, project, negotiation, {
  totalEsperado, primeiraPagina = false,
} = {}, { buscar = buscarPaginaUniversal } = {}) {
  validateProject(project, negotiation, 1);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw fail(project, "Precontagem invalida");
  const now = new Date();
  const first = await buscar(project, negotiation, 1);
  if (first.total !== totalEsperado) throw unstable(project, `Total mudou: ${totalEsperado} -> ${first.total}`);
  const records = new Map();
  const pages = primeiraPagina ? 1 : Math.ceil(totalEsperado / pageSize);
  for (let page = 1; page <= pages; page++) {
    const data = page === 1 ? first : await buscar(project, negotiation, page);
    if (data.total !== totalEsperado) throw unstable(project, `Total mudou na pagina ${page}: ${totalEsperado} -> ${data.total}`);
    for (const raw of data.items) {
      const record = mapearRegistroUniversal(raw, project, negotiation, now);
      if (records.has(record.linkReal)) throw fail(project, `Anuncio repetido: ${record.linkReal}`);
      records.set(record.linkReal, record);
    }
    console.log(`[${project.collection}] Pagina ${page}/${pages}: ${records.size}/${totalEsperado}.`);
  }
  if (!primeiraPagina && records.size !== totalEsperado) {
    throw unstable(project, `Coleta incompleta: ${records.size}/${totalEsperado}`);
  }
  return [...records.values()];
}
