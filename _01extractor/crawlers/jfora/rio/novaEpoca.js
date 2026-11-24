import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const origem = "https://www.novaepoca.com.br";
const tamanhoPagina = 100;
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const falhar = message => new Error(`[rioNovaEpoca] ${message}; dados anteriores preservados.`);

function validarProjeto(project, negociacao) {
  if (project.collection !== "rioNovaEpoca" || project.kind !== "novaEpoca" || negociacao !== "venda"
    || project.urlVendas !== `${origem}/venda/imoveis?finalidade=venda`) {
    throw falhar("Projeto, rota ou finalidade invalidos");
  }
}

export function urlBuscaNovaEpoca(project, negociacao, pagina, minimo, maximo) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(pagina) || pagina < 1
    || minimo !== undefined && (!Number.isSafeInteger(minimo) || minimo < 1)
    || maximo !== undefined && (!Number.isSafeInteger(maximo) || maximo < 1)
    || minimo !== undefined && maximo !== undefined && minimo > maximo) {
    throw falhar("Pagina ou faixa invalida");
  }
  const url = new URL("/api/anuncios/search", origem);
  url.searchParams.set("finalidade", "venda");
  url.searchParams.set("page", String(pagina));
  url.searchParams.set("pagesize", String(tamanhoPagina));
  if (minimo !== undefined) url.searchParams.set("valorMinimo", String(minimo));
  if (maximo !== undefined) url.searchParams.set("valorMaximo", String(maximo));
  return url.href;
}

export async function buscarPaginaNovaEpoca(project, negociacao, pagina, minimo, maximo, fetcher = fetch) {
  const url = urlBuscaNovaEpoca(project, negociacao, pagina, minimo, maximo);
  let response;
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    response = await fetcher(url, { signal: AbortSignal.timeout(60000), redirect: "error" });
    if (response.ok || !(response.status === 429 || response.status >= 500 && response.status <= 599) || tentativa === 5) break;
    console.warn(`[rioNovaEpoca] HTTP ${response.status} na pagina ${pagina}; nova tentativa ${tentativa + 1}/5.`);
    await new Promise(resolve => setTimeout(resolve, tentativa * 3000));
  }
  if (!response.ok) throw falhar(`HTTP ${response.status} na pagina ${pagina}`);
  const data = await response.json();
  if (!data || !Number.isSafeInteger(data.total) || data.total < 0
    || data.page !== pagina || data.pagesize !== tamanhoPagina || !Array.isArray(data.items)) {
    throw falhar(`Resposta invalida na pagina ${pagina}`);
  }
  const esperados = Math.max(0, Math.min(tamanhoPagina, data.total - (pagina - 1) * tamanhoPagina));
  if (data.items.length !== esperados) throw falhar(`Pagina ${pagina} incompleta: ${data.items.length}/${esperados}`);
  return data;
}

function numero(value, campo) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw falhar(`${campo} invalido`);
  return value;
}

export function mapearNovaEpoca(item, project, now = new Date()) {
  validarProjeto(project, "venda");
  const codigo = texto(item?.codigo);
  const slug = texto(item?.url);
  const tipo = texto(item?.tipo);
  const bairroNome = texto(item?.bairro);
  const cidadeNome = texto(item?.cidade);
  const estado = texto(item?.estadoSigla).toUpperCase();
  if (item?.tipoAnuncio !== "Imovel" || !Number.isSafeInteger(item.id) || item.id < 1 || !/^[A-Za-z0-9-]+$/.test(codigo)
    || !slug || /[\/?#\\]/.test(slug) || !tipo || !bairroNome || !cidadeNome || !/^[A-Z]{2}$/.test(estado)) {
    throw falhar(`Anuncio invalido ou incompleto: ${codigo || "sem codigo"}`);
  }
  if (item.ocultarValor !== false || typeof item.valorVenda !== "number" || !Number.isFinite(item.valorVenda) || item.valorVenda <= 0) {
    throw falhar(`Preco de venda ausente, oculto ou invalido: ${codigo}`);
  }
  const linkReal = new URL(`/imovel/${slug}/${item.id}`, origem).href;
  const matches = cidades.filter(city => normalizar(city.nome) === normalizar(cidadeNome) && city.estado === estado);
  const slugs = new Set(matches.map(city => city.slug));
  const cidade = slugs.size === 1 ? [...slugs][0] : cidadeNome;
  if (slugs.size !== 1) console.warn(`[rioNovaEpoca] Cidade fora do catalogo: "${cidadeNome} - ${estado}" (${linkReal})`);
  const bairro = resolverBairroNiteroi(bairroNome, cidade) || bairroNome;
  const tipoImovel = resolverTipoPrefixoCatalogo(tipo) || tipo;
  if (!Array.isArray(item.imagens)) throw falhar(`Imagens invalidas: ${codigo}`);
  const imagem = item.imagens[0];
  if (imagem !== undefined && !/^\d+$/.test(String(imagem))) throw falhar(`Imagem invalida: ${codigo}`);
  const timestamp = now.toISOString();
  const quartos = item.quartos === -1 ? 0 : numero(item.quartos, "Quartos");
  if (item.quartos === -1) console.warn(`[rioNovaEpoca] Quartos informados como -1 no site; tratado como nao informado: ${linkReal}`);
  return {
    linkReal, titulo: `${tipo} - ${bairroNome}, ${cidadeNome} - ${estado}`,
    preco: item.valorVenda, localizacao: `${bairroNome}, ${cidadeNome} - ${estado}`,
    tipoImovel, bairro, cidade,
    dormitorioValor: quartos,
    banheiroValor: numero(item.banheiros, "Banheiros"),
    ambienteValor: 0, areaValor: numero(item.areaConstruida, "Area"),
    garagemValor: numero(item.vagas, "Vagas"), elevadorValor: 0,
    codigoBase: codigo, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "",
    linkFoto: imagem === undefined ? "" : `https://novaepoca.inforcedata.com.br/api/image/thumb/${imagem}.jpg`,
    atualizadoEm: timestamp,
  };
}

export async function contarNovaEpoca(_browser, project, negociacao) {
  return (await buscarPaginaNovaEpoca(project, negociacao, 1)).total;
}

export async function coletarNovaEpoca(_browser, project, negociacao, { totalEsperado, primeiraPagina = false }, { buscar = buscarPaginaNovaEpoca } = {}) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem invalida");
  if (primeiraPagina) {
    const data = await buscar(project, negociacao, 1);
    if (data.total !== totalEsperado) throw falhar("Total alterado na primeira pagina");
    return data.items.map(item => mapearNovaEpoca(item, project));
  }
  const limites = project.novaEpoca?.limitesFaixasVenda;
  if (!Array.isArray(limites) || !limites.length || limites.some((n, i) =>
    !Number.isSafeInteger(n) || n <= 0 || i > 0 && n <= limites[i - 1])) {
    throw falhar("Limites de faixa invalidos");
  }
  const fronteiras = [undefined, ...limites, undefined];
  const registros = new Map();
  const now = new Date();
  for (let faixa = 0; faixa < fronteiras.length - 1; faixa++) {
    const minimo = fronteiras[faixa];
    const maximo = fronteiras[faixa + 1];
    let totalFaixa;
    const linksFaixa = new Set();
    for (let pagina = 1; pagina === 1 || (pagina - 1) * tamanhoPagina < totalFaixa; pagina++) {
      const data = await buscar(project, negociacao, pagina, minimo, maximo);
      if (pagina === 1) {
        totalFaixa = data.total;
        if (totalFaixa > totalEsperado) throw falhar("Total da faixa excede o total geral");
        console.log(`[rioNovaEpoca] Faixa ${minimo ?? 0}-${maximo ?? "sem teto"}: ${totalFaixa} imoveis.`);
      } else if (data.total !== totalFaixa) throw falhar(`Total da faixa mudou: ${totalFaixa} -> ${data.total}`);
      for (const raw of data.items) {
        const item = mapearNovaEpoca(raw, project, now);
        if (minimo !== undefined && item.preco < minimo || maximo !== undefined && item.preco > maximo) {
          throw falhar(`Preco fora da faixa: ${item.linkReal}`);
        }
        if (linksFaixa.has(item.linkReal)) throw falhar(`Imovel repetido na faixa: ${item.linkReal}`);
        linksFaixa.add(item.linkReal);
        const anterior = registros.get(item.linkReal);
        if (anterior) {
          if (anterior.faixa !== faixa - 1 || item.preco !== minimo || !isDeepStrictEqual(anterior.item, item)) {
            throw falhar(`Imovel divergente ou repetido fora do limite: ${item.linkReal}`);
          }
        } else registros.set(item.linkReal, { item, faixa });
      }
      console.log(`[rioNovaEpoca] Pagina ${pagina}/${Math.max(1, Math.ceil(totalFaixa / tamanhoPagina))}: ${linksFaixa.size}/${totalFaixa}.`);
    }
    if (linksFaixa.size !== totalFaixa || registros.size > totalEsperado) throw falhar("Coleta da faixa inconsistente");
    console.log(`[rioNovaEpoca] Faixas: ${registros.size}/${totalEsperado} imoveis unicos.`);
  }
  if (registros.size !== totalEsperado) throw falhar(`Faixas incompletas: ${registros.size}/${totalEsperado}`);
  return [...registros.values()].map(({ item }) => item);
}
