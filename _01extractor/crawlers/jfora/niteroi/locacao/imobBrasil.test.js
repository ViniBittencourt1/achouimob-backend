import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCardImobBrasil, resolverLocalizacaoJnDoLink, resolverLocalizacaoJnDaDescricao, lerTotalLocacaoImobBrasil } from "../imobBrasil/extractor.js";
import { contar, coletar } from "./imobBrasil.js";

const project = { collection: "nitOceanica", displayName: "Oceanica", url: "https://www.oceanicaimobiliaria.com.br/imovel/locacao", layout: "imobbrasil" };
const imperial = { ...project, collection: "nitJn", layout: "imperial" };
const options = { negociacao: "aluguel" };
const card = (id = 1, negocio = "locacao") => `<div class="imovelcard"><a class="imovelcard__img" href="/imovel/${id}/apartamento-${negocio}-niteroi-rj-icarai" title="Apartamento para Loca&#231;&#227;o, em Niter&#243;i, bairro Icara&#237;"><img src="/foto.jpg"></a>
<h2 class="imovelcard__info__local">Icara&#237;, Niter&#243;i / RJ</h2><p class="imovelcard__info__ref"><strong>Ref: AP${id}</strong></p>
<p class="imovelcard__valor__valor">R$ 2.450,75</p><p>Condominio R$ 850,00; IPTU R$ 120,00</p>
<div class="imovelcard__info__feature"><i class="fa fa-bed"></i><b>2</b> Dormitorios</div>
<div class="imovelcard__info__feature"><i class="fa fa-arrows-h"></i><b>65,5</b> Area</div></div>`;
const parse = (html, config = project) => parseCardImobBrasil(html, config, new Date("2026-10-16T12:00:00Z"), options);

test("card moderno usa aluguel mensal sem somar encargos e retorna slugs do catalogo", () => {
  const record = parse(card());
  assert.equal(record.preco, 2450.75);
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.codigoBase, "AP1");
  assert.equal(record.dormitorioValor, 2);
  assert.equal(record.areaValor, 65.5);
  assert.equal(record.dataInclusao, "2026-10-16T12:00:00.000Z");
  assert.equal(record.linkFoto, "https://www.oceanicaimobiliaria.com.br/foto.jpg");
  assert.equal(Object.keys(record).length, 20);
});

test("layout imperial aceita aluguel e consulte sem usar encargos", () => {
  const html = `<div class="item-lista"><a class="img-item-lista" href="/imovel/2/casa-aluguel-niteroi-rj-centro" title="Casa para Aluguel, em Niter&#243;i, bairro Centro"><img data-src="/casa.jpg"></a>
<div class="desc-item-lista"><h3>Centro, Niter&#243;i / RJ</h3><small><strong>Ref: C2</strong></small><ul><li>Consulte</li><li>IPTU R$ 100,00</li></ul></div></div>`;
  const record = parse(html, imperial);
  assert.equal(record.preco, null);
  assert.equal(record.tipoImovel, "casa");
  assert.equal(record.bairro, "centro");
  assert.equal(record.codigoBase, "C2");
  assert.equal(record.linkFoto, "https://www.oceanicaimobiliaria.com.br/casa.jpg");
});

test("negociacao e origem sao restritas sem mudar padrao de vendas", () => {
  assert.throws(() => parse(card(1, "venda")), /fora da origem/);
  assert.throws(() => parse(card().replace('href="/imovel/', 'href="https://outro.example/imovel/')), /fora da origem/);
  assert.throws(() => parseCardImobBrasil(card(), project), /fora da origem/);
  assert.equal(parse(card(1, "aluguel")).preco, 2450.75);
  assert.throws(() => parse(card().replace("R$ 2.450,75", "")), /Preco ausente/);
  assert.throws(() => parse(card().replace("R$ 2.450,75", "indisponivel")), /Preco nao reconhecido/);
});

test("JN resolve bairro do link e da descricao de locacao sem ler central de negocios", () => {
  assert.deepEqual(resolverLocalizacaoJnDoLink("https://exemplo.com/imovel/1/apartamento-locacao-maria-paula", undefined, options), { cidade: "niteroi-rj", bairro: "maria-paula" });
  for (const [nome, slug] of [["Maria Paula", "maria-paula"], ["Rio do Ouro", "rio-do-ouro"]]) {
    const html = `<h3 id="desc_descricao">Descricao</h3><div class="item-imovel">Apartamento em ${nome} com 2 quartos, sala e cozinha.</div><div>Central de negocios em Centro.</div>`;
    assert.deepEqual(resolverLocalizacaoJnDaDescricao(html, options), { cidade: "niteroi-rj", bairro: slug });
  }
  assert.equal(resolverLocalizacaoJnDaDescricao('<div>Central de negocios em Centro.</div>', options), null);
});

function fakeBrowser(snapshots, { status = 200, redirected, detail = "" } = {}) {
  const routes = [];
  let closed = 0;
  return {
    routes, closed: () => closed,
    newPage: async () => {
      let destination;
      let snapshotIndex;
      return {
        setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {},
        goto: async url => { destination = url; snapshotIndex = routes.length; routes.push(url); return { ok: () => status === 200, status: () => status }; },
        url: () => redirected || destination,
        evaluate: async () => snapshots[Math.min(snapshotIndex, snapshots.length - 1)],
        content: async () => detail,
        close: async () => { closed++; },
      };
    },
  };
}
const snapshot = (cards, total = 2, pages = [`${project.url}/?pag=2`]) => ({ cards, labels: [`${total} im\u00f3veis encontrados. P\u00e1gina 1`], pages });
const anteriores = new Map([1, 2].map(id => [new URL(`/imovel/${id}/apartamento-locacao-niteroi-rj-icarai`, project.url).href, { areaValor: 80 }]));

test("contagem pura abre pag=1, exige rota de locacao e fecha pagina", async () => {
  const browser = fakeBrowser([snapshot([card()], 12)]);
  assert.equal(await contar(browser, project), 12);
  assert.equal(new URL(browser.routes[0]).searchParams.get("pag"), "1");
  assert.equal(browser.closed(), 1);
  for (const redirected of ["https://outro.example/imovel/locacao", project.url.replace("locacao", "venda")]) {
    const bad = fakeBrowser([snapshot([card()])], { redirected });
    await assert.rejects(contar(bad, project), /rota exclusiva/);
    assert.equal(bad.closed(), 1);
  }
});

test("Oceanica desativada em check de aluguel interrompe antes de ler contador", async () => {
  let closed = false;
  const page = {
    setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {},
    goto: async () => ({ ok: () => true }), url: () => project.url,
    evaluate: async callback => {
      assert.equal(callback.name, "lerSiteDesativadoDOM");
      return true;
    },
    close: async () => { closed = true; },
  };
  await assert.rejects(contar({ newPage: async () => page }, project, { check: true }),
    error => error.code === "IMOBBRASIL_UNAVAILABLE");
  assert.equal(closed, true);
});

test("contador nao aceita ausente, conflitante, HTTP bloqueado ou zero com cards", async () => {
  assert.equal(lerTotalLocacaoImobBrasil(["1.234 imoveis encontrados. Pagina 1"]), 1234);
  assert.throws(() => lerTotalLocacaoImobBrasil([]), /nao identificado/);
  assert.throws(() => lerTotalLocacaoImobBrasil(["1 imoveis encontrados", "2 imoveis encontrados"]), /conflitante/);
  await assert.rejects(contar(fakeBrowser([snapshot([card()], 0)]), project), /zero com cards/);
  const blocked = fakeBrowser([], { status: 403 });
  await assert.rejects(contar(blocked, project), /HTTP 403/);
  assert.equal(blocked.closed(), 1);
});

test("coleta completa pagina, deduplica e reaproveita anteriores sem consultar fichas", async () => {
  const browser = fakeBrowser([snapshot([card()]), snapshot([card(), card(2)])]);
  const records = await coletar(browser, project, { totalEsperado: 2, check: false, anteriores });
  assert.equal(records.length, 2);
  assert.deepEqual(browser.routes.map(url => new URL(url).searchParams.get("pag")), ["1", "2"]);
  assert.equal(browser.closed(), 1);
});

test("check pode limitar a primeira pagina e zero confirmado retorna vazio", async () => {
  const browser = fakeBrowser([snapshot([card()])]);
  assert.equal((await coletar(browser, project, { totalEsperado: 2, check: true, anteriores })).length, 1);
  assert.equal(browser.routes.length, 1);
  assert.deepEqual(await coletar(fakeBrowser([snapshot([], 0, [])]), project, { totalEsperado: 0 }), []);
});

test("coleta rejeita pagina repetida, parcial, contador alterado e card de venda", async () => {
  for (const snapshots of [
    [snapshot([card()], 2, [])], [snapshot([card()]), snapshot([card()])],
    [snapshot([card()], 3)], [snapshot([card(1, "venda")])],
  ]) await assert.rejects(coletar(fakeBrowser(snapshots), project, { totalEsperado: 2, anteriores }));
});

test("novos recebem detalhes sem substituir preco e JN reaproveita cidade anterior", async () => {
  const browser = fakeBrowser([snapshot([card()], 1)], { detail: "<div id='desc_tags'><p>Endere&#231;o: Rua Teste, 10</p></div>" });
  const [record] = await coletar(browser, project, { totalEsperado: 1 });
  assert.equal(browser.routes.length, 2);
  assert.equal(record.preco, 2450.75);
  assert.match(record.localizacao, /Rua Teste, 10/);
  const html = '<div class="item-lista"><a href="/imovel/3/apartamento-locacao" title="Apartamento para Aluguel"></a><div class="desc-item-lista"><h3></h3><ul><li>R$ 900,00</li></ul></div></div>';
  const old = new Map([[new URL('/imovel/3/apartamento-locacao', project.url).href, { cidade: "niteroi-rj", bairro: "maria-paula", areaValor: 50, localizacao: "Maria Paula" }]]);
  const reused = fakeBrowser([snapshot([html], 1)]);
  const [jn] = await coletar(reused, imperial, { totalEsperado: 1, anteriores: old });
  assert.equal(reused.routes.length, 1);
  assert.equal(jn.cidade, "niteroi-rj");
  assert.equal(jn.bairro, "maria-paula");
  assert.equal(jn.areaValor, 50);
});

test("aluguel repete uma vez detalhe com timeout sem ocultar falhas persistentes", async () => {
  for (const persistente of [false, true]) {
    const browser = fakeBrowser([snapshot([card()], 1)]);
    const originalNewPage = browser.newPage;
    let paginas = 0;
    let tentativas = 0;
    browser.newPage = async () => {
      const page = await originalNewPage();
      if (++paginas === 2) {
        const goto = page.goto;
        page.goto = async (...args) => {
          if (++tentativas === 1 || persistente) {
            const error = new Error("navegacao lenta");
            error.name = "TimeoutError";
            throw error;
          }
          return goto(...args);
        };
      }
      return page;
    };
    const coleta = coletar(browser, project, { totalEsperado: 1 });
    if (persistente) await assert.rejects(coleta, /navegacao lenta/);
    else assert.equal((await coleta).length, 1);
    assert.equal(tentativas, 2);
    assert.equal(browser.closed(), 2);
  }
});
