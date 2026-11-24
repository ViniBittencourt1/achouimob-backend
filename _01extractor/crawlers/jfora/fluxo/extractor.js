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
import { USER_AGENT_FLUXO } from './config.js';
export { USER_AGENT_FLUXO } from './config.js';

const BASE_URL = "https://www.fluxoimoveis.com/imovel/venda";

export async function extractFluxoData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    let semImoveisConfirmado = false;
    const baseUrl = options.baseUrl ?? BASE_URL;
    const coletados = new Map();
    const ordenacoes = ['recentes', 'menor_valor', 'maior_valor'];
    let ordem = 0;
    let totalEsperado = options.totalEsperado;

    while (true) {
        const paginaUrl = new URL(baseUrl);
        paginaUrl.searchParams.set('ord', ordenacoes[ordem]);
        paginaUrl.searchParams.set('pag', String(pageNum));
        const url = paginaUrl.href;

        if (pageNum === 1) {
            console.log(`[Fluxo] Visitando página 1: ${url}`);
        } else {
            console.log(`[Fluxo] Visitando página extra: ${pageNum} - ${url}`);
        }

        const page = await browser.newPage();
        try {
            await page.setUserAgent(USER_AGENT_FLUXO);
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            if (!response?.ok()) {
                const error = new Error(`[Fluxo] HTTP ${response?.status()} em ${url}`);
                if (response?.status() === 403) error.code = 'FLUXO_BLOCKED';
                throw error;
            }

            const responseStatus = response?.status?.() ?? null;
            const title = await page.title();
            if (responseStatus === 403 || /403|forbidden/i.test(title)) {
                const blockedError = new Error(`[Fluxo] Bloqueio detectado (${responseStatus ?? 'sem status'}) em ${url}`);
                blockedError.code = 'FLUXO_BLOCKED';
                throw blockedError;
            }

            const destino = new URL(page.url());
            if (destino.origin !== paginaUrl.origin || destino.pathname.replace(/\/$/, '') !== paginaUrl.pathname.replace(/\/$/, '')) {
                throw new Error('[Fluxo] Busca redirecionada; base preservada.');
            }
            const anunciado = await page.$eval('.topsearch__total', element => {
                const match = element.textContent.match(/^\s*(\d[\d.]*)\s+im[o\u00f3]veis?\s+encontrados?/i);
                return match ? Number(match[1].replace(/\./g, '')) : null;
            });
            if (!Number.isSafeInteger(anunciado) || anunciado < 0 ||
                (totalEsperado !== undefined && anunciado !== totalEsperado)) {
                throw new Error('[Fluxo] Contagem mudou ou nao foi identificada; base preservada.');
            }
            totalEsperado = anunciado;

            const cards = await page.evaluate(() => {
                const propertyCards = document.querySelectorAll('.imovelcard');
                return Array.from(propertyCards)
                    .map(card => {
                        const linkReal = card.querySelector('a[href*="/imovel/"]:not([href*="/imovel/venda"])')?.href || '';
                        return {
                            linkReal,
                            cardHtml: card.outerHTML,
                            codigoBase: null,
                            linkFoto: card.querySelector('img')?.src || '',
                            dataInclusao: new Date().toISOString(),
                            dataExclusao: '',
                            atualizadoEm: '',
                        };
                    })
                    .filter(card => {
                        if (!card.linkReal) return false;
                        try {
                            const parsed = new URL(card.linkReal);
                            const suffix = `${parsed.pathname}${parsed.search || ''}`;
                            return !/\/imovel\/(?:venda|locacao)(\/?(\?.*)?)?$/i.test(suffix);
                        } catch {
                            throw new Error('[Fluxo] Link invalido no card; base preservada.');
                        }
                    });
            });

            console.log(`[Fluxo] ${cards.length} cards encontrados na página ${pageNum}`);

            for (const card of cards) {
                const link = new URL(card.linkReal);
                if (link.origin !== paginaUrl.origin || !/^\/imovel\/\d+\//.test(link.pathname)) {
                    throw new Error('[Fluxo] Anuncio fora do site ou da rota de detalhes; base preservada.');
                }
                link.search = '';
                link.hash = '';
                card.linkReal = link.href;
                if (coletados.has(card.linkReal)) continue;
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
                card.tipoImovel = extractTipoImovel(card.cardHtml);
                card.corretor = 'Fluxo';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
                coletados.set(card.linkReal, card);
            }

            if (coletados.size > totalEsperado) throw new Error('[Fluxo] Coleta excedeu a contagem; base preservada.');
            semImoveisConfirmado = totalEsperado === 0;
            if (coletados.size === totalEsperado) break;
            if (cards.length < 15 || pageNum >= Math.ceil(totalEsperado / 15)) {
                if (++ordem >= ordenacoes.length) {
                    throw new Error(`[Fluxo] Coleta incompleta: ${coletados.size}/${totalEsperado} links unicos; base preservada.`);
                }
                console.warn(`[Fluxo] ${coletados.size}/${totalEsperado} links unicos; complementando com ordem ${ordenacoes[ordem]}.`);
                pageNum = 1;
                continue;
            }
            pageNum++;
        } catch (error) {
            console.error(`[Fluxo] Erro na página ${pageNum}:`, error);
            throw error;
        } finally {
            await page.close();
        }
    }

    allImoveis = [...coletados.values()];
    novosImoveis = allImoveis.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase)));
    if (allImoveis.length > 0) {
        console.log(`[Fluxo] Chamando rotas internas para ${allImoveis.length} imóveis raspados...`);
        await enrichImoveisWithInternalData(browser, allImoveis);
        console.log(`[Fluxo] Finalizou rotas internas.`);
    }

    return {
        imoveisRaspados: allImoveis,
        novosImoveis,
        semImoveisConfirmado
    };
}