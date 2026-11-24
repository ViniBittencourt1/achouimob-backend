import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { coletarPaginasInvestVendas } from './paginacao-vendas.js';
// backend/src/crawlers/jfora/invest/extractor.js
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

// Importando os módulos extratores
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairros.js';
import { extractCidade } from './extractor-07-cidade.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';

import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';

import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';

const BASE_URL = "https://www.invest.com.br/ResultadoBusca.aspx";
const QTDE_ITENS = 135;
const CORRETOR = 'Invest';

export function validateInvestLocacaoPagination(href, baseUrl, expectedPage) {
  const url = new URL(href, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || url.searchParams.get('fin') !== '2' || Number(url.searchParams.get('pag')) !== expectedPage) throw new Error('Paginacao Invest fora da locacao.');
  return url.href;
}

async function scrapeListing(page, options = {}) {
  const imoveisRaspados = [];
  let pagina = 1;
  let posicao = 0;

  let erroTimeout = false;
  let tentativas = 0;
  let expected = null;
  let nextRentalUrl = null;
  while (true) {
    if (tentativas >= 50) {
      if (options.strict) throw new Error('Limite de paginas Invest atingido.');
      console.log('⚠️ Limite de 50 tentativas de "Carregar mais resultados" atingido. Pulando para a próxima função.');
      break;
    }
    let url = `${BASE_URL}?pag=${pagina}&qtdeitens=${QTDE_ITENS}&posicao=${posicao}&fin=1&tit=Imoveis-para-comprar-e-vender-em-juiz-de-foras`;
    if (options.baseUrl) {
      const rentalUrl = new URL(options.baseUrl);
      rentalUrl.searchParams.set('pag', String(pagina));
      rentalUrl.searchParams.set('qtdeitens', String(QTDE_ITENS));
      rentalUrl.searchParams.set('posicao', String(posicao));
      url = rentalUrl.href;
      if (nextRentalUrl) url = nextRentalUrl;
    }
    console.log(`\n📄 Raspando página ${pagina}: ${url}`);

    try {
      const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 180000 });
      if (options.strict && !response?.ok()) throw new Error(`HTTP ${response?.status()} na busca Invest.`);
      await page.waitForSelector(".property-box", { timeout: 15000 });
      if (options.strict) {
        if (new URL(page.url()).searchParams.get('fin') !== '2') throw new Error('Busca Invest retornou fora da locacao.');
        const total = await page.evaluate(() => {
          const match = document.body.innerText.match(/Loca[\u00e7c][\u00e3a]o\s*-\s*(\d+)\s+Im[o\u00f3]veis encontrados/i);
          return match ? Number(match[1]) : null;
        });
        if (expected === null) expected = total;
        if (!Number.isInteger(total) || total !== expected) throw new Error('Total Invest invalido ou alterado durante coleta.');
      }
    } catch (err) {
      if (options.strict) throw err;
      erroTimeout = true;
      break;
    }

    tentativas++;
    const cardsHTML = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".property-box")).map(c => c.outerHTML)
    );

    if (cardsHTML.length === 0) break;

    for (const cardHTML of cardsHTML) {
      const $ = cheerio.load(cardHTML);
      const cardNode = $('body').children().first();
      const imovel = {};

      // Orquestração
      imovel.localizacao = extractLocalizacao(cardNode);
      imovel.cidade = extractCidade(imovel.localizacao);
      imovel.linkReal = extractLinkReal(cardNode);
      imovel.bairro = extractBairro(cardNode, imovel.cidade, imovel.linkReal);
      imovel.codigoBase = extractCodigoBase(cardNode);
      imovel.preco = extractPreco(cardNode);
      imovel.tipoImovel = extractTipoImovel(cardNode);
      imovel.linkFoto = extractLinkFoto(cardNode);
      imovel.dormitorioValor = extractDormitorioValor(cardNode);
      imovel.banheiroValor = extractBanheiroValor(cardNode);
      let ambiente = extractAmbienteValor(cardNode);
      imovel.ambienteValor = (ambiente === undefined || ambiente === null || ambiente === "" ) ? 0 : ambiente;
      imovel.areaValor = extractAreaValor(cardNode);
      imovel.garagemValor = extractGaragemValor(cardNode);
      let elevador = extractElevadorValor(cardNode);
      imovel.elevadorValor = (elevador === undefined || elevador === null || elevador === "") ? 0 : elevador;
      imovel.linkCard = 0;
      imovel.corretor = CORRETOR;

      // Construção do Título
      const altText = cardNode.find("img[alt]").attr("alt") || "";
      let tituloFinal = altText.replace(/Codigo-\d+/gi, "").replace(/\bCodigo\b/gi, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
      const extras = [];
      if (imovel.dormitorioValor) extras.push(`${imovel.dormitorioValor} quarto(s)`);
      if (imovel.banheiroValor) extras.push(`${imovel.banheiroValor} banheiro(s)`);
      if (imovel.garagemValor) extras.push(`${imovel.garagemValor} vaga(s)`);
      if (imovel.areaValor) extras.push(`área ${imovel.areaValor} m²`);
      if (imovel.preco) extras.push(`Valor R$ ${imovel.preco}`);
      if (extras.length) tituloFinal += " — " + extras.join(", ") + ".";
      imovel.titulo = tituloFinal.trim();

      const agora = new Date().toISOString();
      imovel.dataInclusao = agora;
      imovel.atualizadoEm = agora;
      imovel.dataExclusao = "";

      imoveisRaspados.push(imovel);
    }

    if (options.strict && imoveisRaspados.length >= expected) break;
    if (options.strict) {
      const nextHref = await page.evaluate(next => Array.from(document.querySelectorAll('a[href]')).map(item => item.href).find(href => {
        try { return Number(new URL(href).searchParams.get('pag')) === next; } catch { return false; }
      }) || '', pagina + 1);
      if (!nextHref) throw new Error('Proxima pagina Invest ausente antes do total.');
      nextRentalUrl = validateInvestLocacaoPagination(nextHref, options.baseUrl, pagina + 1);
    }
    if (cardsHTML.length < QTDE_ITENS) break;
    pagina++;
    posicao += QTDE_ITENS;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (options.strict && (imoveisRaspados.length !== expected || new Set(imoveisRaspados.map(item => item.linkReal)).size !== imoveisRaspados.length)) throw new Error('Coleta Invest parcial ou duplicada.');
  if (erroTimeout) {
    // Cria um arquivo de controle para não rodar novamente
    fs.writeFileSync(path.join(ISOLATED_BACKEND_ROOT, 'invest.skip'), 'timeout');
    console.warn('⚠️ Timeout ao raspar listagem de imóveis. Continuando para a próxima etapa com os dados já coletados.');
    // Não lança erro, apenas retorna o que foi coletado
  }
  return imoveisRaspados;
}

export async function extractInvestData(browser, options = {}) {
  const page = await browser.newPage();
  let imoveisDaLista;
  try {
    const isRental = options.baseUrl && new URL(options.baseUrl).searchParams.get('fin') === '2';
    imoveisDaLista = isRental ? await scrapeListing(page, options) : await scrapeInvestVendas(page, options);
  }
  finally { await page.close(); }
  return { browser, imoveisRaspados: imoveisDaLista };
}

async function scrapeInvestVendas(page, options) {
  const cardsHTML = await coletarPaginasInvestVendas(page, { totalEsperado: options.totalEsperado });
  const imoveisRaspados = [];
  for (const cardHTML of cardsHTML) {
      const $ = cheerio.load(cardHTML);
      const cardNode = $('body').children().first();
      const imovel = {};

      // Orquestração
      imovel.localizacao = extractLocalizacao(cardNode);
      imovel.cidade = extractCidade(imovel.localizacao);
      imovel.linkReal = extractLinkReal(cardNode);
      imovel.bairro = extractBairro(cardNode, imovel.cidade, imovel.linkReal);
      imovel.codigoBase = extractCodigoBase(cardNode);
      imovel.preco = extractPreco(cardNode);
      imovel.tipoImovel = extractTipoImovel(cardNode);
      imovel.linkFoto = extractLinkFoto(cardNode);
      imovel.dormitorioValor = extractDormitorioValor(cardNode);
      imovel.banheiroValor = extractBanheiroValor(cardNode);
      let ambiente = extractAmbienteValor(cardNode);
      imovel.ambienteValor = (ambiente === undefined || ambiente === null || ambiente === "" ) ? 0 : ambiente;
      imovel.areaValor = extractAreaValor(cardNode);
      imovel.garagemValor = extractGaragemValor(cardNode);
      let elevador = extractElevadorValor(cardNode);
      imovel.elevadorValor = (elevador === undefined || elevador === null || elevador === "") ? 0 : elevador;
      imovel.linkCard = 0;
      imovel.corretor = CORRETOR;

      // Construção do Título
      const altText = cardNode.find("img[alt]").attr("alt") || "";
      let tituloFinal = altText.replace(/Codigo-\d+/gi, "").replace(/\bCodigo\b/gi, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
      const extras = [];
      if (imovel.dormitorioValor) extras.push(`${imovel.dormitorioValor} quarto(s)`);
      if (imovel.banheiroValor) extras.push(`${imovel.banheiroValor} banheiro(s)`);
      if (imovel.garagemValor) extras.push(`${imovel.garagemValor} vaga(s)`);
      if (imovel.areaValor) extras.push(`área ${imovel.areaValor} m²`);
      if (imovel.preco) extras.push(`Valor R$ ${imovel.preco}`);
      if (extras.length) tituloFinal += " — " + extras.join(", ") + ".";
      imovel.titulo = tituloFinal.trim();

      const agora = new Date().toISOString();
      imovel.dataInclusao = agora;
      imovel.atualizadoEm = agora;
      imovel.dataExclusao = "";

      imoveisRaspados.push(imovel);
    }
  if (new Set(imoveisRaspados.map(item => item.linkReal)).size !== imoveisRaspados.length || new Set(imoveisRaspados.map(item => item.codigoBase)).size !== imoveisRaspados.length) throw new Error('[Invest] Dados duplicados; base preservada.');
  return imoveisRaspados;
}
