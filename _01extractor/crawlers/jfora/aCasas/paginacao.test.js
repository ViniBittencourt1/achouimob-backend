import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

let enriched = 0;
mock.module('./extractor-00-rotaInterna.js', {
    namedExports: { enrichImoveisWithInternalData: async () => { enriched++; } },
});
const { extractACasasData } = await import('./extractor.js');

const baseUrl = 'https://acasas.com.br/pesquisa?transacao=Loca%C3%A7%C3%A3o';

function fixture({ missingNext = false, stale = false, total = 37 } = {}) {
    let index = 0;
    let closed = 0;
    let opened = 0;
    let navigated = 0;
    let clicks = 0;
    let dom;
    const render = () => {
        dom?.window.close();
        const start = index * 24;
        const cards = Array.from({ length: Math.min(24, total - start) }, (_, offset) =>
            `<div class="feat_property search-feat-card"><a href="/detalhes/${start + offset}">Apartamento</a></div>`).join('');
        dom = new JSDOM(`<span class="heading-color fw600">Página ${index + 1} de 2 · ${total} resultados</span>
            ${cards}<nav id="searchResultsPagination"><button class="results-pagination__page is-active" data-page="${index}"></button>
            ${missingNext ? '' : '<button data-page-nav="next"></button>'}</nav>`, { url: baseUrl });
    };
    const evaluate = (callback, ...args) => {
        const previous = globalThis.document;
        globalThis.document = dom.window.document;
        try { return callback(...args); }
        finally {
            if (previous === undefined) delete globalThis.document;
            else globalThis.document = previous;
        }
    };
    render();
    const page = {
        setUserAgent: async () => {},
        setExtraHTTPHeaders: async () => {},
        goto: async () => { navigated++; return { status: () => 200, ok: () => true }; },
        title: async () => 'Pesquisa',
        evaluate: async (callback, ...args) => evaluate(callback, ...args),
        $eval: async (selector, callback) => callback(dom.window.document.querySelector(selector)),
        $: async selector => dom.window.document.querySelector(selector) ? {
            click: async () => { clicks++; if (!stale) { index++; render(); } },
        } : null,
        waitForFunction: async (callback, _options, ...args) => {
            assert.ok(evaluate(callback, ...args), 'cards e pagina ativa devem mudar antes da extracao');
        },
        close: async () => { closed++; dom.window.close(); },
    };
    return {
        browser: { newPage: async () => { opened++; return page; } },
        state: () => ({ opened, navigated, clicks, closed }),
    };
}

test('locacao coleta 37 links unicos pela paginacao AJAX na mesma aba', async t => {
    t.mock.method(globalThis, 'setTimeout', callback => { callback(); });
    enriched = 0;
    const { browser, state } = fixture();
    const result = await extractACasasData(browser, new Set(), { baseUrl, strict: true });
    assert.equal(result.imoveisRaspados.length, 37);
    assert.equal(new Set(result.imoveisRaspados.map(item => item.linkReal)).size, 37);
    assert.deepEqual(state(), { opened: 1, navigated: 1, clicks: 1, closed: 1 });
    assert.equal(enriched, 1);
});

test('paginacao ausente ou sem troca de cards falha antes dos detalhes', async t => {
    t.mock.method(globalThis, 'setTimeout', callback => { callback(); });
    t.mock.method(console, 'error', () => {});
    for (const options of [{ missingNext: true }, { stale: true }]) {
        enriched = 0;
        const { browser, state } = fixture(options);
        await assert.rejects(extractACasasData(browser, new Set(), { baseUrl, strict: true }));
        assert.equal(state().closed, 1);
        assert.equal(enriched, 0);
    }
});
