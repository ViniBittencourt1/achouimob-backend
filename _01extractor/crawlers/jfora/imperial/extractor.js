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
import { USER_AGENT_IMPERIAL } from './config.js';

const BASE_URL = "https://www.imperialimoveisjf.com/imovel/venda";

export async function extractImperialData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    let semImoveisConfirmado = false;
    const baseUrl = options.baseUrl ?? BASE_URL;

    while (true) {
        const url = pageNum === 1
            ? baseUrl
            : `${baseUrl}/?pag=${pageNum}`;

        if (pageNum === 1) {
            console.log(`[Imperial] Visitando página 1: ${url}`);
        } else {
            console.log(`[Imperial] Visitando página extra: ${pageNum} - ${url}`);
        }

        const page = await browser.newPage();
        try {
            await page.setUserAgent(USER_AGENT_IMPERIAL);
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            if (options.strict && !response?.ok()) {
                const error = new Error(`[Imperial] HTTP ${response?.status()} em ${url}`);
                if (response?.status() === 403) error.code = 'IMPERIAL_BLOCKED';
                throw error;
            }

            const responseStatus = response?.status?.() ?? null;
            const title = await page.title();
            if (responseStatus === 403 || /403|forbidden/i.test(title)) {
                const blockedError = new Error(`[Imperial] Bloqueio detectado (${responseStatus ?? 'sem status'}) em ${url}`);
                blockedError.code = 'IMPERIAL_BLOCKED';
                throw blockedError;
            }

            await new Promise(resolve => setTimeout(resolve, 2500));

            const cards = await page.evaluate(() => {
                // Cada imovel real fica em div.item-lista (o site mudou o markup;
                // antes o cardRoot acabava caindo no container inteiro da listagem).
                const items = Array.from(document.querySelectorAll('.item-lista'));
                const detalhes = [];
                const vistos = new Set();

                for (const item of items) {
                    const anchor = item.querySelector('a[href*="/imovel/"]');
                    const href = anchor?.href || '';
                    if (!href || !/\/imovel\/\d+\//i.test(href)) continue;
                    if (vistos.has(href)) continue;
                    vistos.add(href);

                    detalhes.push({
                        linkReal: href,
                        cardHtml: item.outerHTML,
                        codigoBase: null,
                        linkFoto: item.querySelector('img')?.src || '',
                        dataInclusao: new Date().toISOString(),
                        dataExclusao: '',
                        atualizadoEm: '',
                    });
                }

                return detalhes;
            });

            console.log(`[Imperial] ${cards.length} cards encontrados na página ${pageNum}`);

            if (cards.length === 0) {
                if (options.strict && pageNum === 1) {
                    semImoveisConfirmado = await page.evaluate(() => /\b0\s+im[o\u00f3]veis\s+encontrados\b/i.test(document.body.innerText || ''));
                    if (!semImoveisConfirmado) throw new Error('[Imperial] Coleta vazia sem confirmacao do site.');
                }
                break;
            }

            if (cards.length < 15) {
                console.log(`[Imperial] Última página detectada (${cards.length} cards < 15). Encerrando.`);
                for (const card of cards) {
                    card.titulo = extractTitulo(card.cardHtml);
                    card.preco = extractPreco(card.cardHtml);
                    card.localizacao = extractLocalizacao(card.cardHtml);
                    card.cidade = extractCidadeFromHtml(card.cardHtml, card.linkReal);
                    card.bairro = extractBairroFromTitulo(card.cardHtml, card.linkReal, card.cidade);
                    card.garagemValor = extractGaragemValor(card.cardHtml);
                    card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                    card.banheiroValor = extractBanheiroValor(card.cardHtml);
                    card.ambienteValor = extractAmbienteValor(card.cardHtml);
                    card.elevadorValor = extractElevadorValor(card.cardHtml);
                    card.areaValor = extractAreaValor(card.cardHtml);
                    card.linkCard = extractLinkCard(card.cardHtml);
                    card.linkFoto = extractLinkFoto(card.cardHtml);
                    card.tipoImovel = extractTipoImovel(card.cardHtml, card.linkReal);
                    card.corretor = 'Imperial';
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
                card.cidade = extractCidadeFromHtml(card.cardHtml, card.linkReal);
                card.bairro = extractBairroFromTitulo(card.cardHtml, card.linkReal, card.cidade);
                card.garagemValor = extractGaragemValor(card.cardHtml);
                card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                card.banheiroValor = extractBanheiroValor(card.cardHtml);
                card.ambienteValor = extractAmbienteValor(card.cardHtml);
                card.elevadorValor = extractElevadorValor(card.cardHtml);
                card.areaValor = extractAreaValor(card.cardHtml);
                card.linkCard = extractLinkCard(card.cardHtml);
                card.linkFoto = extractLinkFoto(card.cardHtml);
                card.tipoImovel = extractTipoImovel(card.cardHtml, card.linkReal);
                card.corretor = 'Imperial';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
            }

            allImoveis = allImoveis.concat(cards);
            novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            pageNum++;
        } catch (error) {
            console.error(`[Imperial] Erro na página ${pageNum}:`, error);
            if (options.strict) throw error;
            break;
        } finally {
            await page.close();
        }
    }

    if (novosImoveis.length > 0) {
        console.log(`[Imperial] Chamando rotas internas para ${novosImoveis.length} imóveis novos...`);
        await enrichImoveisWithInternalData(browser, novosImoveis);
        console.log(`[Imperial] Finalizou rotas internas.`);
    }

    return {
        imoveisRaspados: allImoveis,
        novosImoveis,
        semImoveisConfirmado
    };
}