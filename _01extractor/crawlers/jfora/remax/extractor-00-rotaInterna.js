import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractTituloDetalhe } from './extractor-02-titulo.js';
import { extractLocalizacaoDetalhe } from './extractor-04-localizacao.js';
import { extractCidade } from './extractor-07-cidade.js';
import { extractBairro } from './extractor-06-bairros.js';
import { extractCorretor } from './extractor-16-corretor.js';
import nomesRemax from '../../../../formatarNomeRemax.cjs';
const { formatarNomeRemax } = nomesRemax;

export async function scrapeFranquias(browser, imoveis, anteriores = new Map()) {
  if (!imoveis?.length) return;
  const novos = [];
  for (const imovel of imoveis) {
    if (!imovel.linkReal) throw new Error('Imovel RE/MAX sem link para identificar franquia.');
    if (anteriores.has(imovel.linkReal)) imovel.corretor = formatarNomeRemax(anteriores.get(imovel.linkReal)?.corretor ?? '');
    else novos.push(imovel);
  }
  console.log(`[REMAX] Franquias reaproveitadas: ${imoveis.length - novos.length}; novos imoveis: ${novos.length}.`);
  if (!novos.length) return;
  const page = await browser.newPage();
  try {
    for (const [index, imovel] of novos.entries()) {
      if (!imovel.linkReal) throw new Error('Imovel RE/MAX sem link para identificar franquia.');
      const response = await page.goto(imovel.linkReal, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()} ao identificar franquia RE/MAX de ${imovel.linkReal}.`);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('a[href]')).some(anchor => {
        try {
          const url = new URL(anchor.getAttribute('href'), 'https://www.remax.com.br/');
          return /^(?:www\.)?remax\.com\.br$/i.test(url.hostname) && /\/escritorios\/.+\/\d+\/?$/i.test(url.pathname) && Boolean(anchor.textContent.trim() || anchor.getAttribute('title') || anchor.getAttribute('aria-label'));
        } catch { return false; }
      }), { polling: 'mutation', timeout: 30000 });
      const franquia = extractCorretor(await page.content());
      if (!franquia) throw new Error(`Franquia RE/MAX nao identificada: ${imovel.linkReal}; dados anteriores preservados.`);
      imovel.corretor = franquia;
      console.log(`[REMAX] Franquia ${index + 1}/${novos.length}: ${franquia}`);
    }
  } finally { await page.close(); }
}

export async function scrapeDetails(browser, imoveis) {
  if (!imoveis || imoveis.length === 0) return;
  console.log(`\n🔗 Extraindo dados detalhados para ${imoveis.length} imóveis...`);

  const detailPage = await browser.newPage();

  for (let i = 0; i < imoveis.length; i++) {
    const imovel = imoveis[i];
    if (!imovel.linkReal) continue;

    console.log(`\n🔹 Processando imóvel ${i + 1}/${imoveis.length}: ${imovel.linkReal}`);

    try {
      await detailPage.goto(imovel.linkReal, { waitUntil: "networkidle2", timeout: 45000 });

      imovel.linkFoto = await extractLinkFoto(detailPage);
      imovel.linkCard = 0;
      imovel.corretor = extractCorretor(await detailPage.content());

      const tituloDetalhe = await extractTituloDetalhe(detailPage);
      if (tituloDetalhe) imovel.titulo = tituloDetalhe;

      const localizacaoDetalhe = await extractLocalizacaoDetalhe(detailPage);
      if (localizacaoDetalhe) {
          imovel.localizacao = localizacaoDetalhe;
          imovel.cidade = extractCidade(localizacaoDetalhe);
          const { bairro } = extractBairro(localizacaoDetalhe);
          imovel.bairro = bairro;
      }

    } catch (err) {
      console.error(`   Falha ao processar ${imovel.linkReal}: ${err.message}`);
      imovel.corretor = imovel.corretor || "ERRO NA EXTRAÇÃO";
    }
  }

  await detailPage.close();
  console.log("🔹 Finalizada a extração de dados detalhados.");
}