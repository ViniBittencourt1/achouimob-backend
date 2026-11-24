// backend/src/crawlers/jfora/souzagomes/extractor.js
import * as cheerio from "cheerio";

// Importando Módulos Extratores
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairros.js';
import { extractCidade } from './extractor-07-cidade.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroSocialValor } from './extractor-09-banheiroValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractTitulo } from './extractor-02-titulo.js';

const BASE_URL = "https://souzagomes.com.br/imoveis?order=recentes&negociacao=venda";

function formatarPrecoParaTitulo(n ) {
  if (!n) return "";
  return Number(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


const LIMITE_CLIQUES = 200;

export async function extractSouzaGomesData(browser, options = {}) {
  const imoveisRaspados = [];
  let ignoradosCasaPet = 0;
  // Faixas de preco perdem imoveis sem valor (ex.: futuros lancamentos); vendas usa a listagem geral.
  const searchLinks = options.linksBusca ?? [BASE_URL];
  console.log('🚀 Iniciando extração da Souza Gomes por múltiplos links...');

  for (const [idx, link] of searchLinks.entries()) {
    const page = await browser.newPage();
    console.log(`[${idx + 1}/${searchLinks.length}] Acessando: ${link}`);
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Paginação por clique com limite de 50 tentativas
    let paginacaoClicks = 0;
    while (true) {
      if (paginacaoClicks >= LIMITE_CLIQUES) {
        console.log(`⚠️ Limite de ${LIMITE_CLIQUES} cliques em "Carregar mais resultados" atingido. Prosseguindo para a próxima etapa.`);
        break;
      }
      try {
        await page.waitForSelector('.more-results--button', { visible: true, timeout: 5000 });
        await page.click('.more-results--button');
        paginacaoClicks++;
        console.log(`🖱️ Clicando em "Carregar mais resultados"... (${paginacaoClicks}/${LIMITE_CLIQUES})`);
        await new Promise((res) => setTimeout(res, 2500));
      } catch {
        console.log('✅ Não há mais botões "Carregar mais" nesta página.');
        break;
      }
    }
    const cardsHTML = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.imovel-item.imovel-item-show'))
                  .map(card => card.outerHTML);
    });
    console.log(`📦 Total de ${cardsHTML.length} cards de imóveis encontrados nesta página.`);
    for (const cardHTML of cardsHTML) {
      const $ = cheerio.load(cardHTML);
      const cardNode = $('body').children().first();
      // Regra: ignorar card se contiver 'Casa Pet' no seletor .imovel-item--cod
      const codText = cardNode.find('.imovel-item--cod').text();
      if (codText && codText.includes('Casa Pet')) {
        ignoradosCasaPet++;
        continue;
      }
      const imovel = {};
      imovel.linkReal = extractLinkReal(cardNode);
      imovel.codigoBase = extractCodigoBase(imovel.linkReal);
      imovel.localizacao = extractLocalizacao(cardNode);
      imovel.bairro = extractBairro(imovel.localizacao);
      imovel.cidade = extractCidade();
      imovel.preco = extractPreco(cardNode, options.negociacao);
      imovel.tipoImovel = extractTipoImovel(cardNode);
      imovel.linkCard = 0;
      imovel.corretor = extractCorretor();
      imovel.linkFoto = extractLinkFoto(cardNode);
      imovel.dormitorioValor = extractDormitorioValor(cardNode);
      imovel.garagemValor = extractGaragemValor(cardNode);
      imovel.areaValor = extractAreaValor(cardNode);
      imovel.banheiroValor = extractBanheiroSocialValor(cardNode);
      imovel.titulo = extractTitulo(cardHTML);
      const { getDataInclusao } = await import('./extractor-17-dataInclusao.js');
      const { extractAtualizadoEm } = await import('./extractor-20-atualizadoEm.js');
      imovel.dataInclusao = getDataInclusao();
      imovel.atualizadoEm = extractAtualizadoEm();
      imoveisRaspados.push(imovel);
    }
    await page.close();
  }

  return { browser, imoveisRaspados, ignoradosCasaPet };
}

export default extractSouzaGomesData;
