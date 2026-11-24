// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos

import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';

export async function enrichImoveisWithInternalData(browser, imoveis, options = {}) {
  console.log(`[RotaInterna] Extraindo detalhes em ${imoveis.length} links...`);
  for (const imovel of imoveis) {
    if (!imovel.linkReal) continue;

    const page = await browser.newPage();
    try {
      await page.goto(imovel.linkReal, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 1500));

      const html = await page.evaluate(() => {
        const blocos = [
          document.querySelector('#menu-lateral-imovel')?.outerHTML,
          document.querySelector('#alvo-localizazao')?.outerHTML,
          document.querySelector('[itemprop="address"]')?.outerHTML,
          document.querySelector('.content-dados-imovel')?.outerHTML,
          document.querySelector('.box-informacoes')?.outerHTML,
        ].filter(Boolean);

        return blocos.join('\n') || document.body.innerHTML;
      });

      const endereco = extractEnderecoFromHtml(html);
      if (endereco) {
        imovel.localizacao = adicionarEnderecoNaLocalizacao(imovel.localizacao, endereco);
      }

      if (!options.preservarPreco || !imovel.preco) imovel.preco = extractPreco ? extractPreco(html) : (imovel.preco || 0);
      imovel.areaValor = extractAreaValor ? extractAreaValor(html) : (imovel.areaValor || 0);
      imovel.dormitorioValor = extractDormitorioValor ? extractDormitorioValor(html) : (imovel.dormitorioValor || 0);
      imovel.banheiroValor = extractBanheiroValor ? extractBanheiroValor(html) : (imovel.banheiroValor || 0);
      imovel.garagemValor = extractGaragemValor ? extractGaragemValor(html) : (imovel.garagemValor || 0);
      imovel.linkCard = extractLinkCard ? extractLinkCard(html) : 0;
    } catch (e) {
      console.error(`[RotaInterna] Erro ao visitar link: ${imovel.linkReal} - ${e.message}`);
      imovel.preco = imovel.preco || 0;
      imovel.areaValor = imovel.areaValor || 0;
      imovel.dormitorioValor = imovel.dormitorioValor || 0;
      imovel.banheiroValor = imovel.banheiroValor || 0;
      imovel.garagemValor = imovel.garagemValor || 0;
      imovel.linkCard = imovel.linkCard || 0;
    } finally {
      await page.close();
    }
  }
  return imoveis;
}
