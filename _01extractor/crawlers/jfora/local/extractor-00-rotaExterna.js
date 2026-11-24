import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
export { linksBusca };

import puppeteer from 'puppeteer';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairrojs.js';
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

const linksBusca = [];
// 0 a 50.000
linksBusca.push("https://www.localimoveisjf.com.br/imoveis/a-venda?preco-de-venda=0~50000");
// 50.001 até 500.000: saltos de 50.000
for (let min = 50001; min <= 500000; min += 50000) {
  const max = min + 49999;
  const link = `https://www.localimoveisjf.com.br/imoveis/a-venda?preco-de-venda=${min}~${max}`;
  linksBusca.push(link);
}
// 500.001 até 2.000.000: saltos de 100.000
for (let min = 500001; min <= 2000000; min += 100000) {
  const max = min + 99999;
  const link = `https://www.localimoveisjf.com.br/imoveis/a-venda?preco-de-venda=${min}~${max}`;
  linksBusca.push(link);
}
// De 2.000.001 até 20.000.000: saltos de 1.000.000
for (let min = 2001000; min <= 20000000; min += 1000000) {
  const max = min + 999999;
  const link = `https://www.localimoveisjf.com.br/imoveis/a-venda?preco-de-venda=${min}~${max}`;
  linksBusca.push(link);
}


import fs from 'fs';
import path from 'path';
// Se já houver integração Firestore:
// import { batchUpdateFromMap } from '../../../services/firebase.js';

async function raspagemPorLinks() {
  const browser = await puppeteer.launch({ headless: false }); // garantir modo visível
  const todosImoveis = [];
  for (const link of linksBusca) {
    let page;
    try {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
      console.log(`Página acessada: ${link}`);
      // Busca o bloco <div class="cont-infos"> dentro do <footer>
      const contInfosHtml = await page.$eval('footer .cont-infos', el => el.outerHTML).catch(() => '');
      // Clicar LGPD se aparecer
      try {
        await page.waitForSelector('lgpd-close', { timeout: 5000 });
        await page.evaluate(() => {
          const btn = document.querySelector('lgpd-close');
          if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
        });
        await page.waitForTimeout(500);
      } catch (e) {}
      // Paginação: clicar até o botão "Ver mais" sumir
      let paginacaoClicks = 0;
      while (true) {
        try {
          await page.waitForSelector('button.btn-next span', { timeout: 5000 });
        } catch (e) {
          break; // botão não existe mais
        }
        const btn = await page.$('button.btn-next span');
        if (!btn) break;
        await page.evaluate(span => span.parentElement.click(), btn);
        paginacaoClicks++;
        console.log(`Clique de paginação #${paginacaoClicks}`);
        await page.waitForTimeout(3500); // tempo extra para garantir carregamento
      }
      // Após a paginação, aguardar explicitamente o carregamento dos cards
      // Depuração: salvar screenshot e HTML antes de buscar os cards
      await page.screenshot({ path: `local-debug.png`, fullPage: true });
      const htmlDebug = await page.content();
      require('fs').writeFileSync('local-debug.html', htmlDebug, 'utf-8');
      // Espera por qualquer <a> que contenha ambas as classes, independente da ordem
      let cards = [];
      try {
        await page.waitForFunction(() => {
          return Array.from(document.querySelectorAll('a')).some(a =>
            a.classList.contains('card_split_vertically') && a.classList.contains('borderHover')
          );
        }, { timeout: 15000 });
        // Seleciona todos os cards válidos
        cards = await page.$$('a.card_split_vertically.borderHover, a.borderHover.card_split_vertically');
      } catch (e) {
        console.warn('⚠️ Nenhum card com as classes card_split_vertically e borderHover encontrado após paginação');
        try {
          await page.close();
        } catch (e) {
          console.warn('⚠️ Falha ao fechar página (provavelmente já fechada):', e.message);
        }
        continue;
      }
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
        // Só processa se houver o código único do imóvel
        if (/<p class\"card_split_vertically__code\">.+?<\/p>/.test(html)) {
          const imovel = {
            linkReal: extractLinkReal(html),
            titulo: extractTitulo(html),
            preco: extractPreco(html),
            localizacao: extractLocalizacao(html),
            tipoImovel: extractTipoImovel(html),
            bairro: extractBairro(html),
            cidade: extractCidade(html),
            dormitorioValor: extractDormitorioValor(html),
            banheiroValor: extractBanheiroValor(html),
            ambienteValor: extractAmbienteValor(html),
            areaValor: extractAreaValor(html),
            garagemValor: extractGaragemValor(html),
            elevadorValor: extractElevadorValor(html),
            codigoBase: extractCodigoBase(html),
            linkCard: extractLinkCard(contInfosHtml),
            corretor: extractCorretor(html),
            dataInclusao: extractDataInclusao(html),
            dataExclusao: extractDataExclusao(html),
            linkFoto: extractLinkFoto(html),
            atualizadoEm: extractAtualizadoEm(html)
          };
          todosImoveis.push(imovel);
        }
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
  const outputPath = path.join(outputDir, 'jfLocal.json');
  fs.writeFileSync(outputPath, JSON.stringify(todosImoveis, null, 2), 'utf-8');
  // Salvar no Firestore ao final (descomente se já houver integração)
  // await batchUpdateFromMap('jfLocal', todosImoveis, 'linkReal');
}

// raspagemPorLinks().catch(console.error);
