import assert from "node:assert/strict";
import fs from "node:fs";
import { mock, test } from "node:test";

const calls = [];
let failure = null;
const records = [{ linkReal: "https://www.lidernegociosimob.com.br/imovel/1/casa-venda", codigoBase: "CA001", preco: 100000 }];
mock.module("node:fs", { defaultExport: { ...fs, existsSync: () => true } });
mock.module("../../../services/puppeteerPool.js", {
  namedExports: { abrirBrowser: async options => {
    calls.push(["browser", options]);
    return { close: async () => calls.push(["close"]) };
  } },
});
mock.module("../_utils/vendasContagem.js", {
  namedExports: { contarAntesDasVendas: async (_browser, options) => {
    calls.push(["count", options]);
    if (failure) throw failure;
    return 1;
  } },
});
mock.module("./extractor-locacao-imobbrasil.js", {
  namedExports: {
    USER_AGENT_LIDER: "test-agent",
    extractLiderVendasData: async (_browser, codes, options) => {
      calls.push(["extract", options, [...codes]]);
      return { imoveisRaspados: records, novosImoveis: [] };
    },
  },
});
mock.module("../../../services/crawlerJson.js", {
  namedExports: { getCollectionAsMap: async () => new Map(records.map(item => [item.linkReal, item])) },
});
mock.module("./parser.js", { namedExports: { consolidateData: items => new Map(items.map(item => [item.linkReal, item])) } });
mock.module("./sheets.js", { namedExports: { exportToSheets: async () => {} } });
mock.module("../_utils/vendasSincronizacao.js", {
  namedExports: { sincronizarVendas: async options => calls.push(["sync", options]) },
});
const { main } = await import("./index.js");

for (const headless of [undefined, "false", "true"]) {
  test(`Lider vendas usa contador e extrator atuais sempre headless com ambiente ${headless}`, async () => {
    const previous = process.env.CRAWLER_HEADLESS;
    try {
      if (headless === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = headless;
      calls.length = 0;
      await main();
      assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
      assert.deepEqual(calls.find(([name]) => name === "count")[1], { projeto: "jfLider", userAgent: "test-agent" });
      assert.deepEqual(calls.find(([name]) => name === "extract").slice(1), [{ totalEsperado: 1 }, ["CA001"]]);
      assert.equal(calls.find(([name]) => name === "sync")[1].totalEsperado, 1);
      assert.equal(calls.filter(([name]) => name === "close").length, 1);
      calls.length = 0;
      failure = Object.assign(new Error("HTTP 403"), { code: "LIDER_BLOCKED" });
      await assert.rejects(main(), /HTTP 403/);
      assert.deepEqual(calls.filter(([name]) => name === "browser"), [["browser", { headlessOverride: true }]]);
      assert.equal(calls.filter(([name]) => name === "close").length, 1);
      assert.ok(!calls.some(([name]) => ["extract", "sync"].includes(name)));
    } finally {
      failure = null;
      if (previous === undefined) delete process.env.CRAWLER_HEADLESS;
      else process.env.CRAWLER_HEADLESS = previous;
    }
  });
}
