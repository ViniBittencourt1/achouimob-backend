// ...existing code...
import { extractPreco } from './extractor-03-preco.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
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
import { extractCorretor } from './extractor-16-corretor.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';


const BASE_URL = "https://www.toc2imoveis.com.br/imoveis/venda/-/-/-/-";



import { JSDOM } from 'jsdom';

// Função para extrair dados dos cards de uma página HTML
export function extractToc2Data(pageHtml, existingCodigoBaseSet = new Set(), options = {}) {
    const dom = new JSDOM(pageHtml);
    // Atualizado para o seletor correto dos cards
    const propertyCards = dom.window.document.querySelectorAll(options.negociacao === 'locacao' ? '[class*="ListPiecesProperties_card_horizontal1"]' : '.ListPiecesProperties_card_horizontal1__5R4Gi');
    let allImoveis = [];
    let novosImoveis = [];
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
            atualizadoEm: extractAtualizadoEm(),
        };
        imovel.titulo = extractTitulo(cardHtml);
        imovel.preco = extractPreco(cardHtml, options.negociacao);
        imovel.localizacao = extractLocalizacao(cardHtml);
        imovel.cidade = extractCidadeFromHtml(cardHtml, imovel.linkReal);
        imovel.bairro = extractBairroFromTitulo(cardHtml, imovel.linkReal, imovel.cidade);
        imovel.garagemValor = extractGaragemValor(cardHtml);
        imovel.dormitorioValor = extractDormitorioValor(cardHtml);
        imovel.banheiroValor = extractBanheiroValor(cardHtml);
        imovel.ambienteValor = extractAmbienteValor(cardHtml);
        imovel.elevadorValor = extractElevadorValor(cardHtml);
        imovel.areaValor = extractAreaValor(cardHtml);
        imovel.linkCard = extractLinkCard(cardHtml);
        imovel.tipoImovel = extractTipoImovel(cardHtml);
        imovel.corretor = extractCorretor();
        imovel.codigoBase = extractCodigoBase(cardHtml);
        if (options.negociacao === 'locacao' && !imovel.codigoBase) {
            const codigoText = card.querySelector('[class*="CardApartamentHorizontal_codigo_badge"]')?.textContent || '';
            const match = codigoText.match(/C[o\u00f3]digo:\s*([A-Z0-9_-]+)/i);
            if (match) imovel.codigoBase = match[1];
        }
        delete imovel.cardHtml;
        if (options.negociacao === 'locacao') delete imovel.garagem;
        allImoveis.push(imovel);
        if (!existingCodigoBaseSet.has(String(imovel.codigoBase))) {
            novosImoveis.push(imovel);
        }
    }
    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}