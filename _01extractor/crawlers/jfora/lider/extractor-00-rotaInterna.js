// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos

import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { appendLegacyAddress, extractLegacyAddress } from '../_utils/enrichLegacyAddress.js';

export async function enrichImoveisWithInternalData(browser, imoveis) {
    console.log(`[RotaInterna] Extraindo área em ${imoveis.length} links...`);
  for (const imovel of imoveis) {
    if (!imovel.linkReal) continue;
    // Remove filtro: processa todos os imóveis
    // console.log(`[RotaInterna] Visitando link: ${imovel.linkReal}`); // Log removido
    const page = await browser.newPage();
    try {
      await page.goto(imovel.linkReal, { waitUntil: 'networkidle0', timeout: 60000 });
      // Aguarda carregamento
      await new Promise(resolve => setTimeout(resolve, 1500));
      const html = await page.content();
      const endereco = extractLegacyAddress(html);
      if (endereco) imovel.localizacao = appendLegacyAddress(imovel.localizacao, endereco);
      if (imovel.linkReal === 'https://www.lidernegociosimob.com.br/imovel/4012326/casa-venda-juiz-de-fora-mg-estrela-sul') {
        // Log especial para o link solicitado
        const areaValorExtraido = extractAreaValor ? extractAreaValor(html) : 0;
        const { JSDOM } = await import('jsdom');
        const dom = new JSDOM(html);
        const tagsDiv = dom.window.document.querySelector('div.tags, div#desc_tags');
        console.log('[RotaInterna][DEBUG] desc_tags HTML:', tagsDiv ? tagsDiv.outerHTML : 'NÃO ENCONTRADO');
        if (tagsDiv) {
          const ps = Array.from(tagsDiv.querySelectorAll('p'));
          ps.forEach((p, idx) => {
            console.log(`[RotaInterna][DEBUG] <p> #${idx}:`, p.textContent);
          });
        }
        console.log('[RotaInterna][DEBUG] areaValor extraído:', areaValorExtraido);
        imovel.areaValor = areaValorExtraido;
      } else {
        const areaValorExtraido = extractAreaValor ? extractAreaValor(html) : 0;
        imovel.areaValor = areaValorExtraido;
      }
      imovel.linkCard = extractLinkCard ? extractLinkCard(html) : 0;
    } catch (e) {
      console.error(`[RotaInterna] Erro ao visitar link: ${imovel.linkReal} - ${e.message}`);
      imovel.areaValor = 0;
      imovel.linkCard = 0;
    } finally {
      await page.close();
    }
  }
  return imoveis;
}
