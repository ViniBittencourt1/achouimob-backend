const TAMANHO_PAGINA = 12;
const INTERVALO_PAGINAS_MS = 4000;
const ESPERAS_BLOQUEIO_MS = [30000, 60000, 120000];
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

async function comRetryBloqueio(requisitar, statusDaResposta, retryAfter, descricao, aguardar = esperar) {
  for (let tentativa = 0; ; tentativa++) {
    const response = await requisitar();
    if (statusDaResposta(response) !== 429 || tentativa === ESPERAS_BLOQUEIO_MS.length) return response;
    const header = retryAfter(response);
    const segundos = Number(header);
    const data = Date.parse(header || "");
    const informado = header && Number.isFinite(segundos) && segundos >= 0
      ? segundos * 1000
      : Number.isFinite(data) ? Math.max(0, data - Date.now()) : 0;
    const intervalo = Math.max(ESPERAS_BLOQUEIO_MS[tentativa], informado);
    if (intervalo > 300000) throw new Error(`[rioMetropole] HTTP 429 em ${descricao}: espera solicitada excede 5 minutos; base preservada.`);
    console.warn(`[rioMetropole] HTTP 429 em ${descricao}; aguardando ${intervalo} ms antes de tentar novamente.`);
    await aguardar(intervalo);
  }
}

function divergencia(message) {
  return Object.assign(new Error(`[rioMetropole] ${message}; base preservada.`), { code: "KENLO_TOTAL_DIVERGENTE" });
}

function linkCanonico(value, base) {
  if (typeof value !== "string" || !value) throw divergencia("Registro sem link");
  const url = new URL(value, base);
  if (url.origin !== new URL(base).origin || !/^\/(?:imovel|empreendimento)\//.test(url.pathname)) {
    throw divergencia("Link fora da listagem");
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

export async function percorrerCatalogoMetropole(base, lerPagina, { intervaloMs = 0, aguardar = esperar } = {}) {
  let totalBruto;
  let omitidos = 0;
  let duplicados = 0;
  const links = new Set();
  const datasPorLink = new Map();
  const versoes = new Set();
  const htmls = [];
  for (let pagina = 1; ; pagina++) {
    if (pagina > 1 && intervaloMs > 0) await aguardar(intervaloMs);
    console.log(`[rioMetropole] Conferindo pagina ${pagina}${totalBruto === undefined ? "" : `/${Math.ceil(totalBruto / TAMANHO_PAGINA) + 1}`}...`);
    const terminal = totalBruto !== undefined && (pagina - 1) * TAMANHO_PAGINA >= totalBruto;
    const { state, cards } = await lerPagina(pagina, { terminal });
    const bruto = state?.aggs?.geo_center?.count;
    if (!Number.isSafeInteger(bruto) || bruto < 0 || !Number.isSafeInteger(state.count) || !Array.isArray(state.data)) {
      throw divergencia(`Estado invalido na pagina ${pagina}`);
    }
    if (totalBruto === undefined) totalBruto = bruto;
    if (bruto !== totalBruto) throw divergencia(`Total bruto mudou: ${totalBruto} -> ${bruto}`);
    const slots = Math.min(TAMANHO_PAGINA, Math.max(0, totalBruto - (pagina - 1) * TAMANHO_PAGINA));
    // O site desconta do contador somente as omissoes da pagina atual, nao as do catalogo inteiro.
    if (state.data.length > slots || state.count !== totalBruto - slots + state.data.length) {
      throw divergencia(`Contador nao reconciliado na pagina ${pagina}`);
    }
    const linksPagina = state.data.map(item => linkCanonico(item.url, base));
    const novos = new Set();
    for (const [index, link] of linksPagina.entries()) {
      const atualizado = state.data[index].updated_at;
      if (typeof atualizado !== "string" || !Number.isFinite(Date.parse(atualizado))) throw divergencia(`Versao sem data na pagina ${pagina}`);
      const versao = `${link}|${atualizado}`;
      if (versoes.has(versao)) throw divergencia(`Versao repetida na pagina ${pagina}: ${link}`);
      versoes.add(versao);
      if (datasPorLink.has(link) && Date.parse(atualizado) > datasPorLink.get(link)) {
        throw divergencia(`Ordenacao das versoes mudou na pagina ${pagina}: ${link}`);
      }
      if (!datasPorLink.has(link)) datasPorLink.set(link, Date.parse(atualizado));
      if (links.has(link)) duplicados++;
      else novos.add(link);
      links.add(link);
    }
    if (cards !== undefined) {
      if (!Array.isArray(cards) || cards.length !== new Set(linksPagina).size) throw divergencia(`Cards ausentes na pagina ${pagina}`);
      const linksCards = cards.map(card => linkCanonico(card.href, base));
      if (new Set(linksCards).size !== linksCards.length || linksPagina.some(link => !linksCards.includes(link))) {
        throw divergencia(`Cards diferentes da API na pagina ${pagina}`);
      }
      htmls.push(...cards.filter(card => novos.has(linkCanonico(card.href, base))).map(card => card.html));
    }
    omitidos += slots - state.data.length;
    if (slots === 0) break;
  }
  if (links.size + omitidos + duplicados !== totalBruto || totalBruto > 0 && links.size === 0) {
    throw divergencia("Catalogo sem resultados verificaveis");
  }
  console.log(`[rioMetropole] Catalogo conferido: ${links.size} anuncios publicos; ${totalBruto} posicoes brutas, ${omitidos} sem anuncio retornado pelo site e ${duplicados} versoes duplicadas.`);
  return { total: links.size, totalBruto, links: [...links], htmls };
}

function urlPagina(base, pagina, api = false) {
  const url = new URL(base);
  if (api) url.pathname = url.pathname.replace("/imoveis/", "/api/listings/");
  url.searchParams.set("ordenar", "recentes");
  url.searchParams.set("pagina", pagina);
  url.searchParams.set("_", Date.now());
  return url;
}

export async function lerPaginaApi(project, pagina, aguardar = esperar) {
  const url = urlPagina(project.urlVendas, pagina, true);
  const response = await comRetryBloqueio(() => fetch(url, {
    signal: AbortSignal.timeout(45000), redirect: "error",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  }), response => response.status, response => response.headers?.get("retry-after"), `API pagina ${pagina}`, aguardar);
  if (!response.ok) {
    const orientacao = response.status === 429 ? " Site limitou as requisicoes; aguarde o desbloqueio antes de executar novamente." : "";
    throw new Error(`[rioMetropole] HTTP ${response.status} na API; base preservada.${orientacao}`);
  }
  return response.json();
}

async function lerCatalogoApi(project, aguardar = esperar) {
  return percorrerCatalogoMetropole(project.urlVendas, async pagina => ({ state: await lerPaginaApi(project, pagina, aguardar) }), {
    intervaloMs: INTERVALO_PAGINAS_MS, aguardar,
  });
}

export async function contarMetropole(project) {
  return (await lerCatalogoApi(project)).total;
}

export async function coletarHtmlsMetropole(browser, project, { totalEsperado, primeiraPagina, aguardar = esperar }) {
  const page = await browser.newPage();
  let htmlsPrimeiraPagina = [];
  try {
    await page.setCacheEnabled(false);
    await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache", Pragma: "no-cache" });
    const catalogo = await percorrerCatalogoMetropole(project.urlVendas, async (pagina, { terminal }) => {
      // A rota HTML responde 404 depois da ultima pagina; a API confirma o vazio com estado estruturado.
      if (terminal || totalEsperado === 0) return { state: await lerPaginaApi(project, pagina, aguardar), cards: [] };
      const url = urlPagina(project.urlVendas, pagina);
      const response = await comRetryBloqueio(
        () => page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 }),
        response => response?.status(),
        response => response?.headers()?.["retry-after"],
        `pagina ${pagina}`,
        aguardar,
      );
      if (!response?.ok() || new URL(page.url()).origin !== url.origin || new URL(page.url()).pathname !== url.pathname) {
        const orientacao = response?.status() === 429 ? " Site limitou as requisicoes; aguarde o desbloqueio antes de executar novamente." : "";
        throw new Error(`[rioMetropole] HTTP ${response?.status()} ou redirecionamento na pagina ${pagina}; base preservada.${orientacao}`);
      }
      await page.waitForFunction(() => Object.entries(window.markoVars || {}).some(([key, value]) =>
        key.startsWith("listings-") && Array.isArray(value?.settings?.listings?.data)), { timeout: 30000 });
      const state = await page.evaluate(() => {
        const listings = Object.entries(window.markoVars).find(([key]) => key.startsWith("listings-"))[1].settings.listings;
        return { count: listings.count, data: listings.data.map(item => ({ url: item.url, updated_at: item.updated_at })), aggs: { geo_center: listings.aggs.geo_center } };
      });
      const cards = await page.evaluate(function readCardsMetropole() {
        const cards = new Map();
        const roots = document.querySelectorAll('a.card-with-buttons, a.card_split_vertically, .card.card-listing');
        for (const root of roots) {
          const selector = 'a[href*="/imovel/"], a[href*="/empreendimento/"]';
          const anchor = root.matches(selector) ? root : root.querySelector(selector);
          if (!anchor) continue;
          const url = new URL(anchor.href);
          url.search = "";
          url.hash = "";
          if (!cards.has(url.href)) cards.set(url.href, { href: url.href, html: root.outerHTML });
        }
        return [...cards.values()];
      });
      if (pagina === 1) htmlsPrimeiraPagina = cards.map(card => card.html);
      return { state, cards };
    }, { intervaloMs: INTERVALO_PAGINAS_MS, aguardar });
    if (catalogo.total !== totalEsperado) throw divergencia(`Catalogo mudou: ${totalEsperado} -> ${catalogo.total}`);
    const confirmado = await lerCatalogoApi(project, aguardar);
    const linksConfirmados = new Set(confirmado.links);
    if (confirmado.totalBruto !== catalogo.totalBruto || confirmado.total !== catalogo.total
      || catalogo.links.some(link => !linksConfirmados.has(link))) {
      throw divergencia("Identidades do catalogo mudaram durante a coleta");
    }
    return primeiraPagina ? htmlsPrimeiraPagina : catalogo.htmls;
  } finally { await page.close(); }
}
