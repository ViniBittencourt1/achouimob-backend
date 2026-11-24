import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

const BASE_URL = "https://acasas.com.br/pesquisa?transacao=Venda&ordena=menor_valor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');

const cidadeSlugByNome = new Map();
const cidadeSlugs = new Set();

function normalizeCidadeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\/_,-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

try {
    const cidadesData = fs.readFileSync(cidadesPath, 'utf8');
    const cidadesList = JSON.parse(cidadesData);

    for (const cidade of cidadesList) {
        const nomeNormalizado = normalizeCidadeText(cidade?.nome || '');
        const slug = String(cidade?.slug || '').trim();

        if (slug) cidadeSlugs.add(slug);
        if (nomeNormalizado && slug && !cidadeSlugByNome.has(nomeNormalizado)) {
            cidadeSlugByNome.set(nomeNormalizado, slug);
        }
    }
} catch (err) {
    console.error('[Fogel] Falha ao carregar catálogo de cidades para normalização:', err.message || err);
}

function normalizarCidadeParaSlug(cidade) {
    const raw = String(cidade || '').trim();
    if (!raw) return '';

    if (cidadeSlugs.has(raw)) {
        return raw;
    }

    const nomeNormalizado = normalizeCidadeText(raw);
    if (cidadeSlugByNome.has(nomeNormalizado)) {
        return cidadeSlugByNome.get(nomeNormalizado);
    }

    return raw;
}

function fallbackLocalizacao(localizacao) {
    if (!localizacao) return { bairro: '', cidade: '' };

    const partes = localizacao
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    const bairro = partes[0] || '';
    const cidade = normalizarCidadeParaSlug(partes[1] || '');

    return { bairro, cidade };
}

export async function avancarPaginaACasas(page, pageNum) {
    const anterior = await page.$eval('div.feat_property.search-feat-card a[href*="/detalhes/"]', anchor => anchor.href);
    const next = await page.$('#searchResultsPagination button[data-page-nav="next"]:not([disabled]):not([aria-disabled="true"])');
    if (!next) throw new Error(`[ACasas] Paginacao ausente antes de completar a coleta; dados anteriores preservados.`);
    await next.click();
    await page.waitForFunction((numero, primeiroAnterior) => {
        const active = document.querySelector('#searchResultsPagination button.results-pagination__page.is-active');
        const primeiro = document.querySelector('div.feat_property.search-feat-card a[href*="/detalhes/"]');
        const heading = document.querySelector('span.heading-color.fw600')?.textContent || '';
        const pagina = heading.match(/P[aá]gina\s+(\d+)\s+de/i);
        return active?.getAttribute('data-page') === String(numero) &&
            Number(pagina?.[1]) === numero + 1 && primeiro?.href && primeiro.href !== primeiroAnterior;
    }, { timeout: 30000 }, pageNum, anterior);
}

export async function extractACasasData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 0;
    let allImoveis = [];
    let novosImoveis = [];
    let totalResultados = null;

    const page = await browser.newPage();
    try {
    while (true) {
        const url = options.baseUrl || BASE_URL;

        if (pageNum === 0) {
            console.log(`[ACasas] Visitando página inicial: ${url}`);
        } else {
            console.log(`[ACasas] Visitando página extra: ${pageNum} - ${url}`);
        }

        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

            let response;
            if (pageNum === 0) {
                response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            } else {
                await avancarPaginaACasas(page, pageNum);
            }

            const responseStatus = response?.status?.() ?? null;
            const title = await page.title();
            if (responseStatus === 403 || /403|forbidden/i.test(title)) {
                const blockedError = new Error(`[ACasas] Bloqueio detectado (${responseStatus ?? 'sem status'}) em ${url}`);
                blockedError.code = 'ACASAS_BLOCKED';
                throw blockedError;
            }
            if (response && !response.ok()) throw new Error(`[ACasas] HTTP ${responseStatus}; dados anteriores preservados.`);

            await new Promise(resolve => setTimeout(resolve, 2500));

            const resumoPagina = await page.evaluate(() => {
                const heading = document.querySelector('span.heading-color.fw600');
                const text = heading ? heading.textContent : '';
                const match = text.match(/(?:Página\s+\d+\s+de\s+\d+\s*·\s*)?(?:\d+[\s–-]\d+\s+de\s+)?(\d+)\s+resultados?/i);
                return match ? Number(match[1]) : null;
            });

            if (resumoPagina !== null) {
                if (totalResultados !== null && totalResultados !== resumoPagina) {
                    throw new Error('[ACasas] Total mudou durante a paginacao; dados anteriores preservados.');
                }
                totalResultados = resumoPagina;
            }

            const dataInclusao = extractDataInclusao();
            const cards = await page.evaluate((dataInclusaoAtual) => {
                const cardNodes = Array.from(document.querySelectorAll('div.feat_property.search-feat-card'));
                const detalhes = [];
                const vistos = new Set();

                for (const cardNode of cardNodes) {
                    const anchor = cardNode.querySelector('a[href*="/detalhes/"]');
                    if (!anchor) continue;

                    const href = anchor.href || '';
                    if (!href || !/\/detalhes\//i.test(href)) continue;
                    if (vistos.has(href)) continue;
                    vistos.add(href);

                    detalhes.push({
                        linkReal: href,
                        cardHtml: cardNode.outerHTML,
                        codigoBase: null,
                        linkFoto: cardNode.querySelector('img')?.src || '',
                        dataInclusao: dataInclusaoAtual,
                        dataExclusao: '',
                        atualizadoEm: '',
                    });
                }

                return detalhes;
            }, dataInclusao);

            const labelPagina = pageNum === 0 ? 'base' : pageNum;
            console.log(`[ACasas] ${cards.length} cards encontrados na página ${labelPagina}${totalResultados !== null ? ` (total de ${totalResultados})` : ''}`);

            if (cards.length === 0) {
                break;
            }

            for (const card of cards) {
                card.titulo = extractTitulo(card.cardHtml, { incluirTaxas: options.incluirTaxas });
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = normalizarCidadeParaSlug(extractCidadeFromHtml(card.cardHtml));
                card.bairro = extractBairroFromTitulo(card.cardHtml);
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
                card.corretor = 'A Casas';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
            }

            const linksJaAdicionados = new Set(allImoveis.map(imovel => imovel.linkReal));
            const cardsNaoDuplicados = cards.filter(card => {
                if (!card.linkReal || linksJaAdicionados.has(card.linkReal)) {
                    return false;
                }
                linksJaAdicionados.add(card.linkReal);
                return true;
            });

            allImoveis = allImoveis.concat(cardsNaoDuplicados);
            novosImoveis = novosImoveis.concat(cardsNaoDuplicados.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            if (cardsNaoDuplicados.length === 0) throw new Error('[ACasas] Paginacao sem novos imoveis; dados anteriores preservados.');

            if (totalResultados !== null && allImoveis.length >= totalResultados) {
                console.log(`[ACasas] Total de ${totalResultados} imóveis alcançado. Encerrando.`);
                break;
            }

            if (totalResultados === null && cards.length < 24) {
                console.log(`[ACasas] Última página detectada (${cards.length} cards < 24). Encerrando.`);
                break;
            }

            pageNum += 1;
        } catch (error) {
            console.error(`[ACasas] Erro na página ${pageNum}:`, error);
            if (options.strict) throw error;
            break;
        }
    }
    } finally {
        await page.close();
    }

    if (totalResultados === null || allImoveis.length !== totalResultados) {
        throw new Error(`[ACasas] Coleta incompleta: ${allImoveis.length}/${totalResultados ?? 'desconhecido'}; dados anteriores preservados.`);
    }

    if (allImoveis.length > 0) {
        console.log(`[ACasas] Chamando rotas internas para ${allImoveis.length} imóveis raspados...`);
        await enrichImoveisWithInternalData(browser, allImoveis, { preservarPreco: options.preservarPreco });
        console.log(`[ACasas] Finalizou rotas internas.`);
    }

    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}