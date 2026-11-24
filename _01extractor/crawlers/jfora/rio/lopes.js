import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { load } from "cheerio";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const origem = "https://www.lopes.com.br";
const tamanhoPagina = 100;
const faixasVenda = [[0, 250000], [250000, 500000], [500000, 1000000], [1000000, 2000000], [2000000, 5000000], [5000000, 10000000], [10000000, null]];
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const falhar = message => new Error(`[rioLopes] ${message}; dados anteriores preservados.`);

export function urlBuscaLopes(project, negociacao, pagina) {
  if (project?.collection !== "rioLopes" || project.kind !== "lopes"
    || !["venda", "locacao"].includes(negociacao) || !Number.isSafeInteger(pagina) || pagina < 1) {
    throw falhar("Projeto, finalidade ou pagina invalidos");
  }
  const url = new URL(negociacao === "venda" ? project.urlVendas : project.urlLocacao);
  const rota = `/busca/${negociacao === "venda" ? "venda" : "aluguel"}/br/rj`;
  if (url.origin !== origem || url.pathname !== rota || url.hash
    || url.searchParams.get("placeId") !== "ChIJw4riypQYmAAR0IMFwRrDSQM"
    || url.searchParams.getAll("estagio").join(",") !== "real_estate,real_estate_parent") {
    throw falhar("Rota de busca inesperada");
  }
  if (pagina > 1) url.pathname += `/pagina/${pagina}`;
  return url.href;
}

export function urlApiLopes(project, negociacao, pagina, ordem = "", tipo = "", faixa = null) {
  const original = new URL(urlBuscaLopes(project, negociacao, pagina));
  if (!["", "ASC", "DESC"].includes(ordem) || !["", "real_estate", "real_estate_parent"].includes(tipo)) {
    throw falhar("Ordenacao ou tipo invalido");
  }
  const url = new URL(`https://apis.lopes.com.br/portal-home/v2/search/cache/${negociacao === "venda" ? "sale" : "rent"}/br/rj`);
  url.searchParams.set("page", String(pagina - 1));
  url.searchParams.set("linesPerPage", String(tamanhoPagina));
  for (const produto of tipo ? [tipo] : original.searchParams.getAll("estagio")) url.searchParams.append("productTypes", produto);
  url.searchParams.set("placeId", original.searchParams.get("placeId"));
  if (faixa) {
    const [minimo, maximo] = faixa;
    if (negociacao !== "venda" || tipo !== "real_estate"
      || !Number.isSafeInteger(minimo) || minimo < 0
      || maximo !== null && (!Number.isSafeInteger(maximo) || maximo <= minimo)) throw falhar("Faixa invalida");
    if (minimo > 0) url.searchParams.set("minPrice", String(minimo));
    if (maximo !== null) url.searchParams.set("maxPrice", String(maximo));
  }
  if (ordem) {
    url.searchParams.set("direction", ordem);
    url.searchParams.set("orderBy", "PRICE");
  }
  return url.href;
}

export async function buscarPaginaLopes(project, negociacao, pagina, fetcher = fetch, ordem = "", tipo = "", faixa = null) {
  const url = urlApiLopes(project, negociacao, pagina, ordem, tipo, faixa);
  let response;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    response = await fetcher(url, { signal: AbortSignal.timeout(60000), redirect: "error" });
    if (response.ok || !(response.status === 429 || response.status >= 500) || tentativa === 3) break;
    console.warn(`[rioLopes] HTTP ${response.status} na pagina ${pagina}; tentativa ${tentativa + 1}/3.`);
    await new Promise(resolve => setTimeout(resolve, tentativa * 3000));
  }
  if (!response.ok) throw falhar(`HTTP ${response.status} na pagina ${pagina}`);
  let data;
  try { data = await response.json(); }
  catch (error) { throw new Error(`[rioLopes] JSON invalido na pagina ${pagina}; dados anteriores preservados.`, { cause: error }); }
  const { products, searchCriteria } = data ?? {};
  const total = products?.totalElements;
  if (!Number.isSafeInteger(total) || total < 0 || products?.number !== pagina - 1 || products?.size !== tamanhoPagina
    || searchCriteria?.transactionType !== (negociacao === "venda" ? "sale" : "rent")
    || searchCriteria?.characteristics?.searchLevel !== "State"
    || !Array.isArray(products.content)) throw falhar(`Resposta invalida na pagina ${pagina}`);
  const quantidade = Math.max(0, Math.min(tamanhoPagina, total - (pagina - 1) * tamanhoPagina));
  if (products.numberOfElements !== quantidade || products.content.length !== quantidade) {
    throw falhar(`Pagina ${pagina} incompleta: ${products.content.length}/${quantidade}`);
  }
  if (tipo && products.content.some(item => item.productType !== tipo)) throw falhar(`Tipo inesperado na pagina ${pagina}`);
  return { total, items: products.content };
}

function atributo(item, tipo) {
  const valores = item.attributes.filter(value => value?.type === tipo);
  if (valores.length > 1) throw falhar(`Atributo ${tipo} repetido: ${item.id}`);
  if (!valores.length) return 0;
  const value = texto(valores[0].value).replace(/\s*m²$/i, "");
  const match = value.match(/^(\d+(?:[.,]\d+)?)(?:\s+(?:a|até)\s+\d+(?:[.,]\d+)?)?$/i);
  if (!match) throw falhar(`Atributo ${tipo} invalido no imovel ${item.id}: ${value}`);
  const numero = Number(match[1].replace(",", "."));
  if (!Number.isFinite(numero)) throw falhar(`Atributo ${tipo} invalido: ${item.id}`);
  return numero;
}

function precoLopes(item, negociacao) {
  let raw;
  if (negociacao === "locacao") {
    const sub = load(`<div>${item.subPrice || ""}</div>`).text().replace(/\s+/g, " ");
    raw = sub.match(/Aluguel:\s*(R\$\s*[\d.,]+)/i)?.[1];
  } else {
    raw = item.priceFormat || item.sellingPriceFormat;
  }
  if (!raw) {
    console.warn(`[rioLopes] Preco nao informado no anuncio ${item.id}.`);
    return null;
  }
  if (!/^R\$\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(texto(raw))) {
    throw falhar(`Preco invalido no imovel ${item.id}: ${texto(raw)}`);
  }
  const preco = Number(texto(raw).replace(/[R$\s.]/g, "").replace(",", "."));
  if (!Number.isFinite(preco) || preco <= 0) throw falhar(`Preco invalido no imovel ${item.id}`);
  if (negociacao === "venda" && item.productType === "real_estate_parent" && item.listingPrice?.type === "RANGE"
    && preco !== item.listingPrice.minValue) throw falhar(`Preco minimo divergente no empreendimento ${item.id}`);
  return preco;
}

export function mapearLopes(item, project, negociacao, now = new Date()) {
  urlBuscaLopes(project, negociacao, 1);
  const codigo = texto(item?.id);
  const loc = item?.locationDTO;
  const nomeBairro = texto(loc?.neighborhood);
  const nomeCidade = texto(loc?.city);
  const estado = texto(loc?.uf).toUpperCase();
  const tipoOriginal = texto(item?.type);
  const finalidade = negociacao === "venda" ? "sale" : "rent";
  if (!/^[A-Za-z0-9-]+$/.test(codigo) || !["real_estate", "real_estate_parent"].includes(item?.productType)
    || item.dealType !== finalidade || !Array.isArray(item.deal_types) || !item.deal_types.includes(finalidade)
    || !Array.isArray(item.attributes) || !tipoOriginal || !nomeBairro || !nomeCidade || !/^[A-Z]{2}$/.test(estado)) {
    throw falhar(`Anuncio invalido ou incompleto: ${codigo || "sem codigo"}`);
  }
  const linkReal = `${origem}/imovel/${codigo}`;
  const matches = new Set(cidades.filter(city => normalizar(city.nome) === normalizar(nomeCidade) && city.estado === estado).map(city => city.slug));
  const cidade = matches.size === 1 ? [...matches][0] : nomeCidade;
  if (matches.size !== 1) console.warn(`[rioLopes] Cidade fora do catalogo: "${nomeCidade} - ${estado}" (${linkReal})`);
  const bairro = resolverBairroNiteroi(nomeBairro, cidade) || nomeBairro;
  const tipoImovel = ["condominio", "residential condo"].includes(normalizar(tipoOriginal).replace(/[^a-z0-9]+/g, " ").trim())
    ? "casa"
    : resolverTipoPrefixoCatalogo(tipoOriginal) || tipoOriginal;
  const endereco = texto(item.street);
  const localizacao = [endereco, nomeBairro, `${nomeCidade} - ${estado}`].filter(Boolean).join(", ");
  const preco = precoLopes(item, negociacao);
  const nome = texto(item.name);
  const faixaPreco = item.productType === "real_estate_parent" && item.listingPrice?.type === "RANGE" && preco !== null;
  const titulo = `${nome || tipoOriginal} - ${nomeBairro}, ${nomeCidade} - ${estado}${faixaPreco ? " (preco a partir de)" : ""}`;
  const imagem = texto(item.photo?.[0]?.smallUrl);
  if (imagem) {
    let url;
    try { url = new URL(imagem); } catch { throw falhar(`Foto invalida: ${codigo}`); }
    if (url.protocol !== "https:" || url.username || url.password) throw falhar(`Foto invalida: ${codigo}`);
  }
  const timestamp = now.toISOString();
  return {
    linkReal, titulo, preco, localizacao, tipoImovel, bairro, cidade,
    dormitorioValor: atributo(item, "bedroom_attr"),
    banheiroValor: atributo(item, "bathroom_attr"),
    ambienteValor: 0,
    areaValor: atributo(item, "area_attr"),
    garagemValor: atributo(item, "parking_lots_attr"),
    elevadorValor: 0, codigoBase: codigo, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "", linkFoto: imagem, atualizadoEm: timestamp,
  };
}

export async function contarLopes(_browser, project, negociacao) {
  return (await buscarPaginaLopes(project, negociacao, 1)).total;
}

export async function coletarLopes(_browser, project, negociacao, { totalEsperado, primeiraPagina = false }, { buscar = buscarPaginaLopes } = {}) {
  urlBuscaLopes(project, negociacao, 1);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem invalida");
  const records = new Map();
  const now = new Date();
  const tipos = !primeiraPagina && negociacao === "venda" ? ["real_estate", "real_estate_parent"] : [""];
  const grupos = [];
  for (const tipo of tipos) {
    const total = tipo ? (await buscar(project, negociacao, 1, undefined, "", tipo)).total : totalEsperado;
    if (!Number.isSafeInteger(total) || total < 0) throw falhar(`Total invalido no grupo ${tipo}`);
    grupos.push({ tipo, total });
  }
  if (grupos.reduce((sum, group) => sum + group.total, 0) !== totalEsperado) throw falhar("Totais por tipo divergem da busca original");
  for (const { tipo, total: totalGrupo } of grupos) {
    const codigosGrupo = new Set();
    const faixas = tipo === "real_estate" ? faixasVenda : [null];
    for (const faixa of faixas) {
      const totalFaixa = faixa ? (await buscar(project, negociacao, 1, undefined, "", tipo, faixa)).total : totalGrupo;
      if (!Number.isSafeInteger(totalFaixa) || totalFaixa < 0 || totalFaixa > totalGrupo) throw falhar("Total invalido na faixa");
      const paginas = primeiraPagina ? 1 : Math.max(1, Math.ceil(totalFaixa / tamanhoPagina));
      const codigos = new Set();
      const rotulo = faixa ? `${faixa[0]}-${faixa[1] ?? "sem teto"}` : tipo || negociacao;
      for (let passagem = 1; passagem <= (primeiraPagina ? 1 : 6); passagem++) {
        for (let pagina = 1; pagina <= paginas; pagina++) {
          const ordem = primeiraPagina ? "" : passagem % 2 ? "ASC" : "DESC";
          const { total, items } = await buscar(project, negociacao, pagina, undefined, ordem, tipo, faixa);
          if (total !== totalFaixa) throw falhar(`Total alterado: ${totalFaixa} -> ${total}`);
          for (const item of items) {
            if (tipo && item.productType !== tipo) throw falhar(`Tipo inesperado: ${item.id}`);
            const record = mapearLopes(item, project, negociacao, now);
            if (faixa && (record.preco === null || record.preco < faixa[0] || faixa[1] !== null && record.preco > faixa[1])) {
              throw falhar(`Preco fora da faixa ${rotulo}: ${item.id}`);
            }
            const previous = records.get(record.codigoBase);
            if (previous && !isDeepStrictEqual(previous, record)) throw falhar(`Anuncio divergente: ${record.codigoBase}`);
            records.set(record.codigoBase, record);
            codigos.add(record.codigoBase);
            codigosGrupo.add(record.codigoBase);
          }
          if (records.size > totalEsperado || codigosGrupo.size > totalGrupo || codigos.size > totalFaixa) throw falhar("Quantidade de anuncios excedeu o total");
          if (pagina % 25 === 0 || pagina === paginas) console.log(`[rioLopes] ${rotulo}, passagem ${passagem}, pagina ${pagina}/${paginas}: ${codigos.size}/${totalFaixa} anuncios unicos.`);
        }
        if (primeiraPagina || codigos.size === totalFaixa) break;
        if (passagem === 6) throw falhar(`Coleta incompleta na faixa ${rotulo}: ${codigos.size}/${totalFaixa}`);
        console.warn(`[rioLopes] Paginacao instavel na faixa ${rotulo}; repetindo coleta (${codigos.size}/${totalFaixa}).`);
      }
    }
    if (!primeiraPagina && codigosGrupo.size !== totalGrupo) throw falhar(`Coleta incompleta no grupo ${tipo || negociacao}: ${codigosGrupo.size}/${totalGrupo}`);
  }
  if (!primeiraPagina && records.size !== totalEsperado) throw falhar(`Coleta incompleta: ${records.size}/${totalEsperado}`);
  return [...records.values()];
}
