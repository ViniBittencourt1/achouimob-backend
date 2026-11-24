import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { COLUNAS_VENDAS, separarVendas, publicarRetiradosVendas } from './vendasSincronizacao.js';
import { JF_SPREADSHEET_ID } from './jfSheetsConfig.js';
import { NITEROI_SPREADSHEET_ID } from '../niteroi/projects.js';

export const ERRO_NO_SITE = 'Erro no site';
const crawlerDir = fileURLToPath(new URL('../../../../crawler/', import.meta.url));
let pending = Promise.resolve();

export function lerSiteDesativadoDOM() {
  const text = String(document.body?.innerText || document.body?.textContent || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  return /\beste site esta temporariamente desativado\b/i.test(text);
}

export async function retirarImoveisSiteDesativado(projeto, {
  spreadsheetId = projeto.startsWith('jf') ? JF_SPREADSHEET_ID : NITEROI_SPREADSHEET_ID,
  directory = crawlerDir, adapter, now = new Date(),
} = {}) {
  if (!/^(?:jf|nit)[A-Za-z0-9-]+$/.test(projeto) || /Locacao|Retirados|Historico/.test(projeto)) {
    throw new Error('Projeto invalido para retirada por site desativado.');
  }
  const writing = pending.catch(() => {}).then(async () => {
    const atualizadoEm = format(toZonedTime(now, 'America/Sao_Paulo'), 'dd/MM/yyyy HH:mm:ss');
    const historyPath = path.join(directory, `${projeto}RetiradosErroSite.json`);
    const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
    if (!Array.isArray(history)) throw new Error('Historico de erro no site invalido; retirada nao iniciada.');
    const destinations = [path.join(directory, `${projeto}.json`), path.join(directory, `${projeto}Locacao.json`)];
    const originals = destinations.map(file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
    const records = originals.flatMap((original, index) => {
      const data = original === null ? [] : JSON.parse(original);
      if (!Array.isArray(data)) throw new Error('JSON do projeto invalido; retirada nao iniciada.');
      if (data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error('Registro do projeto invalido; retirada nao iniciada.');
      }
      return data.map(item => ({ ...item, negociacao: index === 0 ? 'venda' : 'aluguel' }));
    });
    const removed = separarVendas(records.map(item => ({
      ...item, ativo: false, dataExclusao: now.toISOString(), dadosExtras: ERRO_NO_SITE,
    })), projeto).retirados;
    const ids = new Set(history.map(item => item.retiradaId));
    for (const item of removed) {
      if (!ids.has(item.retiradaId)) { history.push(item); ids.add(item.retiradaId); }
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    for (const [index, file] of destinations.entries()) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (current !== originals[index]) throw new Error('JSON mudou durante retirada; repita a coleta.');
    }
    // O historico local permite repetir o envio se o Sheets falhar; anuncios ficam fora da publicacao imediatamente.
    for (const file of destinations) fs.writeFileSync(file, '[]', 'utf8');
    const { CABECALHO_IMOVEIS_SHEETS, negociacaoDaLinha } = await import('./imoveisSheets.js');
    const api = adapter ?? await import('../../../services/googleSheets.js');
    const title = await api.ensureSheet(spreadsheetId, projeto, CABECALHO_IMOVEIS_SHEETS.length);
    const range = `'${title.replace(/'/g, "''")}'`;
    const rows = await api.readSheet(spreadsheetId, `${range}!A:U`, { valueRenderOption: 'UNFORMATTED_VALUE' });
    if (rows.length) {
      const expected = rows[0].length === 20 ? CABECALHO_IMOVEIS_SHEETS.slice(0, 20) : CABECALHO_IMOVEIS_SHEETS;
      if (JSON.stringify(rows[0]) !== JSON.stringify(expected)) throw new Error('Cabecalho do projeto incompativel; JSONs vazios e historico local preservado.');
    }
    const sheetsOnly = [];
    for (const row of rows.slice(1).filter(row => row[0] && row[20] !== ERRO_NO_SITE)) {
      const negociacao = negociacaoDaLinha(row);
      if (!history.some(item => item.linkReal === row[0] && item.negociacao === negociacao)) {
        sheetsOnly.push({
          ...Object.fromEntries(COLUNAS_VENDAS.map((column, index) => [column, row[index] ?? ''])),
          negociacao, ativo: false, dataExclusao: now.toISOString(), dadosExtras: ERRO_NO_SITE,
        });
      }
    }
    const additional = separarVendas(sheetsOnly, projeto).retirados;
    for (const item of additional) {
      if (!ids.has(item.retiradaId)) { history.push(item); removed.push(item); ids.add(item.retiradaId); }
    }
    if (additional.length) fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    await publicarRetiradosVendas(history, spreadsheetId, api);
    const warning = [...Array(20).fill(''), ERRO_NO_SITE];
    warning[19] = atualizadoEm;
    await api.clearSheet(spreadsheetId, title);
    await api.writeHeader(spreadsheetId, title, [...CABECALHO_IMOVEIS_SHEETS]);
    await api.writeSheet(spreadsheetId, `${range}!A2:U2`, [warning]);
    const confirmed = await api.readSheet(spreadsheetId, `${range}!A:U`, { valueRenderOption: 'UNFORMATTED_VALUE' });
    if (JSON.stringify(confirmed) !== JSON.stringify([[...CABECALHO_IMOVEIS_SHEETS], warning])) {
      throw new Error('Linha Erro no site nao confirmada no Sheets; JSONs ativos vazios, historico local preservado.');
    }
    console.warn(`[${projeto}] Site desativado: ${removed.length} imoveis retirados; JSONs de vendas e alugueis vazios; aviso gravado no Sheets.`);
    return { retirados: removed, atualizadoEm };
  });
  pending = writing;
  return writing;
}

export async function informarSiteDesativado(projeto, { salvar = true, spreadsheetId } = {}) {
  if (salvar) await retirarImoveisSiteDesativado(projeto, { spreadsheetId });
  const error = new Error(`[${projeto}] Site temporariamente desativado; ${salvar ? 'imoveis retirados e aviso Erro no site gravado' : 'verificacao sem alterar dados'}.`);
  error.code = 'IMOBBRASIL_UNAVAILABLE';
  throw error;
}

export async function verificarSiteDesativado(page, projeto, options) {
  if (await page.evaluate(lerSiteDesativadoDOM) === true) await informarSiteDesativado(projeto, options);
}
