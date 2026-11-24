import { extractPrecoKenloLocacao } from "./locacaoKenloPreco.js";
import { load } from "cheerio";
import { verificarSiteDesativado } from "./siteDesativado.js";

const definitions = [
  ["titulo", "extractor-02-titulo.js", "extractTitulo"],
  ["localizacao", "extractor-04-localizacao.js", "extractLocalizacao"],
  ["tipoImovel", "extractor-05-tipoImovel.js", "extractTipoImovel"],
  ["bairro", "extractor-06-bairrojs.js", "extractBairro"],
  ["cidade", "extractor-07-cidade.js", "extractCidadeFromCardHtml"],
  ["dormitorioValor", "extractor-08-dormitorioValor.js", "extractDormitorioValor"],
  ["banheiroValor", "extractor-09-banheiroValor.js", "extractBanheiroValor"],
  ["ambienteValor", "extractor-10-ambienteValor.js", "extractAmbienteValor"],
  ["areaValor", "extractor-11-areaValor.js", "extractAreaValor"],
  ["garagemValor", "extractor-12-garagemValor.js", "extractGaragemValor"],
  ["elevadorValor", "extractor-13-elevadorValor.js", "extractElevadorValor"],
  ["codigoBase", "extractor-14-codigoBase.js", "extractCodigoBase"],
  ["linkCard", "extractor-15-linkCard.js", "extractLinkCard"],
  ["corretor", "extractor-16-corretor.js", "extractCorretor"],
  ["dataInclusao", "extractor-17-dataInclusao.js", "extractDataInclusao"],
  ["linkFoto", "extractor-19-linkFoto.js", "extractLinkFoto"],
  ["atualizadoEm", "extractor-20-atualizadoEm.js", "extractAtualizadoEm"],
];

export async function loadCamposKenlo(projeto) {
  const fields = {};
  for (const [field, file, symbol] of definitions) {
    const module = await import(`../${projeto.folder}/${file}`);
    if (typeof module[symbol] !== "function") throw new Error(`[${projeto.collection}] Extrator ausente: ${symbol}`);
    fields[field] = module[symbol];
  }
  return fields;
}

export async function mapCardKenloLocacao(projeto, card, fields) {
  const document = load(card.html);
  const modernTitle = document("p.card-with-buttons__title,p.card_split_vertically__title").first().text().trim();
  const modernLocation = document("h2.card-with-buttons__heading,h2.card_split_vertically__heading").first().text().trim().split(/\s+-\s+/);
  // Manter o HTML original de precos e oferecer os campos de localizacao aos leitores legados.
  if (modernTitle && modernLocation.length >= 3) {
    if (!document("h3.card-text").length) {
      document("body").append(document("<h3>").addClass("card-text").text(`${modernTitle} em ${modernLocation.at(-2).trim()}`));
    }
    if (!document("h2.card-title").length) {
      document("body").append(document("<h2>").addClass("card-title").text(modernLocation.slice(0, -2).join(" - ").trim()));
    }
  }
  const html = document.html();
  const titulo = await fields.titulo(html);
  const cidade = await fields.cidade(html, card.href);
  const bairro = projeto.bairroUsesTitulo ? await fields.bairro(html, titulo, cidade) : await fields.bairro(html, cidade, card.href);
  const codigoBase = await fields.codigoBase(html, card.href) || document("p.card-with-buttons__code,p.card_split_vertically__code,small.reference").first().text().trim();
  const imovel = {
    linkReal: card.href,
    titulo,
    preco: extractPrecoKenloLocacao(html),
    localizacao: await fields.localizacao(html) || [bairro, cidade].filter(Boolean).join(", "),
    tipoImovel: await fields.tipoImovel(html, card.href),
    bairro,
    cidade,
    dormitorioValor: await fields.dormitorioValor(html),
    banheiroValor: await fields.banheiroValor(html),
    ambienteValor: await fields.ambienteValor(html),
    areaValor: await fields.areaValor(html),
    garagemValor: await fields.garagemValor(html),
    elevadorValor: await fields.elevadorValor(html),
    codigoBase,
    linkCard: await fields.linkCard(html),
    corretor: await fields.corretor(html),
    dataInclusao: await fields.dataInclusao(html),
    dataExclusao: "",
    linkFoto: await fields.linkFoto(html),
    atualizadoEm: await fields.atualizadoEm(html),
  };
  const heading = document("h2.card-with-buttons__heading,h2.card_split_vertically__heading").first().text().trim();
  if (!imovel.bairro && heading) {
    const first = heading.split(/\s+-\s+/)[0];
    const type = String(imovel.tipoImovel || "");
    const bairroText = first.toLowerCase().startsWith(type.toLowerCase() + " ") ? first.slice(type.length).trim() : first;
    imovel.bairro = bairroText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  const values = document("ul li").toArray().map(element => document(element).text().trim());
  const metrics = {
    areaValor: /([\d.,]+)\s*m[\u00b2\u00b32]/i,
    dormitorioValor: /(\d+)\s*quartos?/i,
    banheiroValor: /(\d+)\s*banheiros?/i,
    garagemValor: /(\d+)\s*vagas?/i,
  };
  for (const [field, pattern] of Object.entries(metrics)) {
    if (Number(imovel[field])) continue;
    const match = values.map(value => value.match(pattern)).find(Boolean);
    if (match) imovel[field] = Number(match[1].replace(/\./g, "").replace(",", "."));
  }
  const ausentes = ["titulo", "codigoBase", "cidade"].filter(field => !imovel[field]);
  if (ausentes.length) throw new Error(`[${projeto.collection}] Card sem ${ausentes.join(", ")} (${card.href}); coleta nao sera publicada.`);
  return imovel;
}

export function validateKenloPage(status, info) {
  const rentalUrl = info.url && new URL(info.url).pathname.replace(/\/+$/, "") === "/imoveis/para-alugar";
  const empty = info.cards.length === 0 && (
    (/im[o\u00f3]veis para alugar/i.test(info.heading) && /n[a\u00e3]o encontramos im[o\u00f3]veis para a sua busca/i.test(info.text)) ||
    (rentalUrl && /^\s*Nenhum im[o\u00f3]vel encontrado\s*$/i.test(info.heading) &&
      /N[a\u00e3]o encontramos im[o\u00f3]veis para esta busca/i.test(info.text))
  );
  if (empty && (status === 200 || status === 404)) return { total: 0, semImoveisConfirmado: true };
  if (status < 200 || status >= 400) {
    const error = new Error(`HTTP ${status} na busca Kenlo; dados anteriores preservados.`);
    if (!info.cards.length) error.code = 'LOCACAO_UNAVAILABLE';
    throw error;
  }
  const match = info.heading.match(/(?:Exibindo\s*)?(\d+)\s*(?:Im[o\u00f3]veis|Loja|Apartamento|Casa|Sala|Terreno|Galp[a\u00e3]o)/i);
  const total = match ? Number(match[1]) : null;
  if (!Number.isInteger(total) || total < 1) {
    const error = new Error("Total de alugueis nao identificado; dados anteriores preservados.");
    if (!info.cards.length) error.code = 'LOCACAO_UNAVAILABLE';
    throw error;
  }
  return { total, semImoveisConfirmado: false };
}

export function readSnapshotKenloLocacao(minimumCount = -1) {
  const unique = new Map();
  for (const root of document.querySelectorAll('a.card-with-buttons,a.card_split_vertically,.card.card-listing')) {
    const anchor = root.matches('a[href*="/imovel/"]') ? root : root.querySelector('a[href*="/imovel/"]');
    if (!anchor || !root.querySelector('p.card-with-buttons__value,p.card_split_vertically__value,span.h-money.location')) continue;
    if (!unique.has(anchor.href)) unique.set(anchor.href, { href: anchor.href, html: root.outerHTML });
  }
  if (unique.size <= minimumCount) return null;
  return { url: document.location.href, heading: document.querySelector('h1')?.textContent || '', text: document.body.innerText, cards: Array.from(unique.values()) };
}

function isTransientKenloError(error) {
  return error?.code === 'LOCACAO_UNAVAILABLE' ||
    /net::ERR_|TimeoutError|Waiting failed|Navigation timeout/i.test(error?.message || '');
}

export async function carregarEstadoKenloLocacao(page, url, { maxTentativas = 4, esperaMs = 2000, projeto, salvar = true } = {}) {
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
      if (projeto && response?.status() === 200) await verificarSiteDesativado(page, projeto, { salvar });
      const info = await page.evaluate(readSnapshotKenloLocacao);
      const requested = new URL(url);
      const destination = new URL(info.url);
      if (destination.origin !== requested.origin || destination.pathname.replace(/\/+$/, "") !== "/imoveis/para-alugar") {
        throw new Error("Busca Kenlo retornou fora da locacao; dados anteriores preservados.");
      }
      return { info, state: validateKenloPage(response?.status() ?? 0, info) };
    } catch (error) {
      if (!isTransientKenloError(error)) throw error;
      if (tentativa >= maxTentativas) {
        if (!error.code) error.code = 'LOCACAO_UNAVAILABLE';
        throw error;
      }
      const espera = esperaMs * tentativa;
      console.warn(`[LocacaoKenlo] Falha transitoria (tentativa ${tentativa}/${maxTentativas}): ${error.message}. Nova tentativa em ${espera}ms.`);
      if (espera > 0) await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
  throw new Error("Falha inesperada ao abrir listagem Kenlo.");
}

export async function collectCardsKenloLocacao(browser, projeto) {
  const page = await browser.newPage();
  try {
    const initial = new URL(projeto.url);
    if (projeto.collection === 'jfLocal') initial.searchParams.set('ordenar', 'recentes');
    const loaded = await carregarEstadoKenloLocacao(page, initial.href);
    let info = loaded.info;
    const state = loaded.state;
    if (state.semImoveisConfirmado) return { cards: [], semImoveisConfirmado: true };
    const cards = new Map(info.cards.map(card => [card.href, card]));
    const visited = new Set([initial.href]);
    let clicks = 0;
    while (cards.size < state.total) {
      if (clicks >= 150) throw new Error("Limite de paginacao Kenlo atingido; coleta parcial nao sera publicada.");
      const findNext = () => Array.from(document.querySelectorAll('a.btn-next,button.btn-next')).find(item => /ver\s+mais/i.test(item.textContent.trim()) && !item.getAttribute('data-action') && !item.disabled && item.getAttribute('aria-disabled') !== 'true') || null;
      let handle = await page.evaluateHandle(findNext);
      if (!handle.asElement()) {
        await handle.dispose();
        await page.waitForFunction(findNext, { timeout: 15000 });
        handle = await page.evaluateHandle(findNext);
      }
      try {
        const button = handle.asElement();
        if (!button) throw new Error("Ver mais ausente antes do total de alugueis.");
        const previousCount = cards.size;
        if (['jfLeal', 'jfLocal', 'jfOliveira', 'jfMasson'].includes(projeto.collection)) {
          const nome = projeto.collection.replace(/^jf/, '');
          const destination = new URL(await button.evaluate(element => element.href));
          if (projeto.collection === 'jfLocal') destination.searchParams.set('ordenar', 'recentes');
          if (destination.origin !== initial.origin || destination.pathname !== initial.pathname || visited.has(destination.href)) throw new Error(`Paginacao ${nome} invalida ou repetida; coleta parcial nao sera publicada.`);
          visited.add(destination.href);
          const nextResponse = await page.goto(destination.href, { waitUntil: 'networkidle2', timeout: 90000 });
          const current = new URL(page.url());
          if (current.origin !== initial.origin || current.pathname !== initial.pathname) throw new Error(`Paginacao ${nome} redirecionada; coleta parcial nao sera publicada.`);
          info = await page.evaluate(readSnapshotKenloLocacao);
          const nextState = validateKenloPage(nextResponse?.status() ?? 0, info);
          if (nextState.total !== state.total) throw new Error(`Total de alugueis ${nome} mudou durante a paginacao; dados anteriores preservados.`);
        } else {
          await button.click();
          const updated = await page.waitForFunction(readSnapshotKenloLocacao, { timeout: 30000 }, info.cards.length);
          try { info = await updated.jsonValue(); }
          finally { await updated.dispose(); }
        }
        for (const card of info.cards) cards.set(card.href, card);
        if (cards.size === previousCount) throw new Error('Paginacao Kenlo sem progresso; coleta parcial nao sera publicada.');
        clicks++;
      } finally { await handle.dispose(); }
    }
    if (cards.size !== state.total) throw new Error(`Quantidade de cards (${cards.size}) difere do total informado pelo site (${state.total}); coleta nao sera publicada.`);
    console.log(`[${projeto.collection}Locacao] ${cards.size}/${state.total} cards completos (${clicks} cliques).`);
    return { cards: Array.from(cards.values()), semImoveisConfirmado: false };
  } finally { await page.close(); }
}

export async function extractKenloLocacao(browser, projeto, fields) {
  const result = await collectCardsKenloLocacao(browser, projeto);
  const imoveisRaspados = [];
  for (const card of result.cards) {
    imoveisRaspados.push(await mapCardKenloLocacao(projeto, card, fields));
    if (global.gc && imoveisRaspados.length % 20 === 0) global.gc();
  }
  return { imoveisRaspados, semImoveisConfirmado: result.semImoveisConfirmado };
}