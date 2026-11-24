import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { aguardarBuscaLocacaoRemax } from "./busca-locacao.js";

const url = "https://www.remax.com.br/listings?City=6579324&TransactionTypeUID=260";

test("reaplica aluguel pela interface somente quando site troca 260 por -1 na mesma cidade", async () => {
  const dom = new JSDOM('<button role="tab">Comprar</button><button role="tab">Alugar</button>');
  let destination = url.replace("260", "-1");
  let clicks = 0;
  dom.window.document.querySelectorAll("button")[1].addEventListener("click", () => { clicks++; destination = url; });
  const page = {
    url: () => destination,
    waitForSelector: async () => {},
    reload: async () => ({ ok: () => true }),
    waitForNetworkIdle: async () => {},
    waitForFunction: async (callback, _options, expected) => {
      const previous = globalThis.location;
      try {
        globalThis.location = { href: destination };
        if (!callback(expected)) throw new Error("Timeout");
      } finally {
        if (previous === undefined) delete globalThis.location;
        else globalThis.location = previous;
      }
    },
    evaluate: async callback => {
      const previous = globalThis.document;
      try { globalThis.document = dom.window.document; return callback(); }
      finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
      }
    },
  };
  try {
    await aguardarBuscaLocacaoRemax(page, url);
    assert.equal(clicks, 1);
    assert.equal(destination, url);
    await aguardarBuscaLocacaoRemax(page, url);
    assert.equal(clicks, 1);
    for (const invalid of [url.replace("260", "261"), url.replace("6579324", "6580792"), url.replace("www.remax.com.br", "outro.example")]) {
      destination = invalid;
      await assert.rejects(aguardarBuscaLocacaoRemax(page, url), /Timeout/);
      assert.equal(clicks, 1);
    }
  } finally { dom.window.close(); }
});

test("aba ausente ou filtro que permanece geral interrompe recuperacao sem novas tentativas", async () => {
  for (const clicked of [false, true]) {
    let attempts = 0;
    const page = {
      url: () => url.replace("260", "-1"),
      waitForFunction: async () => { throw new Error("Timeout"); },
      waitForSelector: async () => {},
      evaluate: async () => { attempts++; return clicked; },
      reload: async () => assert.fail("nao deve recarregar fora de aluguel"),
    };
    await assert.rejects(aguardarBuscaLocacaoRemax(page, url), clicked ? /Timeout/ : /Aba Alugar.*nao encontrada/);
    assert.equal(attempts, 1);
  }
});
