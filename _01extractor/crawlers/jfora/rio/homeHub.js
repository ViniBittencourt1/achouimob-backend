import fs from "node:fs";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const API_ORIGIN = "https://apiv2.homehub.com.br";
const API_PATH = "/api/v1/estates/listSite";
const SITE_ORIGIN = "https://homehub.com.br";
const PAGE_SIZE = 15;
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8",
));
const bairros = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_jfBairros.json", import.meta.url), "utf8",
));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizar = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const falhar = message => new Error(`[rioHomeHub] ${message}; dados anteriores preservados.`);

function conferirTotal(totalEsperado, total, pagina) {
  if (total !== totalEsperado) {
    throw Object.assign(falhar(`Total alterado na pagina ${pagina}: ${totalEsperado} -> ${total}`), {
      code: "HOMEHUB_TOTAL_ALTERADO",
    });
  }
}

function slug(value) {
  return normalizar(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function urlBase(project, negociacao) {
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  return validarUrlHomeHub(url, project, negociacao);
}

export function validarUrlHomeHub(value, project, negociacao) {
  let url;
  try { url = new URL(value); } catch { throw falhar("URL de listagem invalida"); }
  const path = negociacao === "venda"
    ? "/venda/rio-de-janeiro/rj/brasil"
    : "/aluguel/rio-de-janeiro/rj/brasil";
  if (!["venda", "locacao"].includes(negociacao) || url.origin !== SITE_ORIGIN || url.username || url.password
    || url.pathname !== path || url.search || url.hash) {
    throw falhar(`Origem, finalidade ou rota invalidas: ${url.href}`);
  }
  const expected = new URL(negociacao === "venda" ? project.urlVendas : project.urlLocacao);
  if (expected.href !== url.href) throw falhar("Configuracao da rota invalida");
  return url.href;
}

function urlApi(negociacao, pagina) {
  const params = new URLSearchParams([
    [negociacao === "venda" ? "for_sale" : "for_rent", "true"],
    ["city_id[]", "5"],
    ["order_by", "authorized_at"],
    ["order_type", "DESC"],
    ["estate_development", "false"],
    ["per", String(PAGE_SIZE)],
    ["publish_homehub", "true"],
    ["publish_judicearaujo", "false"],
    ["page", String(pagina)],
  ]);
  return `${API_ORIGIN}${API_PATH}?${params}`;
}

function validarResposta(data, negociacao, pagina) {
  const pagination = data?.pagination;
  const total = pagination?.total_count;
  const totalPaginas = Number.isSafeInteger(total) ? Math.ceil(total / PAGE_SIZE) : -1;
  const esperadoNaPagina = Number.isSafeInteger(total)
    ? Math.min(PAGE_SIZE, Math.max(0, total - (pagina - 1) * PAGE_SIZE))
    : -1;
  if (!Array.isArray(data?.estates) || !Number.isSafeInteger(total) || total < 0
    || pagination.current_page !== pagina || pagination.total_pages !== totalPaginas
    || pagination.per_page !== PAGE_SIZE || data.estates.length !== esperadoNaPagina) {
    throw falhar(`Resposta ou paginacao invalida na pagina ${pagina}`);
  }
  const finalidade = negociacao === "venda" ? "for_sale" : "for_rent";
  const codes = data.estates.map(estate => texto(estate?.code));
  if (data.estates.some(estate => estate?.[finalidade] !== true)
    || codes.some(code => !/^\d+$/.test(code)) || new Set(codes).size !== codes.length) {
    throw falhar(`Anuncio fora da finalidade na pagina ${pagina}`);
  }
  return { total, estates: data.estates };
}

async function buscarPagina(negociacao, pagina, request = fetch) {
  if (!["venda", "locacao"].includes(negociacao) || !Number.isSafeInteger(pagina) || pagina < 1) {
    throw falhar("Finalidade ou pagina invalida");
  }
  const response = await request(urlApi(negociacao, pagina), { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw falhar(`HTTP ${response.status} na API, pagina ${pagina}`);
  return validarResposta(await response.json(), negociacao, pagina);
}

function numero(value, campo) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw falhar(`${campo} invalido`);
  return result;
}

function resolverCidade(nomeCidade) {
  const matches = cidades.filter(cidade => cidade.estado === "RJ" && normalizar(cidade.nome) === normalizar(nomeCidade));
  const slugs = new Set(matches.map(cidade => cidade.slug));
  if (slugs.size !== 1) throw falhar(`Cidade sem correspondencia unica: ${nomeCidade}`);
  return [...slugs][0];
}

function validarLink(value, codigoBase, negociacao) {
  let url;
  try { url = new URL(value, SITE_ORIGIN); } catch { throw falhar(`Link invalido: ${codigoBase}`); }
  const route = negociacao === "venda" ? "venda" : "aluguel";
  if (url.origin !== SITE_ORIGIN || url.username || url.password || url.search || url.hash
    || !new RegExp(`^/imovel/${route}/[^/]+/cod-${codigoBase}/[^/]+$`).test(url.pathname)) {
    throw falhar(`Link fora da rota esperada: ${url.href}`);
  }
  return url.href;
}

function nomeEndereco(value) {
  const nome = typeof value === "string" ? value : value?.name;
  return typeof nome === "string" && !/\[object object\]/i.test(nome) ? texto(nome) : "";
}

function bairroDoLink(linkReal, cidade) {
  const caminho = slug(decodeURIComponent(new URL(linkReal).pathname.split("/")[3]));
  const marcador = `-${cidade}-brasil`;
  const posicao = caminho.lastIndexOf(marcador);
  if (posicao < 0 || !/^(-|$)/.test(caminho.slice(posicao + marcador.length))) return "";
  const antesDaCidade = `-${caminho.slice(0, posicao)}`;
  let tamanho = 0;
  const slugs = new Set();
  for (const entry of bairros) {
    if (entry.cidade !== cidade || !entry.slug) continue;
    for (const valor of [entry.nome, entry.slug]) {
      const candidato = slug(valor);
      if (!candidato || candidato.length < tamanho || !antesDaCidade.endsWith(`-${candidato}`)) continue;
      if (candidato.length > tamanho) slugs.clear();
      tamanho = candidato.length;
      slugs.add(entry.slug);
    }
  }
  if (slugs.size !== 1) return "";
  const [bairro] = slugs;
  return bairros.find(entry => entry.cidade === cidade && entry.slug === bairro && entry.principal === "sim")?.nome
    || bairro;
}

export function mapearHomeHub(estate, link, project, negociacao, now = new Date()) {
  if (!["venda", "locacao"].includes(negociacao)) throw falhar("Finalidade invalida");
  const codigoBase = texto(estate?.code);
  const tipo = texto(estate?.category?.name);
  if (!estate || !/^\d+$/.test(codigoBase) || !tipo
    || estate[negociacao === "venda" ? "for_sale" : "for_rent"] !== true) {
    throw falhar(`Anuncio incompleto ou fora dos filtros: ${codigoBase}`);
  }
  const linkReal = validarLink(link, codigoBase, negociacao);
  const partesEndereco = nomeEndereco(estate.complete_address).split(/\s+-\s+/);
  const cidadeNoEndereco = partesEndereco.at(-1)?.match(/^(.*?)\s*\/\s*RJ$/i);
  if (cidadeNoEndereco) partesEndereco.pop();
  const nomeCidade = cidadeNoEndereco?.[1] || nomeEndereco(estate.street?.neighborhood?.city) || "Rio de Janeiro";
  const cidade = resolverCidade(nomeCidade);
  const bairroOriginal = (partesEndereco.length > 1 ? partesEndereco.pop() : "")
    || nomeEndereco(estate.street?.neighborhood)
    || bairroDoLink(linkReal, cidade)
    || nomeEndereco(estate.subneighborhood);
  if (!bairroOriginal) throw falhar(`Bairro nao identificado: ${codigoBase}`);
  const rua = nomeEndereco(estate.address_name) || partesEndereco.join(" - ")
    || [nomeEndereco(estate.street_type), nomeEndereco(estate.street)].filter(Boolean).join(" ");
  const bairro = resolverBairroNiteroi(bairroOriginal, cidade) || slug(bairroOriginal);
  const precoOriginal = estate[negociacao === "venda" ? "sale_price" : "rent_price"];
  const preco = precoOriginal === null || precoOriginal === undefined ? null : numero(precoOriginal, "Preco");
  const foto = texto(estate.estate_photos?.[0]?.photo);
  if (foto && !/^https:\/\//i.test(foto)) throw falhar(`Foto invalida: ${codigoBase}`);
  const timestamp = now.toISOString();
  const tipoImovel = resolverTipoPrefixoCatalogo(tipo) || tipo;
  return {
    linkReal,
    titulo: `${tipo} ${negociacao === "venda" ? "a venda" : "para alugar"} - ${bairroOriginal}, ${nomeCidade}`,
    preco,
    localizacao: [rua, bairroOriginal, `${nomeCidade} - RJ`].filter(Boolean).join(", "),
    tipoImovel,
    bairro,
    cidade,
    dormitorioValor: numero(estate.bedrooms, "Quartos"),
    banheiroValor: numero(estate.social_bathrooms, "Banheiros"),
    ambienteValor: 0,
    areaValor: numero(estate.size, "Area"),
    garagemValor: numero(estate.parking, "Vagas"),
    elevadorValor: 0,
    codigoBase,
    linkCard: linkReal,
    corretor: texto(estate.agency?.name) || project.displayName,
    dataInclusao: timestamp,
    dataExclusao: "",
    linkFoto: foto,
    atualizadoEm: timestamp,
  };
}

async function linksRenderizados(page) {
  return page.$$eval('main a[href*="/imovel/"]', anchors => anchors.map(anchor => ({
    href: anchor.href,
    codigo: anchor.href.match(/\/cod-(\d+)\//)?.[1] || "",
  })));
}

function mapearLinksPorCodigo(links) {
  const result = new Map();
  for (const link of links) {
    if (!link.codigo) continue;
    if (result.has(link.codigo) && result.get(link.codigo) !== link.href) {
      throw falhar(`Codigo com links ambiguos: ${link.codigo}`);
    }
    result.set(link.codigo, link.href);
  }
  return result;
}

async function esperarPagina(page, codes, linkCountBefore = 0) {
  await page.waitForFunction(({ expected, previousCount }) => {
    const main = document.querySelector("main");
    const anchors = [...document.querySelectorAll('main a[href*="/imovel/"]')];
    const visible = new Set(anchors.map(anchor => anchor.href.match(/\/cod-(\d+)\//)?.[1]).filter(Boolean));
    return main && !main.closest("[hidden]") && main.getClientRects().length > 0
      && anchors.length >= previousCount + expected.length
      && expected.every(code => visible.has(code));
  }, { timeout: 60000 }, { expected: codes, previousCount: linkCountBefore });
}

async function esperarBotaoMais(page) {
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => {
    const text = (button.textContent || "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    return text.includes("carregar mais imoveis") && !button.disabled && button.getClientRects().length > 0;
  }), { timeout: 60000 });
}

async function carregarMais(page) {
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const state = await button.evaluate(element => ({
      text: (element.textContent || "").normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase(),
      disabled: element.disabled,
      visible: element.getClientRects().length > 0,
    }));
    if (!state.visible || state.disabled || !state.text.includes("carregar mais imoveis")) continue;
    await button.click();
    return true;
  }
  return false;
}

export async function contarHomeHub(_browser, project, negociacao, { request = fetch } = {}) {
  urlBase(project, negociacao);
  return (await buscarPagina(negociacao, 1, request)).total;
}

export async function coletarHomeHub(browser, project, negociacao, {
  totalEsperado, primeiraPagina = false, request = fetch,
} = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0 || typeof primeiraPagina !== "boolean") {
    throw falhar("totalEsperado ou primeiraPagina invalido");
  }
  const url = urlBase(project, negociacao);
  const first = await buscarPagina(negociacao, 1, request);
  conferirTotal(totalEsperado, first.total, 1);
  if (totalEsperado === 0) return [];

  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!response || !response.ok()) throw falhar(`HTTP ${response?.status?.() ?? "sem resposta"} na listagem`);
    const pageUrl = new URL(page.url());
    if (pageUrl.origin !== SITE_ORIGIN || pageUrl.pathname !== new URL(url).pathname) {
      throw falhar(`Listagem redirecionada: ${pageUrl.href}`);
    }

    const records = [];
    const links = new Set();
    const paginas = primeiraPagina ? 1 : Math.max(1, Math.ceil(totalEsperado / PAGE_SIZE));
    let snapshot = first;
    for (let pagina = 1; pagina <= paginas; pagina++) {
      if (pagina > 1) {
        await esperarBotaoMais(page);
        const apiResponsePromise = page.waitForResponse(response => {
          let responseUrl;
          try { responseUrl = new URL(response.url()); } catch { return false; }
          return responseUrl.origin === API_ORIGIN && responseUrl.pathname === API_PATH
            && responseUrl.searchParams.get("page") === String(pagina);
        }, { timeout: 60000 });
        const previousLinks = await linksRenderizados(page);
        if (!await carregarMais(page)) throw falhar(`Botao de pagina seguinte ausente na pagina ${pagina}`);
        const apiResponse = await apiResponsePromise;
        if (!apiResponse.ok()) throw falhar(`HTTP ${apiResponse.status()} na API, pagina ${pagina}`);
        snapshot = validarResposta(await apiResponse.json(), negociacao, pagina);
        conferirTotal(totalEsperado, snapshot.total, pagina);
        await esperarPagina(page, snapshot.estates.map(estate => texto(estate.code)), previousLinks.length);
      } else {
        await esperarPagina(page, snapshot.estates.map(estate => texto(estate.code)));
      }

      const linksPorCodigo = mapearLinksPorCodigo(await linksRenderizados(page));
      for (const estate of snapshot.estates) {
        const codigoBase = texto(estate.code);
        const link = linksPorCodigo.get(codigoBase);
        if (!link) throw falhar(`Link renderizado ausente: ${codigoBase}`);
        const record = mapearHomeHub(estate, link, project, negociacao);
        if (links.has(record.linkReal)) throw falhar(`Link repetido: ${record.linkReal}`);
        links.add(record.linkReal);
        records.push(record);
      }
      console.log(`[rioHomeHub/${negociacao}] Pagina ${pagina}/${paginas}: ${records.length}/${totalEsperado}.`);
    }
    if (!primeiraPagina && records.length !== totalEsperado) {
      throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
    }
    return records;
  } finally { await page.close(); }
}
