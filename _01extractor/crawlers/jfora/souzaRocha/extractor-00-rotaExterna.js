import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { JSDOM } from 'jsdom';
import { parseTotalVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

// Gera links de busca automaticamente para o crawler
export async function gerarLinksBuscaAuto(browser) {
  const page = await browser.newPage();
  const project = projetoContagemVendas('jfSouzaRocha');
  const base = new URL(project.url);
  try {
    const response = await page.goto(base.href, { waitUntil: 'networkidle2', timeout: 60000 });
    if (!response || response.status() < 200 || response.status() >= 400) throw new Error('Busca de vendas Souza Rocha indisponivel; base preservada.');
    const dom = new JSDOM(await page.content());
    try {
      const label = dom.window.document.querySelector('.rh_pagination__stats')?.textContent || '';
      const total = parseTotalVendas(label, project);
      const cards = dom.window.document.querySelectorAll('.rh_list_card__wrap');
      if (total > 0 && cards.length === 0) throw new Error('Busca Souza Rocha sem cards para o total anunciado; base preservada.');
      const pages = total === 0 ? 1 : Math.ceil(total / cards.length);
      return Array.from({ length: pages }, (_, index) => {
        const url = new URL(base);
        if (index > 0) url.pathname = `/pesquisa/page/${index + 1}/`;
        return url.href;
      });
    } finally { dom.window.close(); }
  } finally { await page.close(); }
}
export { linksBusca };

import puppeteer from 'puppeteer';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractDataExclusao } from './extractor-18-dataExclusao.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

const linksBusca = [
  "https://souzarochaimoveis.com.br/pesquisa/?view=list"
];


import fs from 'fs';
import path from 'path';
// Se já houver integração Firestore:
// import { batchUpdateFromMap } from '../../../services/firebase.js';

async function raspagemPorLinks() {
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
        // Não há paginação nesta página, segue direto para raspagem dos cards
      // Após a paginação, raspar todos os cards
      const cards = await page.$$('.imovel-item.imovel-item-show');
      console.log(`Cards encontrados após paginação: ${cards.length}`);
      if (cards.length === 0) {
        try {
          await page.close();
        } catch (e) {
          console.warn('⚠️ Falha ao fechar página (provavelmente já fechada):', e.message);
        }
        continue;
      }
      for (const card of cards) {
        const html = await page.evaluate(el => el.outerHTML, card);
        const imovel = {
          linkReal: extractLinkReal(html),
          titulo: extractTitulo(html),
          preco: extractPreco(html),
          dormitorioValor: extractDormitorioValor(html),
          banheiroValor: extractBanheiroValor(html),
          ambienteValor: extractAmbienteValor(html),
          areaValor: extractAreaValor(html),
          elevadorValor: extractElevadorValor(html),
          linkCard: extractLinkCard(html),
          corretor: extractCorretor(html),
          dataInclusao: extractDataInclusao(html),
          dataExclusao: extractDataExclusao(html),
          linkFoto: extractLinkFoto(html),
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
  const outputPath = path.join(outputDir, 'jfBomClima.json');
  fs.writeFileSync(outputPath, JSON.stringify(todosImoveis, null, 2), 'utf-8');
}
