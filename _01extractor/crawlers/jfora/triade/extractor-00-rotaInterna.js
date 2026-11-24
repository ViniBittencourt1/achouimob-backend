// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos

import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { appendLegacyAddress, extractLegacyAddress } from '../_utils/enrichLegacyAddress.js';

const TIMEOUT_DETALHE_MS = 15000;

export async function enrichImoveisWithInternalData(browser, imoveis, { timeoutMs = TIMEOUT_DETALHE_MS } = {}) {
  console.log(`[RotaInterna] Extraindo area em ${imoveis.length} links...`);
  let pulados = 0;
  for (const imovel of imoveis) {
    if (!imovel.linkReal) continue;

    const page = await browser.newPage();
    try {
      // Sem user-agent proprio o Chrome headless se identifica como HeadlessChrome e o site responde 403.
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });
      const response = await page.goto(imovel.linkReal, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      if (response && !response.ok()) throw new Error(`HTTP ${response.status()}`);
      await new Promise(resolve => setTimeout(resolve, 500));

      const html = await page.content();
      const endereco = extractLegacyAddress(html);
      if (endereco) imovel.localizacao = appendLegacyAddress(imovel.localizacao, endereco);

      imovel.areaValor = extractAreaValor(html);
      imovel.linkCard = extractLinkCard(html);
    } catch (e) {
      // Link com falha fica apenas com os dados do card da listagem; nao bloqueia o restante da coleta.
      pulados++;
      console.warn(`[RotaInterna] Link pulado (${e.message}): ${imovel.linkReal}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  if (pulados) console.warn(`[RotaInterna] ${pulados} link(s) pulado(s) sem raspagem interna.`);
  return imoveis;
}
