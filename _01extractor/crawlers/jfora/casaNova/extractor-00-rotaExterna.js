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
linksBusca.push("https://casanovajf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=&preco_max=50.000%2C00");
// 50.001 até 500.000: saltos de 50.000
for (let min = 50001; min <= 500000; min += 50000) {
  const max = min + 49999;
  const minStr = min.toLocaleString('pt-BR') + ',00';
  const maxStr = max.toLocaleString('pt-BR') + ',00';
  const link = `https://casanovajf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=${encodeURIComponent(minStr)}&preco_max=${encodeURIComponent(maxStr)}`;
  linksBusca.push(link);
}
// 500.001 até 2.000.000: saltos de 100.000
for (let min = 500001; min <= 2000000; min += 100000) {
  const max = min + 99999;
  const minStr = min.toLocaleString('pt-BR') + ',00';
  const maxStr = max.toLocaleString('pt-BR') + ',00';
  const link = `https://casanovajf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=${encodeURIComponent(minStr)}&preco_max=${encodeURIComponent(maxStr)}`;
  linksBusca.push(link);
}
// De 2.000.001 até 20.000.000: saltos de 1.000.000
for (let min = 2001000; min <= 20000000; min += 1000000) {
  const max = min + 999999;
  const minStr = min.toLocaleString('pt-BR') + ',00';
  const maxStr = max.toLocaleString('pt-BR') + ',00';
  const link = `https://casanovajf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=${encodeURIComponent(minStr)}&preco_max=${encodeURIComponent(maxStr)}`;
  linksBusca.push(link);
}


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
      // Paginação: clicar até o botão sumir, desabilitar ou não aumentar o número de cards
      let paginacaoClicks = 0;
      let lastCardsCount = 0;
      while (true) {
        if (paginacaoClicks >= 50) {
          console.warn('Paginação interrompida: mais de 50 cliques realizados. Pulando para o próximo processo.');
          break;
        }
        const btn = await page.$('button.more-results--button');
        if (!btn) break;
        // Verifica se o botão está desabilitado ou invisível
        const isDisabled = await page.evaluate(el => el.disabled || el.classList.contains('disabled') || el.offsetParent === null, btn);
        if (isDisabled) break;
        // Conta o número de cards antes do clique
        const cardsBefore = await page.$$('.imovel-item.imovel-item-show');
        await btn.click();
        paginacaoClicks++;
        console.log(`[${paginacaoClicks}] Clique de paginação`);
        await new Promise(resolve => setTimeout(resolve, 3500)); // tempo extra para garantir carregamento
        // Conta o número de cards após o clique
        const cardsAfter = await page.$$('.imovel-item.imovel-item-show');
        if (cardsAfter.length === cardsBefore.length || cardsAfter.length === lastCardsCount) {
          console.log('Paginação interrompida: número de cards não aumentou.');
          break;
        }
        lastCardsCount = cardsAfter.length;
      }
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
  const outputPath = path.join(outputDir, 'jfCasaNova.json');
  fs.writeFileSync(outputPath, JSON.stringify(todosImoveis, null, 2), 'utf-8');
  // Salvar no Firestore ao final (descomente se já houver integração)
  // await batchUpdateFromMap('jfCasaNova', todosImoveis, 'linkReal');
}

// raspagemPorLinks().catch(console.error);
