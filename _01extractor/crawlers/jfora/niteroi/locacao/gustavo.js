import { lerListagemGustavo, parseCardGustavo, temProximaPaginaGustavo } from "../nitGustavo/extractor.js";
import { verificarSiteDesativado } from "../../_utils/siteDesativado.js";

const normalizar = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function parseTotalLocacaoGustavo(snapshot) {
  const label = String(snapshot.label).trim();
  if (normalizar(snapshot.heading) !== "imoveis a locacao" || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(label)) {
    throw new Error("[nitGustavo] Total ou finalidade de locacao nao identificado.");
  }
  const total = Number(label.replace(/\./g, ""));
  if (!Number.isSafeInteger(total)) throw new Error("[nitGustavo] Total de locacao invalido.");
  return total;
}

export function validarBuscaLocacaoGustavo(project, destination = project.url) {
  const url = new URL(destination);
  if (url.origin !== "https://www.corretorgustavoferreira.com.br"
    || !/^\/imobiliaria\/locacao\/imoveis\/78963(?:\/\d+)?\/?$/.test(url.pathname)
    || url.searchParams.get("tipo") !== "2") throw new Error("[nitGustavo] Busca fora da locacao; base preservada.");
}

export async function contar(browser, project, { check = false } = {}) {
  validarBuscaLocacaoGustavo(project);
  const page = await browser.newPage();
  try {
    const response = await page.goto(project.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[nitGustavo] HTTP ${response?.status()} na contagem de locacao.`);
    validarBuscaLocacaoGustavo(project, page.url());
    await verificarSiteDesativado(page, project.collection, { salvar: !check });
    return parseTotalLocacaoGustavo(await page.evaluate(lerListagemGustavo));
  } finally { await page.close(); }
}

export async function coletar(browser, project, { totalEsperado, check = false, anteriores = new Map() } = {}) {
  validarBuscaLocacaoGustavo(project);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error("[nitGustavo] Precontagem obrigatoria.");
  const records = new Map();
  const seen = new Set();
  const unavailable = new Set();
  const page = await browser.newPage();
  try {
    for (let number = 1; ; number++) {
      const destination = new URL(project.url);
      if (number > 1) destination.pathname = `${destination.pathname.replace(/\/$/, "")}/${number}`;
      const response = await page.goto(destination.href, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (!response?.ok()) throw new Error(`[nitGustavo] HTTP ${response?.status()} na pagina ${number}.`);
      validarBuscaLocacaoGustavo(project, page.url());
      const snapshot = await page.evaluate(lerListagemGustavo);
      if (parseTotalLocacaoGustavo(snapshot) !== totalEsperado) throw new Error("[nitGustavo] Total alterado; base preservada.");
      const before = seen.size;
      for (const html of snapshot.cards) {
        try {
          const record = parseCardGustavo(html, { negociacao: "locacao", projeto: project });
          if (seen.has(record.linkReal)) throw new Error("[nitGustavo] Link repetido; base preservada.");
          seen.add(record.linkReal);
          record.dataInclusao = anteriores.get(record.linkReal)?.dataInclusao || record.dataInclusao;
          records.set(record.linkReal, record);
        } catch (error) {
          if (!["GUSTAVO_SOLD", "GUSTAVO_RENTAL_ONLY"].includes(error.code)) throw error;
          if (seen.has(error.linkReal)) throw new Error("[nitGustavo] Link repetido; base preservada.");
          seen.add(error.linkReal);
          unavailable.add(error.linkReal);
        }
      }
      if (seen.size > totalEsperado) throw new Error("[nitGustavo] Coleta acima da precontagem; base preservada.");
      console.log(`[nitGustavoLocacao] Pagina ${number}: ${seen.size}/${totalEsperado} anuncios; ${records.size} alugueis ativos; ${unavailable.size} vendidos/locados.`);
      if (seen.size === totalEsperado) {
        if (unavailable.size) console.warn(`[nitGustavoLocacao] O total do site inclui ${unavailable.size} vendidos/locados; excluidos da base de alugueis.`);
        return Object.assign([...records.values()], { excluidos: unavailable.size });
      }
      if (seen.size === before || !temProximaPaginaGustavo(snapshot.pages, project.url, number + 1)) {
        throw new Error(`[nitGustavoLocacao] Coleta incompleta: ${records.size}/${totalEsperado}; base preservada.`);
      }
    }
  } finally { await page.close(); }
}
