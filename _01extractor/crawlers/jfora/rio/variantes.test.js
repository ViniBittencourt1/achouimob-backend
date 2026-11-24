import test from "node:test";
import assert from "node:assert/strict";
import {
  projetoVariante, validarUrlVariante, extrairTotalVariante, lerPaginaVariante,
  parseCardVariante, precoVariante, contarVariante, coletarVariante,
} from "./variantes.js";

const project = {
  collection: "rioBaez", displayName: "Baez",
  urlVendas: "https://www.grupobaez.com.br/imoveis/a-venda",
  urlLocacao: "https://www.grupobaez.com.br/imoveis/para-alugar?ordernar-por=mais-recentes",
};
const configured = negociacao => projetoVariante(project, negociacao);
const cjProject = negociacao => projetoVariante({
  collection: "rioCj", displayName: "CJ Imóveis",
  urlVendas: "https://www.cjimoveisrj.com.br/imoveis/a-venda/todos/",
  urlLocacao: "https://www.cjimoveisrj.com.br/imoveis/para-alugar/todos/",
}, negociacao);
const cjCard = `<div class="inside-item">
  <figure><img data-src="/apartamento.jpg"><figcaption><a class="ab-t-l full z-index-200" href="/imovel/apartamento/AP0001-1?tracking=1#foto"></a></figcaption></figure>
  <a class="lk-infos"><div class="buttons-area"><span>AP0001</span></div>
  <div class="tit-area"><span class="tit tit-list">Apartamento para venda ou locação com 2 quartos</span><span class="tit-list">Barra da Tijuca, Rio de Janeiro</span></div>
  <span class="txt"><i class="fa-bed"></i>2</span><span class="txt"><i class="fa-bath"></i>3</span>
  <span class="txt"><i class="fa-car-side"></i>1</span><span class="txt"><i class="fa-expand"></i>99m²</span>
  <div class="price-area"><span class="price-txt">Venda e Locação</span><span class="price">R$ 840.000,00 / R$ 5.500,00</span></div>
  <span>IPTU R$ 100,00</span></a></div>`;
const card = (id = 1, purpose = "venda") => `<div class="thumbnail_one">
  <a class="property-card-link" href="/imovel/casa-id-${id}?tracking=1#foto"><img src="/foto.jpg"></a>
  <div class="property_card_heading"><span class="color-primary">Casa ${purpose === "venda" ? "à Venda" : "para Alugar"} com 2 quartos</span></div>
  <span class="property_card_address" title="Rua Um, 10 - Bangu, Rio de Janeiro-RJ"></span>
  <span class="transaction_value_from">De R$ 500.000</span>
  <div class="property_pricing">R$ ${purpose === "venda" ? "350.000" : "1.200"}</div><span>IPTU R$ 100</span>
  <div class="thum_data"><ul><li>2 Quartos</li><li>1 Banheiro</li><li>1 Vaga</li><li>100 m²</li></ul></div>
  <div class="property-card-footer"><a data-city="Rio de Janeiro/RJ" data-block="Bangu" data-property-type="Casa" data-code="${id}" data-transaction="${purpose === "venda" ? "sell" : "rent"}"></a></div>
</div>`;
const html = (total = 1, cards = card(), next = "") => `<h1>${total} Imóveis à Venda</h1>${cards}${next ? `<a href="${next}">Próxima</a>` : ""}`;
function browserFor(responses) {
  let closed = 0;
  let current;
  let index = 0;
  const browser = { newPage: async () => ({
    goto: async url => {
      current = { url, ...responses[Math.min(index++, responses.length - 1)] };
      if (current.error) throw current.error;
      return { status: () => current.status || 200, ok: () => !current.status || current.status === 200 };
    },
    url: () => current.redirect || current.url,
    content: async () => current.html,
    close: async () => { closed++; },
  }) };
  return { browser, closed: () => closed, calls: () => index };
}

test("contrato de 20 campos, catalogos, links canonicos e precos separados", () => {
  const item = parseCardVariante(card(), configured("venda"));
  assert.equal(Object.keys(item).length, 20);
  assert.equal(item.cidade, "rio-de-janeiro-rj");
  assert.equal(item.tipoImovel, "casa");
  assert.equal(item.preco, 350000);
  assert.equal(item.linkReal, "https://www.grupobaez.com.br/imovel/casa-id-1");
  assert.equal(item.linkCard, item.linkReal);
  assert.equal(item.dormitorioValor, 2);
  assert.equal(item.areaValor, 100);
  assert.equal(parseCardVariante(card(1, "locacao"), configured("locacao")).preco, 1200);
});

test("guardas de origem, finalidade, query e projeto", () => {
  assert.throws(() => projetoVariante({ ...project, collection: "outro" }, "venda"));
  assert.throws(() => projetoVariante(project, "temporada"));
  for (const url of ["https://evil.example/imoveis/a-venda", project.urlVendas + "?disponibilidade=para-alugar", project.urlVendas + "?pagina=2&pagina=3", project.urlLocacao]) {
    assert.throws(() => validarUrlVariante(url, configured("venda")));
  }
  assert.throws(() => parseCardVariante(card().replace('href="/imovel/', 'href="https://evil.example/imovel/'), configured("venda")));
  assert.throws(() => parseCardVariante(card(1, "locacao"), configured("venda")));
});

test("contadores ignoram contato CJ e rejeitam barreiras ou finalidade errada", () => {
  assert.equal(extrairTotalVariante(`<h1>Não encontrou o imóvel desejado?</h1><h1>157 imóveis à venda</h1>`, configured("venda")), 157);
  assert.equal(extrairTotalVariante("<h1>1.234 Imóveis para locação</h1>", configured("locacao")), 1234);
  assert.throws(() => extrairTotalVariante("<h1>Access denied</h1>", configured("venda")));
  assert.throws(() => extrairTotalVariante("<h1>2 Imóveis para Alugar</h1>", configured("venda")));
  assert.throws(() => extrairTotalVariante("<h1>2 Imóveis à Venda</h1><h1>3 Imóveis à Venda</h1>", configured("venda")));
});

test("precos CJ mistos, sem IPTU, sem inferencia ambigua", () => {
  assert.equal(precoVariante("R$ 840.000,00 / R$ 5.500,00", "Venda e Locação", "venda", project), 840000);
  assert.equal(precoVariante("R$ 840.000,00 / R$ 5.500,00", "Venda e Locação", "locacao", project), 5500);
  assert.equal(precoVariante("Sob consulta", "Locação", "locacao", project), null);
  assert.throws(() => precoVariante("R$ 5.500 / R$ 100", "Locação", "locacao", project));
  assert.throws(() => precoVariante("R$ 840.000", "Venda", "locacao", project));
});

test("CJ: contador paginado exige pagina consistente, mantendo contato fora da contagem", () => {
  const project = cjProject("venda");
  const page2 = "https://www.cjimoveisrj.com.br/imoveis/?disponibilidade=a-venda&categoria=todos&pagina=2";
  const content = `<h1>Não encontrou o imóvel desejado?</h1><h1>157 imóveis à venda <span>Página 2 / 14</span></h1>
    <div class="list-properties"><article class="item-grid">${cjCard}</article></div>`;
  assert.equal(lerPaginaVariante(content, project, page2).total, 157);
  assert.throws(() => lerPaginaVariante(content, project, project.url), /Pagina do contador diverge/);
  assert.throws(() => lerPaginaVariante(content.replace("2 / 14", "2 / 1"), project, page2), /Pagina do contador diverge/);
  assert.throws(() => lerPaginaVariante(content.replace("157 imóveis à venda", "157 imóveis para locação"), project, page2), /outra finalidade/);
});

test("CJ: ambos precos, metricas por icone e 20 campos sem encargos", () => {
  const sale = parseCardVariante(cjCard, cjProject("venda"));
  const rental = parseCardVariante(cjCard, cjProject("locacao"));
  assert.equal(Object.keys(sale).length, 20);
  assert.equal(Object.keys(rental).length, 20);
  assert.equal(sale.preco, 840000);
  assert.equal(rental.preco, 5500);
  assert.equal(sale.cidade, "rio-de-janeiro-rj");
  assert.equal(sale.bairro, "barra-da-tijuca");
  assert.equal(sale.tipoImovel, "apartamento");
  assert.equal(sale.linkReal, "https://www.cjimoveisrj.com.br/imovel/apartamento/AP0001-1");
  assert.deepEqual([sale.dormitorioValor, sale.banheiroValor, sale.garagemValor, sale.areaValor], [2, 3, 1, 99]);
});

test("CJ: localizacao ausente e preco zero continuam bloqueados com link explicito", () => {
  assert.throws(() => parseCardVariante(cjCard.replace('<span class="tit-list">Barra da Tijuca, Rio de Janeiro</span>', ""), cjProject("locacao")), /localizacao=false/);
  assert.throws(() => parseCardVariante(cjCard.replace("840.000,00", "0,00"), cjProject("venda")), /AP0001-1.*Preco invalido/);
});

test("CJ: coleta integral usa contador paginado e fecha pagina sem ignorar cards invalidos", async () => {
  const project = cjProject("venda");
  const first = `<h1>Não encontrou o imóvel desejado?</h1><h1>2 imóveis à venda</h1>
    <div class="list-properties"><article class="item-grid">${cjCard}</article></div>
    <a href="/imoveis/?disponibilidade=a-venda&categoria=todos&pagina=2">2</a>`;
  const second = `<h1>Não encontrou o imóvel desejado?</h1><h1>2 imóveis à venda <span>Página 2 / 2</span></h1>
    <div class="list-properties"><article class="item-grid">${cjCard.replaceAll("AP0001-1", "AP0002-2").replace("AP0001</span>", "AP0002</span>")}</article></div>`;
  const valid = browserFor([{ html: first }, { html: second }, { html: first }]);
  assert.equal((await coletarVariante(valid.browser, project, "venda", { totalEsperado: 2 })).length, 2);
  assert.equal(valid.closed(), 1);
  const invalid = browserFor([{ html: first }, { html: second.replace("840.000,00", "0,00") }]);
  await assert.rejects(coletarVariante(invalid.browser, project, "venda", { totalEsperado: 2 }), /AP0002-2.*Preco invalido/);
  assert.equal(invalid.closed(), 1);
});

test("cidade e tipo desconhecidos nao geram slugs inventados", () => {
  const item = parseCardVariante(card().replace("Rio de Janeiro/RJ", "Cidade inexistente/RJ").replace('data-property-type="Casa"', 'data-property-type="Tipo inexistente"'), configured("venda"));
  assert.equal(item.cidade, "");
  assert.equal(item.tipoImovel, "");
});

test("paginacao CJ mantem finalidade e origem; duplicatas responsivas ignoradas", () => {
  const cj = projetoVariante({
    collection: "rioCj", displayName: "CJ",
    urlVendas: "https://www.cjimoveisrj.com.br/imoveis/a-venda/todos/",
  }, "venda");
  const c = `<div class="inside-item"><figure><figcaption><a class="ab-t-l full" href="/imovel/apartamento/AP1-1"></a></figcaption></figure></div>`;
  const snapshot = lerPaginaVariante(`<h1>2 imóveis à venda</h1><div class="list-properties"><article class="item-grid">${c}</article><article class="item-list">${c}</article></div><a href="/imoveis/?disponibilidade=a-venda&categoria=todos&pagina=2">2</a>`, cj);
  assert.equal(snapshot.cards.length, 1);
  assert.match(snapshot.next, /disponibilidade=a-venda/);
  assert.throws(() => validarUrlVariante(snapshot.next.replace("a-venda", "para-alugar"), cj));
  assert.throws(() => lerPaginaVariante(html(2, card() + card()), configured("venda")));
});

test("coleta exata, total estavel e fechamento", async () => {
  const fake = browserFor([
    { html: html(2, card(1), "?pagina=2") },
    { html: html(2, card(2)) },
    { html: html(2, card(1), "?pagina=2") },
  ]);
  const items = await coletarVariante(fake.browser, project, "venda", { totalEsperado: 2 });
  assert.equal(items.length, 2);
  assert.equal(fake.closed(), 1);
});

test("contagem estavel e fechamento em total alterado", async () => {
  const stable = browserFor([{ html: html() }]);
  assert.equal(await contarVariante(stable.browser, project, "venda"), 1);
  assert.equal(stable.closed(), 1);
  const changed = browserFor([{ html: html() }, { html: html(2) }]);
  await assert.rejects(contarVariante(changed.browser, project, "venda"), /Total instavel/);
  assert.equal(changed.closed(), 1);
});

test("coleta rejeita falta de pagina, repeticao, redirecionamento e barreira", async () => {
  for (const responses of [
    [{ html: html(2) }],
    [{ html: html(2, card(), "?pagina=2") }, { html: html(2) }],
    [{ html: html(2), redirect: "https://evil.example/imoveis/a-venda" }],
    [{ html: "<h1>Access denied</h1>" }],
  ]) {
    const fake = browserFor(responses);
    await assert.rejects(coletarVariante(fake.browser, project, "venda", { totalEsperado: 2 }));
    assert.equal(fake.closed(), 1);
  }
});

test("primeira pagina explicita e total zero nao simulam coleta completa", async () => {
  const first = browserFor([{ html: html(2, card(), "?pagina=2") }]);
  assert.equal((await coletarVariante(first.browser, project, "venda", { totalEsperado: 2, primeiraPagina: true })).length, 1);
  const zero = browserFor([{ html: html(0, "") }]);
  assert.deepEqual(await coletarVariante(zero.browser, project, "venda", { totalEsperado: 0 }), []);
  await assert.rejects(coletarVariante(zero.browser, project, "venda", {}));
});

test("retries transitorios limitados, falhas permanentes sem retry", async () => {
  const retry = browserFor([{ status: 503 }, { html: html() }]);
  assert.equal(await contarVariante(retry.browser, project, "venda"), 1);
  assert.equal(retry.calls(), 3);
  const blocked = browserFor([{ status: 403 }]);
  await assert.rejects(contarVariante(blocked.browser, project, "venda"), /HTTP 403/);
  assert.equal(blocked.calls(), 1);
  assert.equal(blocked.closed(), 1);
  const bounded = browserFor([{ status: 429 }]);
  await assert.rejects(contarVariante(bounded.browser, project, "venda"), /HTTP 429/);
  assert.equal(bounded.calls(), 3);
  assert.equal(bounded.closed(), 1);
});
