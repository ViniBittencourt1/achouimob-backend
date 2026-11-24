import { extractSicilianoSales } from "../nitSiciliano/extractor.js";

import { verificarSiteDesativado } from "../../_utils/siteDesativado.js";

export function parseTotalAluguelSiciliano(label) {
  const match = String(label).trim().match(/^(\d+(?:\.\d{3})*)\s+Im[oó]ve(?:l|is)\s+para alugar\s+encontrados?$/i);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("[nitSicilianoLocacao] Total de aluguel invalido.");
  return total;
}

export async function contar(browser, project, { check = false } = {}) {
  const page = await browser.newPage();
  try {
    const response = await page.goto(project.url, { waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[nitSicilianoLocacao] HTTP ${response?.status()}.`);
    const url = new URL(page.url());
    if (url.origin !== new URL(project.url).origin || url.pathname !== "/imoveis/aluguel") throw new Error("[nitSicilianoLocacao] Listagem fora de aluguel.");
    await verificarSiteDesativado(page, project.collection, { salvar: !check });
    await page.waitForFunction(() => /^\s*[\d.]+\s+Im[oó]ve(?:l|is)\s+para alugar/i.test(document.querySelector("h1")?.textContent || ""), { timeout: 60000 });
    return parseTotalAluguelSiciliano(await page.$eval("h1", element => element.textContent));
  } finally { await page.close(); }
}

export async function coletar(browser, project, { totalEsperado, check = false } = {}) {
  return extractSicilianoSales(browser, {
    totalEsperado, somentePrimeiraPagina: check, projeto: project,
    negociacao: "aluguel", parseTotal: parseTotalAluguelSiciliano,
  });
}
