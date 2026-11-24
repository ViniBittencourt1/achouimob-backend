import { buildUrlRealiza, isRealizaListingResponse, extractRealizaSales } from "../nitRealiza/extractor.js";

import { verificarSiteDesativado } from "../../_utils/siteDesativado.js";

export function lerTotalAluguelRealiza(data) {
  if (!data || !Number.isSafeInteger(data.quantidade) || data.quantidade < 0 || !Array.isArray(data.lista) ||
      data.lista.length !== Math.min(20, data.quantidade) ||
      data.lista.some(item => String(item.finalidade).toLowerCase() !== "aluguel")) {
    throw new Error("[nitRealizaLocacao] Total ou listagem de aluguel invalido.");
  }
  return data.quantidade;
}

export async function contar(browser, project, { check = false } = {}) {
  const page = await browser.newPage();
  try {
    const listing = page.waitForResponse(response => isRealizaListingResponse(response, 1, {
      negociacao: "aluguel", projeto: project,
    }), { timeout: 60000 });
    listing.catch(() => {});
    const response = await page.goto(buildUrlRealiza(1, project), { waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[nitRealizaLocacao] HTTP ${response?.status()}.`);
    const url = new URL(page.url());
    if (url.origin !== new URL(project.url).origin || url.pathname !== "/aluguel/" || url.searchParams.get("pagina") !== "1") throw new Error("[nitRealizaLocacao] Listagem fora de aluguel.");
    await verificarSiteDesativado(page, project.collection, { salvar: !check });
    const initial = await listing;
    if (!initial.ok()) throw new Error(`[nitRealizaLocacao] API HTTP ${initial.status()}.`);
    return lerTotalAluguelRealiza(await initial.json());
  } finally { await page.close(); }
}

export async function coletar(browser, project, { totalEsperado, check = false } = {}) {
  return extractRealizaSales(browser, {
    totalEsperado, somentePrimeiraPagina: check, projeto: project, negociacao: "aluguel",
  });
}
