import assert from "node:assert/strict";
import { test } from "node:test";
import { extractLiderVendasData, lerListagemLiderVendas, parseDetalheLiderVenda, URL_VENDAS_LIDER,
  extractLiderLocacaoData, lerListagemLiderLocacao, parseDetalheLiderLocacao, URL_LOCACAO_LIDER } from "./extractor-vendas.js";

const detailUrl = "https://www.lidernegociosimob.com.br/imovel/apartamento-bom-pastor-im-00020";
function listagem({ total = 1, links = [detailUrl], next = "", heading = "Imoveis a venda" } = {}) {
  return `<h1>${heading}<span class="ct-lista-topo__total">${total} imoveis</span></h1>
    ${links.map(link => `<article class="ct-card"><a class="ct-card__titulo" href="${link}">Imovel</a></article>`).join("")}
    ${next ? `<a href="${next}">Proxima</a>` : ""}`;
}
function detalhe({ finalidade = "Venda", preco = 4190000, area = 115.38, codigo = "IM-00020", tipo = "Apartamento Garden" } = {}) {
  const data = {
    "@type": "RealEstateListing", url: detailUrl, name: "Apartamento Garden no Bom Pastor",
    offers: { price: preco, priceCurrency: "BRL" },
    about: { floorSize: { value: area }, address: { addressLocality: "Juiz de Fora", addressRegion: "MG" } },
    image: ["https://example.com/foto.jpg"],
  };
  return `<script type="application/ld+json">${JSON.stringify([data, { "@type": "BreadcrumbList" }])}</script>
    <span class="ct-ficha__selos">${finalidade}</span><span class="ct-ficha__tipo">${tipo}</span>
    <div class="ct-ficha__valor"><div><small>${finalidade}</small><strong>R$ ${preco == null ? "" : Number(preco).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div></div>
    <span class="ct-ficha__lugar">Bom Pastor · Juiz de Fora · MG · <span class="ct-ficha__codigo">Codigo ${codigo}</span></span>
    <div class="ct-resumo__item"><strong>4</strong><small>dormitorios</small></div>
    <div class="ct-resumo__item"><strong>6</strong><small>banheiros</small></div>
    <div class="ct-resumo__item"><strong>5</strong><small>vagas</small></div>`;
}

function browserFixture(pages) {
  let current;
  let closed = false;
  const visited = [];
  return {
    visited,
    get closed() { return closed; },
    newPage: async () => ({
      goto: async url => {
        current = url;
        visited.push(url);
        return { ok: () => pages[url] !== undefined, status: () => pages[url] === undefined ? 404 : 200 };
      },
      url: () => current,
      content: async () => pages[current],
      close: async () => { closed = true; },
    }),
  };
}

test("Lider mapeia os 20 campos do detalhe Larbase, preservando decimais e slugs", () => {
  const result = parseDetalheLiderVenda(detalhe(), detailUrl);
  assert.equal(Object.keys(result).length, 20);
  assert.equal(result.linkReal, detailUrl);
  assert.equal(result.codigoBase, "IM-00020");
  assert.equal(result.preco, 4190000);
  assert.equal(result.areaValor, 115.38);
  assert.equal(result.cidade, "juiz-de-fora-mg");
  assert.equal(result.bairro, "bom-pastor");
  assert.equal(result.tipoImovel, "apartamento");
  assert.equal(result.dormitorioValor, 4);
  assert.equal(result.banheiroValor, 6);
  assert.equal(result.garagemValor, 5);
});

test("Lider pesquisa tipos compostos no catalogo e retorna os slugs canonicos",()=>{
  assert.equal(parseDetalheLiderVenda(detalhe({tipo:"Apartamento Garden"}),detailUrl).tipoImovel,"apartamento");
  const terrenoUrl=detailUrl.replace("apartamento-bom-pastor-im-00020","terreno-urbano-salvaterra-im-00022");
  const terrenoHtml=detalhe({tipo:"Terreno Urbano",codigo:"IM-00022"}).replaceAll(detailUrl,terrenoUrl);
  assert.equal(parseDetalheLiderVenda(terrenoHtml,terrenoUrl).tipoImovel,"terreno");
});

test("Lider segue paginacao oficial antes de visitar detalhes e identifica novos por codigo", async () => {
  const secondUrl = detailUrl.replace("im-00020", "im-00021");
  const next = `${URL_VENDAS_LIDER}?pagina=2`;
  const browser = browserFixture({
    [URL_VENDAS_LIDER]: listagem({ total: 2, next }),
    [next]: listagem({ total: 2, links: [secondUrl] }),
    [detailUrl]: detalhe(),
    [secondUrl]: detalhe({ codigo: "IM-00021" }).replace(detailUrl, secondUrl),
  });
  const result = await extractLiderVendasData(browser, new Set(["IM-00020"]), { totalEsperado: 2 });
  assert.equal(result.imoveisRaspados.length, 2);
  assert.deepEqual(result.novosImoveis.map(item => item.codigoBase), ["IM-00021"]);
  assert.deepEqual(browser.visited, [URL_VENDAS_LIDER, next, detailUrl, secondUrl]);
  assert.ok(browser.closed);
});

test("Lider rejeita HTTP 404, contagem alterada, pagina ausente e duplicados sem retornar coleta parcial", async () => {
  const next = `${URL_VENDAS_LIDER}?pagina=2`;
  for (const pages of [
    {},
    { [URL_VENDAS_LIDER]: listagem({ total: 3 }) },
    { [URL_VENDAS_LIDER]: listagem({ total: 2 }) },
    { [URL_VENDAS_LIDER]: listagem({ total: 2, next }), [next]: listagem({ total: 2 }) },
    { [URL_VENDAS_LIDER]: listagem({ total: 2, links: [detailUrl, detailUrl] }) },
  ]) {
    const browser = browserFixture(pages);
    await assert.rejects(extractLiderVendasData(browser, new Set(), { totalEsperado: 2 }), /404|alterada|incompleta|repetido|duplicados/);
    assert.ok(browser.closed);
  }
});

test("Lider rejeita aluguel, links externos, detalhe divergente e preco invalido", () => {
  assert.throws(() => lerListagemLiderVendas(listagem({ heading: "Imoveis para alugar" }), URL_VENDAS_LIDER, 1), /fora de vendas/);
  assert.throws(() => lerListagemLiderVendas(listagem({ links: ["https://example.com/imovel/a"] }), URL_VENDAS_LIDER, 1), /Link de imovel invalido/);
  assert.throws(() => lerListagemLiderVendas(listagem(), `${URL_VENDAS_LIDER}?pagina=2`, 1), /redirecionada/);
  assert.throws(() => parseDetalheLiderVenda(detalhe({ finalidade: "Aluguel" }), detailUrl), /fora de vendas/);
  assert.throws(() => parseDetalheLiderVenda(detalhe().replace(detailUrl, `${detailUrl}-outro`), detailUrl), /fora de vendas/);
  assert.throws(() => parseDetalheLiderVenda(detalhe({ preco: null }), detailUrl), /preco/);
  assert.throws(() => parseDetalheLiderVenda(detalhe({ codigo: "" }), detailUrl), /sem codigo/);
});

test("Lider usa somente o preco explicito de venda em anuncio misto cujo JSON-LD informa aluguel", () => {
  const html = detalhe({ finalidade: "Aluguel", preco: 900 }).replace(
    '</strong></div></div>',
    '</strong></div><ul><li><span>Venda</span> R$ 225.000,50</li><li><span>Condominio</span> R$ 388</li></ul></div>',
  );
  assert.equal(parseDetalheLiderVenda(html, detailUrl).preco, 225000.5);
});

test("Lider aceita zero confirmado e exige precontagem antes de navegar", async () => {
  const browser = browserFixture({ [URL_VENDAS_LIDER]: listagem({ total: 0, links: [] }) });
  assert.deepEqual((await extractLiderVendasData(browser, new Set(), { totalEsperado: 0 })).imoveisRaspados, []);
  assert.ok(browser.closed);
  await assert.rejects(extractLiderVendasData(browser), /Precontagem/);
});

function listagemLocacao(options = {}) {
  return listagem({ ...options, heading: "Imoveis para alugar" });
}

function detalheLocacao(options = {}) {
  return detalhe({ ...options, finalidade: "Aluguel", preco: 900 })
    .replace('</strong></div></div>', '<em>/mes</em></strong></div><ul><li><span>Venda</span> R$ 225.000</li><li><span>Condominio</span> R$ 388</li><li><span>IPTU</span> R$ 80</li><li><span>Total por mes</span> R$ 1.368</li></ul></div>');
}

test("Lider aluguel usa preco rotulado Aluguel sem venda, condominio, IPTU ou total mensal", () => {
  const item = parseDetalheLiderLocacao(detalheLocacao(), detailUrl);
  assert.equal(item.preco, 900);
  assert.equal(item.linkReal, detailUrl);
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(Object.keys(item).length, 20);
  assert.throws(() => parseDetalheLiderLocacao(detalhe(), detailUrl), /fora de locacao/);
  assert.throws(() => lerListagemLiderLocacao(listagem(), URL_LOCACAO_LIDER, 1), /fora de locacao/);
  assert.throws(() => lerListagemLiderLocacao(listagemLocacao(), URL_VENDAS_LIDER, 1), /fora de locacao/);
});

test("Lider aluguel preserva centavos e caracteristicas com rotulos no singular", () => {
  const html = detalheLocacao().replace("900,00", "1.250,75")
    .replace("<strong>4</strong><small>dormitorios", "<strong>1</strong><small>dormitorio")
    .replace("<strong>6</strong><small>banheiros", "<strong>1</strong><small>banheiro")
    .replace("<strong>5</strong><small>vagas", "<strong>1</strong><small>vaga");
  const item = parseDetalheLiderLocacao(html, detailUrl);
  assert.equal(item.preco, 1250.75);
  assert.equal(item.dormitorioValor, 1);
  assert.equal(item.banheiroValor, 1);
  assert.equal(item.garagemValor, 1);
});

test("Lider preserva o parser legado de aluguel Larbase", async () => {
  const secondUrl = detailUrl.replace("im-00020", "im-00021");
  const next = `${URL_LOCACAO_LIDER}?pagina=2`;
  const pages = {
    [URL_LOCACAO_LIDER]: listagemLocacao({ total: 2, next }),
    [next]: listagemLocacao({ total: 2, links: [secondUrl] }),
    [detailUrl]: detalheLocacao(),
    [secondUrl]: detalheLocacao({ codigo: "IM-00021" }).replace(detailUrl, secondUrl),
  };
  for (const extract of [extractLiderLocacaoData]) {
    const browser = browserFixture(pages);
    const result = await extract(browser, new Set(["IM-00020"]), { totalEsperado: 2 });
    assert.equal(result.imoveisRaspados.length, 2);
    assert.equal(result.novosImoveis[0].codigoBase, "IM-00021");
    assert.equal(result.semImoveisConfirmado, false);
    assert.deepEqual(browser.visited, [URL_LOCACAO_LIDER, next, detailUrl, secondUrl]);
    assert.ok(browser.closed);
  }
});

test("Lider aluguel rejeita 404, pagina incompleta, total alterado e links repetidos", async () => {
  const next = `${URL_LOCACAO_LIDER}?pagina=2`;
  for (const pages of [
    {},
    { [URL_LOCACAO_LIDER]: listagemLocacao({ total: 3 }) },
    { [URL_LOCACAO_LIDER]: listagemLocacao({ total: 2 }) },
    { [URL_LOCACAO_LIDER]: listagemLocacao({ total: 2, next }), [next]: listagemLocacao({ total: 2 }) },
  ]) {
    const browser = browserFixture(pages);
    await assert.rejects(extractLiderLocacaoData(browser, new Set(), { totalEsperado: 2 }), /404|alterada|incompleta|repetido/);
    assert.ok(browser.closed);
  }
  const empty = browserFixture({ [URL_LOCACAO_LIDER]: listagemLocacao({ total: 0, links: [] }) });
  const result = await extractLiderLocacaoData(empty, new Set(), { totalEsperado: 0 });
  assert.deepEqual(result.imoveisRaspados, []);
  assert.equal(result.semImoveisConfirmado, true);
  await assert.rejects(extractLiderLocacaoData(empty), /Precontagem/);
});
