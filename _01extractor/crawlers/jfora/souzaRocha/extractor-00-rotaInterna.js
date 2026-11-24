import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractBairro } from './extractor-06-bairro.js';
import { extractCidade } from './extractor-07-cidade.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';

// Rota interna agora extrai localização detalhada
export async function enrichImoveisWithInternalData(browser, imoveis) {
  for (const imovel of imoveis) {
    if (imovel.linkReal) {
      let page;
      try {
        page = await browser.newPage();
        await page.goto(imovel.linkReal, { waitUntil: 'networkidle2', timeout: 60000 });
        // Extrai localizacao da página interna
        const html = await page.content();
        imovel.cidade = extractCidade(html);
        imovel.bairro = extractBairro(html, imovel.cidade);
        imovel.tipoImovel = extractTipoImovel(html);
        imovel.garagemValor = extractGaragemValor(html);
        imovel.codigoBase = extractCodigoBase(html);
        imovel.localizacao = extractLocalizacao(html);
      } catch (e) {
        console.error('Erro ao extrair dados pela rota interna:', e);
      } finally {
        if (page) await page.close();
      }
    }
  }
  return imoveis;
}
