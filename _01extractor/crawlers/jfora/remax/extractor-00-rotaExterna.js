import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCidade } from './extractor-07-cidade.js';
import { extractBairro } from './extractor-06-bairros.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractPreco } from './extractor-03-preco.js';

export function isRemaxLocacaoLink(link) {
  try {
    const url = new URL(link);
    return /^(?:www\.)?remax\.com\.br$/i.test(url.hostname) && /\/(?:alugar|locacao)\//i.test(url.pathname);
  } catch { return false; }
}

export async function scrapeListingPage(page, options = {}) {
  const imoveisRaspados = [];
  let pagina = 1;
  const aluguel = options.negociacao === 'locacao';
  const strict = aluguel || options.negociacao === 'venda' || options.totalEsperado !== undefined;
  let totalEsperado = null;
  const linksSeen = new Set();
  while (true) {
    if (strict) await page.waitForSelector('.listing-card', { timeout: 30000 });
    else await page.waitForSelector('.listing-card', { timeout: 10000 }).catch(() => {});
    await new Promise(res => setTimeout(res, 1200));
    if (strict && totalEsperado === null) {
      totalEsperado = await page.evaluate(() => {
        const match = document.body.innerText.match(/(\d[\d.]*)\s+N[\u00fa]mero total de correspond[\u00ea]ncias/i);
        return match ? Number(match[1].replace(/\./g, '')) : null;
      });
      if (!Number.isInteger(totalEsperado) || totalEsperado < 1) throw new Error('Total de imoveis RE/MAX nao identificado.');
      if (options.totalEsperado !== undefined && totalEsperado !== options.totalEsperado) throw new Error(`Total RE/MAX mudou: ${totalEsperado}/${options.totalEsperado}; base preservada.`);
    }
    const cards = await page.$$eval('.listing-card', elements => elements.map(el => el.outerHTML));
    if (cards.length === 0) break;
    const quantidadeAntes = imoveisRaspados.length;
    for (let i = 0; i < cards.length; i++) {
      const cardData = await page.evaluate((html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        const el = container.firstElementChild;
        const data = {};
        let localizacao = "";
        const infoLink = el.querySelector('a.listing-info');
        if (infoLink) {
          const locNode = infoLink.querySelector('p.listing-address');
          if (locNode && locNode.textContent) {
            localizacao = locNode.textContent.trim();
          }
        }
        if (!localizacao) {
          const locNodeAlt = el.querySelector('p.listing-address, .listing-address');
          if (locNodeAlt && locNodeAlt.textContent) {
            localizacao = locNodeAlt.textContent.trim();
          }
        }
        if (!localizacao) {
          localizacao = el.textContent ? el.textContent.trim().split('\n').find(t => t && t.length > 10) || "" : "";
        }
        data.localizacao = localizacao;
        data.linkReal = el.querySelector('a') ? el.querySelector('a').href : "";
        const precoNode = el.querySelector('.card-first-price');
        data.preco = precoNode ? precoNode.textContent.trim() : "";
        // Removido o código antigo de extração de tipoImovel
        // O campo será preenchido após a normalização com extractTipoImovel
        data.tipoImovel = "";
        data.dormitorioValor = "";
        data.banheiroValor = "";
        data.ambienteValor = "";
        data.areaValor = "";
        data.garagemValor = "";
        data.elevadorValor = "";
        data.codigoBase = "";
        data.titulo = "";
        data.linkCard = "";
        data.corretor = "";
        const foto = el.querySelector('img[src*="cdn.gryphtech.com/userimages"]');
        data.linkFoto = foto?.src || "";
        data._outerHTML = el.outerHTML;
        return data;
      }, cards[i]);
      const cheerio = await import('cheerio');
      const cardHtml = cardData._outerHTML || '';
      const $ = cheerio.load('<body>' + cardHtml + '</body>');
      const $card = $('body').children().first();
      cardData.linkCard = 0;
      cardData.corretor = '';
      cardData.preco = extractPreco($card, options.negociacao);
      cardData.dormitorioValor = extractDormitorioValor($card);
      cardData.banheiroValor = extractBanheiroValor($card);
      cardData.ambienteValor = extractAmbienteValor($card);
      cardData.areaValor = extractAreaValor($card);
      cardData.garagemValor = extractGaragemValor($card);
      cardData.elevadorValor = extractElevadorValor($card);
      cardData.cidade = extractCidade(cardData.localizacao);
      // Refatoração: extrair e normalizar tipoImovel
      cardData.tipoImovel = extractTipoImovel(cardHtml);
      const { bairroRaw, bairro } = extractBairro(cardData.localizacao);
      cardData.bairroRaw = bairroRaw;
      cardData.bairro = bairro;
      cardData.codigoBase = extractCodigoBase(cardData.linkReal);
      cardData.titulo = extractTitulo(null, cardData.tipoImovel, cardData.localizacao);

      // LOG dos 10 primeiros imóveis (todos os campos, um por linha)
      if (!strict && imoveisRaspados.length < 10) {
        console.log(`\n===== Imóvel ${imoveisRaspados.length + 1} =====`);
        Object.entries(cardData).forEach(([key, value]) => {
          if (typeof value !== 'object') {
            console.log(`${key} = ${value}`);
          }
        });
      }
      if (strict) {
        if (!cardData.codigoBase || (aluguel && !isRemaxLocacaoLink(cardData.linkReal))) throw new Error(`Card invalido ou sem codigo RE/MAX: ${cardData.linkReal}`);
        if (linksSeen.has(cardData.linkReal)) {
          console.warn(`[RemaxLocacao] Link repetido ignorado na pagina ${pagina}: ${cardData.linkReal}`);
          continue;
        }
        linksSeen.add(cardData.linkReal);
        delete cardData._outerHTML;
        delete cardData.bairroRaw;
        cardData.dataInclusao = new Date().toISOString();
        cardData.dataExclusao = '';
        cardData.atualizadoEm = new Date().toISOString();
      }
      imoveisRaspados.push(cardData);
    }
    if (strict) {
      if (global.gc) global.gc();
      console.log(`[Remax${aluguel ? 'Locacao' : 'Vendas'}] Pagina ${pagina}: ${imoveisRaspados.length}/${totalEsperado} imoveis.`);
      if (imoveisRaspados.length >= totalEsperado) break;
      if (imoveisRaspados.length === quantidadeAntes) throw new Error('Pagina RE/MAX sem novos alugueis. Coleta parcial nao sera publicada.');
      if (pagina >= 150) throw new Error('Limite de paginacao RE/MAX atingido.');
      const before = await page.$$eval('.listing-card', cards => cards.map(card => card.querySelector('a')?.href || '').join('|'));
      const next = await page.$('button[aria-label="Go to next page"]');
      if (!next || await next.evaluate(button => button.disabled || button.getAttribute('aria-disabled') === 'true')) throw new Error('Proxima pagina indisponivel antes do total esperado.');
      await next.click();
      await page.waitForFunction(previous => {
        const cards = Array.from(document.querySelectorAll('.listing-card'));
        return cards.length > 0 && cards.map(card => card.querySelector('a')?.href || '').join('|') !== previous;
      }, { polling: 'mutation', timeout: 30000 }, before);
      pagina++;
      continue;
    }
    if (cards.length < 24) break;
    const nextButton = await page.$('button[aria-label="Go to next page"]');
    if (!nextButton) break;
    await nextButton.click();
    await new Promise((res) => setTimeout(res, 3000));
    pagina++;
  }
  if (strict && imoveisRaspados.length !== totalEsperado) throw new Error('Quantidade de alugueis RE/MAX difere do total informado. Dados anteriores preservados.');
  return imoveisRaspados;
}