import assert from "node:assert/strict";
import { test } from "node:test";
import { parseImovelRealiza, isRealizaListingResponse } from "../nitRealiza/extractor.js";
import { getProjetoNiteroiLocacao } from "./projects.js";
import { contar, coletar, lerTotalAluguelRealiza } from "./realiza.js";

const project = getProjetoNiteroiLocacao("nitRealiza");
const item = (codigo = 1) => ({ codigo, finalidade: "Aluguel", titulo: "Apartamento em Icarai", url_amigavel: `apartamento-${codigo}`,
  valor: "R$ 1.800,50", valorcondominio: "R$ 900,00", tipo: "Apartamento", bairro: "Icarai", cidade: "Niteroi", estado: "RJ",
  numeroquartos: "2", numerobanhos: "1", areainterna: "75,50", tipomedida: "m\u00b2" });
const response = (finalidade = "aluguel") => ({
  url: () => new URL("/retornar-imoveis-disponiveis", project.url).href, ok: () => true,
  request: () => ({ method: () => "POST", postData: () => `finalidade=${finalidade}&numeropagina=1&numeroregistros=20` }),
});
function fake(batches, { url = project.url, ok = true, initial = response() } = {}) {
  let index = 0, closed = 0;
  initial.json = async () => batches[0];
  const page = {
    goto: async () => ({ ok: () => ok, status: () => 403 }), url: () => url,
    waitForResponse: async predicate => { assert.equal(predicate(initial), true); return initial; },
    evaluate: async (_fn, endpoint, body) => {
      if (_fn.name === "lerSiteDesativadoDOM") return false;
      assert.equal(endpoint, initial.url());
      const params = new URLSearchParams(body);
      assert.equal(params.get("finalidade"), "aluguel");
      assert.equal(params.get("numeropagina"), String(++index));
      return batches[index - 1];
    }, close: async () => { closed++; },
  };
  return { browser: { newPage: async () => page }, closed: () => closed };
}
const batch = (total, records) => ({ quantidade: total, lista: records });
const first = Array.from({ length: 20 }, (_, i) => item(i + 1));

test("parser exige aluguel e extrai preco sem condominio e slugs do catalogo", () => {
  const parse = value => parseImovelRealiza(value, new Date("2026-10-16"), { negociacao: "aluguel", projeto: project });
  const record = parse(item());
  assert.equal(record.preco, 1800.50);
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.areaValor, 75.5);
  assert.equal(record.corretor, project.displayName);
  assert.equal(Object.keys(record).length, 20);
  assert.equal(parse({ ...item(), valor: "Consulte" }).preco, null);
  assert.throws(() => parse({ ...item(), finalidade: "Venda" }), /fora de aluguel/);
  assert.throws(() => parseImovelRealiza(item()), /fora de venda/);
  assert.throws(() => parse({ ...item(), valor: "erro" }), /invalido/);
  assert.equal(isRealizaListingResponse(response(), 1, { negociacao: "aluguel", projeto: project }), true);
  assert.equal(isRealizaListingResponse(response("venda"), 1, { negociacao: "aluguel", projeto: project }), false);
});

test("contagem valida total inteiro e primeira pagina de alugueis e fecha navegador", async () => {
  assert.equal(lerTotalAluguelRealiza(batch(0, [])), 0);
  for (const data of [null, batch("21", first), batch(-1, []), batch(21, []), batch(1, [{ finalidade: "Venda" }])]) assert.throws(() => lerTotalAluguelRealiza(data));
  const f = fake([batch(21, first)]);
  assert.equal(await contar(f.browser, project), 21);
  assert.equal(f.closed(), 1);
  for (const options of [{ ok: false }, { url: project.url.replace("aluguel", "venda") }]) {
    const invalid = fake([batch(21, first)], options);
    await assert.rejects(contar(invalid.browser, project));
    assert.equal(invalid.closed(), 1);
  }
});

test("paginacao completa usa filtro aluguel; check limita primeira pagina e zero e valido", async () => {
  let f = fake([batch(21, first), batch(21, [item(21)])]);
  const records = await coletar(f.browser, project, { totalEsperado: 21, check: false, anteriores: new Map() });
  assert.equal(records.length, 21);
  assert.equal(new Set(records.map(x => x.linkReal)).size, 21);
  assert.equal(f.closed(), 1);
  f = fake([batch(21, first)]);
  assert.equal((await coletar(f.browser, project, { totalEsperado: 21, check: true })).length, 20);
  f = fake([batch(0, [])]);
  assert.deepEqual(await coletar(f.browser, project, { totalEsperado: 0 }), []);
});

test("contagem alterada, pagina incompleta e duplicacao impedem retorno parcial", async () => {
  for (const batches of [[batch(22, first)], [batch(21, first.slice(0, 19))], [batch(21, first), batch(21, [item(1)])]]) {
    const f = fake(batches);
    await assert.rejects(coletar(f.browser, project, { totalEsperado: 21 }));
    assert.equal(f.closed(), 1);
  }
  await assert.rejects(coletar(fake([]).browser, project, {}), /Precontagem/);
});
