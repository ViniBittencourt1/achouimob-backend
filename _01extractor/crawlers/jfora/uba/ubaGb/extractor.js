import fs from "node:fs";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";
import { resolverTipoNiteroi } from "../../niteroi/tipoImovel.js";
import { buildUrlRealiza, isRealizaListingResponse, fetchRealizaPage } from "../../niteroi/nitRealiza/extractor.js";

const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));
const origin = "https://www.gbnimob.com.br";
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();

function finalidadeGb(negociacao) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("[ubaGb] Negociacao invalida.");
  return negociacao === "venda" ? "venda" : "aluguel";
}

export function validarUrlGb(value, negociacao, pageNumber = 1) {
  const finalidade = finalidadeGb(negociacao);
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== `/${finalidade}/` ||
      url.searchParams.get("pagina") !== String(pageNumber) ||
      [...url.searchParams.keys()].some(key => key !== "pagina") || url.hash) {
    throw new Error(`[ubaGb] Listagem fora da finalidade ou pagina esperada: ${url.href}; dados preservados.`);
  }
  return url;
}

function numero(value, field, inteiro = false) {
  if (value === null || value === undefined || value === "") return null;
  const text = texto(value);
  if (!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(text)) throw new Error(`[ubaGb] ${field} invalido: ${text}`);
  const result = Number(text.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER || (inteiro && !Number.isSafeInteger(result))) {
    throw new Error(`[ubaGb] ${field} fora do limite numerico.`);
  }
  return result;
}

export function parseImovelGb(item, negociacao, now = new Date().toISOString()) {
  const finalidade = finalidadeGb(negociacao);
  if (!item || typeof item !== "object" || normalizarBairro(item.finalidade) !== finalidade) {
    throw new Error("[ubaGb] Anuncio fora da finalidade; dados preservados.");
  }
  const codigoBase = texto(item.codigo);
  const slug = texto(item.url_amigavel);
  const titulo = texto(item.titulo);
  if (!/^[1-9]\d*$/.test(codigoBase) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !titulo) {
    throw new Error("[ubaGb] Codigo, link ou titulo invalido; dados preservados.");
  }
  const linkReal = `${origin}/imovel/${slug}/${codigoBase}`;
  const tipoImovel = resolverTipoNiteroi(texto(item.tipo));
  if (!tipoImovel) throw new Error(`[ubaGb] Tipo fora do catalogo: ${texto(item.tipo)} (${codigoBase})`);
  const cidadeNome = texto(item.cidade);
  const uf = texto(item.estado).toUpperCase();
  const matches = new Set(cidades.filter(city =>
    normalizarBairro(city.nome) === normalizarBairro(cidadeNome) && city.estado === uf
  ).map(city => city.slug));
  if (matches.size !== 1) throw new Error(`[ubaGb] Cidade fora do catalogo ou ambigua: ${cidadeNome}/${uf}`);
  const bairroNome = texto(item.bairro);
  if (!bairroNome) throw new Error(`[ubaGb] Bairro ausente: ${codigoBase}`);
  const price = texto(item.valor);
  let preco;
  if (/^(sob consulta|consulte)$/i.test(price)) preco = null;
  else {
    if (!/^R\$\s*\d+(?:\.\d{3})*(?:,\d{2})?$/.test(price)) throw new Error(`[ubaGb] Preco invalido: ${price}`);
    preco = numero(price.replace(/^R\$\s*/, ""), "preco");
  }
  const areas = ["areainterna", "areaprincipal", "arealote"].map(field => numero(item[field], field));
  const areaValor = areas.find(value => value > 0) ?? (areas.some(value => value === 0) ? 0 : null);
  if (areaValor > 0 && texto(item.tipomedida) !== "m\u00b2") {
    throw new Error(`[ubaGb] Unidade de area nao suportada: ${texto(item.tipomedida)} (${codigoBase})`);
  }
  const image = texto(item.urlfotoprincipalp) || texto(item.fotos?.[0]?.urlp);
  const photo = image ? new URL(image, origin) : null;
  if (photo && !["https:", "http:"].includes(photo.protocol)) throw new Error(`[ubaGb] Foto invalida: ${codigoBase}`);
  return {
    linkReal, titulo, preco,
    localizacao: [
      texto(item.endereco), /^\d+[A-Za-z]?$/.test(texto(item.numero)) ? texto(item.numero) : "",
      bairroNome, cidadeNome, uf,
    ].filter(Boolean).join(", "),
    tipoImovel, bairro: normalizarBairro(bairroNome).replace(/ /g, "-"),
    cidade: matches.values().next().value,
    dormitorioValor: numero(item.numeroquartos, "quartos", true),
    banheiroValor: numero(item.numerobanhos, "banheiros", true),
    ambienteValor: numero(item.numerosalas, "salas", true), areaValor,
    garagemValor: numero(item.numerovagas, "vagas", true),
    elevadorValor: numero(item.numeroelevador, "elevadores", true),
    codigoBase, linkCard: linkReal, corretor: "GB",
    dataInclusao: now, dataExclusao: "", linkFoto: photo?.href || "", atualizadoEm: now,
  };
}

export function lerPaginaGb(data, negociacao, pageNumber = 1) {
  finalidadeGb(negociacao);
  if (!data || !Number.isSafeInteger(data.quantidade) || data.quantidade < 0 || !Array.isArray(data.lista)) {
    throw new Error("[ubaGb] Contagem ou lista invalida; dados preservados.");
  }
  const expected = Math.min(20, Math.max(0, data.quantidade - (pageNumber - 1) * 20));
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || data.lista.length !== expected ||
      (pageNumber > 1 && expected === 0)) {
    throw new Error("[ubaGb] Pagina incompleta ou fora do intervalo; dados preservados.");
  }
  return { total: data.quantidade, imoveis: data.lista.map(item => parseImovelGb(item, negociacao)) };
}

function validarBuscaSemFiltros(params) {
  for (const [key, value] of params) {
    if (["finalidade", "numeropagina", "numeroregistros"].includes(key)) continue;
    if (key === "ordenacao" && value === "dataatualizacaodesc") continue;
    if (["bairros[0][nome]", "bairros[0][nomeUrl]", "opcaoimovel[nomeUrl]", "condominio[nomeUrl]"].includes(key) &&
        ["Todos", "todos-os-bairros", "todas-as-opcoes", "todos-os-condominios"].includes(value)) continue;
    if (value !== "" && value !== "0") throw new Error(`[ubaGb] Busca com filtro inesperado: ${key}; dados preservados.`);
  }
}

export async function coletarGb(browser, project, negociacao, {
  anteriores = new Map(), onCount = async () => {},
} = {}) {
  const finalidade = finalidadeGb(negociacao);
  const projeto = { url: negociacao === "venda" ? project.urlVendas : project.urlLocacao };
  validarUrlGb(projeto.url, negociacao);
  const page = await browser.newPage();
  try {
    const [initial, navigation] = await Promise.all([
      page.waitForResponse(response => isRealizaListingResponse(response, 1, { negociacao: finalidade, projeto }), { timeout: 60000 }),
      page.goto(buildUrlRealiza(1, projeto), { waitUntil: "networkidle2", timeout: 90000 }),
    ]);
    if (!navigation?.ok()) throw new Error(`[ubaGb] Listagem HTTP ${navigation?.status()}; dados preservados.`);
    validarUrlGb(page.url(), negociacao);
    if (!initial.ok()) throw new Error(`[ubaGb] API HTTP ${initial.status()}; dados preservados.`);
    const params = new URLSearchParams(initial.request().postData());
    validarBuscaSemFiltros(params);
    const first = lerPaginaGb(await initial.json(), negociacao);
    const pages = Math.max(1, Math.ceil(first.total / 20));
    if (pages > 150) throw new Error("[ubaGb] Limite de paginacao atingido; dados preservados.");
    await onCount(first.total);
    const imoveis = [];
    const seen = new Set();
    for (let number = 1; number <= pages; number++) {
      params.set("numeropagina", String(number));
      const batch = number === 1 ? first : lerPaginaGb(
        await page.evaluate(fetchRealizaPage, initial.url(), params.toString()), negociacao, number
      );
      if (batch.total !== first.total) throw new Error("[ubaGb] Contagem mudou durante coleta; dados preservados.");
      for (const item of batch.imoveis) {
        if (seen.has(item.codigoBase)) throw new Error("[ubaGb] Codigo repetido entre paginas; dados preservados.");
        seen.add(item.codigoBase);
        const old = anteriores.get(item.linkReal);
        if (old) {
          item.dataInclusao = old.dataInclusao || item.dataInclusao;
          for (const field of ["areaValor", "dormitorioValor", "banheiroValor", "garagemValor", "ambienteValor", "elevadorValor"]) {
            if (item[field] === null) item[field] = old[field] ?? null;
          }
        }
        imoveis.push(item);
      }
      console.log(`[ubaGb] ${negociacao} pagina ${number}/${pages}: ${imoveis.length}/${first.total}.`);
    }
    params.set("numeropagina", "1");
    const final = lerPaginaGb(await page.evaluate(fetchRealizaPage, initial.url(), params.toString()), negociacao);
    if (final.total !== first.total ||
        final.imoveis.map(item => item.codigoBase).join("|") !== first.imoveis.map(item => item.codigoBase).join("|")) {
      throw new Error("[ubaGb] Listagem mudou entre inicio e fim; dados preservados.");
    }
    if (imoveis.length !== first.total) throw new Error("[ubaGb] Coleta incompleta; dados preservados.");
    if (first.total === 0) throw new Error("[ubaGb] Busca vazia requer confirmacao antes de substituir a base; dados preservados.");
    return { imoveis, totalEsperado: first.total };
  } finally { await page.close(); }
}
