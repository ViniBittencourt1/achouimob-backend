import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { contarAntesDasVendas, registrarTotaisVendas } from './_01extractor/crawlers/jfora/_utils/vendasContagem.js';
import { projetosContagemVendas, projetoContagemVendas } from './_01extractor/crawlers/jfora/_utils/vendasContagemProjetos.js';
import { ordenarProjetos } from './crawler-order.cjs';

export async function contarVendas(args = process.argv.slice(2)) {
  if (!args.length || args.some(arg => arg.startsWith('--') && !['--todos', '--dry-run', '--headed'].includes(arg))) throw new Error('Selecione projetos ou use --todos. --dry-run consulta sem gravar; --headed usa navegador visivel.');
  const names = args.filter(arg => !arg.startsWith('--'));
  if (args.includes('--todos') && names.length) throw new Error('Use --todos ou projetos selecionados, nao ambos.');
  const projects = ordenarProjetos(args.includes('--todos') ? projetosContagemVendas : [...new Map(names.map(name => { const project = projetoContagemVendas(name); return [project.collection, project]; })).values()]);
  if (!projects.length) throw new Error('Selecione ao menos um projeto.');
  const { abrirBrowser } = await import('./_01extractor/services/puppeteerPool.js');
  let browser;
  const results = [];
  try {
    browser = await abrirBrowser({ headlessOverride: args.includes('--headed') ? false : undefined });
    for (const project of projects) {
      try {
        const total = await contarAntesDasVendas(browser, { projeto: project.collection, salvar: false });
        results.push({ projeto: project.collection, total, status: 'ok' });
        console.log(`CONTAGEM_VENDAS=${JSON.stringify(results.at(-1))}`);
      } catch (error) {
        results.push({ projeto: project.collection, status: 'erro', mensagem: error.message });
        console.error(`CONTAGEM_VENDAS=${JSON.stringify(results.at(-1))}`);
      }
    }
  } finally { if (browser) await browser.close(); }
  if (!args.includes('--dry-run')) await registrarTotaisVendas(results.filter(item => item.status === 'ok'));
  const failed = results.filter(item => item.status === 'erro').length;
  console.log(`CONTAGEM_VENDAS_RESUMO=${JSON.stringify({ projetos: projects.length, sucesso: projects.length - failed, falhas: failed, gravado: !args.includes('--dry-run') })}`);
  if (failed) process.exitCode = 1;
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  contarVendas().catch(error => { console.error(`[CONTAGEM VENDAS] ${error.message}`); process.exitCode = 1; });
}