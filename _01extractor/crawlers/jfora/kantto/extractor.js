import { coletarCardsKantto } from './paginacao-vendas.js';
import { enrichImoveisWithInternalData } from './extractor-00-rotaInterna.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairroFromTitulo } from './extractor-06-bairro.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractCidadeFromHtml } from './extractor-07-cidade.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

const BASE_URL = "https://www.kanttoimoveis.com.br/venda?transacao=%22venda%22";

function fallbackLocalizacao(localizacao) {
    if (!localizacao) return { bairro: '', cidade: '' };

    const partes = localizacao
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    const bairro = partes[0] || '';
    const cidade = partes[1] || '';

    return { bairro, cidade };
}

function montarUrlPagina(pageNum) {
    const urlObj = new URL(BASE_URL);
    if (pageNum > 1) urlObj.searchParams.set('pagina', String(pageNum));
    return urlObj.toString();
}

export async function extractKanttoData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    const cards = await coletarCardsKantto(browser, { totalEsperado: options.totalEsperado });
    let processed = 0;
    for (const card of cards) {
                card.titulo = extractTitulo(card.cardHtml);
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = extractCidadeFromHtml(card.cardHtml);
                card.bairro = extractBairroFromTitulo(card.cardHtml, card.linkReal, card.cidade);
                if (!card.bairro || !card.cidade) {
                    const fallback = fallbackLocalizacao(card.localizacao);
                    if (!card.bairro) card.bairro = fallback.bairro;
                    if (!card.cidade) card.cidade = fallback.cidade;
                }
                card.garagemValor = extractGaragemValor(card.cardHtml);
                card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                card.banheiroValor = extractBanheiroValor(card.cardHtml);
                card.ambienteValor = extractAmbienteValor(card.cardHtml);
                card.elevadorValor = extractElevadorValor(card.cardHtml);
                card.areaValor = extractAreaValor(card.cardHtml);
                card.linkCard = extractLinkCard(card.cardHtml);
                card.linkFoto = extractLinkFoto(card.cardHtml);
                card.tipoImovel = extractTipoImovel(card.cardHtml);
                card.corretor = 'Kantto';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
                processed++;
                if (processed % 20 === 0 || processed === cards.length) {
                    console.log(`[Kantto] Processados ${processed}/${cards.length} cards.`);
                    if (global.gc) global.gc();
                    await new Promise(resolve => setImmediate(resolve));
                }
            }
    const novosImoveis = cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase)));
    const imoveisParaRotaInterna = cards.filter(imovel => !imovel.preco || !imovel.areaValor || !imovel.dormitorioValor || !imovel.banheiroValor || !imovel.garagemValor);
    if (!options.somenteListagem && imoveisParaRotaInterna.length) await enrichImoveisWithInternalData(browser, imoveisParaRotaInterna);
    if (new Set(cards.map(card => card.linkReal)).size !== cards.length) throw new Error('[Kantto] Dados duplicados; base preservada.');
    return { imoveisRaspados: cards, novosImoveis };
}