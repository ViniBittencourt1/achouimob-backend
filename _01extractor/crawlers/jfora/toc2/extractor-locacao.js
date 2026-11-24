import { extractToc2Data } from "./extractor.js";

export const URL_LOCACAO_TOC2 = "https://toc2imoveis.com.br/imoveis/aluguel/-/-/-/-?ordem=desc-inclusao";

export function buildUrlToc2Locacao(pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error("Numero de pagina invalido.");
  const url = new URL(URL_LOCACAO_TOC2);
  if (pageNumber > 1) url.searchParams.set("pagination", String(pageNumber));
  return url.href;
}

export async function extractToc2Locacao(browser, existingCodes = new Set()) {
  const imoveis = [];
  const seen = new Set();
  let expected = null;
  let pages = 1;
  for (let number = 1; number <= pages; number++) {
    if (number > 150) throw new Error("Limite de paginas TOC2 atingido.");
    const page = await browser.newPage();
    try {
      const response = await page.goto(buildUrlToc2Locacao(number), { waitUntil: "domcontentloaded", timeout: 120000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()} na busca de aluguel TOC2.`);
      if (!new URL(page.url()).pathname.startsWith("/imoveis/aluguel/")) throw new Error("Busca TOC2 retornou fora de aluguel.");
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return /\d+\s+Encontrados/i.test(text) && (document.querySelector('[class*="ListPiecesProperties_card_horizontal1"] a[href*="/imovel/"]') || /\b0\s+Encontrados/i.test(text));
      }, { timeout: 30000 });
      const total = await page.evaluate(() => {
        const count = document.querySelector('[class*="Properties_qtd1"]')?.textContent || document.body.innerText;
        const match = count.match(/(\d+)\s+Encontrados/i);
        return match ? Number(match[1]) : null;
      });
      if (!Number.isInteger(total)) throw new Error("Total de alugueis TOC2 nao identificado.");
      if (expected === null) {
        expected = total;
        pages = Math.max(1, Math.ceil(total / 12));
      }
      if (total !== expected) throw new Error("Total de alugueis TOC2 mudou durante a coleta.");
      const result = extractToc2Data(await page.content(), existingCodes, { negociacao: "locacao" });
      for (const item of result.imoveisRaspados) {
        if (!item.linkReal || !item.codigoBase || (item.preco !== null && !Number.isFinite(item.preco))) throw new Error("Card TOC2 sem link, codigo ou preco valido.");
        if (seen.has(item.linkReal)) throw new Error("Imovel duplicado entre paginas TOC2.");
        seen.add(item.linkReal);
        imoveis.push(item);
      }
      console.log(`[Toc2Locacao] Pagina ${number}/${pages}: ${imoveis.length}/${expected} alugueis.`);
    } finally { await page.close(); }
  }
  if (imoveis.length !== expected) throw new Error("Coleta TOC2 incompleta. Dados anteriores preservados.");
  return imoveis;
}