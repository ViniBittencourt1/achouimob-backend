// ...existing code...
import { extractPreco } from './extractor-03-preco.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairro.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractLocalizacao, buildLocalizacaoFallback } from './extractor-04-localizacao.js';
import { extractCidadeFromHtml } from './extractor-07-cidade.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractCorretor } from './extractor-16-corretor.js';


const BASE_URL = "https://oliveiramendesimoveisjf.com.br/localizar/localizar-imovel?list[fullordering]=valor%20ASC&list[limit]=21&filter[search]=&filter[categoria_catid]=-40&filter[faixa_valor_venda][min]=0.00&filter[faixa_valor_venda][max]=18000000.00&filter[faixa_valor_locacao][min]=0.00&filter[faixa_valor_locacao][max]=4000.00&filter[faixa_valor_temporada][min]=0.00&filter[faixa_valor_temporada][max]=250.00&filter[endereco_eid]=&filter[quartos]=&filter[suites]=&filter[banheiros]=&filter[garagens]=&filter[captador_id]=0&edfcb8fa22577ff194417f62bd7a8062=1&filter_order=valor&filter_order_Dir=ASC&task=search&start=0";



import { JSDOM } from 'jsdom';
// Função para calcular o número de páginas
export function calcularPaginas(pageHtml) {
  const match = pageHtml.match(/<label>\s*(\d+) opções encontrado\(s\)/);
  if (!match) return 1;
  const totalImoveis = parseInt(match[1], 10);
  return Math.ceil(totalImoveis / 21);
}

// Função para extrair dados dos cards de uma página HTML
export function extractOliveiraData(pageHtml, existingCodigoBaseSet = new Set()) {
    const dom = new JSDOM(pageHtml);
    // Atualizado para o novo seletor dos cards
    const propertyCards = dom.window.document.querySelectorAll('.col-md-4.col-lg-4');
    console.log('[DEBUG] Quantidade de cards encontrados:', propertyCards.length);
    if (propertyCards.length > 0) {
    }
    let allImoveis = [];
    let novosImoveis = [];
    let cardIndex = 0;
    for (const card of propertyCards) {
        const cardHtml = card.outerHTML;
        const imovel = {
            linkReal: extractLinkReal(cardHtml),
            cardHtml,
            garagem: null,
            codigoBase: null,
            linkFoto: extractLinkFoto(cardHtml),
            dataInclusao: new Date().toISOString(),
            dataExclusao: '',
            atualizadoEm: new Date().toISOString(),
        };
        imovel.titulo = extractTitulo(cardHtml);
        imovel.preco = extractPreco(cardHtml);
        imovel.localizacao = extractLocalizacao(cardHtml);
        imovel.cidade = extractCidadeFromHtml(cardHtml, imovel.titulo, imovel.linkReal);
        imovel.bairro = extractBairro(cardHtml, imovel.titulo, imovel.cidade, imovel.linkReal);
        if (!imovel.localizacao) imovel.localizacao = buildLocalizacaoFallback(imovel.bairro, imovel.cidade);
        imovel.garagemValor = extractGaragemValor(cardHtml);
        imovel.dormitorioValor = extractDormitorioValor(cardHtml);
        imovel.banheiroValor = extractBanheiroValor(cardHtml);
        imovel.ambienteValor = extractAmbienteValor(cardHtml);
        imovel.elevadorValor = extractElevadorValor(cardHtml);
        imovel.areaValor = extractAreaValor(cardHtml);
        imovel.linkCard = extractLinkCard(cardHtml);
        imovel.tipoImovel = extractTipoImovel(cardHtml);
        if (cardIndex === 0 && (!imovel.tipoImovel || imovel.tipoImovel === '')) {
            console.log('[LOG tipoImovel] Não encontrado na primeira página! HTML do card:', cardHtml);
        }
        imovel.corretor = extractCorretor();
        imovel.codigoBase = extractCodigoBase(cardHtml);
        delete imovel.cardHtml;
        allImoveis.push(imovel);
        if (!existingCodigoBaseSet.has(String(imovel.codigoBase))) {
            novosImoveis.push(imovel);
        }
        cardIndex++;
    }
    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}