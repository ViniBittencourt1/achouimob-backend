import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { listaStartPronta } from './extractor.js';

test('Start nao interpreta mensagem de outro componente ou contador terminado em zero como lista vazia', () => {
    for (const html of [
        '<h4 class="top15 left15">10 imoveis encontrados</h4>',
        '<h4 class="top15 left15">2 imoveis encontrados</h4><p>Nenhum resultado</p>',
        '<div class="listing-item"></div><p>Nenhum imovel</p>',
        '<h4 class="top15 left15">0 imoveis encontrados</h4>',
    ]) {
        const dom = new JSDOM(html);
        const previous = globalThis.document;
        globalThis.document = dom.window.document;
        try {
            assert.equal(listaStartPronta(2), false);
        } finally {
            if (previous === undefined) delete globalThis.document;
            else globalThis.document = previous;
            dom.window.close();
        }
    }
});

test('Start aguarda link do card e aceita zero explicito somente sem precontagem positiva', () => {
    const dom = new JSDOM('<h4 class="top15 left15">0 imoveis encontrados</h4>');
    const previous = globalThis.document;
    globalThis.document = dom.window.document;
    try {
        assert.equal(listaStartPronta(), true);
        assert.equal(listaStartPronta(2), false);
        dom.window.document.body.innerHTML += '<div class="listing-item"><a href="/imovel/123">Aluguel</a></div>';
        assert.equal(listaStartPronta(2), true);
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        dom.window.close();
    }
});
