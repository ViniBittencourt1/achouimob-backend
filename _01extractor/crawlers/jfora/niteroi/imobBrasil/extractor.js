import fs from "node:fs";
import { JSDOM } from "jsdom";
import { parseTotalVendas, validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { appendLegacyAddress, extractLegacyAddress } from "../../_utils/enrichLegacyAddress.js";
import { extractAreaValor } from "../../adMyHouse/extractor-11-areaValor.js";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoNiteroi, resolverTipoNiteroiDoLink } from "../tipoImovel.js";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const bairros = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_jfBairros.json", import.meta.url), "utf8"));
const normalizar = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function formarLocalizacaoImobBrasil(record) {
  if (String(record.localizacao || "").trim()) return record.localizacao;
  const cidade = cidades.find(item => item.slug === record.cidade && item.principal === "sim");
  const bairro = bairros.find(item => item.cidade === record.cidade && item.slug === record.bairro && item.principal === "sim");
  if (!cidade || !bairro) return record.localizacao || "";
  return `${bairro.nome}, ${cidade.nome} - ${cidade.estado}`;
}

export function resolverLocalizacaoJnDoLink(link, catalogo = bairros, { negociacao = "venda" } = {}) {
  const slug = normalizar(decodeURIComponent(new URL(link).pathname.split("/").at(-1)));
  const trecho = slug.match(negociacao === "aluguel" ? /-(?:locacao|aluguel)-(.+)$/ : /-venda-(.+)$/)?.[1];
  if (!trecho) return null;
  const slugificar = value => normalizar(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const cidade of ["niteroi-rj", "sao-goncalo-rj"]) {
    const matches = catalogo.filter(entry => entry.cidade === cidade && entry.slug).flatMap(entry =>
      [...new Set([slugificar(entry.nome), slugificar(entry.slug)])]
        .filter(nome => nome && (trecho === nome || trecho.endsWith(`-${nome}`)))
        .map(nome => ({ nome, bairro: entry.slug }))
    );
    if (!matches.length) continue;
    const maior = Math.max(...matches.map(item => item.nome.length));
    const melhores = matches.filter(item => item.nome.length === maior);
    const slugs = new Set(melhores.map(item => item.bairro));
    if (slugs.size !== 1) return null;
    return { cidade, bairro: melhores[0].bairro };
  }
  return null;
}

export function resolverLocalizacaoJnDaDescricao(html, { negociacao = "venda" } = {}) {
  const dom = new JSDOM(html);
  try {
    const heading = dom.window.document.querySelector("#desc_descricao");
    const classicHeading = [...dom.window.document.querySelectorAll(".detimo_placas")]
      .find(element => normalizar(element.querySelector(".titulo")?.textContent) === "descricao");
    const description = heading ? heading.nextElementSibling : classicHeading?.nextElementSibling;
    if (!description || !(heading ? description.classList.contains("item-imovel") : description.classList.contains("fonte_padrao"))) return null;
    const clone = description.cloneNode(true);
    clone.querySelectorAll("style, script, form").forEach(element => element.remove());
    const text = clone.textContent.replace(/\s+/g, " ").trim();
    const matches = [...text.matchAll(/\b(?:bairro|em|no|na)\s+([^,.;!]+)/gi)]
      .map(match => {
        const bairro = negociacao === "aluguel" ? match[1].split(/\s+com\b/i)[0] : match[1];
        const slug = normalizar(bairro).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return resolverLocalizacaoJnDoLink(`https://www.jncorretoresdeimoveis.com.br/imovel/1/imovel-venda-${slug}`);
      }).filter(Boolean);
    for (const cidade of ["niteroi-rj", "sao-goncalo-rj"]) {
      const candidates = matches.filter(item => item.cidade === cidade);
      if (!candidates.length) continue;
      return new Set(candidates.map(item => item.bairro)).size === 1 ? candidates[0] : null;
    }
    return null;
  } finally { dom.window.close(); }
}

function numero(value) {
  const match = String(value || "").match(/\d+(?:\.\d{3})*(?:,\d+)?/);
  return match ? Number(match[0].replace(/\./g, "").replace(",", ".")) : 0;
}

export function lerListagemImobBrasil() {
  const roots = [...document.querySelectorAll(".imovelcard, .item-lista, .imoveis_listar")];
  return {
    cards: roots.filter(root => [...root.querySelectorAll('a[href*="/imovel/"]')].some(anchor => /\/imovel\/\d+\//.test(anchor.pathname))).map(root => root.outerHTML),
    labels: [...document.querySelectorAll(".topsearch__total, .grid-3, .lista_imoveis_paginacao .fontepadrao_cor_grande")].map(element => element.textContent),
    pages: [...document.querySelectorAll('a[href*="pag="]')].map(anchor => anchor.href),
  };
}

export function parseCardImobBrasil(html, project, now = new Date(), { negociacao = "venda" } = {}) {
  const aluguel = negociacao === "aluguel";
  const tituloNegociacao = aluguel ? /\s+para\s+(?:loca[c\u00e7][a\u00e3]o|aluguel)\b/i : /\s+para\s+venda\b/i;
  const dom = new JSDOM(html, { url: project.url });
  try {
    const document = dom.window.document;
    const anchor = [...document.querySelectorAll('a[href*="/imovel/"]')].find(item => /\/imovel\/\d+\//.test(item.pathname));
    if (!anchor) throw new Error(`[${project.collection}] Card sem link de imovel.`);
    const link = new URL(anchor.href);
    if (link.hostname !== new URL(project.url).hostname || !(aluguel ? /-(?:locacao|aluguel)(?:-|$)/ : /-venda(?:-|$)/).test(link.pathname)) {
      throw new Error(`[${project.collection}] Card fora da origem de ${aluguel ? "alugueis" : "vendas"}: ${link.href}`);
    }
    link.search = "";
    link.hash = "";
    const linkReal = link.href;
    const titulo = anchor.title || document.querySelector("img")?.alt || "";
    const localizacao = document.querySelector(".imovelcard__info__local, .desc-item-lista h3, .conteudo1 h2")?.textContent.trim() || "";
    const location = localizacao.match(/^(.*),\s*([^,]+)\s*\/\s*([A-Z]{2})?$/i);
    const bairroExtraido = location?.[1] || titulo.match(/\bbairro\s+([^,]+)/i)?.[1]?.trim() ||
      (localizacao.includes("/") ? "" : localizacao);
    const nomeCidade = location?.[2] || titulo.match(aluguel ? /\bpara\s+(?:loca[c\u00e7][a\u00e3]o|aluguel),\s*em\s+([^,]+),/i : /\bpara\s+venda,\s*em\s+([^,]+),/i)?.[1]?.trim() || "";
    const ufLocal = location?.[3];
    const cityPath = normalizar(nomeCidade).replace(/[^a-z0-9]+/g, "-");
    const uf = ufLocal || link.pathname.match(new RegExp(`-${cityPath}-([a-z]{2})(?:-|$)`))?.[1] || "";
    const candidates = cidades.filter(item => nomeCidade
      ? normalizar(item.nome) === normalizar(nomeCidade) && (!uf || item.slug.endsWith(`-${uf.toLowerCase()}`))
      : link.pathname.includes(`-${item.slug}-`) || link.pathname.endsWith(`-${item.slug}`)
    );
    const citySlugs = new Set(candidates.map(item => item.slug));
    let cidade = citySlugs.size === 1 ? citySlugs.values().next().value : nomeCidade.trim();
    const localizacaoDoLink = ["nitJn", "nitNiteroi"].includes(project.collection) && !cidade ? resolverLocalizacaoJnDoLink(linkReal, bairros, { negociacao }) : null;
    if (localizacaoDoLink) {
      cidade = localizacaoDoLink.cidade;
      console.log(`[${project.collection}] Cidade identificada pelo bairro no link: ${localizacaoDoLink.bairro} / ${cidade} (${linkReal})`);
    }
    if (citySlugs.size !== 1 && !localizacaoDoLink) console.warn(`[${project.collection}] Cidade fora do catalogo: "${nomeCidade}" / ${uf} (${linkReal})`);
    const bairro = localizacaoDoLink?.bairro || resolverBairroNiteroi(bairroExtraido, cidade);
    if (!bairro) console.warn(`[${project.collection}] Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade}; ${linkReal})`);
    const tipoExtraido = titulo.split(tituloNegociacao)[0].trim();
    const tipoImovel = resolverTipoNiteroi(tipoExtraido) || resolverTipoNiteroiDoLink(linkReal);
    if (!tipoImovel) console.warn(`[${project.collection}] Tipo fora do catalogo: "${tipoExtraido}" (${linkReal})`);
    const ref = document.querySelector(".imovelcard__info__ref strong, .desc-item-lista small strong, .conteudo1 span")?.textContent || "";
    const codigoBase = ref.replace(/^\s*#?\s*Ref\s*:\s*/i, "").trim() || link.pathname.split("/")[2];
    const priceText = document.querySelector(".imovelcard__valor__valor, .desc-item-lista ul li, .valor")?.textContent.trim();
    if (!priceText) throw new Error(`[${project.collection}] Preco ausente: ${linkReal}`);
    const preco = /\d/.test(priceText) ? numero(priceText) : null;
    if (preco === null && !/consult/i.test(priceText)) throw new Error(`[${project.collection}] Preco nao reconhecido: ${priceText}`);
    const features = [...document.querySelectorAll(".imovelcard__info__feature, td, .itens")];
    const feature = (icon, label) => {
      const element = features.find(item => item.querySelector(icon) ||
        label.test(normalizar(item.textContent.replace(/(\p{L})(\d)/gu, "$1 $2"))));
      return numero(element?.querySelector("b, span")?.textContent || element?.textContent);
    };
    const image = document.querySelector(".imovelcard__img img, .img-item-lista img, .imagem img");
    const imageUrl = image?.getAttribute("data-src") || image?.getAttribute("src");
    const timestamp = now.toISOString();
    return {
      linkReal, titulo, preco,
      localizacao: ["nitJn", "nitNiteroi"].includes(project.collection)
        ? formarLocalizacaoImobBrasil({ localizacao, bairro, cidade }) : localizacao,
      tipoImovel: tipoImovel || tipoExtraido,
      bairro: bairro || bairroExtraido.trim(), cidade,
      dormitorioValor: feature(".fa-bed", /\bquartos?\b|\bdormitorios?\b/),
      banheiroValor: feature(".fa-shower", /\bbanheiros?\b/),
      ambienteValor: 0,
      areaValor: feature(".fa-arrows-h", /\barea\b/),
      garagemValor: feature(".fa-car", /\bvagas?\b/),
      elevadorValor: 0, codigoBase, linkCard: linkReal, corretor: project.displayName,
      dataInclusao: timestamp, dataExclusao: "",
      linkFoto: imageUrl ? new URL(imageUrl, project.url).href : "", atualizadoEm: timestamp,
    };
  } finally { dom.window.close(); }
}

export const IMOBBRASIL_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

export function validarUrlLocacaoImobBrasil(project, value) {
  const url = new URL(value);
  if (url.origin !== new URL(project.url).origin || url.pathname.replace(/\/$/, "") !== "/imovel/locacao") {
    throw new Error(`[${project.collection}] A coleta exige a origem e a rota exclusiva de locacao.`);
  }
}

export function lerTotalLocacaoImobBrasil(labels) {
  const totals = labels.flatMap(label => {
    const match = normalizar(label).match(/^(\d[\d.]*)\s+imove(?:l|is)\s+encontrad[oa]s?\b/);
    return match ? [Number(match[1].replace(/\./g, ""))] : [];
  });
  if (!totals.length || new Set(totals).size !== 1 || !Number.isSafeInteger(totals[0]) || totals[0] < 0) {
    throw new Error("Total de alugueis nao identificado ou conflitante no contador ImobBrasil.");
  }
  return totals[0];
}

async function carregarPaginaImobBrasil(page, destination, project, pageNum, retryDelayMs) {
  const maxTentativas = 3;
  for (let tentativa = 1; ; tentativa++) {
    try {
      const response = await page.goto(destination.href, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (!response?.ok()) {
        const status = response?.status();
        const error = new Error(`[${project.collection}] HTTP ${status} na pagina ${pageNum}; base preservada.`);
        if ([403, 429].includes(status)) error.code = "IMOBBRASIL_BLOCKED";
        error.retryable = status >= 500 && status <= 599;
        throw error;
      }
      return;
    } catch (error) {
      const transitorio = error.retryable === true || error.name === "TimeoutError" ||
        /net::ERR_|Navigation timeout|Execution context was destroyed/i.test(error.message || "");
      if (!transitorio || tentativa >= maxTentativas) throw error;
      const espera = retryDelayMs * tentativa;
      console.warn(`[${project.collection}] Falha transitoria na pagina ${pageNum} (tentativa ${tentativa}/${maxTentativas}): ${error.message} Repetindo a mesma pagina em ${espera}ms.`);
      if (espera > 0) await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
}

// Mantem vendas como padrao; negociacao="aluguel" restringe links e contagem a locacao.
export async function extractImobBrasilSales(browser, project, { totalEsperado, somentePrimeiraPagina = false, negociacao = "venda", retryDelayMs = 3000 } = {}) {
  const aluguel = negociacao === "aluguel";
  const config = aluguel ? null : projetoContagemVendas(project.collection);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error(`Precontagem de ${aluguel ? "alugueis" : "vendas"} obrigatoria.`);
  if (aluguel) validarUrlLocacaoImobBrasil(project, project.url);
  const page = await browser.newPage();
  const records = new Map();
  try {
    await page.setUserAgent(IMOBBRASIL_USER_AGENT);
    await page.setExtraHTTPHeaders({ "accept-language": "pt-BR,pt;q=0.9" });
    for (let pageNum = 1; ; pageNum++) {
      const destination = new URL(project.url);
      destination.searchParams.set("pag", String(pageNum));
      await carregarPaginaImobBrasil(page, destination, project, pageNum, retryDelayMs);
      if (aluguel) validarUrlLocacaoImobBrasil(project, page.url());
      else validarUrlContagemVendas(config, page.url());
      const snapshot = await page.evaluate(lerListagemImobBrasil);
      const label = aluguel ? null : snapshot.labels.find(text => new RegExp(config.pattern, "i").test(normalizar(text)));
      const totalAtual = aluguel ? lerTotalLocacaoImobBrasil(snapshot.labels) : label === undefined ? null : parseTotalVendas(label, config);
      if (totalAtual !== totalEsperado) {
        throw new Error(`[${project.collection}] Contagem mudou ou nao foi identificada; base preservada.`);
      }
      if (totalEsperado === 0) {
        if (snapshot.cards.length) throw new Error(`[${project.collection}] Contador zero com cards; base preservada.`);
        return [];
      }
      const before = records.size;
      for (const html of snapshot.cards) {
        const record = parseCardImobBrasil(html, project, new Date(), { negociacao });
        records.set(record.linkReal, record);
      }
      console.log(`[${project.collection}] Pagina ${pageNum}: ${records.size}/${totalEsperado} imoveis unicos (${(records.size / totalEsperado * 100).toFixed(1)}%).`);
      if (records.size > totalEsperado) throw new Error(`[${project.collection}] Coleta acima da precontagem; base preservada.`);
      if (somentePrimeiraPagina) {
        if (!records.size) throw new Error(`[${project.collection}] Nenhum card na primeira pagina.`);
        return [...records.values()];
      }
      if (records.size === totalEsperado) return [...records.values()];
      if (records.size === before) throw new Error(`[${project.collection}] Paginacao sem novos imoveis; base preservada.`);
      const hasNext = snapshot.pages.some(href => {
        const next = new URL(href, project.url);
        return next.hostname === destination.hostname && next.pathname.replace(/\/$/, "") === destination.pathname.replace(/\/$/, "") &&
          Number(next.searchParams.get("pag")) === pageNum + 1;
      });
      if (!hasNext) throw new Error(`[${project.collection}] Coleta incompleta: ${records.size}/${totalEsperado}; base preservada.`);
    }
  } finally { await page.close(); }
}

export async function enriquecerNovosImobBrasil(browser, records, anteriores, { projectName = "ImobBrasil", negociacao = "venda" } = {}) {
  if (negociacao === "aluguel") {
    for (const record of records) {
      const previous = anteriores.get(record.linkReal);
      if (!record.cidade && previous?.cidade) {
        record.cidade = previous.cidade;
        record.bairro = previous.bairro || record.bairro;
      }
      if (previous?.localizacao && previous.localizacao.startsWith(record.localizacao)) record.localizacao = previous.localizacao;
    }
  }
  const precisaCidade = record => ["nitJn", "nitNiteroi"].includes(projectName) && !record.cidade;
  const novos = records.filter(record => !anteriores.has(record.linkReal) || precisaCidade(record));
  console.log(`[${projectName}] Detalhes: ${novos.length} imoveis novos ou com cidade pendente para consultar; ${records.length - novos.length} reaproveitados.`);
  let consultados = 0;
  for (const record of records) {
    const previous = anteriores.get(record.linkReal);
    if (previous && !record.areaValor) record.areaValor = previous.areaValor || 0;
    if (previous && !precisaCidade(record)) {
      continue;
    }
    const page = await browser.newPage();
    try {
      await page.setUserAgent(IMOBBRASIL_USER_AGENT);
      await page.setExtraHTTPHeaders({ "accept-language": "pt-BR,pt;q=0.9" });
      console.log(`[${projectName}] Consultando detalhes ${consultados + 1}/${novos.length}: ${record.linkReal}`);
      let response;
      for (let tentativa = 0; ; tentativa++) {
        try {
          response = await page.goto(record.linkReal, { waitUntil: "domcontentloaded", timeout: 60000 });
          break;
        } catch (error) {
          if (negociacao !== "aluguel" || tentativa >= 1 || error.name !== "TimeoutError") throw error;
          console.warn(`[${projectName}] Timeout nos detalhes; repetindo uma vez: ${record.linkReal}`);
        }
      }
      if (!response?.ok() || new URL(page.url()).hostname !== new URL(record.linkReal).hostname) {
        throw new Error(`Rota interna indisponivel: ${record.linkReal}`);
      }
      const html = await page.content();
      if (precisaCidade(record)) {
        const location = resolverLocalizacaoJnDaDescricao(html, { negociacao });
        if (location) {
          record.cidade = location.cidade;
          record.bairro = location.bairro;
          console.log(`[${projectName}] Cidade identificada pela descricao: ${record.bairro} / ${record.cidade} (${record.linkReal})`);
        } else console.warn(`[${projectName}] Cidade continua ausente apos consultar a descricao: ${record.linkReal}`);
      }
      record.localizacao = appendLegacyAddress(record.localizacao, extractLegacyAddress(html));
      if (!record.areaValor) record.areaValor = extractAreaValor(html) || 0;
      consultados++;
      console.log(`[${projectName}] Detalhes concluidos: ${consultados}/${novos.length} (${(consultados / novos.length * 100).toFixed(1)}%).`);
    } finally { await page.close(); }
  }
  if (["nitJn", "nitNiteroi"].includes(projectName)) {
    for (const record of records) record.localizacao = formarLocalizacaoImobBrasil(record);
  }
}
