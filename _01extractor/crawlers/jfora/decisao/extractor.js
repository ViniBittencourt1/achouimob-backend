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
import { extractLocalizacao, buildLocalizacaoFallback } from './extractor-04-localizacao.js';
import { extractCidadeFromHtml } from './extractor-07-cidade.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { USER_AGENT_DECISAO } from './config.js';


const BASE_URL = "https://www.imobiliariadecisaojf.com.br/imovel/venda";

export async function extractDecisaoData(browser, existingCodigoBaseSet = new Set(), options = {}) {
    let pageNum = 1;
    let allImoveis = [];
    let novosImoveis = [];
    let semImoveisConfirmado = false;
    const baseUrl = options.baseUrl ?? BASE_URL;
    while (true) {
        const url = pageNum === 1
            ? baseUrl
            : `${baseUrl}/?&pag=${pageNum}`;
        if (pageNum === 1) {
            console.log(`[Decisao] Visitando página 1: ${url}`);
        } else {
            console.log(`[Decisao] Visitando página extra: ${pageNum} - ${url}`);
        }
        const page = await browser.newPage();
        try {
            await page.setUserAgent(USER_AGENT_DECISAO);
            await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });
            await page.setViewport({ width: 1280, height: 800 });
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
            const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
            if (options.strict && !response?.ok()) {
              const error = new Error(`[Decisao] HTTP ${response?.status()} em ${url}`);
              if (response?.status() === 403) error.code = 'DECISAO_BLOCKED';
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Debug: verificar se os cards estão no DOM
            const debugInfo = await page.evaluate(() => {
              const cards = document.querySelectorAll('.imovelcard');
              const divContainers = document.querySelectorAll('[class*="card"]');
              return {
                imvelcardCount: cards.length,
                allDivCardsCount: divContainers.length,
                bodyHTML: document.body.innerHTML.substring(0, 500)
              };
            });
            console.log(`[Decisao Debug] .imovelcard encontrados: ${debugInfo.imvelcardCount}, divs com 'card': ${debugInfo.allDivCardsCount}`);

            // Aguardar pelo menos um card antes de fazer a raspagem
            try {
              await page.waitForSelector('.imovelcard', { timeout: 8000 });
            } catch (e) {
              console.log(`[Decisao] Aviso: timeout esperando .imovelcard - continuando mesmo assim`);
            }

            // Não salvar HTML da primeira página (pagina1.html) conforme solicitado
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
                        atualizadoEm: new Date().toISOString(),
                    };
                  })
                  .filter(card => {
                    // Remove cards cujo linkReal termina com /imovel/venda ou contém apenas paginação
                    if (!card.linkReal) return false;
                    try {
                      const urlObj = new URL(card.linkReal, 'https://www.imobiliariadecisaojf.com.br');
                      const pathname = urlObj.pathname + (urlObj.search || '');
                      const regex = /\/imovel\/(?:venda|locacao)(\/?(\?.*)?)?$/;
                      return !regex.test(pathname);
                    } catch (e) {
                      // Se houver erro ao processar a URL, manter o card
                      return true;
                    }
                  });
            }, BASE_URL);
            console.log(`[Decisao] ${cards.length} cards encontrados na página ${pageNum}`);
            if (cards.length === 0) {
              if (options.strict && pageNum === 1) {
                semImoveisConfirmado = await page.evaluate(() => /\b0\s+im[o\u00f3]veis\s+encontrados\b/i.test(document.body.innerText || ''));
                if (!semImoveisConfirmado) throw new Error('[Decisao] Coleta vazia sem confirmacao do site.');
              }
                // Dump do HTML da página 2 para análise
              if (pageNum === 2 && !options.strict) {
                    const html = await page.content();
                    const fs = await import('fs');
                    fs.writeFileSync('pagina2.html', html, 'utf-8');
                    console.log('[Decisao] HTML da página 2 salvo em pagina2.html para análise.');
                }
                break;
            }
            // Se encontrou menos de 15 cards, é a última página
            if (cards.length < 15) {
                console.log(`[Decisao] Última página detectada (${cards.length} cards < 15). Encerrando.`);
                // Processa todos os cards normalmente antes de encerrar
                for (const card of cards) {
                    card.titulo = extractTitulo(card.cardHtml);
                    card.preco = extractPreco(card.cardHtml);
                    card.localizacao = extractLocalizacao(card.cardHtml);
                    card.cidade = extractCidadeFromHtml(card.cardHtml);
                    card.bairro = extractBairroFromTitulo(card.cardHtml, card.cidade, card.linkReal);
                    if (!card.localizacao) card.localizacao = buildLocalizacaoFallback(card.bairro, card.cidade);
                    card.garagemValor = extractGaragemValor(card.cardHtml);
                    card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                    card.banheiroValor = extractBanheiroValor(card.cardHtml);
                    card.ambienteValor = extractAmbienteValor(card.cardHtml);
                    card.elevadorValor = extractElevadorValor(card.cardHtml);
                    card.areaValor = extractAreaValor(card.cardHtml);
                    card.linkCard = extractLinkCard(card.cardHtml);
                    card.linkFoto = extractLinkFoto(card.cardHtml);
                    card.tipoImovel = extractTipoImovel(card.cardHtml);
                    card.corretor = 'Decisao';
                    card.codigoBase = extractCodigoBase(card.cardHtml);
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
                if (!card.localizacao) card.localizacao = buildLocalizacaoFallback(card.bairro, card.cidade);
                card.garagemValor = extractGaragemValor(card.cardHtml);
                card.dormitorioValor = extractDormitorioValor(card.cardHtml);
                card.banheiroValor = extractBanheiroValor(card.cardHtml);
                card.ambienteValor = extractAmbienteValor(card.cardHtml);
                card.elevadorValor = extractElevadorValor(card.cardHtml);
                card.areaValor = extractAreaValor(card.cardHtml);
                card.linkCard = extractLinkCard(card.cardHtml);
                card.linkFoto = extractLinkFoto(card.cardHtml);
                card.tipoImovel = extractTipoImovel(card.cardHtml);
                card.corretor = 'Decisao';
                card.codigoBase = extractCodigoBase(card.cardHtml);
                delete card.cardHtml;
            }
            allImoveis = allImoveis.concat(cards);
            novosImoveis = novosImoveis.concat(cards.filter(card => !existingCodigoBaseSet.has(String(card.codigoBase))));
            if (cards.length === 0) break;
            pageNum++;
        } catch (error) {
            console.error(`[Decisao] Erro na página ${pageNum}:`, error);
          if (options.strict) throw error;
            break;
        } finally {
            await page.close();
        }
    }
    if (allImoveis.length > 0) {
      console.log(`[Decisao] Chamando rotas internas para ${allImoveis.length} imóveis raspados...`);
      await enrichImoveisWithInternalData(browser, allImoveis);
        console.log(`[Decisao] Finalizou rotas internas.`);
    }
    // Sempre retorna objeto esperado, mesmo se vazio
    return {
        imoveisRaspados: allImoveis,
        novosImoveis,
        semImoveisConfirmado
    };
}