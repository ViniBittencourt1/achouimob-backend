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


const BASE_URL = "https://www.secimoveis.com.br/imoveis/venda/#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1";



import { JSDOM, VirtualConsole } from 'jsdom';

// Função para extrair dados dos cards de uma página HTML
export function extractSoaresData(pageHtml, existingCodigoBaseSet = new Set(), options = {}) {
    const virtualConsole = new VirtualConsole();
    // Suprime ruído de CSS inválido sem depender de APIs removidas do jsdom.
    virtualConsole.on('jsdomError', () => {});
    const dom = new JSDOM(pageHtml, { virtualConsole });
    const propertyCards = dom.window.document.querySelectorAll('.box-imovel.ng-scope');
    let allImoveis = [];
    let novosImoveis = [];
    for (const card of propertyCards) {
        const cardHtml = card.outerHTML;
        const imovel = {
            linkReal: extractLinkReal(cardHtml),
            cardHtml,
            garagem: null,
            codigoBase: null,
            linkFoto: card.querySelector('img')?.src || '',
            dataInclusao: new Date().toISOString(),
            dataExclusao: '',
            atualizadoEm: new Date().toISOString(),
        };
        imovel.titulo = extractTitulo(cardHtml);
        imovel.preco = extractPreco(cardHtml, options.negociacao);
        imovel.localizacao = extractLocalizacao(cardHtml);
        imovel.cidade = extractCidadeFromHtml(cardHtml);
        imovel.bairro = extractBairroFromTitulo(cardHtml, imovel.cidade, imovel.linkReal);
        imovel.garagemValor = extractGaragemValor(cardHtml);
        imovel.dormitorioValor = extractDormitorioValor(cardHtml);
        imovel.banheiroValor = extractBanheiroValor(cardHtml);
        imovel.ambienteValor = extractAmbienteValor(cardHtml);
        imovel.elevadorValor = extractElevadorValor(cardHtml);
        imovel.areaValor = extractAreaValor(cardHtml);
        imovel.linkCard = extractLinkCard(cardHtml);
        imovel.linkFoto = extractLinkFoto(cardHtml);
        imovel.tipoImovel = extractTipoImovel(cardHtml);
        imovel.corretor = 'Soares';
        imovel.codigoBase = extractCodigoBase(cardHtml);
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