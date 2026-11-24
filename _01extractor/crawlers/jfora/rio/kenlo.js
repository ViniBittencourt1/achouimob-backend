import { contarAntesDasVendas, parseTotalVendas } from "../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../_utils/vendasContagemProjetos.js";
import { coletarPaginasKenloVendas } from "../_utils/vendasKenloPaginacao.js";
import { carregarEstadoKenloLocacao } from "../_utils/locacaoKenloExtractor.js";
import { parseNiteroiCard, readSnapshotNiteroi } from "../niteroi/extractor.js";
import { coletarCardsPorPagina, mapearCardKenlo } from "../niteroi/locacao/kenlo.js";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { RIO_SPREADSHEET_ID } from "./projects.js";
import { load } from "cheerio";
import { coletarHtmlsMetropole } from "./metropole.js";

export function projetoKenlo(project, negociacao) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("Negociacao Rio invalida.");
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  const expected = negociacao === "venda" ? "/imoveis/a-venda" : "/imoveis/para-alugar";
  if (project.kind !== "kenlo" || !url || new URL(url).pathname !== expected) {
    throw new Error(`[${project.collection}] Rota ${negociacao} nao suportada pelo coletor Kenlo; base preservada.`);
  }
  return { ...project, url };
}

export function mapearCardRio(html, project, negociacao) {
  const item = negociacao === "locacao"
    ? mapearCardKenlo(html, project)
    : parseNiteroiCard(html, { baseUrl: project.url, displayName: project.displayName, projectName: project.collection });
  if (negociacao === "venda") {
    const $ = load(html);
    const containers = $(".card-with-buttons__value-container, .card_split_vertically__value-container");
    if (containers.length) {
      const venda = containers.toArray().find(element => /venda/i.test($(element).find(".card-with-buttons__value-title, .card_split_vertically__value-title").text()));
      if (!venda) throw new Error(`[${project.collection}] Card sem rotulo de venda; base preservada.`);
      const value = $(venda).find(".card-with-buttons__value, .card_split_vertically__value").first().text().trim();
      const match = value.match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
      if (!match && !/sob consulta|consulte/i.test(value)) throw new Error(`[${project.collection}] Preco de venda nao reconhecido: ${value}`);
      item.preco = match ? Number(`${match[1].replace(/\./g, "")}.${match[2] ?? "0"}`) : null;
    }
  }
  const bairro = resolverBairroNiteroi(item.bairro, item.cidade);
  if (bairro) item.bairro = bairro;
  else if (negociacao === "venda" && item.bairro) console.warn(`[${project.collection}] Bairro fora do catalogo: "${item.bairro}" (${item.cidade}; ${item.linkReal})`);
  const link = new URL(item.linkReal);
  if (link.origin !== new URL(project.url).origin || !/^\/(?:imovel|empreendimento)\//.test(link.pathname)) {
    throw new Error(`[${project.collection}] Card fora da origem; base preservada.`);
  }
  link.search = "";
  link.hash = "";
  item.linkReal = link.href;
  item.linkCard = link.href;
  if (!item.codigoBase || !item.titulo || !item.cidade) throw new Error(`[${project.collection}] Card sem codigo, titulo ou cidade; base preservada.`);
  return item;
}

export async function contarKenloRio(browser, project, negociacao) {
  const configured = projetoKenlo(project, negociacao);
  if (negociacao === "venda") {
    return contarAntesDasVendas(browser, { projeto: project.collection, salvar: false, spreadsheetId: RIO_SPREADSHEET_ID });
  }
  const page = await browser.newPage();
  try {
    return (await carregarEstadoKenloLocacao(page, configured.url, { projeto: project.collection, salvar: false })).state.total;
  } finally { await page.close(); }
}

export async function coletarKenloRio(browser, project, negociacao, { totalEsperado, primeiraPagina = false } = {}) {
  const configured = projetoKenlo(project, negociacao);
  let htmls;
  if (project.collection === "rioMetropole" && negociacao === "venda") {
    htmls = await coletarHtmlsMetropole(browser, project, { totalEsperado, primeiraPagina });
  } else if (primeiraPagina || totalEsperado === 0) {
    const page = await browser.newPage();
    try {
      if (negociacao === "locacao") {
        const { info, state } = await carregarEstadoKenloLocacao(page, configured.url);
        if (state.total !== totalEsperado) {
          throw Object.assign(new Error(`[${project.collection}] Total alterado: ${totalEsperado} -> ${state.total}; base preservada.`), { code: "KENLO_TOTAL_ALTERADO" });
        }
        htmls = info.cards.map(card => card.html);
      } else {
        const url = new URL(configured.url);
        url.searchParams.set("ordenar", "recentes");
        const response = await page.goto(url.href, { waitUntil: "networkidle2", timeout: 90000 });
        if (!response?.ok() && !(totalEsperado === 0 && response?.status() === 404)) throw new Error(`[${project.collection}] HTTP ${response?.status()} na listagem.`);
        if (new URL(page.url()).origin !== url.origin || new URL(page.url()).pathname !== url.pathname) throw new Error(`[${project.collection}] Busca redirecionada.`);
        const snapshot = await page.evaluate(readSnapshotNiteroi);
        const vazio = snapshot.cards.length === 0 && /n[a\u00e3]o encontramos im[o\u00f3]veis para a sua busca/i.test(snapshot.text || "");
        const total = vazio ? 0 : parseTotalVendas(snapshot.heading, projetoContagemVendas(project.collection));
        if (total !== totalEsperado) {
          throw Object.assign(new Error(`[${project.collection}] Total alterado: ${totalEsperado} -> ${total}; base preservada.`), { code: "KENLO_TOTAL_ALTERADO" });
        }
        htmls = snapshot.cards.map(card => card.html);
      }
      if (totalEsperado === 0 && htmls.length) throw new Error(`[${project.collection}] Contador zero com cards; base preservada.`);
      if (totalEsperado > 0 && !htmls.length) throw new Error(`[${project.collection}] Listagem sem cards; base preservada.`);
    } finally { await page.close(); }
  } else if (negociacao === "locacao") {
    htmls = (await coletarCardsPorPagina(browser, configured, totalEsperado)).map(card => card.html);
  } else {
    htmls = await coletarPaginasKenloVendas(browser, [configured.url], {
      projeto: project.collection, readSnapshot: readSnapshotNiteroi,
      cardSelector: 'a.card-with-buttons[href*="/imovel/"], a.card_split_vertically[href*="/imovel/"], .card.card-listing a[href*="/imovel/"]',
      totalEsperado, maxTentativas: 2, maxTentativasPagina: 4, retryDelayMs: 3000,
    });
  }
  const items = htmls.map(html => mapearCardRio(html, configured, negociacao));
  if (!primeiraPagina && items.length !== totalEsperado) throw new Error(`[${project.collection}] Coleta incompleta: ${items.length}/${totalEsperado}; base preservada.`);
  if (new Set(items.map(item => item.linkReal)).size !== items.length) throw new Error(`[${project.collection}] Links repetidos; base preservada.`);
  return items;
}
