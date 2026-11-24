// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos

import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { adicionarEnderecoNaLocalizacao, extractEnderecoFromHtml } from './extractor-04-localizacao.js';
import { USER_AGENT_DECISAO } from './config.js';

export async function enrichImoveisWithInternalData(browser, imoveis) {
    console.log(`[RotaInterna] Extraindo área em ${imoveis.length} links...`);
  for (const imovel of imoveis) {
    if (!imovel.linkReal) continue;
    // Remove filtro: processa todos os imóveis
    // console.log(`[RotaInterna] Visitando link: ${imovel.linkReal}`); // Log removido
    const page = await browser.newPage();
    try {
      await page.setUserAgent(USER_AGENT_DECISAO);
      const response = await page.goto(imovel.linkReal, { waitUntil: 'networkidle0', timeout: 60000 });
      if (!response?.ok()) throw new Error(`[Decisao] HTTP ${response?.status()} em ${imovel.linkReal}`);
      // Aguarda carregamento
      await new Promise(resolve => setTimeout(resolve, 1500));
      const html = await page.content();
      const endereco = extractEnderecoFromHtml(html);
      if (endereco) {
        imovel.localizacao = adicionarEnderecoNaLocalizacao(imovel.localizacao, endereco);
      }

      const areaValorExtraido = extractAreaValor ? extractAreaValor(html) : 0;
      imovel.areaValor = areaValorExtraido;
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
