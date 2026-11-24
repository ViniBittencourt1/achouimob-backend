import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const origem = "https://privilegioimoveis.com.br";
const tamanhoPagina = 100;
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const falhar = message => new Error(`[rioPrivilegio] ${message}; dados anteriores preservados.`);

function validarProjeto(project, negociacao) {
  if (project?.collection !== "rioPrivilegio" || project.kind !== "privilegio"
    || negociacao !== "venda" || project.urlVendas !== `${origem}/imoveis?page=1`) {
    throw falhar("Projeto, rota ou finalidade invalidos");
  }
}

export function urlBuscaPrivilegio(project, negociacao, pagina) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(pagina) || pagina < 1) throw falhar("Pagina invalida");
  const url = new URL("/api/imoveis", origem);
  url.searchParams.set("finalidade", "2");
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("por_pagina", String(tamanhoPagina));
  return url.href;
}

export async function buscarPaginaPrivilegio(project, negociacao, pagina, fetcher = fetch) {
  const url = urlBuscaPrivilegio(project, negociacao, pagina);
  let response;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    response = await fetcher(url, { signal: AbortSignal.timeout(60000), redirect: "error", headers: { Accept: "application/json" } });
    if (response.ok || !(response.status === 429 || response.status >= 500 && response.status <= 599) || tentativa === 3) break;
    console.warn(`[rioPrivilegio] HTTP ${response.status} na pagina ${pagina}; tentativa ${tentativa + 1}/3.`);
    await new Promise(resolve => setTimeout(resolve, tentativa * 3000));
  }
  if (!response.ok) throw falhar(`HTTP ${response.status} na pagina ${pagina}`);
  const data = await response.json();
  const meta = data?.pagination;
  if (!meta || !Number.isSafeInteger(meta.total) || meta.total < 0 || meta.page !== pagina
    || meta.per_page !== tamanhoPagina || !Array.isArray(data.lista)) throw falhar(`Resposta invalida na pagina ${pagina}`);
  const esperados = Math.max(0, Math.min(tamanhoPagina, meta.total - (pagina - 1) * tamanhoPagina));
  if (data.lista.length !== esperados) throw falhar(`Pagina ${pagina} incompleta: ${data.lista.length}/${esperados}`);
  return { total: meta.total, items: data.lista };
}

function numero(value, campo, codigo) {
  if (value === null || value === undefined || value === "") return 0;
  const raw = texto(value);
  if (/^0(?:\s*m²)?\s+at[eé]\s+0(?:\s*m²)?$/i.test(raw)) {
    console.warn(`[rioPrivilegio] ${campo} nao informado no imovel ${codigo}: ${raw}`);
    return 0;
  }
  if (!/^\d+(?:[,.]\d+)?$/.test(raw)) throw falhar(`${campo} invalido no imovel ${codigo}: ${raw}`);
  const number = Number(raw.replace(",", "."));
  if (!Number.isFinite(number)) throw falhar(`${campo} invalido no imovel ${codigo}`);
  return number;
}

function precoVenda(value, codigo) {
  const raw = texto(value);
  if (raw === "" || /^(?:sob consulta|consulte)$/i.test(raw)
    || /^R\$\s*0(?:[,.]0+)?(?:\s+at[eé]\s+R\$\s*0(?:[,.]0+)?)?$/i.test(raw) || raw === "0") {
    console.warn(`[rioPrivilegio] Preco sob consulta: ${codigo}`);
    return null;
  }
  if (!/^R\$\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(raw)) throw falhar(`Preco invalido no imovel ${codigo}: ${raw}`);
  const preco = Number(raw.replace(/[R$\s.]/g, "").replace(",", "."));
  if (!Number.isFinite(preco) || preco <= 0) throw falhar(`Preco invalido no imovel ${codigo}`);
  return preco;
}

export function mapearPrivilegio(item, project, now = new Date()) {
  validarProjeto(project, "venda");
  const codigo = texto(item?.codigo);
  const tipoOriginal = texto(item?.tipo);
  const titulo = texto(item?.titulo);
  const bairroNome = texto(item?.bairro);
  const cidadeNome = texto(item?.cidade);
  const estado = texto(item?.estado).toUpperCase();
  if (!/^[1-9]\d*$/.test(codigo) || !titulo || !bairroNome || !cidadeNome || !/^[A-Z]{2}$/.test(estado)) {
    throw falhar(`Anuncio sem identificacao ou localizacao: ${codigo || "sem codigo"}`);
  }
  if (normalizar(item.finalidade) !== "venda") throw falhar(`Finalidade inesperada no imovel ${codigo}: ${texto(item.finalidade)}`);
  const linkReal = `${origem}/imoveis/${codigo}`;
  const slugs = new Set(cidades.filter(city => normalizar(city.nome) === normalizar(cidadeNome) && city.estado === estado).map(city => city.slug));
  const cidade = slugs.size === 1 ? [...slugs][0] : cidadeNome;
  if (slugs.size !== 1) console.warn(`[rioPrivilegio] Cidade fora do catalogo: "${cidadeNome} - ${estado}" (${linkReal})`);
  const bairro = resolverBairroNiteroi(bairroNome, cidade) || bairroNome;
  const tipoImovel = resolverTipoPrefixoCatalogo(tipoOriginal) || tipoOriginal;
  if (!tipoImovel) console.warn(`[rioPrivilegio] Tipo nao informado no anuncio: ${linkReal}`);
  const endereco = texto(item.endereco);
  const localizacao = [endereco, bairroNome, `${cidadeNome} - ${estado}`].filter(Boolean).join(", ");
  const foto = texto(item.urlfotoprincipal || item.fotos?.[0]?.url);
  if (foto) {
    let url;
    try { url = new URL(foto); } catch { throw falhar(`Foto invalida no imovel ${codigo}`); }
    if (url.protocol !== "https:" || url.username || url.password) throw falhar(`Foto invalida no imovel ${codigo}`);
  }
  const timestamp = now.toISOString();
  return {
    linkReal, titulo, preco: precoVenda(item.valor, codigo), localizacao, tipoImovel, bairro, cidade,
    dormitorioValor: numero(item.numeroquartos, "Quartos", codigo),
    banheiroValor: numero(item.numerobanhos, "Banheiros", codigo),
    ambienteValor: numero(item.numerosalas, "Salas", codigo),
    areaValor: numero(item.areaprincipal, "Area", codigo),
    garagemValor: numero(item.numerovagas, "Vagas", codigo),
    elevadorValor: numero(item.numeroelevador, "Elevadores", codigo),
    codigoBase: codigo, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "", linkFoto: foto, atualizadoEm: timestamp,
  };
}

export async function contarPrivilegio(_browser, project, negociacao) {
  return (await buscarPaginaPrivilegio(project, negociacao, 1)).total;
}

export async function coletarPrivilegio(_browser, project, negociacao, { totalEsperado, primeiraPagina = false }, { buscar = buscarPaginaPrivilegio } = {}) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem invalida");
  const paginas = primeiraPagina ? 1 : Math.max(1, Math.ceil(totalEsperado / tamanhoPagina));
  const registros = new Map();
  const sequencias = [];
  const now = new Date();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    const data = await buscar(project, negociacao, pagina);
    if (data.total !== totalEsperado) throw falhar(`Total alterado: ${totalEsperado} -> ${data.total}`);
    const codigos = [];
    for (const raw of data.items) {
      const item = mapearPrivilegio(raw, project, now);
      codigos.push(item.linkReal);
      const anterior = registros.get(item.linkReal);
      if (anterior && !isDeepStrictEqual(anterior, item)) throw falhar(`Imovel repetido com dados divergentes: ${item.linkReal}`);
      if (anterior) console.warn(`[rioPrivilegio] Anuncio duplicado identico no site: ${item.linkReal}`);
      else registros.set(item.linkReal, item);
    }
    sequencias.push(codigos);
    console.log(`[rioPrivilegio] Pagina ${pagina}/${paginas}: ${registros.size}/${totalEsperado} imoveis unicos.`);
  }
  if (!primeiraPagina) {
    const ocorrencias = sequencias.reduce((total, items) => total + items.length, 0);
    if (ocorrencias !== totalEsperado) throw falhar(`Coleta incompleta: ${ocorrencias}/${totalEsperado}`);
    for (let pagina = 1; pagina <= paginas; pagina++) {
      const data = await buscar(project, negociacao, pagina);
      if (data.total !== totalEsperado) throw falhar(`Total alterado na reconferencia: ${totalEsperado} -> ${data.total}`);
      const codigos = data.items.map(item => `${origem}/imoveis/${texto(item.codigo)}`);
      if (!isDeepStrictEqual(codigos, sequencias[pagina - 1])) throw falhar(`Anuncios da pagina ${pagina} mudaram na reconferencia`);
    }
    console.log(`[rioPrivilegio] Reconferencia concluida: ${ocorrencias} anuncios, ${registros.size} imoveis unicos.`);
  }
  return [...registros.values()];
}
