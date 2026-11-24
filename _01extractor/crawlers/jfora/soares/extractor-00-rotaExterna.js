import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';


import puppeteer from 'puppeteer';
import { aguardarContagemVendas, lerContagemVendasDOM, parseTotalVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';
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
  const BASE_URL = "https://www.secimoveis.com.br/imoveis/venda/#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1";
  const firstPage = await browser.newPage();
  const project = projetoContagemVendas('jfSoares');
  let totalImoveis;
  try {
    const response = await firstPage.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    if (!response?.ok()) throw new Error(`[jfSoares] HTTP ${response?.status()} ao gerar paginas; retorno preservado.`);
    await aguardarContagemVendas(firstPage, project);
    const info = await firstPage.evaluate(lerContagemVendasDOM, project);
    totalImoveis = parseTotalVendas(info.label, project);
  } finally {
    await firstPage.close();
  }
  const cardsPorPagina = 15;
  const numPaginas = Math.ceil(totalImoveis / cardsPorPagina);
  const links = [];
  for (let pag = 1; pag <= numPaginas; pag++) {
    const url = pag === 1
      ? BASE_URL
      : `https://www.secimoveis.com.br/imoveis/venda/#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=${pag}`;
    links.push(url);
  }
  console.log(`[Soares] Total de imóveis: ${totalImoveis}, páginas: ${numPaginas}`);
  return links;
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
          corretor: extractCorretor(),
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
  const outputPath = path.join(outputDir, 'jfDecisao.json');
  fs.writeFileSync(outputPath, JSON.stringify(todosImoveis, null, 2), 'utf-8');
  // Salvar no Firestore ao final (descomente se já houver integração)
  // await batchUpdateFromMap('jfDecisao', todosImoveis, 'linkReal');
}

// raspagemPorLinks().catch(console.error);
