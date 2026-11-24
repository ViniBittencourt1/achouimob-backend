import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const origin = { venda: "https://luxury.invexo.com.br", locacao: "https://aluguel.invexo.com.br" };
const cidades = JSON.parse(fs.readFileSync(new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const slug = value => texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const falhar = message => new Error(`[rioInvexo] ${message}; dados anteriores preservados.`);
const documento = html => new JSDOM(html, { virtualConsole: new VirtualConsole() });

function urlBase(project, negociacao) {
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  const parsed = new URL(url);
  if (parsed.origin !== origin[negociacao] || parsed.hash || negociacao === "venda" && parsed.pathname !== "/buscar-imoveis/"
    || negociacao === "locacao" && parsed.pathname !== "/imoveis/" || negociacao === "locacao" && parsed.search !== "?imovel=disponivel") {
    throw falhar(`URL de ${negociacao} invalida`);
  }
  return parsed.href;
}

function parsePreco(value, negociacao) {
  const match = texto(value).match(/R\$\s*([\d.]+,\d{2})/);
  if (!match) throw falhar(`Preco ausente ou invalido: ${value}`);
  const preco = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(preco) || preco < 0) throw falhar(`Preco invalido: ${value}`);
  return preco;
}

function resolverCidade() {
  const cidade = cidades.find(item => item.slug === "rio-de-janeiro-rj");
  if (!cidade) throw falhar("Cidade Rio de Janeiro ausente no catalogo");
  return cidade.slug;
}

function linkCanonico(value, project, negociacao) {
  const url = new URL(value, project.urlVendas);
  if (url.origin !== origin[negociacao] || url.search || url.hash
    || negociacao === "venda" && !/^\/imoveis\/[^/]+\/[^/]+\/[^/]+\/?$/.test(url.pathname)
    || negociacao === "locacao" && !/^\/imovel\/[^/]+\/?$/.test(url.pathname)) {
    throw falhar(`Link de imovel invalido: ${url.href}`);
  }
  url.search = ""; url.hash = "";
  return url.href;
}

function numero(value) {
  const match = texto(value).match(/\d[\d.,]*/);
  return match ? Number(match[0].replace(/\./g, "").replace(",", ".")) : 0;
}

function parseCard(card, project, negociacao, now) {
  const anchor = card.querySelector(negociacao === "venda" ? "a.rx-card[href]" : "a.ixv-card__link[href]");
  if (!anchor) throw falhar("Card sem link");
  const linkReal = linkCanonico(anchor.getAttribute("href"), project, negociacao);
  const bairroNome = texto(card.querySelector(negociacao === "venda" ? ".rx-ph-bairro" : ".ixv-card__bairro")?.textContent);
  const titulo = texto(card.querySelector(negociacao === "venda" ? ".rx-tit" : ".ixv-card__titulo")?.textContent);
  const tipoNome = negociacao === "venda"
    ? texto(card.querySelector(".rx-tipo")?.textContent).replace(/\s*·.*$/, "")
    : titulo.split(/\s+de\s+\d+\s+quartos?\b/i)[0].trim();
  const preco = parsePreco(card.querySelector(negociacao === "venda" ? ".rx-preco" : ".ixv-card__preco")?.textContent, negociacao);
  const cidade = resolverCidade();
  if (!bairroNome || !titulo || !tipoNome) throw falhar(`Card incompleto: ${linkReal}`);
  const bairro = resolverBairroNiteroi(bairroNome, cidade) || slug(bairroNome);
  const caracteristicas = texto(card.querySelector(negociacao === "venda" ? ".rx-attrs" : ".ixv-card__feats")?.textContent);
  const codigoBase = (card.getAttribute("data-id") || anchor.href.match(/(?:codigo|id)[-/](\d+)/i)?.[1] || linkReal.match(/(\d+)(?:\/?$)/)?.[1] || "");
  const timestamp = now.toISOString();
  return {
    linkReal, titulo, preco, localizacao: `${bairroNome}, Rio de Janeiro - RJ`,
    tipoImovel: resolverTipoNiteroi(tipoNome) || slug(tipoNome), bairro, cidade,
    dormitorioValor: numero(caracteristicas.match(/\d+\s+quartos?/i)?.[0]),
    banheiroValor: 0, ambienteValor: 0, areaValor: numero(caracteristicas.match(/\d[\d.,]*\s*m²/i)?.[0]),
    garagemValor: numero(caracteristicas.match(/\d+\s+vagas?/i)?.[0]), elevadorValor: 0,
    codigoBase, linkCard: linkReal, corretor: project.displayName, dataInclusao: timestamp,
    dataExclusao: "", linkFoto: card.querySelector("img")?.getAttribute("src") || "", atualizadoEm: timestamp,
  };
}

async function carregar(page, project, negociacao, primeiraPagina = false) {
  const url = urlBase(project, negociacao);
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!response || ![200, 304].includes(response.status())) throw falhar(`HTTP ${response.status()} em ${url}`);
  if (negociacao === "venda") {
    const items = await page.evaluate(async (partial) => {
      const first = await fetch("/wp-json/myhome/v1/estates?currency=any", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ page: "1", limit: partial ? "12" : "100", sortBy: "newest", currency: "any" }),
      }).then(response => response.json());
      const total = Number(first.found_results);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total da API Invexo invalido");
      const results = [...(first.results || [])];
      if (!partial) {
        for (let page = 2; results.length < total; page++) {
          const next = await fetch("/wp-json/myhome/v1/estates?currency=any", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ page: String(page), limit: "100", sortBy: "newest", currency: "any" }),
          }).then(response => response.json());
          if (!Array.isArray(next.results) || !next.results.length) throw new Error("Pagina Invexo vazia antes do total");
          results.push(...next.results);
        }
      }
      return results.slice(0, partial ? 12 : total);
    }, primeiraPagina);
    const html = items.map(item => {
      const attrs = item.attributes || [];
      const get = name => attrs.find(attribute => attribute.slug === name)?.values?.[0]?.name || "";
      const tipo = /cobertura/i.test(item.name) ? "Cobertura" : /casa/i.test(item.name) ? "Casa"
        : /sala/i.test(item.name) ? "Sala comercial" : /loja/i.test(item.name) ? "Loja"
        : /terreno/i.test(item.name) ? "Terreno" : /prédio/i.test(item.name) ? "Prédio inteiro" : "Apartamento";
      const bairro = get("bairro") || item.link.match(/\/imoveis\/([^/]+)\//)?.[1] || "";
      return `<div class="rx-cw" data-id="${item.id}"><a class="rx-card" href="${item.link}"><div class="rx-ph"><img src="${item.image || ""}"><span class="rx-ph-bairro">${bairro}</span></div><div class="rx-bd"><span class="rx-tipo">${tipo}</span><div class="rx-preco">${item.price?.[0]?.price || ""}</div><h2 class="rx-tit">${item.name || ""}</h2><div class="rx-attrs">${get("property-size")} · ${get("bedrooms")} quartos · ${get("attribute_20")} vagas</div></div></a></div>`;
    }).join("");
    const d = documento(html);
    try { return [...d.window.document.querySelectorAll(".rx-cw")]; } finally { d.window.close(); }
  }
  const d = documento(await page.content());
  try {
    const cards = [...d.window.document.querySelectorAll(negociacao === "venda" ? ".rx-cw" : ".ixv-card")];
    return cards;
  } finally { d.window.close(); }
}

export async function contarInvexo(browser, project, negociacao) {
  const page = await browser.newPage();
  try { return (await carregar(page, project, negociacao)).length; } finally { await page.close(); }
}

export async function coletarInvexo(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Total esperado invalido");
  const page = await browser.newPage();
  try {
    const cards = await carregar(page, project, negociacao, primeiraPagina);
    const records = cards.map(card => parseCard(card, project, negociacao, new Date()));
    if (!primeiraPagina && records.length !== totalEsperado) throw falhar(`Coleta incompleta: ${records.length}/${totalEsperado}`);
    return records;
  } finally { await page.close(); }
}
