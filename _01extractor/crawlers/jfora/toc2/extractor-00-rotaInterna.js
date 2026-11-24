// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos


import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairro.js';
import { extractCidade } from './extractor-07-cidade.js';

import puppeteer from 'puppeteer';
import fs from 'fs';

// Função utilitária para controlar paralelismo
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}



// Rota interna agora extrai localização detalhada
export async function enrichImoveisWithInternalData(browser, imoveis) {
  const poolSize = 5; // Número de imóveis processados em paralelo
  await asyncPool(poolSize, imoveis, async (imovel) => {
    if (!imovel.linkReal) return;
    let page;
    let success = false;
    let lastError = null;
    for (let attempt = 1; attempt <= 2 && !success; attempt++) {
      try {
        page = await browser.newPage();
        await page.goto(imovel.linkReal, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('div.DetailsPiecesProperties_container_caracters__i2IT3, div.GalleryPiecesProperties_codigoImovel__K1tn1, div.GalleryPiecesProperties_container_img__TTJiQ', { timeout: 60000 });
        const html = await page.content();
        imovel.localizacao = extractLocalizacao(html);
        const tipoImovelExtraido = extractTipoImovel(html, imovel.titulo);
        if (tipoImovelExtraido) {
          imovel.tipoImovel = tipoImovelExtraido;
        }
        const cidadeExtraida = extractCidade(html, imovel.linkReal);
        if (cidadeExtraida) {
          imovel.cidade = cidadeExtraida;
        }
        const bairroExtraido = extractBairro(html, imovel.linkReal, imovel.cidade);
        if (bairroExtraido) {
          imovel.bairro = bairroExtraido;
        }
        imovel.dormitorioValor = extractDormitorioValor(html);
        imovel.banheiroValor = extractBanheiroValor(html);
        imovel.areaValor = extractAreaValor(html);
        imovel.garagemValor = extractGaragemValor(html);
        imovel.codigoBase = extractCodigoBase(html);
        imovel.linkFoto = extractLinkFoto(html);
        success = true;
      } catch (e) {
        lastError = e;
        if (attempt === 2) {
          console.error('Erro ao extrair dados pela rota interna para o link:', imovel.linkReal);
          console.error(e);
          try {
            const html = page ? await page.content() : '';
            const fileName = `falha-interno-${Date.now()}-${Math.floor(Math.random()*10000)}.html`;
            fs.writeFileSync(fileName, html, 'utf8');
            console.error('HTML salvo para análise:', fileName);
          } catch (err) {
            console.error('Falha ao salvar HTML:', err);
          }
        } else {
          console.warn(`Tentativa ${attempt} falhou para o link: ${imovel.linkReal}, tentando novamente...`);
        }
      } finally {
        if (page) await page.close();
      }
    }
  });
  return imoveis;
}
