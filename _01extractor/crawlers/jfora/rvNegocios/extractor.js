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
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';


const BASE_URL = "https://www.rvnegociosimobiliariosjf.com.br/imovel/venda";
export const USER_AGENT_RVNEGOCIOS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function extractRVNegociosData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    let semImoveisConfirmado = false;
    const baseUrl = options.baseUrl ?? BASE_URL;
    const regexImovel = /^https:\/\/www\.rvnegociosimobiliariosjf\.com\.br\/imovel\/[0-9]+\//;
    const MAX_TENTATIVAS_PAGINA_VAZIA = 3;
    const HTTP_TRANSITORIOS = [500, 502, 503, 504, 520, 521, 522, 523, 524];
    let tentativasVazias = 0;
    let tentativasNavegacao = 0;
    let totalPaginas = null;
    const linksVistos = new Set();
    while (true) {
        const url = pageNum === 1
            ? baseUrl
            : `${baseUrl}/?&pag=${pageNum}`;
        if (pageNum === 1) {
            console.log(`[RV Negocios] Visitando página 1: ${url}`);
        } else {
            console.log(`[RV Negocios] Visitando página extra: ${pageNum} - ${url}`);
        }
        const page = await browser.newPage();
        try {
            await page.setUserAgent(USER_AGENT_RVNEGOCIOS);
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });
            await page.setViewport({ width: 1280, height: 800 });
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
            let response;
            try {
                response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
                if (!response?.ok()) {
                    const error = new Error(`[RV Negocios] HTTP ${response?.status()} em ${url}`);
                    if (response?.status() === 403) error.code = 'RVNEGOCIOS_BLOCKED';
                    throw error;
                }
            } catch (error) {
                const transitorio = error.name === 'TimeoutError' || HTTP_TRANSITORIOS.includes(response?.status());
                if (!transitorio || tentativasNavegacao >= 2) throw error;
                tentativasNavegacao++;
                const motivo = error.name === 'TimeoutError' ? 'Timeout' : `HTTP ${response.status()}`;
                console.warn(`[RV Negocios] ${motivo} na pagina ${pageNum}; nova tentativa ${tentativasNavegacao}/2 em ${tentativasNavegacao * 5}s, sem descartar paginas anteriores.`);
                await new Promise(resolve => setTimeout(resolve, tentativasNavegacao * 5000));
                continue;
            }
            await new Promise(resolve => setTimeout(resolve, 4000)); // tempo maior para garantir carregamento
            await page.waitForSelector('.imovelcard, a[href*="/imovel/"]', { timeout: 15000 }).catch(() => null);
            // Salvar HTML da primeira página para análise
            if (pageNum === 1) {
                // Removido: não salvar pagina1.html
            }
            let cards = await page.evaluate(() => {
                function getNumberFromLi(el, iconClass) {
                    const li = Array.from(el.querySelectorAll('li')).find(li => {
                        const i = li.querySelector('i');
                        return i && i.className.includes(iconClass);
                    });
                    if (!li) return 0;
                    const span = li.querySelector('span');
                    if (!span) return 0;
                    const match = span.textContent.match(/\d+[\.,]?\d*/);
                    return match ? parseFloat(match[0].replace(',', '.')) : 0;
                }
                const propertyCards = document.querySelectorAll('.imovelcard');
                                let extracted = Array.from(propertyCards)
                  .map(card => {
                    const linkReal = card.querySelector('a')?.href || '';
                    const cardHtml = card.outerHTML;
                    return {
                        linkReal,
                        cardHtml,
                        garagem: getNumberFromLi(card, 'flaticon-vehicle'),
                        codigoBase: (() => {
                            const match = linkReal.match(/\/(\d+)(?:\?.*)?$/);
                            return match ? match[1] : 0;
                        })(),
                        linkFoto: card.querySelector('img')?.src || '',
                        dataInclusao: '',
                        dataExclusao: '',
                        atualizadoEm: '',
                    };
                  })
                  .filter(card => card.linkReal && /^https:\/\/www\.rvnegociosimobiliariosjf\.com\.br\/imovel\/[0-9]+\//.test(card.linkReal));

                // Fallback: alguns layouts mudam a estrutura do card, mas mantêm os links /imovel/{id}/
                if (extracted.length === 0) {
                    const links = Array.from(document.querySelectorAll('a[href]'))
                        .map(a => a.href)
                        .filter(href => /^https:\/\/www\.rvnegociosimobiliariosjf\.com\.br\/imovel\/[0-9]+\//.test(href));

                    const uniqueLinks = [...new Set(links)];
                    extracted = uniqueLinks.map(linkReal => ({
                        linkReal,
                        cardHtml: '',
                        garagem: 0,
                        codigoBase: (() => {
                            const match = linkReal.match(/\/([0-9]+)(?:\/|\?|$)/);
                            return match ? match[1] : 0;
                        })(),
                        linkFoto: '',
                        dataInclusao: '',
                        dataExclusao: '',
                        atualizadoEm: '',
                    }));
                }

                return extracted;
            });
            const diagnostico = await page.evaluate(() => {
                const cardsLayout = document.querySelectorAll('.imovelcard').length;
                const linksImovel = Array.from(document.querySelectorAll('a[href]')).filter(a =>
                    /^https:\/\/www\.rvnegociosimobiliariosjf\.com\.br\/imovel\/[0-9]+\//.test(a.href)
                ).length;
                const paginacao = (document.body?.innerText || '').match(/P[aá]gina\s+\d+\s+de\s+(\d+)/i);
                const contagem = document.querySelector('.topsearch__total')?.textContent.match(/^\s*(\d[\d.]*)\s+im[oó]veis?\s+encontrados/i);
                return { cardsLayout, linksImovel, totalPaginas: paginacao ? Number(paginacao[1]) : null,
                    total: contagem ? Number(contagem[1].replace(/\./g, '')) : null };
            });
            if (options.totalEsperado !== undefined && diagnostico.total !== options.totalEsperado) {
                throw new Error(`[RV Negocios] Contagem mudou ou nao foi identificada na pagina ${pageNum}; base preservada.`);
            }
            if (diagnostico.totalPaginas) totalPaginas = diagnostico.totalPaginas;
            console.log(`[RV Negocios] ${cards.length} cards válidos na página ${pageNum}${totalPaginas ? `/${totalPaginas}` : ''} (layout: ${diagnostico.cardsLayout}, links: ${diagnostico.linksImovel}, HTTP ${typeof response?.status === 'function' ? response.status() : '?'})`);
            // O site devolve paginas vazias de forma intermitente apos muitas requisicoes seguidas.
            if (cards.length === 0 && pageNum > 1 && (totalPaginas === null || pageNum <= totalPaginas) && tentativasVazias < MAX_TENTATIVAS_PAGINA_VAZIA) {
                tentativasVazias++;
                const espera = 15000 * tentativasVazias;
                console.warn(`[RV Negocios] Página ${pageNum} vazia; nova tentativa ${tentativasVazias}/${MAX_TENTATIVAS_PAGINA_VAZIA} em ${espera / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, espera));
                continue;
            }
            tentativasVazias = 0;
            // O site chega a repetir o mesmo card (ex.: imovel 1255429 duas vezes na pag 71).
            const repetidos = cards.filter(card => linksVistos.has(card.linkReal) || !linksVistos.add(card.linkReal));
            if (repetidos.length) {
                console.warn(`[RV Negocios] ${repetidos.length} card(s) repetido(s) ignorado(s) na página ${pageNum}: ${repetidos.map(card => card.linkReal).join(', ')}`);
                cards = cards.filter(card => !repetidos.includes(card));
            }
            if (cards.length === 0) {
                if (options.strict && pageNum === 1) {
                    semImoveisConfirmado = await page.evaluate(() => /\b0\s+im[o\u00f3]veis\s+encontrados\b/i.test(document.body.innerText || ''));
                    if (!semImoveisConfirmado) throw new Error('[RV Negocios] Coleta vazia sem confirmacao do site.');
                }
                break;
            }
            // Se não encontrou nenhum card, encerra o processo
            if (cards.length === 0) {
                break;
            }
            for (const card of cards) {
                card.titulo = extractTitulo(card.cardHtml);
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = extractCidadeFromHtml(card.cardHtml);
                card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade);
                card.garagemValor = extractGaragemValor(card.cardHtml);
                card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                card.banheiroValor = extractBanheiroValor(card.cardHtml);
                card.ambienteValor = extractAmbienteValor(card.cardHtml);
                card.elevadorValor = extractElevadorValor(card.cardHtml);
                card.areaValor = extractAreaValor(card.cardHtml);
                card.linkCard = extractLinkCard(card.cardHtml);
                card.linkFoto = extractLinkFoto(card.cardHtml);
                card.tipoImovel = extractTipoImovel(card.cardHtml);
                delete card.cardHtml;
            }
            allImoveis = allImoveis.concat(cards);
            novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            tentativasNavegacao = 0;
            if (options.totalEsperado !== undefined && allImoveis.length > options.totalEsperado) {
                throw new Error('[RV Negocios] Coleta excedeu a precontagem; base preservada.');
            }
            if (totalPaginas !== null && pageNum >= totalPaginas) break;
            // Continua para próxima página
            pageNum++;
        } catch (error) {
            console.error(`[RV Negocios] Erro na página ${pageNum}:`, error);
            throw error;
        } finally {
            await page.close();
        }
    }
    if (options.totalEsperado !== undefined && allImoveis.length !== options.totalEsperado) {
        throw new Error(`[RV Negocios] Coleta incompleta: ${allImoveis.length}/${options.totalEsperado} links unicos; base preservada.`);
    }
    if (novosImoveis.length > 0) {
        console.log(`[RV Negocios] Chamando rotas internas para ${novosImoveis.length} imóveis novos...`);
        await enrichImoveisWithInternalData(browser, allImoveis);
        console.log(`[RV Negocios] Finalizou rotas internas.`);
    }
    const atualizadoEm = extractAtualizadoEm();
    for (const imovel of allImoveis) imovel.atualizadoEm = atualizadoEm;
    // Sempre retorna objeto esperado, mesmo se vazio
    return {
        imoveisRaspados: allImoveis,
        novosImoveis,
        semImoveisConfirmado
    };
}