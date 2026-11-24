import { parseTotalVendas, esperaRetryAfter } from './vendasContagem.js';
import { projetoContagemVendas } from './vendasContagemProjetos.js';

function erroTransitorio(error) {
  return error?.retryable === true ||
    /net::ERR_|TimeoutError|Waiting failed|Execution context was destroyed|Navigation timeout/i.test(error?.message || '');
}

async function carregarSnapshotPagina(page, destination, initial, {
  projeto,
  readSnapshot,
  cardSelector,
  maxTentativasPagina,
  retryDelayMs,
  allowPartialRoutes,
  esperaBloqueioMs,
  intervaloEntrePaginasMs,
  waitUntil,
  navigationTimeoutMs,
}) {
  for (let tentativa = 1; tentativa <= maxTentativasPagina; tentativa++) {
    try {
      if (intervaloEntrePaginasMs > 0) await new Promise(resolve => setTimeout(resolve, intervaloEntrePaginasMs));
      console.log(
        `[${projeto}] Carregando pagina ${destination.searchParams.get('pagina') || 1} ` +
        `(tentativa ${tentativa}/${maxTentativasPagina}; ${waitUntil}).`
      );
      // Kenlo pode servir catalogos diferentes para "~" e "%7E"; preservar o separador oficial das faixas.
      const response = await page.goto(destination.href.replace(/%7e/gi, '~'), {
        waitUntil,
        timeout: navigationTimeoutMs,
      });
      const status = response?.status() ?? 0;
      if ((status < 200 || status >= 400) && status !== 404) {
        const error = new Error(`[${projeto}] HTTP ${status}; coleta parcial nao sera salva.`);
        error.retryable = status === 429 || status >= 500;
        if (status === 429) error.esperaMs = esperaRetryAfter(response, esperaBloqueioMs);
        throw error;
      }
      const current = new URL(page.url());
      if (current.origin !== initial.origin || current.pathname !== initial.pathname) {
        throw new Error(`[${projeto}] Busca redirecionada; coleta parcial nao sera salva.`);
      }
      await page.waitForFunction((selector, partialRoutes) => {
        const heading = document.querySelector('h1')?.textContent || '';
        const text = (document.body.innerText || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const confirmedEmpty = /nao encontramos imoveis para a sua busca/i.test(text);
        const nextLink = Array.from(document.querySelectorAll('a.btn-next[href]')).some(anchor =>
          /ver\s+mais/i.test(anchor.textContent) &&
          !anchor.getAttribute('data-action') &&
          anchor.getAttribute('aria-disabled') !== 'true'
        );
        const validHeading = partialRoutes
          ? /\d[\d.]*/.test(heading)
          : /\d[\d.]*\s*Im[o\u00f3]veis.*venda/i.test(heading);
        return confirmedEmpty || (
          validHeading &&
          (document.querySelector(selector) || nextLink || /^\s*(?:Exibindo\s*)?0\s*Im[o\u00f3]veis/i.test(heading))
        );
      }, { timeout: 30000 }, cardSelector, allowPartialRoutes);
      const snapshot = await page.evaluate(readSnapshot);
      if (status === 404) {
        const confirmedEmpty = snapshot.cards.length === 0 &&
          /n[a\u00e3]o encontramos im[o\u00f3]veis para a sua busca/i.test(snapshot.text || '');
        if (!confirmedEmpty) throw new Error(`[${projeto}] HTTP 404 sem faixa vazia confirmada; coleta parcial nao sera salva.`);
      }
      return snapshot;
    } catch (error) {
      if (!erroTransitorio(error)) throw error;
      if (allowPartialRoutes && /Waiting failed|TimeoutError/i.test(error?.message || '')) {
        const snapshot = await page.evaluate(readSnapshot).catch(() => null);
        if (snapshot && Array.isArray(snapshot.cards) && snapshot.heading) {
          console.warn(`[${projeto}] Conteudo identificado apos a espera; continuando a pagina atual.`);
          return snapshot;
        }
      }
      if (tentativa >= maxTentativasPagina) {
        if (allowPartialRoutes) {
          const snapshot = await page.evaluate(readSnapshot).catch(() => null);
          if (snapshot && Array.isArray(snapshot.cards)) {
            console.warn(`[${projeto}] Rota sem conteudo carregavel apos ${maxTentativasPagina} tentativas; seguindo com a uniao global.`);
            return snapshot;
          }
        }
        throw new Error(
          `[${projeto}] Falha ao carregar ${destination.href} apos ${maxTentativasPagina} tentativas: ${error.message}`,
          { cause: error }
        );
      }
      const espera = Math.max(retryDelayMs * tentativa, (error.esperaMs || 0) * tentativa);
      console.warn(
        `[${projeto}] Falha transitoria na pagina ${destination.searchParams.get('pagina') || 1} ` +
        `(tentativa ${tentativa}/${maxTentativasPagina}): ${error.message}. Nova tentativa em ${espera}ms.`
      );
      if (espera > 0) await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
  throw new Error(`[${projeto}] Falha inesperada ao carregar pagina.`);
}

export async function coletarPaginasKenloVendas(browser, links, {
  projeto,
  readSnapshot,
  cardSelector,
  totalEsperado,
  ordenacaoInicial = 'recentes',
  maxTentativas = 1,
  maxPaginasSemProgresso = 3,
  maxTentativasPagina = 4,
  retryDelayMs = 2000,
  allowPartialRoutes = false,
  ordenacoesAlternativas = [],
  esperaBloqueioMs = 0,
  intervaloEntrePaginasMs = 0,
  waitUntil = allowPartialRoutes ? 'domcontentloaded' : 'networkidle2',
  navigationTimeoutMs = 90000,
  recargasTotalDivergente = 0,
  esperaTotalDivergenteMs = 0,
}) {
  if (!Array.isArray(links) || !links.length) throw new Error(`[${projeto}] Rotas de venda ausentes.`);
  const allCards = new Map();
  for (const [linkIndex, link] of links.entries()) {
    const initial = new URL(link);
    if (initial.pathname !== '/imoveis/a-venda') throw new Error(`[${projeto}] Coleta exige uma rota de venda.`);
    if (ordenacaoInicial) initial.searchParams.set('ordenar', ordenacaoInicial);
    else initial.searchParams.delete('ordenar');
    if (links.length > 1) {
      const filter = initial.searchParams.get('tipo') || initial.searchParams.get('preco-de-venda') || initial.pathname.replace('/imoveis/a-venda/', '');
      console.log(`[${projeto}] Rota ${linkIndex + 1}/${links.length}: ${filter}.`);
    }
    const page = await browser.newPage();
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });
      const visited = new Set();
      const cards = new Map();
      let next = initial.href;
      let expected;
      let tentativa = 1;
      let paginasSemProgresso = 0;
      while (next) {
        const destination = new URL(next);
        if (ordenacaoInicial) destination.searchParams.set('ordenar', ordenacaoInicial);
        else destination.searchParams.delete('ordenar');
        if (destination.origin !== initial.origin || destination.pathname !== initial.pathname || visited.has(destination.href)) throw new Error(`[${projeto}] Paginacao invalida ou repetida; coleta parcial nao sera salva.`);
        visited.add(destination.href);
        let snapshot;
        let total;
        let semTotal = false;
        // Alguns sites devolvem momentaneamente uma pagina com contador divergente (ex.: 0); recarrega a mesma pagina antes de desistir.
        for (let recarga = 0; ; recarga++) {
          snapshot = await carregarSnapshotPagina(page, destination, initial, {
            projeto,
            readSnapshot,
            cardSelector,
            maxTentativasPagina,
            retryDelayMs,
            allowPartialRoutes,
            esperaBloqueioMs,
            intervaloEntrePaginasMs,
            waitUntil,
            navigationTimeoutMs,
          });
          const confirmedEmpty = snapshot.cards.length === 0 &&
            /n[a\u00e3]o encontramos im[o\u00f3]veis para a sua busca/i.test(snapshot.text || '');
          try {
            total = confirmedEmpty ? 0 : parseTotalVendas(snapshot.heading, projetoContagemVendas(projeto));
          } catch (error) {
            if (!allowPartialRoutes) throw error;
            semTotal = true;
            break;
          }
          if (expected === undefined || total === expected || recarga >= recargasTotalDivergente) break;
          const espera = Math.max(retryDelayMs, esperaTotalDivergenteMs) * (recarga + 1);
          console.warn(`[${projeto}] Pagina ${visited.size} retornou total ${total} (esperado ${expected}); recarregando a mesma pagina em ${Math.round(espera / 1000)}s (${recarga + 1}/${recargasTotalDivergente}).`);
          if (espera > 0) await new Promise(resolve => setTimeout(resolve, espera));
        }
        if (semTotal) {
          console.warn(`[${projeto}] Rota sem total identificavel; seguindo com a uniao global.`);
          break;
        }
        if (expected === undefined) expected = total;
        if (total !== expected) {
          const error = new Error(`[${projeto}] Total mudou durante a paginacao: ${expected} -> ${total} (${destination.href}); coleta parcial nao sera salva.`);
          error.code = 'KENLO_TOTAL_ALTERADO';
          throw error;
        }
        const before = cards.size;
        for (const card of snapshot.cards) {
          if (cards.has(card.href)) console.warn(`[${projeto}] Link repetido na pagina ${visited.size}: ${card.href}`);
          cards.set(card.href, card.html);
        }
        for (const card of snapshot.descartados || []) console.warn(`[${projeto}] Card descartado na pagina ${visited.size}: ${JSON.stringify(card)}`);
        console.log(`[${projeto}] Pagina ${visited.size}: ${cards.size}/${expected} imoveis unicos.`);
        paginasSemProgresso = cards.size === before ? paginasSemProgresso + 1 : 0;
        if (cards.size === expected) break;
        const coletaTravada = !snapshot.next || paginasSemProgresso >= maxPaginasSemProgresso;
        if (allowPartialRoutes && cards.size < expected && coletaTravada) {
          console.warn(`[${projeto}] Rota parcial encerrada em ${cards.size}/${expected}; seguindo com a uniao global.`);
          break;
        }
        if (cards.size < expected && coletaTravada && tentativa < maxTentativas) {
          console.warn(`[${projeto}] Coleta incompleta: ${cards.size}/${expected}. Reiniciando coleta completa (tentativa ${tentativa + 1}/${maxTentativas}).`);
          tentativa++;
          cards.clear();
          visited.clear();
          paginasSemProgresso = 0;
          next = initial.href;
          continue;
        }
        if (cards.size > expected || coletaTravada) throw new Error(`[${projeto}] Coleta incompleta: ${cards.size}/${expected}; Ver mais ausente ou sem novos imoveis.`);
        if (paginasSemProgresso > 0) {
          console.warn(`[${projeto}] Pagina ${visited.size} sem novos imoveis; seguindo para a proxima (${paginasSemProgresso}/${maxPaginasSemProgresso}).`);
        }
        next = snapshot.next;
      }
      // The site changes during long runs, so pages shift and listings get skipped; other sort orders fill the gaps.
      if (allowPartialRoutes && expected !== undefined) {
        for (const ordenacao of ordenacoesAlternativas) {
          if (cards.size >= expected) break;
          console.log(`[${projeto}] Complementando rota com ordenar=${ordenacao} (${cards.size}/${expected}).`);
          const visitedAlt = new Set();
          let nextAlt = initial.href;
          while (nextAlt && cards.size < expected) {
            const destination = new URL(nextAlt);
            destination.searchParams.set('ordenar', ordenacao);
            if (destination.origin !== initial.origin || destination.pathname !== initial.pathname || visitedAlt.has(destination.href)) break;
            visitedAlt.add(destination.href);
            const snapshot = await carregarSnapshotPagina(page, destination, initial, {
              projeto,
              readSnapshot,
              cardSelector,
              maxTentativasPagina,
              retryDelayMs,
              allowPartialRoutes,
              esperaBloqueioMs,
              intervaloEntrePaginasMs,
              waitUntil,
              navigationTimeoutMs,
            });
            if (!snapshot.cards.length) break;
            const before = cards.size;
            for (const card of snapshot.cards) cards.set(card.href, card.html);
            if (cards.size > before) console.log(`[${projeto}] ordenar=${ordenacao} pagina ${visitedAlt.size}: ${cards.size}/${expected} imoveis unicos.`);
            nextAlt = snapshot.next;
          }
        }
        if (cards.size < expected) console.warn(`[${projeto}] Rota encerrada em ${cards.size}/${expected} apos ordenacoes alternativas.`);
      }
      for (const [href, html] of cards) allCards.set(href, html);
      if (allowPartialRoutes) {
        console.log(`[${projeto}] Uniao global apos rota ${linkIndex + 1}: ${allCards.size}/${totalEsperado}.`);
      }
      if (totalEsperado !== undefined && allCards.size === totalEsperado) break;
    } finally { await page.close(); }
  }
  if (totalEsperado !== undefined && allCards.size !== totalEsperado) {
    const error = new Error(`[${projeto}] Coleta ${allCards.size} difere da precontagem ${totalEsperado}; base preservada.`);
    error.code = 'KENLO_TOTAL_DIVERGENTE';
    throw error;
  }
  return [...allCards.values()];
}

export function readSnapshotGm() {
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cards = new Map();
  for (const anchor of document.querySelectorAll('a.card-with-buttons.borderHover[href*="/imovel/"],a.card-with-buttons.borderHover[href*="/empreendimento/"]')) {
    const url = new URL(anchor.href);
    url.search = '';
    url.hash = '';
    const code = anchor.querySelector('p.card-with-buttons__code')?.textContent?.trim() || '';
    const title = anchor.querySelector('p.card-with-buttons__title')?.textContent?.trim() || '';
    const heading = anchor.querySelector('h2.card-with-buttons__heading')?.textContent?.trim() || '';
    const price = anchor.querySelector('p.card-with-buttons__value')?.textContent?.trim() || '';
    const metrics = Array.from(anchor.querySelectorAll('ul li')).map(element => `<li>${escape(element.textContent.trim())}</li>`).join('');
    const image = anchor.querySelector('img.cards_digital_carousel-image');
    const html = `<a class="card-with-buttons borderHover" href="${escape(anchor.getAttribute('href'))}">
      <p class="card-with-buttons__code">${escape(code)}</p><p class="card-with-buttons__title">${escape(title)}</p>
      <h2 class="card-with-buttons__heading">${escape(heading)}</h2><ul>${metrics}</ul><p class="card-with-buttons__value">${escape(price)}</p>
      <img class="cards_digital_carousel-image" src="${escape(image?.getAttribute('src'))}" data-fallback="${escape(image?.getAttribute('data-fallback'))}"></a>`;
    cards.set(url.href, { href: url.href, html });
  }
  const next = Array.from(document.querySelectorAll('a.btn-next[href]')).find(anchor => /ver\s+mais/i.test(anchor.textContent) && !anchor.getAttribute('data-action') && anchor.getAttribute('aria-disabled') !== 'true');
  return { heading: document.querySelector('h1')?.textContent || '', cards: [...cards.values()], next: next?.href || '' };
}

export function readSnapshotLeal() {
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cards = new Map();
  const descartados = [];
  for (const root of document.querySelectorAll('.card.card-listing,a.card-with-buttons.borderHover[href],a[href*="/imovel/"]:has(h3.card-text)')) {
    if (root.matches('a') && root.closest('.card.card-listing')) continue;
    const modern = root.matches('a.card-with-buttons');
    const anchor = (root.matches('a[href]') ? [root] : Array.from(root.querySelectorAll('a[href]'))).find(element => {
      const url = new URL(element.href);
      return url.origin === new URL(document.URL).origin && url.pathname.startsWith('/imovel/');
    });
    if (!anchor || !root.querySelector('h3.card-text,p.card-with-buttons__title')) {
      descartados.push({ codigo: root.querySelector('small.reference')?.textContent?.trim() || '', titulo: root.querySelector('h3,h2')?.textContent?.trim() || '', links: Array.from(root.querySelectorAll('a[href]')).map(element => element.href) });
      continue;
    }
    const url = new URL(anchor.href);
    url.search = '';
    url.hash = '';
    const code = root.querySelector('small.reference.property_full_reference.pull-right,p.card-with-buttons__code')?.textContent?.trim() || '';
    const location = (root.querySelector('h2.card-with-buttons__heading')?.textContent || '').split(/\s+-\s+/);
    const cidade = location.length >= 3 ? location.at(-2).trim() : '';
    const title = modern
      ? [root.querySelector('p.card-with-buttons__title')?.textContent?.trim(), cidade].filter(Boolean).join(' em ')
      : root.querySelector('h3.card-text')?.textContent?.trim() || '';
    const bairro = modern ? location.slice(0, -2).join(' - ').trim() : root.querySelector('h2.card-title')?.textContent?.trim() || '';
    const price = root.querySelector('span.h-money.location,p.card-with-buttons__value')?.textContent?.trim() || '';
    // Adaptar as metricas novas ao DOM esperado pelos extratores legados.
    const metrics = modern
      ? Array.from(root.querySelectorAll('ul:not(.cards_digital_carousel) li')).map(element => {
        const text = element.textContent.trim();
        return `<div class="value"><p>${escape(text).replace(/^[\d.,]+/, value => `<span class="h-money">${value}</span>`)}</p></div>`;
      }).join('')
      : Array.from(root.querySelectorAll('div.values div.value p,div.value p')).map(element => `<li>${escape(element.textContent.trim())}</li>`).join('');
    const photo = root.querySelector('div.card-img-top');
    const image = root.querySelector('img.card-img-top,.card-carousel img,img.cards_digital_carousel-image');
    const html = `<a href="${escape(anchor.getAttribute('href'))}">
      <h2 class="card-title">${escape(bairro)}</h2><h3 class="card-text">${escape(title)}</h3>
      <span class="h-money location">${escape(price)}</span>${modern ? `<div class="values">${metrics}</div>` : `<ul>${metrics}</ul>`}
      <div class="card-img-top" style="${escape(photo?.getAttribute('style'))}" data-src="${escape(photo?.getAttribute('data-src'))}">
      <img class="card-img-top" src="${escape(image?.getAttribute('src'))}" data-fallback="${escape(image?.getAttribute('data-fallback'))}"></div>
      <small class="reference property_full_reference pull-right">${escape(code)}</small></a>`;
    cards.set(url.href, { href: url.href, html });
  }
  const next = Array.from(document.querySelectorAll('a.btn-next[href]')).find(anchor => /ver\s+mais/i.test(anchor.textContent) && !anchor.getAttribute('data-action') && anchor.getAttribute('aria-disabled') !== 'true');
  return { heading: document.querySelector('h1')?.textContent || '', cards: [...cards.values()], next: next?.href || '', descartados };
}

export function readSnapshotToronto() {
  const cards = new Map();
  for (const anchor of document.querySelectorAll('a.card_split_vertically.borderHover[href]')) {
    const url = new URL(anchor.href);
    if (url.origin !== new URL(document.URL).origin || !/^\/(?:imovel|empreendimento)\//.test(url.pathname)) continue;
    url.search = '';
    url.hash = '';
    cards.set(url.href, { href: url.href, html: anchor.outerHTML });
  }
  const next = Array.from(document.querySelectorAll('a.btn-next[href]')).find(anchor => /ver\s+mais/i.test(anchor.textContent) && !anchor.getAttribute('data-action') && anchor.getAttribute('aria-disabled') !== 'true');
  return { heading: document.querySelector('h1')?.textContent || '', cards: [...cards.values()], next: next?.href || '' };
}