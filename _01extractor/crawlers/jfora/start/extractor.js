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

const BASE_URL = "https://www.startimoveisjf.com.br/imoveis.php?negocio=1&tipo=&cidade2=&dormitorios=&vagas=&faixapreco1=&faixapreco2=&condo=#";

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

function slugToLabel(slug) {
    if (!slug) return '';
    return String(slug)
        .replace(/-+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackByLink(linkReal) {
    if (!linkReal) return { bairro: '', cidade: '', localizacao: '' };

    let pathname = '';
    try {
        pathname = decodeURIComponent(new URL(linkReal).pathname || '');
    } catch {
        return { bairro: '', cidade: '', localizacao: '' };
    }

    const slugMatch = pathname.match(/\/imovel\/\d+\/([^/?#]+)/i);
    const slug = (slugMatch?.[1] || '').toLowerCase();
    if (!slug) return { bairro: '', cidade: '', localizacao: '' };

    const cityAndBairro = slug.match(/_([a-z-]+-[a-z]{2})_([a-z0-9-]+)$/i);
    if (cityAndBairro?.[1] && cityAndBairro?.[2]) {
        const cidadeSlug = cityAndBairro[1].trim();
        const bairroSlug = cityAndBairro[2].trim();

        const uf = cidadeSlug.slice(-2).toUpperCase();
        const cidadeNome = slugToLabel(cidadeSlug.replace(/-[a-z]{2}$/i, ''));
        const bairroNome = slugToLabel(bairroSlug);

        return {
            bairro: bairroSlug,
            cidade: cidadeSlug,
            localizacao: bairroNome && cidadeNome ? `${bairroNome}, ${cidadeNome} - ${uf}` : '',
        };
    }

    const tokens = slug.split('_').filter(Boolean);
    const bairroFallback = tokens.length ? tokens[tokens.length - 1].trim() : '';
    return {
        bairro: bairroFallback,
        cidade: '',
        localizacao: bairroFallback ? slugToLabel(bairroFallback) : '',
    };
}

function montarUrlPagina(pageNum, baseUrl = BASE_URL) {
    return baseUrl;
}

export function listaStartPronta(totalEsperado) {
    if (document.querySelector('div.listing-item a[href*="/imovel/"]')) return true;
    return totalEsperado === undefined &&
        /^\s*0\s+im[oó]veis?\s+encontrados?\s*$/i.test(
            document.querySelector('h4.top15.left15')?.textContent || ''
        );
}

export async function extractStartData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    const vistos = new Set();

    const url = montarUrlPagina(1, options.baseUrl);
    if (options.strict && new URL(url).searchParams.get('negocio') !== '2') throw new Error('Filtro de aluguel Start ausente.');
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

        console.log(`[Start] Visitando página inicial: ${url}`);
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
        if (options.strict && !response?.ok()) {
            const error = new Error(`[Start] HTTP ${response?.status()} na busca de aluguel.`);
            if (response?.status() === 403) error.code = 'START_BLOCKED';
            throw error;
        }
        if (options.strict && new URL(page.url()).searchParams.get('negocio') !== '2') throw new Error('Busca Start retornou sem filtro de aluguel.');

        const responseStatus = response?.status?.() ?? null;
        const title = await page.title();
        if (responseStatus === 403 || /403|forbidden/i.test(title)) {
            const blockedError = new Error(`[Start] Bloqueio detectado (${responseStatus ?? 'sem status'}) em ${url}`);
            blockedError.code = 'START_BLOCKED';
            throw blockedError;
        }
        if (options.strict) {
            try {
                await page.waitForFunction(listaStartPronta, { timeout: 30000 }, options.totalEsperado);
            } catch (error) {
                throw new Error(`[Start] Lista de aluguel nao carregou: ${error.message}`);
            }
        }

        for (pageNum = 1; pageNum <= 50; pageNum++) {
            await page.evaluate(() => {
                const loading = document.querySelector('.loading-div');
                if (loading) loading.remove();
                const policy = document.querySelector('#container-privacy-policy');
                if (policy) policy.remove();
            });
            await new Promise(resolve => setTimeout(resolve, 1800));

            const cards = await page.evaluate(() => {
                const nodes = Array.from(document.querySelectorAll('div.listing-item'));
                return nodes.map((node) => {
                    const anchor = node.querySelector('a[href*="/imovel/"]');
                    const href = anchor?.href || '';
                    return {
                        linkReal: href,
                        cardHtml: node.outerHTML,
                        codigoBase: null,
                        linkFoto: node.querySelector('img')?.src || '',
                        dataInclusao: new Date().toISOString(),
                        dataExclusao: '',
                        atualizadoEm: '',
                    };
                }).filter((card) => card.linkReal && /\/imovel\//i.test(card.linkReal));
            });

            console.log(`[Start] ${cards.length} cards encontrados na página ${pageNum}`);
            if (cards.length === 0) {
                const vazioConfirmado = await page.evaluate(listaStartPronta, options.totalEsperado);
                if (options.strict && !vazioConfirmado) throw new Error(`[Start] Pagina ${pageNum} sem cards e sem confirmacao de lista vazia.`);
                break;
            }
            if (options.strict && cards.some(card => !/aluguel|para[-\s]+alugar/i.test(card.cardHtml))) throw new Error('Card fora da locacao Start.');

            const novosDaPagina = [];
            for (const card of cards) {
                if (vistos.has(card.linkReal)) continue;
                vistos.add(card.linkReal);

                card.titulo = extractTitulo(card.cardHtml);
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = extractCidadeFromHtml(card.cardHtml);
                card.bairro = extractBairroFromTitulo(card.cardHtml);
                if (!card.bairro || !card.cidade) {
                    const fallback = fallbackLocalizacao(card.localizacao);
                    if (!card.bairro) card.bairro = fallback.bairro;
                    if (!card.cidade) card.cidade = fallback.cidade;
                }
                if (!card.bairro || !card.localizacao || !card.cidade) {
                    const fallbackLink = fallbackByLink(card.linkReal);
                    if (!card.bairro && fallbackLink.bairro) card.bairro = fallbackLink.bairro;
                    if (!card.cidade && fallbackLink.cidade) card.cidade = fallbackLink.cidade;
                    if (!card.localizacao && fallbackLink.localizacao) card.localizacao = fallbackLink.localizacao;
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
                card.corretor = 'Start';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;

                novosDaPagina.push(card);
            }

            allImoveis = allImoveis.concat(novosDaPagina);
            novosImoveis = novosImoveis.concat(novosDaPagina.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            if (options.strict && !novosDaPagina.length) throw new Error('Pagina Start nao acrescentou imoveis. Coleta parcial nao sera publicada.');

            const proximaPagina = pageNum + 1;
            const existeProxima = await page.$(`a[data-page="${proximaPagina}"]`);
            if (!existeProxima) {
                console.log(`[Start] Última página detectada em ${pageNum}.`);
                break;
            }
            if (options.strict && pageNum === 50) throw new Error('Limite de paginacao Start atingido.');
            const before = await page.$$eval('div.listing-item', items => items.map(item => item.querySelector('a[href*="/imovel/"]')?.href || '').join('|'));

            // Clique via DOM: o clique por coordenada acertava outro numero da paginacao e pulava paginas.
            await page.evaluate((p) => {
                const btn = document.querySelector(`a[data-page="${p}"]`);
                if (btn) btn.click();
            }, proximaPagina);
            // A paginacao e via AJAX; sem esperar a troca, a mesma pagina era lida de novo e imoveis ficavam de fora.
            await page.waitForFunction(previous => {
                const items = Array.from(document.querySelectorAll('div.listing-item'));
                return items.length > 0 && items.map(item => item.querySelector('a[href*="/imovel/"]')?.href || '').join('|') !== previous;
            }, { timeout: 30000 }, before);
        }
    } catch (error) {
        console.error(`[Start] Erro na página ${pageNum}:`, error);
        if (options.strict) throw error;
    } finally {
        await page.close();
    }

    if (options.totalEsperado !== undefined && allImoveis.length !== options.totalEsperado) {
        throw new Error(`[Start] Coleta incompleta: ${allImoveis.length}/${options.totalEsperado}. JSON e Sheets anteriores preservados.`);
    }

    const imoveisParaRotaInterna = allImoveis.filter((imovel) =>
        !imovel.preco || !imovel.areaValor || !imovel.dormitorioValor || !imovel.banheiroValor || !imovel.garagemValor
    );

    if (imoveisParaRotaInterna.length > 0) {
        console.log(`[Start] Chamando rotas internas para ${imoveisParaRotaInterna.length} imóveis com dados incompletos...`);
        await enrichImoveisWithInternalData(browser, imoveisParaRotaInterna, { preservarPreco: options.preservarPreco });
        console.log(`[Start] Finalizou rotas internas.`);
    }

    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}