import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('./extractor-00-rotaInterna.js', { namedExports: { enrichImoveisWithInternalData: async () => {} } });
const sheetRows = [];
mock.module('../../../services/googleSheets.js', { namedExports: {ensureSheet: async (_id, title) => title, readSheet: async () => [],
  clearSheet: async () => {}, writeHeader: async () => {},
  writeSheet: async (_id, _range, rows) => { sheetRows.push(rows); },
} });
const { extractRVNegociosData } = await import('./extractor.js');
const { exportToSheets } = await import('./sheets.js');

function fixture() {
  let number = 0;
  const record = { linkReal: 'https://www.rvnegociosimobiliariosjf.com.br/imovel/1234/apartamento/1234', codigoBase: '1234', cardHtml: '<div class="imovelcard"><a href="https://www.rvnegociosimobiliariosjf.com.br/imovel/1234/apartamento/1234">Apartamento</a></div>', atualizadoEm: '' };
  return {
    newPage: async () => {
      number++;
      const current = number;
      let evaluations = 0;
      return {
        setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {}, setViewport: async () => {}, evaluateOnNewDocument: async () => {},
        goto: async () => ({ ok: () => true }), waitForSelector: async () => {}, close: async () => {},
        evaluate: async () => {
          evaluations++;
          if (evaluations === 1) return current === 1 ? [{ ...record }] : [];
          return { cardsLayout: current === 1 ? 1 : 0, linksImovel: current === 1 ? 1 : 0 };
        },
      };
    },
  };
}

test('RV Negocios preenche atualizadoEm de todos os alugueis antes de retornar', async () => {
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const result = await extractRVNegociosData(fixture(), new Set(['1234']), { baseUrl: 'https://www.rvnegociosimobiliariosjf.com.br/imovel/locacao', strict: true });
    assert.equal(result.imoveisRaspados.length, 1);
    assert.match(result.imoveisRaspados[0].atualizadoEm, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    await exportToSheets(result.imoveisRaspados, { spreadsheetId: 'planilha-alugueis', sheetName: 'jfRVNegocios' });
    assert.equal(sheetRows.at(-1)[0].length, 21);
    assert.equal(sheetRows.at(-1)[0][19], result.imoveisRaspados[0].atualizadoEm);
  } finally { timer.mock.restore(); }
});

test('RV Negocios preenche atualizadoEm tambem nas vendas', async () => {
  const timer = mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  try {
    const result = await extractRVNegociosData(fixture(), new Set(['1234']), { strict: true });
    assert.match(result.imoveisRaspados[0].atualizadoEm, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  } finally { timer.mock.restore(); }
});