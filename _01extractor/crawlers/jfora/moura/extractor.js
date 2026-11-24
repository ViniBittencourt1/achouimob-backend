import * as cheerio from 'cheerio';
import { coletarPaginasKenloVendas, readSnapshotGm } from '../_utils/vendasKenloPaginacao.js';
import { resolverTipoCatalogoContido } from '../_1Jf/tipos-alugueis.js';
import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

export function parseMouraCard(cardHtml) {
  const $ = cheerio.load(cardHtml);
  const anchor = $('a.card-with-buttons[href*="/imovel/"]').first();
  const base = new URL('https://www.mouraimoveisjf.com.br');
  const link = new URL(anchor.attr('href'), base);
  const tipo = $('.card-with-buttons__title').text().trim();
  const localizacao = $('.card-with-buttons__heading').text().trim();
  const [bairroNome, cidadeNome] = localizacao.split(/\s+-\s+/);
  const codigoBase = $('.card-with-buttons__code').text().trim();
  const priceText = $('.card-with-buttons__value').text().trim();
  const priceMatch = priceText.match(/^R\$\s*(\d[\d.]*)(?:,(\d{2}))?$/);
  const preco = priceMatch ? Number(`${priceMatch[1].replace(/\./g, '')}.${priceMatch[2] || '0'}`) : NaN;
  if (!anchor.length || link.origin !== base.origin || !link.pathname.startsWith('/imovel/') ||
      !tipo || !bairroNome || !cidadeNome || !codigoBase || !Number.isFinite(preco)) {
    throw new Error('[Moura] Card sem link, tipo, localizacao, codigo ou preco valido; base preservada.');
  }
  const legacy = cheerio.load('<h3 class="card-text"></h3><h2 class="card-title"></h2>');
  legacy('h3').text(`${tipo} em ${cidadeNome}`);
  legacy('h2').text(bairroNome);
  const htmlLocalizacao = legacy.html();
  const cidade = extractCidadeFromCardHtml(htmlLocalizacao);
  const bairro = extractBairro(htmlLocalizacao, cidade);
  const metricas = $('ul li').toArray().map(element => $(element).text().trim());
  const numero = pattern => {
    const text = metricas.find(value => pattern.test(value));
    const match = text?.match(/\d[\d.]*(?:,\d+)?/);
    return match ? Number(match[0].replace(/\./g, '').replace(',', '.')) : 0;
  };
  const timestamp = new Date().toISOString();
  return {
    linkReal: link.href,
    titulo: `${tipo} em ${cidadeNome}`,
    preco: aplicarPrecoAPartir(preco, cardHtml),
    localizacao,
    tipoImovel: resolverTipoCatalogoContido(tipo) || tipo,
    bairro,
    cidade,
    dormitorioValor: numero(/quarto|dormit/i),
    banheiroValor: numero(/banheiro/i),
    ambienteValor: numero(/sala/i),
    areaValor: numero(/m\u00b2|m2/i),
    garagemValor: numero(/vaga|garagem/i),
    elevadorValor: 0,
    codigoBase,
    linkCard: extractLinkCard(),
    corretor: extractCorretor(),
    dataInclusao: timestamp,
    dataExclusao: '',
    linkFoto: $('img.cards_digital_carousel-image').attr('src') || $('img.cards_digital_carousel-image').attr('data-fallback') || '',
    atualizadoEm: extractAtualizadoEm(),
  };
}

export async function extractLocalData(browser, linksBusca, options = {}) {
  const cards = await coletarPaginasKenloVendas(browser, linksBusca, {
    ...options,
    projeto: 'jfMoura',
    readSnapshot: readSnapshotGm,
    cardSelector: 'a.card-with-buttons.borderHover[href*="/imovel/"]',
  });
  const imoveis = cards.map(parseMouraCard);
  console.log(`[Moura] ${imoveis.length} imoveis coletados e validados.`);
  return imoveis;
}
