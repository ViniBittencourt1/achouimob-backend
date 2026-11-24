import fs from "node:fs";
import { JSDOM } from "jsdom";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoNiteroi } from "../tipoImovel.js";
import { parseTotalVendas, validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { project } from "./config.js";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalizar = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function numero(text, decimalPonto = false) {
  const match = text.trim().match(decimalPonto && !text.includes(",")
    ? /^\d+(?:\.\d+)?(?=\s|$)/
    : /^\d+(?:\.\d{3})*(?:,\d+)?(?=\s|$)/);
  if (!match) throw new Error(`[nitGustavo] Numero nao reconhecido: ${text}`);
  return Number(decimalPonto && !text.includes(",") ? match[0] : match[0].replace(/\./g, "").replace(",", "."));
}

export function parseCardGustavo(html, { now = new Date(), precoSobConsulta = false, negociacao = "venda", projeto = project } = {}) {
  const project = projeto;
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("Negociacao Gustavo invalida.");
  const dom = new JSDOM(html, { url: project.url });
  try {
    const doc = dom.window.document;
    const text = selector => doc.querySelector(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
    const anchor = doc.querySelector(".c49-property-card_photo a[href]");
    if (!anchor) throw new Error("[nitGustavo] Card sem link de imovel.");
    const link = new URL(anchor.href);
    if (link.origin !== new URL(project.url).origin || !(negociacao === "venda" ? /^\/\d+\/imoveis\/venda-/ : /^\/\d+\/imoveis\/(?:venda-)?locacao-/).test(link.pathname)) {
      throw new Error(`[nitGustavo] Card fora da origem de ${negociacao === "venda" ? "vendas" : "locacao"}: ${link.href}`);
    }
    link.search = "";
    link.hash = "";
    const linkReal = link.href;
    const status = [...doc.querySelectorAll(".c49-strip")].map(item => normalizar(item.textContent));
    if (status.includes("vendido")) {
      throw Object.assign(new Error(`[nitGustavo] Anuncio vendido: ${linkReal}`), {
        code: "GUSTAVO_SOLD", linkReal,
      });
    }
    if (status.includes("locado")) {
      throw Object.assign(new Error(`[nitGustavo] Anuncio locado: ${linkReal}`), {
        code: "GUSTAVO_RENTAL_ONLY", linkReal,
      });
    }
    const image = doc.querySelector(".c49-property-card_photo img");
    const titulo = text(".c49-property-card_title") || image?.alt.replace(/^#\d+\s*-\s*/, "").replace(/\s*-\s*\d+$/, "").trim();
    const codigoBase = text(".c49-property-card_code").replace(/^C[oó]d\.\s*/i, "");
    if (!titulo || !codigoBase) throw new Error(`[nitGustavo] Titulo ou codigo ausente: ${linkReal}`);
    const prices = [...doc.querySelectorAll(".c49-property-card_price > div")];
    const sale = prices.find(element => [...element.querySelectorAll("span")].some(span => normalizar(span.textContent) === negociacao));
    const rentalOnly = negociacao === "venda" && !sale && prices.some(element => [...element.querySelectorAll("span")].some(span =>
      ["locacao", "temporada"].includes(normalizar(span.textContent))));
    if (rentalOnly) {
      throw Object.assign(new Error(`[nitGustavo] Anuncio somente de locacao: ${linkReal}`), {
        code: "GUSTAVO_RENTAL_ONLY", linkReal,
      });
    }
    const statusSemPreco = status.find(value => ["em avaliacao", "em negociacao", "reservado"].includes(value));
    if (!sale && !precoSobConsulta && !statusSemPreco) {
      throw Object.assign(new Error(`[nitGustavo] Preco de ${negociacao} ausente: ${linkReal}`), {
        code: "GUSTAVO_PRICE_DETAIL", linkReal,
      });
    }
    if (!sale && statusSemPreco) console.warn(`[nitGustavo] Preco nao divulgado (${statusSemPreco}); preservado como null: ${linkReal}`);
    const priceText = sale?.textContent.replace(/Venda|Loca[\u00e7c][a\u00e3]o|R\$/gi, "").trim();
    const preco = precoSobConsulta || (!sale && statusSemPreco) || /consult/i.test(priceText) ? null : numero(priceText);
    const localizacao = text(".c49-property-card_address");
    const location = localizacao.match(/^(.*),\s*([^,]+)\s*-\s*([A-Z]{2})$/i);
    const nomeCidade = location?.[2]?.trim() || "";
    const uf = location?.[3]?.toUpperCase();
    const candidates = cidades.filter(item => nomeCidade
      ? normalizar(item.nome) === normalizar(nomeCidade) && item.estado === uf
      : link.pathname.endsWith(`-${item.slug}`));
    const slugs = new Set(candidates.map(item => item.slug));
    const cidade = slugs.size === 1 ? slugs.values().next().value : nomeCidade;
    if (slugs.size !== 1) console.warn(`[nitGustavo] Cidade sem correspondencia unica: "${localizacao}" (${linkReal})`);
    const bairroExtraido = location?.[1]?.trim() || "";
    const bairro = resolverBairroNiteroi(bairroExtraido, cidade);
    if (!bairro) console.warn(`[nitGustavo] Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade}; ${linkReal})`);
    const tipoExtraido = text(".c49-property-card_type");
    const tipoImovel = resolverTipoNiteroi(tipoExtraido);
    if (!tipoImovel) console.warn(`[nitGustavo] Tipo sem correspondencia unica: "${tipoExtraido}" (${linkReal})`);
    const feature = icon => {
      const wrap = doc.querySelector(`.${icon}`)?.closest(".c49-property-number-wrap");
      const value = wrap?.querySelector(".c49-property-number")?.textContent.trim();
      return value ? numero(value, icon === "c49icon-area-1") : 0;
    };
    const imageUrl = image?.getAttribute("data-src") || image?.getAttribute("src");
    const timestamp = now.toISOString();
    return {
      linkReal, titulo, preco, localizacao, tipoImovel: tipoImovel || tipoExtraido,
      bairro: bairro || bairroExtraido, cidade,
      dormitorioValor: feature("c49icon-bedroom-1"),
      banheiroValor: feature("c49icon-bathroom-1"),
      ambienteValor: 0, areaValor: feature("c49icon-area-1"),
      garagemValor: feature("c49icon-garage-1"), elevadorValor: 0,
      codigoBase, linkCard: linkReal, corretor: project.displayName,
      dataInclusao: timestamp, dataExclusao: "",
      linkFoto: imageUrl ? new URL(imageUrl, project.url).href : "", atualizadoEm: timestamp,
    };
  } finally { dom.window.close(); }
}

export function lerListagemGustavo() {
  const root = document.querySelector("#c49mod-properties-list");
  return {
    cards: [...(root?.querySelectorAll(".c49-property-card") || [])].map(item => item.outerHTML),
    label: document.querySelector(".c49-filter-number")?.textContent || "",
    heading: document.querySelector(".c49-filter-title")?.textContent || "",
    pages: [...document.querySelectorAll(".pagination a")].map(anchor => anchor.getAttribute("href")),
  };
}

export function temProximaPaginaGustavo(pages, busca, numeroPagina) {
  const destination = new URL(busca);
  const basePath = destination.pathname.replace(/\/$/, "");
  const searchId = basePath.split("/").at(-1);
  destination.pathname = `${basePath}/${numeroPagina}`;
  return pages.some(href => {
    if (!href) return false;
    const match = href.match(/^javascript:pagination\('\d+', '(\d+)', '(\d+)', ''\);$/);
    if (match) return match[2] === searchId && Number(match[1]) === numeroPagina;
    if (!URL.canParse(href, busca)) return false;
    const url = new URL(href, busca);
    return url.origin === destination.origin
      && url.pathname.replace(/\/$/, "") === destination.pathname
      && url.search === destination.search && !url.hash;
  });
}

export function validarPrecoSobConsultaGustavo(html, linkReal) {
  const dom = new JSDOM(html);
  try {
    const doc = dom.window.document;
    const anuncio = [...doc.querySelectorAll('script[type="application/ld+json"]')]
      .flatMap(script => JSON.parse(script.textContent)["@graph"] || [])
      .find(item => item["@type"] === "RealEstateListing" && item.url === linkReal);
    const label = [...doc.querySelectorAll(".c49-property-price-value")].map(item => normalizar(item.textContent));
    if (!anuncio?.offers?.businessFunction?.endsWith("#Sell") ||
      !label.some(value => /^(?:este imovel esta em (?:avaliacao|negociacao)|este imovel foi reservado|sob consulta|consulte.*)$/.test(value))) {
      throw new Error(`[nitGustavo] Venda sem preco verificavel no detalhe; base preservada: ${linkReal}`);
    }
    console.warn(`[nitGustavo] Preco nao divulgado (${label.join("; ")}); preservado como null: ${linkReal}`);
  } finally { dom.window.close(); }
}

export async function extractGustavoSales(browser, { totalEsperado, somentePrimeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error("[nitGustavo] Precontagem obrigatoria.");
  const config = projetoContagemVendas(project.collection);
  const records = new Map();
  const excluidosLocacao = new Set();
  const excluidosVendidos = new Set();
  const linksColetados = new Set();
  const page = await browser.newPage();
  try {
    for (let pageNum = 1; ; pageNum++) {
      const destination = `${project.url}/${pageNum}`;
      const response = await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (!response?.ok()) throw new Error(`[nitGustavo] HTTP ${response?.status()} na pagina ${pageNum}; base preservada.`);
      validarUrlContagemVendas(config, page.url());
      const snapshot = await page.evaluate(lerListagemGustavo);
      if (normalizar(snapshot.heading) !== "imoveis a venda" || parseTotalVendas(snapshot.label, config) !== totalEsperado) {
        throw new Error("[nitGustavo] Finalidade ou contagem mudou; base preservada.");
      }
      const before = linksColetados.size;
      for (const html of snapshot.cards) {
        try {
          let record;
          try {
            record = parseCardGustavo(html);
          } catch (error) {
            if (error.code !== "GUSTAVO_PRICE_DETAIL") throw error;
            const detail = await browser.newPage();
            try {
              console.log(`[nitGustavo] Conferindo preco no detalhe: ${error.linkReal}`);
              const response = await detail.goto(error.linkReal, { waitUntil: "domcontentloaded", timeout: 60000 });
              if (!response?.ok() || detail.url() !== error.linkReal) throw new Error(`[nitGustavo] Detalhe indisponivel: ${error.linkReal}`);
              validarPrecoSobConsultaGustavo(await detail.content(), error.linkReal);
              record = parseCardGustavo(html, { precoSobConsulta: true });
            } finally { await detail.close(); }
          }
          linksColetados.add(record.linkReal);
          excluidosLocacao.delete(record.linkReal);
          excluidosVendidos.delete(record.linkReal);
          records.set(record.linkReal, record);
        } catch (error) {
          if (!["GUSTAVO_RENTAL_ONLY", "GUSTAVO_SOLD"].includes(error.code)) throw error;
          const linkReal = error.linkReal;
          const vendidos = error.code === "GUSTAVO_SOLD";
          if (!vendidos && !excluidosLocacao.has(linkReal)) console.warn(`${error.message}; excluido da base de vendas.`);
          linksColetados.add(linkReal);
          records.delete(linkReal);
          if (vendidos) {
            excluidosLocacao.delete(linkReal);
            excluidosVendidos.add(linkReal);
          } else {
            excluidosVendidos.delete(linkReal);
            excluidosLocacao.add(linkReal);
          }
        }
      }
      if (linksColetados.size > totalEsperado) throw new Error("[nitGustavo] Coleta acima da precontagem; base preservada.");
      console.log(`[nitGustavo] Pagina ${pageNum}: ${linksColetados.size}/${totalEsperado} anuncios unicos (${(totalEsperado ? linksColetados.size / totalEsperado * 100 : 100).toFixed(1)}%); ${records.size} vendas; excluidos: ${excluidosLocacao.size} somente locacao, ${excluidosVendidos.size} vendidos.`);
      if (linksColetados.size === totalEsperado) return { imoveis: [...records.values()], excluidosLocacao: [...excluidosLocacao], excluidosVendidos: [...excluidosVendidos] };
      if (linksColetados.size === before) throw new Error("[nitGustavo] Coleta sem progresso; base preservada.");
      if (somentePrimeiraPagina) return { imoveis: [...records.values()], excluidosLocacao: [...excluidosLocacao], excluidosVendidos: [...excluidosVendidos] };
      const hasNext = temProximaPaginaGustavo(snapshot.pages, project.url, pageNum + 1);
      if (!hasNext) throw new Error(`[nitGustavo] Coleta incompleta: ${linksColetados.size}/${totalEsperado}; base preservada.`);
    }
  } finally { await page.close(); }
}
