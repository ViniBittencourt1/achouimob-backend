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

const BASE_URL = "https://www.coutoguerraimoveis.com.br/search?acao=s1&finalidade_s=2&tipo_s=&cidade_s=&bairro_s=";

function montarUrlPagina(pageNum, baseUrl = BASE_URL) {
    if (pageNum === 1) return baseUrl;
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('pag', String(pageNum));
    return urlObj.toString();
}

export async function extractCoutoData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    let totalEsperado = null;

    while (true) {
        const url = montarUrlPagina(pageNum, options.baseUrl);

        if (pageNum === 1) {
            console.log(`[Couto] Visitando página 1: ${url}`);
        } else {
            console.log(`[Couto] Visitando página extra: ${pageNum} - ${url}`);
        }

        const page = await browser.newPage();
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            if (options.strict && !response?.ok()) throw new Error(`[Couto] HTTP ${response?.status()} na busca de aluguel.`);

            const responseStatus = response?.status?.() ?? null;
            const title = await page.title();
            if (responseStatus === 403 || /403|forbidden/i.test(title)) {
                const blockedError = new Error(`[Couto] Bloqueio detectado (${responseStatus ?? 'sem status'}) em ${url}`);
                blockedError.code = 'COUTO_BLOCKED';
                throw blockedError;
            }

            await new Promise(resolve => setTimeout(resolve, 2500));
            if (options.strict) {
                const total = await page.evaluate(() => {
                    const match = document.body.innerText.match(/de\s+(\d+)\s+resultados/i);
                    return match ? Number(match[1]) : null;
                });
                if (total !== null) totalEsperado = total;
            }

            const cards = await page.evaluate(() => {
                const allLinks = Array.from(document.querySelectorAll('a[href*="/detalhes-imovel/"]'));
                const detalhes = [];
                const vistos = new Set();

                for (const anchor of allLinks) {
                    const href = anchor.href || '';
                    if (!href || !/\/detalhes-imovel\//i.test(href)) continue;
                    if (vistos.has(href)) continue;
                    vistos.add(href);

                    const foto = anchor.closest('dd.foto-lista, dd, article, .col, .item, .imovel, .property, .card') || anchor.parentElement;
                    const detalhe = foto?.nextElementSibling?.matches?.('dd.det-lista, dd')
                        ? foto.nextElementSibling
                        : anchor.closest('dd.det-lista, dd') || null;
                    const cardHtml = `${foto?.outerHTML || ''}${detalhe?.outerHTML || ''}` || anchor.outerHTML;

                    detalhes.push({
                        linkReal: href,
                        cardHtml,
                        codigoBase: null,
                        linkFoto: foto?.querySelector('img')?.src || detalhe?.querySelector('img')?.src || anchor.querySelector('img')?.src || '',
                        dataInclusao: new Date().toISOString(),
                        dataExclusao: '',
                        atualizadoEm: '',
                    });
                }

                return detalhes;
            });

            console.log(`[Couto] ${cards.length} cards encontrados na página ${pageNum}`);

            if (cards.length === 0) {
                break;
            }

            if (cards.length < 30) {
                console.log(`[Couto] Última página detectada (${cards.length} cards < 30). Encerrando.`);
                for (const card of cards) {
                    card.titulo = extractTitulo(card.cardHtml);
                    card.preco = extractPreco(card.cardHtml);
                    card.localizacao = extractLocalizacao(card.cardHtml);
                    card.cidade = extractCidadeFromHtml(card.cardHtml);
                    card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade, card.linkReal);
                    card.garagemValor = extractGaragemValor(card.cardHtml);
                    card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                    card.banheiroValor = extractBanheiroValor(card.cardHtml);
                    card.ambienteValor = extractAmbienteValor(card.cardHtml);
                    card.elevadorValor = extractElevadorValor(card.cardHtml);
                    card.areaValor = extractAreaValor(card.cardHtml);
                    card.linkCard = extractLinkCard(card.cardHtml);
                    card.linkFoto = extractLinkFoto(card.cardHtml);
                    card.tipoImovel = extractTipoImovel(card.cardHtml, card.linkReal);
                    card.corretor = 'Couto Guerra';
                    card.codigoBase = extractCodigoBase(card.cardHtml);
                    card.atualizadoEm = extractAtualizadoEm();
                    delete card.cardHtml;
                }

                allImoveis = allImoveis.concat(cards);
                novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
                break;
            }

            for (const card of cards) {
                card.titulo = extractTitulo(card.cardHtml);
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = extractCidadeFromHtml(card.cardHtml);
                card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade, card.linkReal);
                card.garagemValor = extractGaragemValor(card.cardHtml);
                card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                card.banheiroValor = extractBanheiroValor(card.cardHtml);
                card.ambienteValor = extractAmbienteValor(card.cardHtml);
                card.elevadorValor = extractElevadorValor(card.cardHtml);
                card.areaValor = extractAreaValor(card.cardHtml);
                card.linkCard = extractLinkCard(card.cardHtml);
                card.linkFoto = extractLinkFoto(card.cardHtml);
                card.tipoImovel = extractTipoImovel(card.cardHtml, card.linkReal);
                card.corretor = 'Couto Guerra';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
            }

            allImoveis = allImoveis.concat(cards);
            novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            pageNum++;
        } catch (error) {
            console.error(`[Couto] Erro na página ${pageNum}:`, error);
            if (options.strict) throw error;
            break;
        } finally {
            await page.close();
        }
    }

    if (options.strict && (totalEsperado === null || allImoveis.length !== totalEsperado || new Set(allImoveis.map(item => item.linkReal)).size !== allImoveis.length)) throw new Error('[Couto] Coleta parcial ou duplicada. Dados anteriores preservados.');
    if (allImoveis.length > 0) {
        console.log(`[Couto] Chamando rotas internas para ${allImoveis.length} imóveis raspados...`);
        await enrichImoveisWithInternalData(browser, allImoveis, { preservarPreco: options.preservarPreco });
        console.log(`[Couto] Finalizou rotas internas.`);
    }

    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}