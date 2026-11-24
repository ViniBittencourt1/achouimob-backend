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


const BASE_URL = "https://www.lidernegociosimob.com.br/imovel/venda";

export async function extractLiderData(browser, existingCodigoBaseSet = new Set()) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    while (true) {
        const url = pageNum === 1
            ? BASE_URL
            : `${BASE_URL}/?&pag=${pageNum}`;
        if (pageNum === 1) {
            console.log(`[Lider] Visitando página 1: ${url}`);
        } else {
            console.log(`[Lider] Visitando página extra: ${pageNum} - ${url}`);
        }
        const page = await browser.newPage();
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });

            const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

            const responseStatus = response?.status?.() ?? null;
            const title = await page.title();
            if (responseStatus === 403 || /403|forbidden/i.test(title)) {
                const blockedError = new Error(`[Lider] Bloqueio detectado (${responseStatus ?? "sem status"}) em ${url}`);
                blockedError.code = "LIDER_BLOCKED";
                throw blockedError;
            }

            await new Promise(resolve => setTimeout(resolve, 4000)); // tempo maior para garantir carregamento
            // Salvar HTML da primeira página para análise
            if (pageNum === 1) {
                // Removido: não salvar pagina1.html
            }
            const cards = await page.evaluate((BASE_URL) => {
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
                return Array.from(propertyCards)
                  .map(card => {
                    const linkReal = card.querySelector('a')?.href || '';
                    const cardHtml = card.outerHTML;
                    return {
                        linkReal,
                        cardHtml,
                        garagem: getNumberFromLi(card, 'flaticon-vehicle'),
                        codigoBase: null, // será preenchido depois
                        linkFoto: card.querySelector('img')?.src || '',
                        dataInclusao: new Date().toISOString(),
                        dataExclusao: '',
                        atualizadoEm: '',
                    };
                  })
                  .filter(card => {
                    // Remove cards cujo linkReal termina com /imovel/venda ou contém apenas paginação
                    if (!card.linkReal) return false;
                    const url = card.linkReal;
                    // Exemplo: https://www.lidernegociosimob.com.br/imovel/venda ou .../imovel/venda/?pag=1
                    const regex = /\/imovel\/venda(\/?(\?.*)?)?$/;
                    return !regex.test(new URL(url).pathname + (new URL(url).search || ''));
                  });
            }, BASE_URL);
            console.log(`[Lider] ${cards.length} cards encontrados na página ${pageNum}`);
            if (cards.length === 0) {
                // Dump do HTML da página 2 para análise
                if (pageNum === 2) {
                    const html = await page.content();
                    const fs = await import('fs');
                    fs.writeFileSync('pagina2.html', html, 'utf-8');
                    console.log('[Lider] HTML da página 2 salvo em pagina2.html para análise.');
                }
                break;
            }
            // Se encontrou menos de 15 cards, é a última página
            if (cards.length < 15) {
                console.log(`[Lider] Última página detectada (${cards.length} cards < 15). Encerrando.`);
                // Processa todos os cards normalmente antes de encerrar
                for (const card of cards) {
                    card.titulo = extractTitulo(card.cardHtml);
                    card.preco = extractPreco(card.cardHtml);
                    card.localizacao = extractLocalizacao(card.cardHtml);
                    card.cidade = extractCidadeFromHtml(card.cardHtml);
                    card.bairro = extractBairroFromTitulo(card.cardHtml);
                    card.garagemValor = extractGaragemValor(card.cardHtml);
                    card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                    card.banheiroValor = extractBanheiroValor(card.cardHtml);
                    card.ambienteValor = extractAmbienteValor(card.cardHtml);
                    card.elevadorValor = extractElevadorValor(card.cardHtml);
                    card.areaValor = extractAreaValor(card.cardHtml);
                    card.linkCard = extractLinkCard(card.cardHtml);
                    card.linkFoto = extractLinkFoto(card.cardHtml);
                    card.tipoImovel = extractTipoImovel(card.cardHtml);
                    card.corretor = 'Lider';
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
                card.bairro = extractBairroFromTitulo(card.cardHtml);
                card.garagemValor = extractGaragemValor(card.cardHtml);
                card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                card.banheiroValor = extractBanheiroValor(card.cardHtml);
                card.ambienteValor = extractAmbienteValor(card.cardHtml);
                card.elevadorValor = extractElevadorValor(card.cardHtml);
                card.areaValor = extractAreaValor(card.cardHtml);
                card.linkCard = extractLinkCard(card.cardHtml);
                card.linkFoto = extractLinkFoto(card.cardHtml);
                card.tipoImovel = extractTipoImovel(card.cardHtml);
                card.corretor = 'Lider';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                card.atualizadoEm = extractAtualizadoEm();
                delete card.cardHtml;
            }
            allImoveis = allImoveis.concat(cards);
            novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            if (cards.length === 0) break;
            pageNum++;
        } catch (error) {
            console.error(`[Lider] Erro na página ${pageNum}:`, error);
            break;
        } finally {
            await page.close();
        }
    }
    if (novosImoveis.length > 0) {
        console.log(`[Lider] Chamando rotas internas para ${novosImoveis.length} imóveis novos...`);
        await enrichImoveisWithInternalData(browser, allImoveis);
        console.log(`[Lider] Finalizou rotas internas.`);
    }
    // Sempre retorna objeto esperado, mesmo se vazio
    return {
        imoveisRaspados: allImoveis,
        novosImoveis
    };
}