// ...existing code...
import { extractPreco } from './extractor-03-preco.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTipoImovel, extractTipoImovelDoLink } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairro.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractCidadeFromHtml as extractCidade } from './extractor-07-cidade.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractCorretor } from './extractor-16-corretor.js';


const BASE_URL = "https://souzarochaimoveis.com.br/pesquisa/?view=list";



import { JSDOM } from 'jsdom';
// Função para calcular o número de páginas
export function calcularPaginas(pageHtml) {
  const match = pageHtml.match(/<label>\s*(\d+) opções encontrado\(s\)/);
  if (!match) return 1;
  const totalImoveis = parseInt(match[1], 10);
  return Math.ceil(totalImoveis / 21);
}

// Função para extrair dados dos cards de uma página HTML
export function extractSouzaRochaData(pageHtml, existingCodigoBaseSet = new Set()) {
    const dom = new JSDOM(pageHtml);
    // Atualizado para o seletor dos cards souzaRocha
    const propertyCards = dom.window.document.querySelectorAll('.rh_list_card__wrap');
    console.log('[DEBUG] Quantidade de cards encontrados:', propertyCards.length);
    if (propertyCards.length > 0) {
    }
    let allImoveis = [];
    let novosImoveis = [];
    let cardIndex = 0;
    for (const card of propertyCards) {
        const cardHtml = card.outerHTML;
        // Log do status do card
        let status = '';
        const statusMatch = cardHtml.match(/<span class="status">(.*?)<\/span>/);
        if (statusMatch) {
            status = statusMatch[1].trim();
        } else {
            status = '(sem status)';
        }
        console.log(`[DEBUG][Card ${cardIndex + 1}] Status encontrado: ${status}`);
        // Só processa se tiver <span class="status">Venda</span>
        if (!Array.from(card.querySelectorAll('.status')).some(element => element.textContent.split(',').some(status => /^venda$/i.test(status.trim())))) {
            cardIndex++;
            continue;
        }
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
        // Extração dos campos principais
        imovel.cidade = extractCidade(cardHtml);
        imovel.bairro = extractBairro(cardHtml, imovel.cidade);
        // Após extrair bairro e cidade, monta localizacao corretamente
        imovel.localizacao = extractLocalizacao(cardHtml, imovel.bairro, imovel.cidade);
        imovel.garagemValor = extractGaragemValor(cardHtml);
        imovel.dormitorioValor = extractDormitorioValor(cardHtml);
        imovel.banheiroValor = extractBanheiroValor(cardHtml);
        imovel.ambienteValor = extractAmbienteValor(cardHtml);
        imovel.elevadorValor = extractElevadorValor(cardHtml);
        imovel.areaValor = extractAreaValor(cardHtml);
        imovel.linkCard = extractLinkCard(cardHtml);
        imovel.tipoImovel = extractTipoImovel(cardHtml) || extractTipoImovelDoLink(imovel.linkReal);
        // (log removido conforme solicitado)
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