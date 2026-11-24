import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';

// O contador de vendas soma todas as cidades; o filtro so por cidade tambem traz aluguel.
const BASE_URL = 'https://megacasaimoveis.com.br/imovel/?_acao=venda';

function slugToLabel(slug) {
  const clean = String(slug || '')
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function extrairBairroSlugDoLink(linkReal, cidade = 'juiz-de-fora-mg') {
  const cidadeSlug = String(cidade || 'juiz-de-fora-mg').toLowerCase();
  const clean = String(linkReal || '').toLowerCase();
  const escapedCidade = cidadeSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = clean.match(new RegExp(`\\/imovel\\/[^/]*?-venda-([a-z0-9-]+)-${escapedCidade}\\/?$`, 'i'));
  return match?.[1] ? resolverBairroCatalogo(match[1], cidadeSlug) : '';
}

function fallbackByLink(linkReal, cidade = 'juiz-de-fora-mg') {
  const bairro = extrairBairroSlugDoLink(linkReal, cidade);
  const cidadeLabel = slugToLabel(String(cidade).replace(/-mg$/i, ''));
  return {
    bairro,
    cidade,
    localizacao: bairro ? `${slugToLabel(bairro)}, ${cidadeLabel} - MG` : '',
  };
}

async function clicarLoadMoreAteFinal(page, strict = false) {
  for (let tentativas = 0; tentativas < 80; tentativas++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const existeBotao = await page.$('button.wpgb-button.wpgb-load-more');
    if (!existeBotao) break;

    const estado = await page.evaluate(() => {
      const btn = document.querySelector('button.wpgb-button.wpgb-load-more');
      if (!btn) return null;
      return {
        text: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
        disabled: btn.hasAttribute('disabled'),
      };
    });

    if (!estado) break;

    if (!estado.text || /\(0\)/.test(estado.text) || estado.disabled) break;

    const totalAntes = await page.$$eval('article.wpgb-card', (nodes) => nodes.length);
    await page.evaluate(() => {
      const btn = document.querySelector('button.wpgb-button.wpgb-load-more');
      if (btn) btn.click();
    });

    try {
      await page.waitForFunction(
        (prev) => document.querySelectorAll('article.wpgb-card').length > prev,
        { timeout: 20000 },
        totalAntes,
      );
    } catch (error) {
      if (strict) throw new Error('Mega nao acrescentou novos cards. Coleta parcial nao sera publicada.');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export function parsePrecoMegaLocacao(value) {
  const match = String(value || '').trim().match(/^(?:R\$\s*)?([\d.]+)(?:,(\d{1,2}))?$/);
  if (!match) throw new Error('Valor de aluguel Mega nao identificado no bloco proprio.');
  return Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`);
}

function toNumber(texto) {
  const source = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!source) return 0;

  const vendaLabel = source.match(/venda\s*[:\-]?\s*r?\$?\s*(\d{1,3}(?:\.\d{3})+)(?:,\d{2})?/i);
  if (vendaLabel?.[1]) {
    const n = Number(vendaLabel[1].replace(/\./g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }

  const todos = source.match(/\d{1,3}(?:\.\d{3})+/g) || [];
  if (todos.length > 0) {
    const n = Number(todos[0].replace(/\./g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }

  const fallback = source.match(/(\d+)/);
  if (!fallback?.[1]) return 0;
  const n = Number(fallback[1]);
  return Number.isFinite(n) ? n : 0;
}

function getBairroFromTituloOuLink(titulo, linkReal) {
  const tituloLimpo = String(titulo || '')
    .replace(/^\s*[^\s]+\s+à\s+venda\s+no\s+/i, '')
    .replace(/^\s*[^\s]+\s+à\s+venda\s+na\s+/i, '');

  const matchTitulo = tituloLimpo.match(/^(.*?)\s+em\s+Juiz\s+de\s+Fora/i)
    || String(titulo || '').match(/(?:no|na)\s+(.+?)\s+em\s+Juiz\s+de\s+Fora/i);
  if (matchTitulo?.[1]) {
    return matchTitulo[1]
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  return extrairBairroSlugDoLink(linkReal, 'juiz-de-fora-mg');
}

function localizacaoFromTituloOuLink(titulo, linkReal) {
  const tituloLimpo = String(titulo || '')
    .replace(/^\s*[^\s]+\s+à\s+venda\s+no\s+/i, '')
    .replace(/^\s*[^\s]+\s+à\s+venda\s+na\s+/i, '');

  const matchTitulo = tituloLimpo.match(/^(.*?)\s+em\s+Juiz\s+de\s+Fora/i)
    || String(titulo || '').match(/(?:no|na)\s+(.+?)\s+em\s+Juiz\s+de\s+Fora/i);
  if (matchTitulo?.[1]) {
    return `${slugToLabel(matchTitulo[1].trim().toLowerCase().replace(/\s+/g, '-'))}, Juiz de Fora - MG`;
  }

  const fallback = fallbackByLink(linkReal);
  return fallback.localizacao;
}

export async function extractMegaData(browser, existingCodigoBaseSet = new Set(), options = {}) {
  const page = await browser.newPage();
  const vistos = new Set();
  let allImoveis = [];

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });
    const response = await page.goto(options.baseUrl ?? BASE_URL, { waitUntil: 'networkidle2', timeout: 90000 });
    if (options.strict && !response?.ok()) throw new Error(`HTTP ${response?.status()} na busca Mega.`);
    const status = response?.status?.() ?? null;
    const tituloPagina = await page.title();

    if (status === 403 || /cloudflare|just a moment|forbidden|acesso negado/i.test(tituloPagina)) {
      const err = new Error(`[Mega] Bloqueio detectado (${status ?? 'sem status'}) na listagem.`);
      err.code = 'MEGA_BLOCKED';
      throw err;
    }

    try {
      await page.waitForFunction(
        () => document.querySelectorAll('article.wpgb-card').length > 0,
        { timeout: 30000 },
      );
    } catch {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const cardsIniciais = await page.$$eval('article.wpgb-card', (nodes) => nodes.length);
    if (cardsIniciais === 0) {
      const err = new Error('[Mega] Cards não carregaram na listagem.');
      err.code = 'MEGA_BLOCKED';
      throw err;
    }

    await clicarLoadMoreAteFinal(page, options.strict);
    if (options.strict) {
      const active = await page.evaluate(() => {
        const button = document.querySelector('button.wpgb-load-more');
        return button && button.offsetParent !== null && !button.disabled && !/\(0\)/.test(button.textContent);
      });
      if (active) throw new Error('Mega ainda possui paginas pendentes.');
    }

    const cards = await page.$$eval('article.wpgb-card', (nodes) => nodes.map((card) => {
      const txt = (sel) => card.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const linkReal = card.querySelector('a.wpgb-card-layer-link[href*="/imovel/"]')?.href || card.querySelector('a[href*="/imovel/"]')?.href || '';
      const codigoBase = txt('.wpgb-block-4') || txt('.wpgb-block-6');
      const titulo = txt('.wpgb-block-11') || txt('h3 a') || txt('h2 a') || txt('h4 a');
      const precoTexto = txt('.wpgb-block-10') || txt('.wpgb-block-16') || txt('.wpgb-block-1');
      const aluguelTexto = txt('.wpgb-block-13');
      const precoFonte = (card.textContent || '').replace(/\s+/g, ' ').trim();
      const dormitorioTexto = txt('.wpgb-block-8') || txt('.wpgb-block-12');
      const suiteTexto = txt('.wpgb-block-2') || txt('.wpgb-block-12');
      const vagaTexto = txt('.wpgb-block-5') || txt('.wpgb-block-12');
      const areaTexto = txt('.wpgb-block-17') || txt('.wpgb-block-12');
      const foto = card.querySelector('a.wpgb-handle-lb')?.getAttribute('href') || card.querySelector('img[fifu-featured]')?.getAttribute('src') || card.querySelector('img')?.getAttribute('src') || '';

      return {
        linkReal,
        codigoBase,
        titulo,
        precoTexto,
        aluguelTexto,
        precoFonte,
        dormitorioTexto,
        suiteTexto,
        vagaTexto,
        areaTexto,
        foto,
      };
    }));

    console.log(`[Mega] ${cards.length} cards encontrados na listagem.`);

    for (const raw of cards) {
      const linkReal = raw.linkReal;
      if (!linkReal || vistos.has(linkReal)) continue;
      vistos.add(linkReal);

      const tituloLocal = options.strict ? raw.titulo.replace(/para\s+alugar/gi, '\u00e0 venda') : raw.titulo;
      const linkLocal = options.strict ? linkReal.replace(/-aluguel-|-alugar-|-locacao-/g, '-venda-') : linkReal;
      const cidade = extractCidadeFromCardHtml(linkReal);
      const fallback = fallbackByLink(linkLocal, cidade || undefined);
      const bairro = getBairroFromTituloOuLink(tituloLocal, linkLocal) || fallback.bairro;
      const localizacao = localizacaoFromTituloOuLink(tituloLocal, linkLocal) || fallback.localizacao;

      const tipoImovel = extractTipoImovel('', raw.titulo);

      const dormMatch = String(raw.dormitorioTexto || '').match(/(\d+)\s*dorm/i);
      const suiteMatch = String(raw.suiteTexto || '').match(/(\d+)\s*su[ií]te/i);
      const vagaMatch = String(raw.vagaTexto || '').match(/(\d+)\s*vaga/i);
      const areaMatch = String(raw.areaTexto || '').match(/(\d+[\.,]?\d*)\s*m\s*²?|m²/i) || String(raw.areaTexto || '').match(/(\d+[\.,]?\d*)/);

      allImoveis.push({
        linkReal,
        titulo: raw.titulo,
        preco: options.strict ? parsePrecoMegaLocacao(raw.aluguelTexto) : aplicarPrecoAPartir(toNumber(`${raw.precoTexto} ${raw.precoFonte}`), `${raw.precoTexto} ${raw.precoFonte}`),
        localizacao,
        tipoImovel,
        bairro,
        cidade,
        dormitorioValor: dormMatch?.[1] ? Number(dormMatch[1]) : 0,
        banheiroValor: 0,
        ambienteValor: extractAmbienteValor(),
        areaValor: areaMatch?.[1] ? parseFloat(String(areaMatch[1]).replace('.', '').replace(',', '.')) || 0 : 0,
        garagemValor: vagaMatch?.[1] ? Number(vagaMatch[1]) : 0,
        elevadorValor: extractElevadorValor(),
        codigoBase: raw.codigoBase || (linkReal.match(/\/imovel\/([a-z]{2}\d{3,8})-/i)?.[1] || '').toUpperCase(),
        linkCard: extractLinkCard(),
        corretor: extractCorretor(),
        dataInclusao: extractDataInclusao(),
        dataExclusao: '',
        linkFoto: raw.foto,
        atualizadoEm: extractAtualizadoEm(),
      });
    }
  } finally {
    await page.close();
  }

  const novosImoveis = allImoveis.filter((card) => !existingCodigoBaseSet.has(String(card.codigoBase)));

  return {
    imoveisRaspados: allImoveis,
    novosImoveis,
  };
}
