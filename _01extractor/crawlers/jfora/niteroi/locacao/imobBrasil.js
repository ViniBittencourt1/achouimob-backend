import {
  IMOBBRASIL_USER_AGENT, lerListagemImobBrasil, lerTotalLocacaoImobBrasil,
  validarUrlLocacaoImobBrasil, extractImobBrasilSales, enriquecerNovosImobBrasil,
} from "../imobBrasil/extractor.js";
import { verificarSiteDesativado } from "../../_utils/siteDesativado.js";
import { NITEROI_SPREADSHEET_ID } from "../projects.js";

// Le apenas o contador publico; persistencia pertence exclusivamente ao runner.
export async function contar(browser, project, { check = false } = {}) {
  validarUrlLocacaoImobBrasil(project, project.url);
  const page = await browser.newPage();
  try {
    await page.setUserAgent(IMOBBRASIL_USER_AGENT);
    await page.setExtraHTTPHeaders({ "accept-language": "pt-BR,pt;q=0.9" });
    const destination = new URL(project.url);
    destination.searchParams.set("pag", "1");
    const response = await page.goto(destination.href, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) {
      const error = new Error(`[${project.collection}] HTTP ${response?.status()} na contagem de alugueis.`);
      if ([403, 429].includes(response?.status())) error.code = "IMOBBRASIL_BLOCKED";
      throw error;
    }
    validarUrlLocacaoImobBrasil(project, page.url());
    await verificarSiteDesativado(page, project.collection, { salvar: !check, spreadsheetId: NITEROI_SPREADSHEET_ID });
    const snapshot = await page.evaluate(lerListagemImobBrasil);
    const total = lerTotalLocacaoImobBrasil(snapshot.labels);
    if (!total && snapshot.cards.length) throw new Error(`[${project.collection}] Contador zero com cards de aluguel.`);
    return total;
  } finally { await page.close(); }
}

export async function coletar(browser, project, { totalEsperado, check = false, anteriores = new Map() } = {}) {
  const records = await extractImobBrasilSales(browser, project, {
    totalEsperado, somentePrimeiraPagina: check, negociacao: "aluguel",
  });
  await enriquecerNovosImobBrasil(browser, records, anteriores, { projectName: project.collection, negociacao: "aluguel" });
  return records;
}
