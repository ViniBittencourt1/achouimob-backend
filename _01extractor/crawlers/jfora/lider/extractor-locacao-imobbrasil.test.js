import assert from "node:assert/strict";
import { test } from "node:test";
import { lerListagemLiderLocacao, extractLiderLocacaoData, lerListagemLiderVendas, extractLiderVendasData, URL_VENDAS_LIDER } from "./extractor-locacao-imobbrasil.js";
import { URL_LOCACAO_LIDER, extractLiderNovaData, extractLiderLocacao } from "./extractor-locacao.js";

const first = "https://www.lidernegociosimob.com.br/imovel/4494457/studio-locacao-juiz-de-fora-mg-sao-mateus";
const second = first.replace("4494457", "4494458");
const next = `${URL_LOCACAO_LIDER}/?pag=2`;
function card({ url = first, code = "ST097", price = "1.500,75", tag = "Loca\u00e7\u00e3o" } = {}) {
  return `<div class="imovelcard"><a href="${url}"><img src="https://example.com/foto.jpg"></a>
    <h2 class="imovelcard__info__tag">${tag}</h2><h2 class="imovelcard__info__local">S\u00e3o Mateus, Juiz de Fora / MG</h2>
    <p class="imovelcard__info__ref"><strong>Ref: ${code}</strong> - Studio</p>
    <p class="imovelcard__valor__valor"><span>R$</span> ${price}</p>
    <div class="imovelcard__info__feature"><p><b>1</b> Dormit\u00f3rio</p></div>
    <div class="imovelcard__info__feature"><p><b>1</b> Banheiro</p></div>
    <div class="imovelcard__info__feature"><p><b>1</b> Vaga</p></div>
    <div class="imovelcard__info__feature"><p><b>55,75 m\u00b2</b> \u00datil</p></div>
    <p>Condominio R$ 500,00 IPTU R$ 100,00</p></div>`;
}
function listing({ total = 2, cards = card(), nextUrl = "" } = {}) {
  return `<h1>Im\u00f3veis Dispon\u00edveis, Loca\u00e7\u00e3o</h1>
    <p class="topsearch__total"><strong>${total}</strong> im\u00f3veis encontrados. P\u00e1gina 1</p>
    ${cards}<div class="imovelcard"><a href="${URL_LOCACAO_LIDER}/?pag=1">1</a></div>
    ${nextUrl ? `<a href="${nextUrl}">Proxima</a>` : ""}`;
}
function browserFixture(pages) {
  let current;
  const visited = [];
  let closed = 0;
  return {
    visited,
    get closed() { return closed; },
    newPage: async () => ({
      setUserAgent: async value => assert.match(value, /Chrome/),
      goto: async url => {
        current = url;
        visited.push(url);
        const status = typeof pages[url] === "number" ? pages[url] : pages[url] === undefined ? 404 : 200;
        return { ok: () => status === 200, status: () => status };
      },
      url: () => current,
      content: async () => pages[current],
      close: async () => { closed++; },
    }),
  };
}

test("Lider ImobBrasil mapeia 20 campos sem taxas e ignora card de paginacao", () => {
  const { records } = lerListagemLiderLocacao(listing(), URL_LOCACAO_LIDER, 1);
  const item = records[0];
  assert.equal(records.length, 1);
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.preco, 1500.75);
  assert.equal(item.cidade, "juiz-de-fora-mg");
  assert.equal(item.bairro, "sao-mateus");
  assert.equal(item.tipoImovel, "loft");
  assert.equal(item.codigoBase, "ST097");
  assert.equal(item.areaValor, 55.75);
  assert.equal(item.dormitorioValor, 1);
  assert.equal(item.banheiroValor, 1);
  assert.equal(item.garagemValor, 1);
});

test("Lider preserva bairro publicado sem inventar cidade ausente", () => {
  const html = listing().replace("S\u00e3o Mateus, Juiz de Fora / MG", "S\u00e3o Mateus");
  const item = lerListagemLiderLocacao(html, URL_LOCACAO_LIDER, 1).records[0];
  assert.equal(item.cidade, "");
  assert.equal(item.bairro, "S\u00e3o Mateus");
});

test("Lider ImobBrasil valida finalidade, origem, pagina e preco sem fallback", () => {
  for (const url of [URL_LOCACAO_LIDER.replace("locacao", "venda"), `${URL_LOCACAO_LIDER}?finalidade=venda`, `${URL_LOCACAO_LIDER}?pag=2`]) {
    assert.throws(() => lerListagemLiderLocacao(listing(), url, 1), /fora de locacao|redirecionada/);
  }
  for (const invalid of [card({ tag: "Venda" }), card({ price: "" }), card({ url: "https://example.com/imovel/123/casa" })]) {
    assert.throws(() => lerListagemLiderLocacao(listing({ cards: invalid }), URL_LOCACAO_LIDER, 1), /locacao|preco valido/);
  }
});

test("Lider individual e lote seguem paginacao, deduplicam e conferem total unico", async () => {
  for (const extract of [extractLiderLocacaoData, extractLiderNovaData, async (browser, _codes, options) => ({
    imoveisRaspados: await extractLiderLocacao(browser, options),
  })]) {
    const browser = browserFixture({
      [URL_LOCACAO_LIDER]: listing({ cards: card() + card(), nextUrl: next }),
      [next]: listing({ cards: card() + card({ url: second, code: "ST098" }) }),
      [first]: '<div id="desc_tags"><p>Endere\u00e7o: Rua Exemplo, 10</p></div>',
      [second]: "<h1>Studio</h1>",
    });
    const result = await extract(browser, new Set(["ST097"]), { totalEsperado: 2 });
    assert.equal(result.imoveisRaspados.length, 2);
    assert.ok(result.imoveisRaspados[0].localizacao.endsWith("Rua Exemplo, 10"));
    assert.equal(result.imoveisRaspados[0].preco, 1500.75);
    if (result.novosImoveis) assert.deepEqual(result.novosImoveis.map(item => item.codigoBase), ["ST098"]);
    assert.deepEqual(browser.visited, [URL_LOCACAO_LIDER, next, first, second]);
    assert.equal(browser.closed, 1);
  }
});

test("Lider ImobBrasil nao retorna coleta parcial apos erro, duplicata divergente ou total alterado", async () => {
  for (const pages of [
    { [URL_LOCACAO_LIDER]: 403 },
    { [URL_LOCACAO_LIDER]: 404 },
    { [URL_LOCACAO_LIDER]: listing({ total: 3 }) },
    { [URL_LOCACAO_LIDER]: listing() },
    { [URL_LOCACAO_LIDER]: listing({ nextUrl: next }) },
    { [URL_LOCACAO_LIDER]: listing({ cards: card() + card({ price: "2.000" }) }) },
    { [URL_LOCACAO_LIDER]: listing({ cards: card() + card({ url: second }) }) },
    { [URL_LOCACAO_LIDER]: listing({ cards: card() + card({ url: second, code: "ST098" }) }), [first]: 403 },
  ]) {
    const browser = browserFixture(pages);
    await assert.rejects(extractLiderLocacaoData(browser, new Set(), { totalEsperado: 2 }), /403|404|alterada|incompleta|divergente|duplicado/);
    assert.equal(browser.closed, 1);
  }
});

test("Lider ImobBrasil aceita zero confirmado e exige precontagem", async () => {
  const browser = browserFixture({ [URL_LOCACAO_LIDER]: listing({ total: 0, cards: "" }) });
  const result = await extractLiderLocacaoData(browser, new Set(), { totalEsperado: 0 });
  assert.deepEqual(result.imoveisRaspados, []);
  assert.equal(result.semImoveisConfirmado, true);
  assert.equal(browser.closed, 1);
  await assert.rejects(extractLiderLocacaoData(browser), /Precontagem/);
});

function listingVenda(options = {}) {
  return listing(options).replaceAll("Loca\u00e7\u00e3o", "Venda").replaceAll("/imovel/locacao", "/imovel/venda");
}

test("Lider vendas ImobBrasil usa preco de venda, centavos e null somente sob consulta", () => {
  const item = lerListagemLiderVendas(listingVenda(), URL_VENDAS_LIDER, 1).records[0];
  assert.equal(item.preco, 1500.75);
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.codigoBase, "ST097");
  assert.equal(item.cidade, "juiz-de-fora-mg");
  for (const price of ["Consulte", "Sob consulta"]) {
    const html = listingVenda().replace("<span>R$</span> 1.500,75", price);
    assert.equal(lerListagemLiderVendas(html, URL_VENDAS_LIDER, 1).records[0].preco, null);
  }
  assert.throws(() => lerListagemLiderVendas(listing(), URL_VENDAS_LIDER, 1), /fora de venda/);
  assert.throws(() => lerListagemLiderVendas(listingVenda(), URL_LOCACAO_LIDER, 1), /fora de venda/);
  assert.throws(() => lerListagemLiderVendas(listingVenda({ cards: card({ price: "" }) }), URL_VENDAS_LIDER, 1), /preco valido/);
});

test("Lider vendas ImobBrasil pagina e deduplica sem alterar alugueis", async () => {
  const nextVenda = `${URL_VENDAS_LIDER}/?pag=2`;
  const browser = browserFixture({
    [URL_VENDAS_LIDER]: listingVenda({ cards: card() + card(), nextUrl: nextVenda }),
    [nextVenda]: listingVenda({ cards: card() + card({ url: second, code: "ST098" }) }),
    [first]: "<h1>Studio</h1>",
    [second]: "<h1>Studio</h1>",
  });
  const result = await extractLiderVendasData(browser, new Set(["ST097"]), { totalEsperado: 2 });
  assert.equal(result.imoveisRaspados.length, 2);
  assert.deepEqual(result.novosImoveis.map(item => item.codigoBase), ["ST098"]);
  assert.deepEqual(browser.visited, [URL_VENDAS_LIDER, nextVenda, first, second]);
  assert.equal(browser.closed, 1);
});

test("Lider vendas ImobBrasil preserva base em bloqueios, coleta parcial e total alterado", async () => {
  for (const pages of [
    { [URL_VENDAS_LIDER]: 403 },
    { [URL_VENDAS_LIDER]: 404 },
    { [URL_VENDAS_LIDER]: listingVenda({ total: 3 }) },
    { [URL_VENDAS_LIDER]: listingVenda() },
    { [URL_VENDAS_LIDER]: listingVenda({ cards: card() + card({ price: "2.000" }) }) },
  ]) {
    const browser = browserFixture(pages);
    await assert.rejects(extractLiderVendasData(browser, new Set(), { totalEsperado: 2 }), /403|404|alterada|incompleta|divergente/);
    assert.equal(browser.closed, 1);
  }
  const browser = browserFixture({ [URL_VENDAS_LIDER]: listingVenda({ total: 0, cards: "" }) });
  assert.deepEqual((await extractLiderVendasData(browser, new Set(), { totalEsperado: 0 })).imoveisRaspados, []);
  await assert.rejects(extractLiderVendasData(browser), /Precontagem/);
});

test("Lider vendas continua paginas cheias sem link seguinte ate atingir o total unico", async () => {
  const nextVenda = `${URL_VENDAS_LIDER}?pag=2`;
  const cards = Array.from({ length: 15 }, () => card()).join("");
  const browser = browserFixture({
    [URL_VENDAS_LIDER]: listingVenda({ cards }),
    [nextVenda]: listingVenda({ cards: card({ url: second, code: "ST098" }) }),
    [first]: "<h1>Studio</h1>",
    [second]: "<h1>Studio</h1>",
  });
  assert.equal((await extractLiderVendasData(browser, new Set(), { totalEsperado: 2 })).imoveisRaspados.length, 2);
  assert.deepEqual(browser.visited, [URL_VENDAS_LIDER, nextVenda, first, second]);
  const repeated = browserFixture({
    [URL_VENDAS_LIDER]: listingVenda({ cards }),
    [nextVenda]: listingVenda({ cards }),
  });
  await assert.rejects(extractLiderVendasData(repeated, new Set(), { totalEsperado: 2 }), /Paginacao inconsistente/);
  assert.equal(repeated.closed, 1);
});

test("Lider locacao recupera pagina omitida depois de cards repetidos entre paginas", async () => {
  const thirdPage = `${URL_LOCACAO_LIDER}/?pag=3`;
  const items = Array.from({ length: 30 }, (_, index) => ({
    url: first.replace("4494457", String(4494457 + index)), code: `ST${index}`,
  }));
  const browser = browserFixture({
    [URL_LOCACAO_LIDER]: listing({
      total: 30, cards: [...items.slice(0, 14), items[0]].map(card).join(""), nextUrl: next,
    }),
    [next]: listing({
      total: 30, cards: [...items.slice(14, 26), ...items.slice(0, 3)].map(card).join(""),
    }),
    [thirdPage]: listing({ total: 30, cards: items.slice(26).map(card).join("") }),
    ...Object.fromEntries(items.map(item => [item.url, "<h1>Studio</h1>"])),
  });
  const result = await extractLiderLocacaoData(browser, new Set(), { totalEsperado: 30 });
  assert.equal(result.imoveisRaspados.length, 30);
  assert.equal(new Set(result.imoveisRaspados.map(item => item.linkReal)).size, 30);
  assert.deepEqual(browser.visited.slice(0, 3), [URL_LOCACAO_LIDER, next, thirdPage]);
  assert.equal(browser.closed, 1);
});

test("Lider locacao interrompe paginas extras sem progresso e informa total incompleto", async () => {
  const extra = `${URL_LOCACAO_LIDER}?pag=2`;
  const cards = Array.from({ length: 15 }, () => card()).join("");
  const repeated = browserFixture({
    [URL_LOCACAO_LIDER]: listing({ cards }),
    [extra]: listing({ cards }),
  });
  await assert.rejects(extractLiderLocacaoData(repeated, new Set(), { totalEsperado: 2 }), /Paginacao inconsistente/);
  assert.equal(repeated.closed, 1);
  const incomplete = browserFixture({ [URL_LOCACAO_LIDER]: listing() });
  await assert.rejects(extractLiderLocacaoData(incomplete, new Set(), { totalEsperado: 2 }), /1\/2 links unicos/);
  assert.equal(incomplete.closed, 1);
});
