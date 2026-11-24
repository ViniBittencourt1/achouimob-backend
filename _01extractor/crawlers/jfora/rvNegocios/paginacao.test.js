import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let enriched = 0;
mock.module('./extractor-00-rotaInterna.js', {
  namedExports: { enrichImoveisWithInternalData: async () => { enriched++; } },
});
const { extractRVNegociosData } = await import('./extractor.js');

function fixture({ failures = [], total = 2, announced = total, emptyLast = false, status = 200 } = {}) {
  const visits = [];
  let closed = 0;
  const browser = {
    newPage: async () => {
      let number;
      return {
        setUserAgent: async () => {},
        setExtraHTTPHeaders: async () => {},
        setViewport: async () => {},
        evaluateOnNewDocument: async () => {},
        waitForSelector: async () => {},
        goto: async url => {
          number = Number(new URL(url).searchParams.get('pag') || 1);
          visits.push(number);
          let responseStatus = status;
          if (number === 2 && failures.length) {
            const failure = failures.shift();
            if (failure instanceof Error) throw failure;
            responseStatus = failure;
          }
          return { ok: () => responseStatus === 200, status: () => responseStatus };
        },
        evaluate: async callback => {
          if (String(callback).includes('const cardsLayout')) {
            return { cardsLayout: 1, linksImovel: 1, totalPaginas: total || 1, total: announced };
          }
          if (String(callback).includes('document.body.innerText')) return total === 0;
          if (total === 0 || (emptyLast && number === 2)) return [];
          return [{
            linkReal: `https://www.rvnegociosimobiliariosjf.com.br/imovel/${number}/apartamento/${number}`,
            codigoBase: String(number),
            cardHtml: '<div class="imovelcard"></div>',
          }];
        },
        close: async () => { closed++; },
      };
    },
  };
  return { browser, visits, get closed() { return closed; } };
}
const timeout = () => Object.assign(new Error('Navigation timeout of 60000 ms exceeded'), { name: 'TimeoutError' });
function fastTimers(context) {
  context.mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  context.mock.method(console, 'error', () => {});
}

test('timeout intermediario retenta a mesma pagina e preserva paginas ja coletadas', async context => {
  fastTimers(context);
  enriched = 0;
  const f = fixture({ failures: [timeout(), timeout()] });
  const result = await extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 });
  assert.deepEqual(f.visits, [1, 2, 2, 2]);
  assert.equal(f.closed, 4);
  assert.equal(result.imoveisRaspados.length, 2);
  assert.equal(new Set(result.imoveisRaspados.map(item => item.linkReal)).size, 2);
  assert.equal(enriched, 1);
});

test('timeout persistente aborta apos tres tentativas sem devolver lista parcial', async context => {
  fastTimers(context);
  enriched = 0;
  const f = fixture({ failures: [timeout(), timeout(), timeout()] });
  await assert.rejects(extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 }), /Navigation timeout/);
  assert.deepEqual(f.visits, [1, 2, 2, 2]);
  assert.equal(f.closed, 4);
  assert.equal(enriched, 0);
});

test('erro nao transitorio nao e retentado nem convertido em sucesso parcial', async context => {
  fastTimers(context);
  const f = fixture({ failures: [new Error('Target closed')] });
  await assert.rejects(extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 }), /Target closed/);
  assert.deepEqual(f.visits, [1, 2]);
  assert.equal(f.closed, 2);
});

test('HTTP transitorio retenta a mesma pagina sem duplicar a coleta', async context => {
  fastTimers(context);
  for (const status of [500, 502, 503, 504, 520, 521, 522, 523, 524]) {
    enriched = 0;
    const f = fixture({ failures: [status, status] });
    const result = await extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 });
    assert.deepEqual(f.visits, [1, 2, 2, 2]);
    assert.equal(f.closed, 4);
    assert.equal(new Set(result.imoveisRaspados.map(item => item.linkReal)).size, 2);
    assert.equal(enriched, 1);
  }
});

test('HTTP 520 persistente e falhas mistas respeitam limite unico de tres tentativas', async context => {
  fastTimers(context);
  for (const failures of [[520, 520, 520], [timeout(), 520, timeout()], [520, timeout(), 520]]) {
    enriched = 0;
    const f = fixture({ failures });
    await assert.rejects(extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 }), /HTTP 520|Navigation timeout/);
    assert.deepEqual(f.visits, [1, 2, 2, 2]);
    assert.equal(f.closed, 4);
    assert.equal(enriched, 0);
  }
});

test('HTTP invalido e contagem alterada impedem a coleta sem exigir strict', async context => {
  fastTimers(context);
  for (const options of [{ status: 403 }, { status: 404 }, { status: 429 }, { announced: 3 }]) {
    const f = fixture(options);
    await assert.rejects(extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 }), /HTTP|Contagem mudou/);
    assert.deepEqual(f.visits, [1]);
    assert.equal(f.closed, 1);
  }
});

test('pagina vazia persistente informa contagem incompleta antes das rotas internas', async context => {
  fastTimers(context);
  enriched = 0;
  const f = fixture({ emptyLast: true });
  await assert.rejects(extractRVNegociosData(f.browser, new Set(), { totalEsperado: 2 }), /1\/2 links unicos/);
  assert.equal(enriched, 0);
  assert.equal(f.closed, 5);
});

test('zero confirmado continua permitido com precontagem zero', async context => {
  fastTimers(context);
  const f = fixture({ total: 0 });
  const result = await extractRVNegociosData(f.browser, new Set(), { totalEsperado: 0, strict: true });
  assert.deepEqual(result.imoveisRaspados, []);
  assert.equal(result.semImoveisConfirmado, true);
});
