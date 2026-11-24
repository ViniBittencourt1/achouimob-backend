import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SPREADSHEET_PREPARACAO_LOCACAO = JF_SPREADSHEET_ID;
export const projetosSemRotaLocacao = [
  { folder: 'gm', collection: 'jfGm', urlLocacao: null },
  { folder: 'kantto', collection: 'jfKantto', urlLocacao: null },
  { folder: 'souzaRocha', collection: 'jfSouzaRocha', urlLocacao: null },
];

export async function zerarDadosLocacao(collection, exportToSheets) {
  const outputPath = fileURLToPath(new URL(`../../../../crawler/${collection}Locacao.json`, import.meta.url));
  const { sincronizarLocacao } = await import('./locacaoSincronizacao.js');
  await sincronizarLocacao({ imoveis: [], imobiliaria: collection, outputPath, exportToSheets, spreadsheetId: SPREADSHEET_PREPARACAO_LOCACAO, vazioConfirmado: true, totalEsperado: 0 });
  console.log(`[${collection}Locacao] 0 imoveis; JSON vazio e lista do Sheets zerada.`);
  return 0;
}

export async function prepararLocacaoSemRota(nome) {
  const normalized = String(nome || '').toLowerCase();
  const project = projetosSemRotaLocacao.find(item => item.folder.toLowerCase() === normalized || item.collection.toLowerCase() === normalized);
  if (!project) throw new Error(`Projeto sem rota nao cadastrado: ${nome}`);
  if (project.urlLocacao) throw new Error('Rota de locacao cadastrada: implemente e valide a extracao antes de coletar.');
  const { exportToSheets } = await import(`../${project.folder}/sheets.js`);
  console.log(`[${project.collection}Locacao] Rota de aluguel ainda nao disponivel/configurada.`);
  const { registrarTotalLocacao } = await import('./locacaoContagem.js');
  await registrarTotalLocacao(project.collection, 0, SPREADSHEET_PREPARACAO_LOCACAO);
  return zerarDadosLocacao(project.collection, exportToSheets);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepararLocacaoSemRota(process.argv[2]).catch(error => { console.error('[PreparacaoLocacao]', error.message); process.exitCode = 1; });
}