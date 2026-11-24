import fs from "node:fs";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const PAGE_SIZE = 12;
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const falhar = (message, project) => new Error(`[${project?.collection ?? "Netimoveis"}] ${message}; dados anteriores preservados.`);
const localizacao = [{ urlPais: "BR", urlEstado: "rio-de-janeiro", urlCidade: "", urlRegiao: "", urlBairro: "", urlLogradouro: "", idAgrupamento: "", idLocalizacao: "BR-RJ" }];
const rotas = {
  rioLuciene: {
    kind: "luciene",
    venda: "https://www.lucieneleitenetimoveis.com.br/venda/rio-de-janeiro?tipos=todos&transacao=venda&localizacao=BR-RJ&pagina=1",
    locacao: "https://www.lucieneleitenetimoveis.com.br/locacao/rio-de-janeiro/apartamento?tipo=apartamento&transacao=locacao&localizacao=BR-RJ&pagina=1",
  },
  rioFr: {
    kind: "netimoveis",
    venda: "https://www.frimoveis.com.br/venda/rio-de-janeiro?tipos=todos&transacao=venda&localizacao=BR-RJ&pagina=1",
    locacao: "https://www.frimoveis.com.br/locacao/rio-de-janeiro?tipos=todos&transacao=locacao&localizacao=BR-RJ&pagina=1",
  },
};

export function urlBuscaLuciene(project, negociacao, pagina) {
  const config = rotas[project?.collection];
  if (!config || project.kind !== config.kind || !["venda", "locacao"].includes(negociacao) || !Number.isSafeInteger(pagina) || pagina < 1) throw falhar("Projeto, modalidade ou pagina invalida", project);
  const expected = config[negociacao];
  if ((negociacao === "venda" ? project.urlVendas : project.urlLocacao) !== expected) throw falhar("Filtros da rota configurada invalidos", project);
  const url = new URL("/wp-admin/admin-ajax.php", expected);
  const filtro = new URL(expected).searchParams;
  const tipo = filtro.has("tipo") ? "tipo" : "tipos";
  url.searchParams.set(tipo, filtro.get(tipo));
  url.searchParams.set("transacao", negociacao);
  url.searchParams.set("localizacao", JSON.stringify(localizacao));
  url.searchParams.set("action", "pesquisar_imoveis");
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("retornaPaginacao", "true");
  url.searchParams.set("outrasPags", "true");
  return url.href;
}

export async function buscarLuciene(project, negociacao, pagina, { request = fetch } = {}) {
  const response = await request(urlBuscaLuciene(project, negociacao, pagina), { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw falhar(`HTTP ${response.status} na pagina ${pagina}`, project);
  const data = await response.json();
  if (data?.erro !== false || !Number.isSafeInteger(data.totalDeRegistros) || data.totalDeRegistros < 0 || !Array.isArray(data.lista)) throw falhar(`Resposta invalida na pagina ${pagina}: ${texto(data?.mensagem)}`, project);
  return { total: data.totalDeRegistros, items: data.lista };
}

function numero(value, campo) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw falhar(`${campo} invalido`);
  return value;
}

export function mapearLuciene(item, project, negociacao, now = new Date()) {
  const codigoBase = texto(item?.imovelSan_Id);
  const tipo = texto(item?.tipoImovel1);
  const nomeCidade = texto(item?.nomeCidade);
  const bairroOriginal = texto(item?.nomeBairro);
  if (!/^\d+$/.test(codigoBase) || !tipo || !nomeCidade || !bairroOriginal || item.siglaEstado !== "RJ"
    || item.paramTransacao !== negociacao || item[negociacao === "venda" ? "exibeVenda" : "exibeLocacao"] !== 1
    || project.collection === "rioLuciene" && negociacao === "locacao" && !normalizar(tipo).startsWith("apartamento")) throw falhar(`Card invalido ou fora dos filtros: ${codigoBase}`, project);
  let link;
  try { link = new URL(item.urlDetalheImovel, new URL(project.urlVendas).origin + "/"); } catch { throw falhar(`Link invalido: ${codigoBase}`); }
  const partes = link.pathname.split("/").filter(Boolean);
  if (link.origin !== new URL(project.urlVendas).origin || partes.length !== 3 || partes[0] !== "imovel"
    || !partes[1].startsWith(`${negociacao}-`) || partes[2] !== codigoBase || link.search || link.hash) throw falhar(`Link inesperado: ${codigoBase}`);
  const preco = numero(item[negociacao === "venda" ? "valorImovel" : "valorLocacao"], "Preco");
  if (preco === 0 && project.collection !== "rioFr") throw falhar(`Preco zero: ${link.href}`, project);
  if (preco === 0) console.warn(`[${project.collection}] Preco zero anunciado: ${link.href}`);
  const matches = cidades.filter(city => normalizar(city.nome) === normalizar(nomeCidade) && city.estado === "RJ");
  const slugs = new Set(matches.map(city => city.slug));
  const cidade = slugs.size === 1 ? [...slugs][0] : nomeCidade;
  const bairro = resolverBairroNiteroi(bairroOriginal, cidade) || bairroOriginal;
  const tipoImovel = resolverTipoPrefixoCatalogo(tipo) || tipo;
  const rua = texto(item.logradouroPublico);
  const endereco = [rua, bairroOriginal, `${nomeCidade} - RJ`].filter(Boolean).join(", ");
  const foto = texto(item.nomeArquivoThumb);
  if (foto && !/^https:\/\//i.test(foto)) throw falhar(`Foto invalida: ${codigoBase}`);
  if (typeof item.elevadorSocial !== "boolean" || typeof item.elevadorDeServico !== "boolean") throw falhar(`Elevador invalido: ${codigoBase}`);
  const timestamp = now.toISOString();
  return {
    linkReal: link.href, titulo: `${tipo} para ${negociacao === "venda" ? "venda" : "alugar"} - ${bairroOriginal}, ${nomeCidade}`,
    preco, localizacao: endereco, tipoImovel, bairro, cidade,
    dormitorioValor: numero(item.quartos, "Quartos"), banheiroValor: numero(item.banho, "Banheiros"),
    ambienteValor: numero(item.sala, "Salas"), areaValor: numero(item.areaRealPrivativa, "Area"),
    garagemValor: numero(item.vagaGaragem, "Vagas"), elevadorValor: Number(item.elevadorSocial || item.elevadorDeServico),
    codigoBase, linkCard: link.href, corretor: project.displayName, dataInclusao: timestamp,
    dataExclusao: "", linkFoto: foto, atualizadoEm: timestamp,
  };
}

export async function contarLuciene(_browser, project, negociacao) {
  return (await buscarLuciene(project, negociacao, 1)).total;
}

export async function coletarLuciene(_browser, project, negociacao, { totalEsperado, primeiraPagina = false, request = fetch, aguardar = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Total esperado invalido");
  const result = [];
  const links = new Set();
  let pagina = 1;
  while (true) {
    const { total, items } = await buscarLuciene(project, negociacao, pagina, { request });
    if (total !== totalEsperado) throw falhar(`Total alterado: ${totalEsperado} -> ${total}`);
    const offset = (pagina - 1) * PAGE_SIZE;
    const overlap = result.length - offset;
    if (overlap < 0 || overlap > PAGE_SIZE) throw falhar("Sobreposicao de paginas invalida");
    const minimum = Math.min(totalEsperado - offset, pagina === 1 ? PAGE_SIZE : PAGE_SIZE * 3);
    if (items.length < minimum) throw falhar(`Pagina ${pagina} incompleta: ${items.length}/${minimum}`);
    const mapped = items.slice(0, Math.min(items.length, totalEsperado - offset)).map(item => mapearLuciene(item, project, negociacao));
    for (let i = 0; i < overlap; i++) {
      if (mapped[i]?.linkReal !== result[offset + i]?.linkReal) throw falhar(`Ordem mudou na pagina ${pagina}`);
    }
    const available = pagina === 1 ? mapped.slice(0, PAGE_SIZE) : mapped;
    for (const item of available.slice(overlap)) {
      if (links.has(item.linkReal)) throw falhar(`Link duplicado: ${item.linkReal}`);
      links.add(item.linkReal);
      result.push(item);
    }
    console.log(`[${project.collection}] ${negociacao}: ${result.length}/${totalEsperado}.`);
    if (primeiraPagina || result.length === totalEsperado) return result;
    if (pagina === 1) pagina = 2;
    else pagina = Math.floor(result.length / PAGE_SIZE);
    await aguardar(500);
  }
}
