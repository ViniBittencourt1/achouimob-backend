import { coletarCardsFogelVendas } from './paginacao-vendas.js';
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
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

const BASE_URL = "https://fogel.com.br/pesquisa?transacao=Venda";

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

function montarUrlPagina(pageNum, baseUrl = BASE_URL) {
    const urlObj = new URL(baseUrl);
    if (pageNum > 1) urlObj.searchParams.set('pagina', String(pageNum));
    return urlObj.toString();
}

export async function extractFogelData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    if (!options.baseUrl || new URL(options.baseUrl).searchParams.get('transacao')?.toLowerCase() === 'venda') return extractFogelVendas(browser, existingCodigoBaseSet, options);
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    let totalResultados = null;

    while (true) {
        const url = montarUrlPagina(pageNum, options.baseUrl);

        if (pageNum === 1) {
            console.log(`[Fogel] Visitando página 1: ${url}`);
        } else {
            console.log(`[Fogel] Visitando página extra: ${pageNum} - ${url}`);
        }

        const page = await browser.newPage();
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            if (options.strict && !response?.ok()) {
                const error = new Error(`[Fogel] HTTP ${response?.status()} em ${url}`);
                if (response?.status() === 403) error.code = 'FOGEL_BLOCKED';
                throw error;
            }

            const responseStatus = response?.status?.() ?? null;
            const title = await page.title();
            if (responseStatus === 403 || /403|forbidden/i.test(title)) {
                const blockedError = new Error(`[Fogel] Bloqueio detectado (${responseStatus ?? 'sem status'}) em ${url}`);
                blockedError.code = 'FOGEL_BLOCKED';
                throw blockedError;
            }

            await new Promise(resolve => setTimeout(resolve, 2500));

            if (options.strict) {
                const total = await page.evaluate(() => {
                    const match = document.body.innerText.match(/\b(\d+)\s+resultados?\b/i);
                    return match ? Number(match[1]) : null;
                });
                if (total !== null) totalResultados = total;
            }

            const cards = await page.evaluate(() => {
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
                        dataInclusao: new Date().toISOString(),
                        dataExclusao: '',
                        atualizadoEm: '',
                    });
                }

                return detalhes;
            });

            console.log(`[Fogel] ${cards.length} cards encontrados na página ${pageNum}`);

            if (cards.length === 0) {
                break;
            }

            if (cards.length < 24) {
                console.log(`[Fogel] Última página detectada (${cards.length} cards < 24). Encerrando.`);
                for (const card of cards) {
                    card.titulo = extractTitulo(card.cardHtml, { incluirTaxas: options.incluirTaxas });
                    card.preco = extractPreco(card.cardHtml);
                    card.localizacao = extractLocalizacao(card.cardHtml);
                    card.cidade = normalizarCidadeParaSlug(extractCidadeFromHtml(card.cardHtml));
                    card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade);
                    if (!card.bairro || !card.cidade) {
                        const fallback = fallbackLocalizacao(card.localizacao);
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
                    card.corretor = 'Fogel';
                    card.codigoBase = extractCodigoBase(card.cardHtml);
                    card.atualizadoEm = extractAtualizadoEm();
                    delete card.cardHtml;
                }

                allImoveis = allImoveis.concat(cards);
                novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
                break;
            }

            for (const card of cards) {
                card.titulo = extractTitulo(card.cardHtml, { incluirTaxas: options.incluirTaxas });
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = normalizarCidadeParaSlug(extractCidadeFromHtml(card.cardHtml));
                card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade);
                if (!card.bairro || !card.cidade) {
                    const fallback = fallbackLocalizacao(card.localizacao);
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
                card.corretor = 'Fogel';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
            }

            allImoveis = allImoveis.concat(cards);
            novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            pageNum++;
        } catch (error) {
            console.error(`[Fogel] Erro na página ${pageNum}:`, error);
            if (options.strict) throw error;
            break;
        } finally {
            await page.close();
        }
    }

    if (options.strict && (totalResultados === null || allImoveis.length !== totalResultados || new Set(allImoveis.map(item => item.linkReal)).size !== allImoveis.length)) {
        throw new Error('[Fogel] Coleta incompleta ou duplicada. Dados anteriores preservados.');
    }

    if (allImoveis.length > 0) {
        console.log(`[Fogel] Chamando rotas internas para ${allImoveis.length} imóveis raspados...`);
        await enrichImoveisWithInternalData(browser, allImoveis, { preservarPreco: options.preservarPreco });
        console.log(`[Fogel] Finalizou rotas internas.`);
    }

    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}
export async function extractFogelVendas(browser, existingCodigoBaseSet = new Set(), options = {}) {
    const cards = await coletarCardsFogelVendas(browser, { url: options.baseUrl ?? BASE_URL, totalEsperado: options.totalEsperado });
    for (const card of cards) {
                card.titulo = extractTitulo(card.cardHtml, { incluirTaxas: options.incluirTaxas });
                card.preco = extractPreco(card.cardHtml);
                card.localizacao = extractLocalizacao(card.cardHtml);
                card.cidade = normalizarCidadeParaSlug(extractCidadeFromHtml(card.cardHtml));
                card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade);
                if (!card.bairro || !card.cidade) {
                    const fallback = fallbackLocalizacao(card.localizacao);
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
                card.corretor = 'Fogel';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
            }
    const novosImoveis = cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase)));
    if (!options.somenteListagem && cards.length) await enrichImoveisWithInternalData(browser, cards, { preservarPreco: options.preservarPreco });
    if (new Set(cards.map(card => card.linkReal)).size !== cards.length) throw new Error('[Fogel] Dados duplicados; base preservada.');
    return { imoveisRaspados: cards, novosImoveis };
}
