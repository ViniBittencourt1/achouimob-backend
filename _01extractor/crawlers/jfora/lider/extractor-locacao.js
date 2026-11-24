import fs from "node:fs";
import { resolverBairroCatalogo, normalizarBairro } from "../_utils/bairroCatalogo.js";
import { resolverTipoCatalogoContido } from "../_1Jf/tipos-alugueis.js";

export const URL_LOCACAO_LIDER = "https://www.lidernegociosimob.com.br/imovel/locacao";
export const URL_VENDAS_LIDER = "https://www.lidernegociosimob.com.br/imovel/venda";
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const bairros = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_jfBairros.json", import.meta.url), "utf8"));
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function mapImovelLiderLocacao(item) {
  return mapImovelLider(item, "locacao");
}

export function mapImovelLiderVenda(item) {
  return mapImovelLider(item, "venda");
}

export function mapImovelLiderVendaSite(item, linkReal) {
  return mapImovelLiderSite(item, linkReal, "venda");
}

export function mapImovelLiderLocacaoSite(item, linkReal) {
  return mapImovelLiderSite(item, linkReal, "locacao");
}

export function mapImovelLiderLocacaoImobBrasil(item, linkReal) {
  return mapImovelLiderImobBrasil(item, linkReal, "locacao");
}

export function mapImovelLiderVendaImobBrasil(item, linkReal) {
  return mapImovelLiderImobBrasil(item, linkReal, "venda");
}

function mapImovelLiderImobBrasil(item, linkReal, modo) {
  const url = new URL(linkReal);
  if (url.origin !== new URL(URL_LOCACAO_LIDER).origin || !/^\/imovel\/\d+\/[^/]+$/.test(url.pathname)) {
    throw new Error(`URL de ${modo} Lider invalida.`);
  }
  return mapImovelLider(item, modo, url.href);
}

function mapImovelLiderSite(item, linkReal, modo) {
  const url = new URL(linkReal);
  if (url.origin !== "https://www.lidernegociosimob.com.br" || !/^\/imovel\/[^/]+$/.test(url.pathname)) {
    throw new Error(`URL de ${modo} Lider invalida.`);
  }
  return mapImovelLider(item, modo, url.href);
}

function mapImovelLider(item, modo, linkReal) {
  const finalidade = normalize(item.finalidade);
  const finalidadeOk = finalidade === "ambos" || (modo === "venda" ? /vend|compr/.test(finalidade) : /loca|alug/.test(finalidade));
  if ((!linkReal && !/^[a-f0-9-]{36}$/i.test(item.id ?? "")) || !finalidadeOk) {
    throw new Error(`Imovel sem ID valido ou fora da finalidade ${modo}.`);
  }
  const valor = modo === "venda" ? item.valor_venda : item.valor_locacao;
  const preco = valor == null ? null : Number(valor);
  if (preco !== null && !Number.isFinite(preco)) throw new Error(`Preco de ${modo} invalido.`);
  const cidade = cidades.find(city => normalize(city.nome) === normalize(item.cidade))?.slug || item.cidade || "";
  const bairroEncontrado = resolverBairroCatalogo(item.bairro ?? "", cidade);
  const bairroValido = bairroEncontrado && bairros.some(bairro => bairro.slug === bairroEncontrado && normalizarBairro(bairro.cidade) === normalizarBairro(cidade));
  const comodidades = Array.isArray(item.comodidades) ? item.comodidades.map(value => typeof value === "string" ? value : value?.nome).join(" ") : String(item.comodidades ?? "");
  const local = [item.bairro, item.cidade, item.estado].filter(Boolean).join(", ");
  const endereco = String(item.endereco_completo ?? "").trim();
  return {
    linkReal: linkReal || `https://www.lidernegociosimob.com.br/p/${item.id}`,
    titulo: item.titulo ?? "",
    preco,
    localizacao: endereco && !local.includes(endereco) ? `${local} - ${endereco}` : local,
    tipoImovel: resolverTipoCatalogoContido(item.subtipo) || resolverTipoCatalogoContido(item.tipo) || item.subtipo || item.tipo || "",
    bairro: bairroValido ? bairroEncontrado : item.bairro ?? "",
    cidade,
    dormitorioValor: Number(item.quartos) || 0,
    banheiroValor: Number(item.banheiros) || 0,
    ambienteValor: Number(item.salas) || 0,
    areaValor: Number(item.metragem_util) || Number(item.metragem_total) || 0,
    garagemValor: Number(item.vagas_garagem) || 0,
    elevadorValor: /elevador/i.test(comodidades) ? 1 : 0,
    codigoBase: item.codigo ?? "",
    linkCard: 0,
    corretor: "Lider",
    dataInclusao: new Date().toISOString(),
    dataExclusao: "",
    linkFoto: item.capa_url || "",
    atualizadoEm: new Date().toISOString(),
  };
}

export async function contarLiderLocacao(browser, options = {}) {
  const { contarLiderLocacaoSite } = await import("./extractor-locacao-imobbrasil.js");
  return contarLiderLocacaoSite(browser, options);
}

export async function extractLiderLocacao(browser, { totalEsperado } = {}) {
  const { extractLiderLocacaoData } = await import("./extractor-locacao-imobbrasil.js");
  return (await extractLiderLocacaoData(browser, new Set(), { totalEsperado })).imoveisRaspados;
}

export async function extractLiderNovaData(browser, existingCodes = new Set(), { totalEsperado } = {}) {
  const { extractLiderLocacaoData } = await import("./extractor-locacao-imobbrasil.js");
  return extractLiderLocacaoData(browser, existingCodes, { totalEsperado });
}

export async function extractLiderVendasData(browser, existingCodes = new Set(), options = {}) {
  const vendas = await import("./extractor-locacao-imobbrasil.js");
  return vendas.extractLiderVendasData(browser, existingCodes, options);
}