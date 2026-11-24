// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos

import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { appendLegacyAddress, extractLegacyAddress } from '../_utils/enrichLegacyAddress.js';

export async function enrichImoveisWithInternalData(browser, imoveis) {
  for (const imovel of imoveis) {
    if (!imovel.linkReal) continue;
    // Visita apenas imóveis novos (sem campos internos preenchidos)
    if (imovel.areaValor || imovel.linkCard || imovel.corretor) continue;
    console.log(`[RotaInterna] Visitando link: ${imovel.linkReal}`);
    const page = await browser.newPage();
    try {
      await page.goto(imovel.linkReal, { waitUntil: 'networkidle0', timeout: 60000 });
      // Aguarda carregamento
      await new Promise(resolve => setTimeout(resolve, 1500));
      const html = await page.content();
      const endereco = extractLegacyAddress(html);
      if (endereco) imovel.localizacao = appendLegacyAddress(imovel.localizacao, endereco);
      imovel.areaValor = extractAreaValor ? extractAreaValor(html) : 0;
      imovel.linkCard = 0;
      imovel.corretor = extractCorretor();
    } catch (e) {
      console.error(`[RotaInterna] Erro ao visitar link: ${imovel.linkReal} - ${e.message}`);
      imovel.areaValor = 0;
      imovel.linkCard = 0;
      imovel.corretor = 0;
    } finally {
      await page.close();
    }
  }
  return imoveis;
}
