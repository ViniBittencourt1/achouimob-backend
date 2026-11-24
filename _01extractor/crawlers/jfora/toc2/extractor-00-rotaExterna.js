import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';


import puppeteer from 'puppeteer';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';



import { extractCidade } from './extractor-07-cidade.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';




export function validarUrlToc2Venda(destination, pagina) {
  const url = new URL(destination);
  if (!['https://toc2imoveis.com.br', 'https://www.toc2imoveis.com.br'].includes(url.origin) ||
      url.pathname !== '/imoveis/venda/-/-/-/-') {
    throw new Error(`[toc2] Pagina ${pagina} saiu da listagem de vendas. URL recebida: ${url.href}; base preservada.`);
  }
}

// Função para raspar o número total de imóveis e gerar os links de busca
export async function gerarLinksBuscaAuto(browser) {
  const BASE_URL = "https://www.toc2imoveis.com.br/imoveis/venda/-/-/-/-";
  const firstPage = await browser.newPage();
  let totalImoveis = 0;
  try {
    await firstPage.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await firstPage.waitForFunction(() => {
      const text = document.body?.innerText || '';
      const hasCount = /\d+\s+Encontrados/i.test(text);
      const hasCards = document.querySelectorAll('a[href*="/imovel/"]').length > 0;
      return hasCount || hasCards;
    }, { timeout: 30000 }).catch(() => {});
    // Busca o total de imóveis no seletor correto do toc2imoveis.com.br
    totalImoveis = await firstPage.evaluate(() => {
      const el = document.querySelector('h2[class*="Properties_qtd1"], [class*="Properties_qtd1"]');
      const text = el?.textContent || document.body?.innerText || '';
      const match = text.match(/(\d+)\s+Encontrados/i);
      if (match) return parseInt(match[1], 10);

      const linksImoveis = new Set(
        Array.from(document.querySelectorAll('a[href*="/imovel/"]'))
          .map((a) => a.href || a.getAttribute('href'))
          .filter(Boolean)
      );
      return linksImoveis.size;
    });
  } catch (err) {
    console.error(`Erro ao acessar página inicial: ${BASE_URL}`);
    console.error(err);
    throw err;
  } finally {
    await firstPage.close();
  }
  const cardsPorPagina = 12;
  const numPaginas = Math.ceil(totalImoveis / cardsPorPagina);
  const links = [];
  for (let pag = 1; pag <= numPaginas; pag++) {
    const url = pag === 1
      ? BASE_URL
      : `https://www.toc2imoveis.com.br/imoveis/venda/-/-/-/-?filtros&min=0&max=20000000&ordem=desc-valor&pagination=${pag}`;
    links.push(url);
  }
  console.log(`[toc2] Total de imóveis: ${totalImoveis}, páginas: ${numPaginas}`);
  return links;
}


import fs from 'fs';
import path from 'path';
// Se já houver integração Firestore:
// import { batchUpdateFromMap } from '../../../services/firebase.js';

// Função corrigida para raspagem por links
export async function raspagemPorLinks(linksBusca) {
  const browser = await puppeteer.launch({ headless: false });
  const todosImoveis = [];
  for (const link of linksBusca) {
    let page;
    try {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
      console.log(`Página acessada: ${link}`);
      // Clicar LGPD se aparecer
      try {
        await page.waitForSelector('lgpd-close', { timeout: 5000 });
        await page.evaluate(() => {
          const btn = document.querySelector('lgpd-close');
          if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
        });
        await page.waitForTimeout(500);
      } catch (e) {}

      // Extrair cards
      const cards = await page.$$('.imovel-item.imovel-item-show');
      console.log(`Cards encontrados: ${cards.length}`);
      if (cards.length < 15) {
        console.log('Menos de 15 cards encontrados, encerrando a raspagem.');
        await page.close();
        break;
      }
      // Extração dos dados dos cards
      for (const card of cards) {
        const html = await page.evaluate(el => el.outerHTML, card);
        // Só processa cards que possuem o bloco de referência
        if (!/<p class="imovelcard__info__ref">/.test(html)) {
          continue;
        }
        const linkReal = extractLinkReal(html);
        const imovel = {
          linkReal,
          titulo: extractTitulo(html),
          preco: extractPreco(html),
          // localizacao será preenchida pela rota interna
          localizacao: '',
          // tipoImovel será preenchido pela rota interna
          tipoImovel: '',
          // bairro será preenchido pela rota interna
          bairro: '',
          // cidade será preenchida pela rota interna
          cidade: '',
          // dormitorioValor, banheiroValor, areaValor, garagemValor, codigoBase, linkFoto serão preenchidos pela rota interna
          ambienteValor: extractAmbienteValor(html),
          elevadorValor: extractElevadorValor(html),
          linkCard: extractLinkCard(html),
          corretor: extractCorretor(),
          dataInclusao: extractDataInclusao(html),
          dataExclusao: extractDataExclusao(html),
          atualizadoEm: extractAtualizadoEm(html)
        };
        todosImoveis.push(imovel);
      }
    } catch (err) {
      console.error(`❌ Erro ao processar o link: ${link}`);
      console.error(err);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.warn('⚠️ Falha ao fechar página (provavelmente já fechada):', e.message);
        }
      }
    }
  }
  await browser.close();
  // Exibir apenas o total de cards raspados
  console.log(`Total de cards raspados: ${todosImoveis.length}`);
  // Salvar no JSON ao final
  const outputDir = path.join(ISOLATED_BACKEND_ROOT, 'crawler');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'jfDecisao.json');
  fs.writeFileSync(outputPath, JSON.stringify(todosImoveis, null, 2), 'utf-8');
  // Salvar no Firestore ao final (descomente se já houver integração)
  // await batchUpdateFromMap('jfDecisao', todosImoveis, 'linkReal');
}

// raspagemPorLinks().catch(console.error);
