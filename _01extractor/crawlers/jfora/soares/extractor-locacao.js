import { extractSoaresData } from "./extractor.js";
import { extractLinkFotoDetalhe } from "./extractor-19-linkFoto.js";

export const URL_LOCACAO_SOARES = "https://www.secimoveis.com.br/imoveis/aluguel#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA";

export function buildUrlSoaresLocacao(pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error("Numero de pagina invalido.");
  const url = new URL(URL_LOCACAO_SOARES);
  const params = new URLSearchParams(url.hash.replace(/^#\/?\?/, ""));
  params.set("page", String(pageNumber));
  url.hash = `/?${params.toString()}`;
  return url.href;
}

export function validateSoaresLocacaoPage(url, heading) {
  const location = new URL(url);
  const params = new URLSearchParams(location.hash.replace(/^#\/?\?/, ""));
  const tipo = params.get("tipoNegocio");
  if (location.origin !== new URL(URL_LOCACAO_SOARES).origin ||
      location.pathname.replace(/\/+$/, "") !== "/imoveis/aluguel" ||
      (tipo !== null && tipo !== "AA")) throw new Error("Busca Soares retornou fora da locacao. Dados anteriores preservados.");
  const match = heading.match(/(\d+)\s+Im[o\u00f3]ve(?:l|is)\s+para\s+Alugar/i);
  if (!match) throw new Error("Total de alugueis Soares nao identificado.");
  return Number(match[1]);
}

export async function extractSoaresLocacao(browser, existingCodes = new Set()) {
  const imoveis = [];
  const seen = new Set();
  let expected = null;
  let pages = 1;
  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    if (pageNumber > 150) throw new Error("Limite de paginas Soares atingido.");
    const page = await browser.newPage();
    try {
      const response = await page.goto(buildUrlSoaresLocacao(pageNumber), { waitUntil: "networkidle2", timeout: 90000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()} na busca Soares.`);
      await page.waitForFunction(() => {
        const heading = document.querySelector('h1.destaque-titulo') || document.querySelector('h1');
        return /\d+\s+Im[o\u00f3]ve(?:l|is)\s+para\s+Alugar/i.test(heading?.textContent || '') && (document.querySelector('.box-imovel.ng-scope') || /^\s*0\s/.test(heading.textContent));
      }, { timeout: 30000 });
      const heading = await page.evaluate(() => (document.querySelector('h1.destaque-titulo') || document.querySelector('h1'))?.textContent || '');
      const total = validateSoaresLocacaoPage(page.url(), heading);
      if (expected === null) {
        expected = total;
        pages = Math.max(1, Math.ceil(total / 15));
      }
      if (total !== expected) throw new Error("Total de alugueis mudou durante a coleta Soares.");
      const parsed = extractSoaresData(await page.content(), existingCodes, { negociacao: "locacao" });
      for (const item of parsed.imoveisRaspados) {
        if (!item.linkReal || !item.codigoBase || (item.preco !== null && !Number.isFinite(item.preco))) throw new Error("Card Soares sem link, codigo ou preco valido.");
        if (seen.has(item.linkReal)) throw new Error("Imovel duplicado entre paginas Soares.");
        seen.add(item.linkReal);
        imoveis.push(item);
      }
      console.log(`[SoaresLocacao] Pagina ${pageNumber}/${pages}: ${imoveis.length}/${expected} alugueis.`);
    } finally { await page.close(); }
  }
  if (imoveis.length !== expected) throw new Error("Coleta Soares incompleta. Dados anteriores preservados.");
  await preencherFotosSoaresLocacao(browser, imoveis);
  return imoveis;
}

export async function preencherFotosSoaresLocacao(browser, imoveis) {
  for (const imovel of imoveis) {
    if (String(imovel.linkFoto || "").trim()) continue;
    const page = await browser.newPage();
    try {
      const response = await page.goto(imovel.linkReal, { waitUntil: "domcontentloaded", timeout: 60000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()} nos detalhes Soares: ${imovel.linkReal}`);
      const destino = new URL(page.url());
      const esperado = new URL(imovel.linkReal);
      if (destino.origin !== esperado.origin || destino.pathname.replace(/\/+$/, "") !== esperado.pathname.replace(/\/+$/, "")) {
        throw new Error(`Detalhes Soares redirecionados para outro imovel: ${imovel.linkReal}`);
      }
      imovel.linkFoto = extractLinkFotoDetalhe(await page.content(), imovel.linkReal);
      if (!imovel.linkFoto) console.warn(`[SoaresLocacao] Foto nao identificada na galeria: ${imovel.linkReal}`);
      else console.log(`[SoaresLocacao] Foto recuperada da galeria: ${imovel.codigoBase}`);
    } finally { await page.close(); }
  }
}