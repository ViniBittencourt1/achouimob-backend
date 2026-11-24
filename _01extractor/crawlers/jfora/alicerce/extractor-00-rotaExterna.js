import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
export { linksBusca };

import puppeteer from 'puppeteer';
import { extractAlicerceData } from './extractor.js';
import { pathToFileURL } from 'node:url';

const linksBusca = ["https://alicerceimob.com.br/imoveis?order=recentes&negociacao=venda"];


import fs from 'fs';
import path from 'path';
import '../../../services/crawlerJson.js';

async function raspagemPorLinks() {
  const browser = await puppeteer.launch({ headless: false });
  let todosImoveis;
  try {
    todosImoveis = await extractAlicerceData(browser, linksBusca);
  } finally { await browser.close(); }
  // Exibir apenas o total de cards raspados
  console.log(`Total de cards raspados: ${todosImoveis.length}`);
  // Salvar no JSON ao final
  const outputDir = path.join(ISOLATED_BACKEND_ROOT, 'crawler');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'jfAlicerce.json');
  fs.writeFileSync(outputPath, JSON.stringify(todosImoveis, null, 2), 'utf-8');
}

// Executa a raspagem automaticamente se este arquivo for chamado diretamente
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  raspagemPorLinks().catch(error => {
    console.error('[Alicerce] Falha na coleta por faixas; base preservada:', error);
    process.exitCode = 1;
  });
}
