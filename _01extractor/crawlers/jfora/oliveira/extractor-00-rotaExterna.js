

import puppeteer from 'puppeteer';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairro.js';
import { extractCidade } from './extractor-07-cidade.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';

import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractDataExclusao } from './extractor-18-dataExclusao.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';




// Função para raspar o número total de imóveis e gerar os links de busca
export async function gerarLinksBuscaAuto(browser) {
  // Link base padronizado para todas as páginas, alterando apenas o parâmetro start
  const BASE_URL = "https://oliveiramendesimoveisjf.com.br/localizar/localizar-imovel?list[fullordering]=valor%20ASC&list[limit]=21&filter[search]=&filter[categoria_catid]=-40&filter[faixa_valor_venda][min]=0.00&filter[faixa_valor_venda][max]=18000000.00&filter[faixa_valor_locacao][min]=0.00&filter[faixa_valor_locacao][max]=4000.00&filter[faixa_valor_temporada][min]=0.00&filter[faixa_valor_temporada][max]=250.00&filter[endereco_eid]=&filter[quartos]=&filter[suites]=&filter[banheiros]=&filter[garagens]=&filter[captador_id]=0&edfcb8fa22577ff194417f62bd7a8062=1&filter_order=valor&filter_order_Dir=ASC&task=search&start=";

  // Abre o navegador e acessa a primeira página para capturar o total de imóveis
  const page = await browser.newPage();
  await page.goto(BASE_URL + '0', { waitUntil: 'networkidle2', timeout: 60000 });
  const html = await page.content();
  await page.close();
  // Extrai o número de imóveis do HTML
  let totalImoveis = 0;
  const match = html.match(/<label>\s*(\d+) opções encontrado\(s\)/i);
  if (match) {
    totalImoveis = parseInt(match[1], 10);
  }
  if (!totalImoveis) {
    console.warn('[oliveira] Não foi possível encontrar o total de imóveis, usando 21 como fallback.');
    totalImoveis = 21;
  }
  const cardsPorPagina = 21;
  const numPaginas = Math.ceil(totalImoveis / cardsPorPagina);
  const links = [];
  for (let pag = 1; pag <= numPaginas; pag++) {
    const start = (pag - 1) * cardsPorPagina;
    const url = BASE_URL + start;
    links.push(url);
  }
  console.log(`[oliveira] Total de imóveis: ${totalImoveis}, páginas: ${numPaginas}`);
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
          localizacao: '',
          tipoImovel: extractTipoImovel(html),
          bairro: '',
          cidade: '',
          dormitorioValor: extractDormitorioValor(html),
          banheiroValor: extractBanheiroValor(html),
          ambienteValor: extractAmbienteValor(html),
          areaValor: extractAreaValor(html),
          garagemValor: extractGaragemValor(html),
          elevadorValor: extractElevadorValor(html),
          //codigoBase: extractCodigoBase(html),
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

}

// raspagemPorLinks().catch(console.error);
