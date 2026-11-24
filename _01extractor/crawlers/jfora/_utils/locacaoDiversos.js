import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { abrirBrowser } from '../../../services/puppeteerPool.js';
import { projetosLocacaoDiversos, getProjetoLocacaoDiversos } from './locacaoDiversosProjetos.js';
import { ordenarProjetos } from '../../../../crawler-order.cjs';
import { contarAntesDaLocacaoInvest, contarAntesDaLocacaoKenlo, contarAntesDaLocacaoMega, contarAntesDaLocacaoCouto } from './locacaoContagem.js';
import { sincronizarLocacao } from './locacaoSincronizacao.js';

export const SPREADSHEET_LOCACAO_DIVERSOS = JF_SPREADSHEET_ID;
const outputDir = fileURLToPath(new URL('../../../../crawler/', import.meta.url));

export async function loadProjetoDiversos(project) {
  const extractor = await import(`../${project.folder}/${project.file ?? 'extractor.js'}`);
  const parser = await import(`../${project.folder}/parser.js`);
  const sheets = await import(`../${project.folder}/sheets.js`);
  const functions = { extract: extractor[project.extractor], consolidate: parser.consolidateData, exportToSheets: sheets.exportToSheets };
  for (const [name,value] of Object.entries(functions)) if (typeof value !== 'function') throw new Error(`[${project.collection}] Modulo invalido: ${name}`);
  return functions;
}

export async function runProjetoDiversos(nome) {
  const project = getProjetoLocacaoDiversos(nome);
  const functions = await loadProjetoDiversos(project);
  const outputPath = path.join(outputDir, `${project.collection}Locacao.json`);
  const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath,'utf8')) : [];
  const existingMap = new Map(existing.map(item => [item.linkReal,item]));
  const codes = new Set(existing.map(item => String(item.codigoBase)));
  const options = { baseUrl: project.url, strict: true, preservarPreco: true };
  let browser;
  let imoveis;
  let totalEsperado;
  try {
    browser = await abrirBrowser();
    if (project.folder === 'invest') totalEsperado = await contarAntesDaLocacaoInvest(browser, { projeto: project.collection, url: project.url });
    if (project.folder === 'oliveira') totalEsperado = await contarAntesDaLocacaoKenlo(browser, { projeto: project.collection, url: project.url });
    if (project.folder === 'mega') totalEsperado = await contarAntesDaLocacaoMega(browser, { projeto: project.collection, url: project.url });
    if (project.folder === 'couto') totalEsperado = await contarAntesDaLocacaoCouto(browser, { projeto: project.collection, url: project.url });
    const result = project.adapter ? await functions.extract(browser) : project.browserOptions ? await functions.extract(browser,options) : await functions.extract(browser,new Set(),options);
    imoveis = result.imoveisRaspados;
    if (!Array.isArray(imoveis) || (!imoveis.length && totalEsperado !== 0)) throw new Error('Nenhum aluguel extraido. Dados anteriores preservados.');
    if (imoveis.some(item => !item.linkReal || !item.codigoBase || (item.preco !== null && !Number.isFinite(item.preco)))) throw new Error('Imovel sem link, codigo ou preco valido.');
    if (new Set(imoveis.map(item => item.linkReal)).size !== imoveis.length) throw new Error('Cards duplicados. Coleta nao sera publicada.');
  } finally { if (browser) await browser.close(); }
  await sincronizarLocacao({ imoveis, anteriores: existingMap, imobiliaria: project.collection, outputPath, exportToSheets: functions.exportToSheets, spreadsheetId: SPREADSHEET_LOCACAO_DIVERSOS, totalEsperado, vazioConfirmado: totalEsperado === 0 });
  console.log(`[${project.collection}Locacao] Concluido. imoveis salvos: ${imoveis.length}; JSON: ${outputPath}`);
}

export async function main(args=process.argv.slice(2)) {
  const check=args.includes('--check');
  const todos=args.includes('--todos');
  const names=args.filter(arg=>!arg.startsWith('--'));
  if(!names.length&&!check&&!todos)throw new Error('Informe um projeto, --todos ou --check.');
  const projects=ordenarProjetos(todos||(check&&!names.length)?projetosLocacaoDiversos:names.map(getProjetoLocacaoDiversos));
  const failures=[];
  for(const project of projects){
    try{
      if(check){await loadProjetoDiversos(project);console.log(`[OK] ${project.collection}: ${project.url}`);}
      else if(todos){
        const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[...process.execArgv,fileURLToPath(import.meta.url),project.folder],{stdio:'inherit'});child.once('error',reject);child.once('exit',resolve);});
        if(code!==0)throw new Error(`Execucao encerrada com codigo ${code}`);
      }else await runProjetoDiversos(project.folder);
    }catch(error){failures.push(project.collection);console.error(`[${project.collection}Locacao] ${error.message}`);}
  }
  if(failures.length)throw new Error(`Projetos com falha: ${failures.join(', ')}`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main().catch(error=>{console.error('[LocacaoDiversos]',error.message);process.exitCode=1;});}