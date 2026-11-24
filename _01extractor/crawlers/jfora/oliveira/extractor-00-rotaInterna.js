import { extractLocalizacao, buildLocalizacaoFallback } from './extractor-04-localizacao.js';
import { extractBairro } from './extractor-06-bairro.js';
import { extractCidade } from './extractor-07-cidade.js';

// Rota interna agora extrai localização detalhada
export async function enrichImoveisWithInternalData(browser, imoveis) {
  let enderecosNaoEncontrados = 0;
  for (const imovel of imoveis) {
    if (imovel.linkReal) {
      let page;
      try {
        page = await browser.newPage();
        await page.goto(imovel.linkReal, { waitUntil: 'networkidle2', timeout: 60000 });
        // Extrai localizacao da página interna
        const html = await page.content();
        imovel.localizacao = extractLocalizacao(html) || imovel.localizacao;
        const cidadeExtraida = extractCidade(html, imovel.titulo, imovel.linkReal);
        if (cidadeExtraida) {
          imovel.cidade = cidadeExtraida;
        }
        const bairroExtraido = extractBairro(html, imovel.titulo, imovel.cidade, imovel.linkReal);
        if (bairroExtraido) {
          imovel.bairro = bairroExtraido;
        }
        if (!imovel.localizacao) {
          imovel.localizacao = buildLocalizacaoFallback(imovel.bairro, imovel.cidade);
        }
        // Se não encontrar endereço (localizacao, bairro e cidade vazios)
        if (!imovel.localizacao && !imovel.bairro && !imovel.cidade) {
          console.log('endereço não encontrado:', imovel.linkReal);
          enderecosNaoEncontrados++;
        }
      } catch (e) {
        console.error('Erro ao extrair dados pela rota interna:', e);
        // Também conta como não encontrado
        console.log('endereço não encontrado:', imovel.linkReal);
        enderecosNaoEncontrados++;
      } finally {
        if (page) await page.close();
      }
    }
  }
  console.log(`Total de endereços não encontrados: ${enderecosNaoEncontrados}`);
  return imoveis;
}
