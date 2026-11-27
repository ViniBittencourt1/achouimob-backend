import { getProjetoLocacao, buildUrlLocacao } from './locacaoPadraoProjetos.js';
import { enriquecerLocacao } from './locacaoSincronizacao.js';
import { validateCatalogs, validateListings } from '../universal/gcsVendas.js';

const PROJECTS = new Set(['jfAlicerce', 'jfAlmar', 'jfBargon', 'jfBrasil', 'jfCasaNova']);

export async function collectJfPadraoGcs({ projeto, catalogos, negociacao }) {
  validateCatalogs(catalogos);
  if (!PROJECTS.has(projeto) || !['venda', 'aluguel'].includes(negociacao)) {
    throw new Error('Projeto ou negociacao padrao invalido.');
  }
  const config = getProjetoLocacao(projeto);
  const hostname = new URL(config.urlVenda).hostname.replace(/^www\./, '');
  const [{ abrirBrowser }, extractor, internal] = await Promise.all([
    import('../../../services/puppeteerPool.js'),
    import(`../${config.folder}/extractor.js`),
    import(`../${config.folder}/extractor-00-rotaInterna.js`),
  ]);
  if (typeof extractor[config.extractor] !== 'function' || typeof internal.enrichImoveisWithInternalData !== 'function') {
    throw new Error('Extrator ou enriquecimento ausente; coleta nao iniciada.');
  }
  const browser = await abrirBrowser();
  try {
    let url;
    let totalEsperado;
    if (negociacao === 'venda') {
      const [{ contarAntesDasVendas }, { rotaVendasPadrao }] = await Promise.all([
        import('./vendasContagem.js'), import('./vendasPadraoPaginacao.js'),
      ]);
      url = rotaVendasPadrao(projeto);
      totalEsperado = await contarAntesDasVendas(browser, { projeto, salvar: false });
    } else {
      const { contarAntesDaLocacaoPadrao } = await import('./locacaoContagem.js');
      url = buildUrlLocacao(config.urlVenda);
      totalEsperado = await contarAntesDaLocacaoPadrao(browser, { projeto, url, salvar: false });
    }
    const imoveis = await extractor[config.extractor](browser, [url], {
      negociacao: negociacao === 'aluguel' ? 'locacao' : 'venda',
      totalEsperado, catalogos, liberarMemoria: true,
    });
    if (!Array.isArray(imoveis) || imoveis.length !== totalEsperado) {
      throw new Error('Coleta incompleta; detalhes nao serao visitados.');
    }
    validateListings(imoveis, hostname);
    if (negociacao === 'aluguel') {
      await enriquecerLocacao(browser, imoveis, internal.enrichImoveisWithInternalData, { negociacao: 'aluguel', exigirDetalhes: true });
    } else {
      await internal.enrichImoveisWithInternalData(browser, imoveis, { exigirDetalhes: true });
    }
    return { totalEsperado, imoveis };
  } finally {
    await browser.close();
  }
}
