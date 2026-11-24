import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { test } from "node:test";
import { projetosNiteroiImobBrasil } from "./projects.js";
import { parseCardImobBrasil, lerListagemImobBrasil, extractImobBrasilSales, enriquecerNovosImobBrasil, resolverLocalizacaoJnDoLink, resolverLocalizacaoJnDaDescricao, formarLocalizacaoImobBrasil } from "./extractor.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { validarUrlContagemVendas, parseTotalVendas } from "../../_utils/vendasContagem.js";
import order from "../../../../../crawler-order.cjs";

const project = projetosNiteroiImobBrasil[0];

test("localizacao vazia usa os nomes principais de bairro, cidade e UF sem alterar endereco existente", () => {
  for (const [bairro, nome] of [["icarai", "Icara\u00ed"], ["maria-paula", "Maria Paula"], ["rio-do-ouro", "Rio do Ouro"]]) {
    assert.equal(formarLocalizacaoImobBrasil({ bairro, cidade: "niteroi-rj", localizacao: " " }), `${nome}, Niter\u00f3i - RJ`);
  }
  const localizacao = "Rua existente, 12 - Icarai";
  assert.equal(formarLocalizacaoImobBrasil({ bairro: "icarai", cidade: "niteroi-rj", localizacao }), localizacao);
  for (const record of [{}, { bairro: "icarai" }, { cidade: "niteroi-rj" }, { bairro: "inexistente", cidade: "niteroi-rj" }, { bairro: "icarai", cidade: "sao-goncalo-rj" }]) {
    assert.equal(formarLocalizacaoImobBrasil(record), "");
  }
});

for (const projectName of ["nitJn", "nitNiteroi"]) {
  for (const negociacao of ["venda", "aluguel"]) {
    test(`${projectName} ${negociacao} forma localizacao de registro reaproveitado sem visitar detalhes`, async () => {
      const record = { linkReal: "https://example.com/imovel/1", cidade: "niteroi-rj", bairro: "icarai", localizacao: "" };
      await enriquecerNovosImobBrasil({
        newPage: async () => { throw new Error("Nao deveria consultar detalhes"); },
      }, [record], new Map([[record.linkReal, { ...record }]]), { projectName, negociacao });
      assert.equal(record.localizacao, "Icara\u00ed, Niter\u00f3i - RJ");
    });
  }
}
test("nitJn recupera Maria Paula da descricao exclusiva do anuncio sem ler endereco da imobiliaria", () => {
  const html = '<h3 id="desc_descricao">Descricao</h3><div class="item-imovel">Ótimo apartamento em Maria Paula, com 2 quartos.</div>';
  assert.deepEqual(resolverLocalizacaoJnDaDescricao(html), { cidade: "niteroi-rj", bairro: "maria-paula" });
  assert.equal(resolverLocalizacaoJnDaDescricao('<div>Imobiliaria em Maria Paula</div>'), null);
  assert.equal(resolverLocalizacaoJnDaDescricao('<h3 id="desc_descricao">Descricao</h3><div class="item-imovel">Apartamento com dois quartos.</div><div>Central de negocios em Maria Paula</div>'), null);
});

for (const projectName of ["nitJn", "nitNiteroi"]) {
test(`${projectName} reconsulta registro ja cadastrado sem cidade e preenche cidade e bairro`, async () => {
  const record = { linkReal: "https://www.jncorretoresdeimoveis.com.br/imovel/4186618/apartamento-venda", cidade: "", bairro: "", areaValor: 0, localizacao: "" };
  let closed = false;
  const page = {
    setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {},
    goto: async () => ({ ok: () => true }), url: () => record.linkReal,
    content: async () => '<h3 id="desc_descricao">Descricao</h3><div class="item-imovel">Ótimo apartamento em Maria Paula, com 2 quartos.</div>',
    close: async () => { closed = true; },
  };
  await enriquecerNovosImobBrasil({ newPage: async () => page }, [record], new Map([[record.linkReal, { areaValor: 60 }]]), { projectName });
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "maria-paula");
  assert.equal(record.localizacao, "Maria Paula, Niter\u00f3i - RJ");
  assert.equal(record.areaValor, 60);
  assert.equal(closed, true);
});
}

test("nitNiteroi recupera Icarai somente da secao DESCRICAO do layout classico", () => {
  const html = '<div class="detimo_placas"><div class="titulo">DESCRIÇÃO</div></div><div class="fonte_padrao">PRONTO PARA MORAR!!!<br>SD40 Residencial em Icaraí. Você merece esse conforto</div><div class="fonte_padrao">Central de negócios em Centro.</div>';
  assert.deepEqual(resolverLocalizacaoJnDaDescricao(html), { cidade: "niteroi-rj", bairro: "icarai" });
  assert.equal(resolverLocalizacaoJnDaDescricao('<div class="detimo_placas"><div class="titulo">CENTRAL DE NEGÓCIOS</div></div><div class="fonte_padrao">Imobiliaria em Icaraí.</div>'), null);
  assert.equal(resolverLocalizacaoJnDaDescricao('<div class="detimo_placas"><div class="titulo">DESCRIÇÃO</div></div><div class="fonte_padrao">Apartamento com dois quartos.</div><div class="fonte_padrao">Imobiliaria em Icaraí.</div>'), null);
});
const card = (id = 1) => `<div class="imovelcard"><a class="imovelcard__img" href="/imovel/${id}/apartamento-venda-niteroi-rj-icarai" title="Apartamento para Venda, em Niterói, bairro Icaraí"><img src="/foto.jpg"></a>
<h2 class="imovelcard__info__local">Icaraí, Niterói / RJ</h2><p class="imovelcard__info__ref"><strong>Ref: AP${id}</strong> - Apartamento</p>
<p class="imovelcard__valor__valor">R$ 27.112.087,06</p>
<div class="imovelcard__info__feature"><i class="fa fa-bed"></i><p><b>2</b> Dormitórios</p></div>
<div class="imovelcard__info__feature"><i class="fa fa-arrows-h"></i><p><b>66,63 m²</b> Útil</p></div></div>`;

test("card sem localizacao forma bairro e cidade identificados no link apenas nos dois projetos", () => {
  const html = card().replace(/<h2[^>]*>.*?<\/h2>/, "");
  for (const collection of ["nitJn", "nitNiteroi"]) {
    const record = parseCardImobBrasil(html, { ...project, collection });
    assert.equal(record.localizacao, "Icara\u00ed, Niter\u00f3i - RJ");
  }
  assert.equal(parseCardImobBrasil(html, { ...project, collection: "nitOceanica" }).localizacao, "");
  assert.equal(parseCardImobBrasil(card(), { ...project, collection: "nitJn" }).localizacao, "Icara\u00ed, Niter\u00f3i / RJ");
});

test("painel associa scripts dos novos crawlers aos JSONs para transmissao", () => {
  const backendRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json")));
  const source = fs.readFileSync(new URL("../../_1Jf/jfora.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function getCollectionNameForScript("), source.indexOf("\nfunction loadConfig("));
  const context = vm.createContext({ fs, path, backendRoot, extractJforaScripts: () => Object.entries(pkg.scripts).map(([name, cmd]) => ({ name, cmd })) });
  vm.runInContext(fn, context);
  for (const item of projetosNiteroiImobBrasil) {
    assert.equal(vm.runInContext(`getCollectionNameForScript("${item.collection.toLowerCase()}")`, context), item.collection);
  }
});

test("cadastro dos cinco projetos integra scripts, ordem, contagem e rota exclusiva de venda", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../../../../../package.json", import.meta.url)));
  for (const item of projetosNiteroiImobBrasil) {
    assert.ok(pkg.scripts[item.collection.toLowerCase()].endsWith(`/niteroi/${item.folder}/index.js`));
    assert.ok(fs.existsSync(new URL(`../${item.folder}/index.js`, import.meta.url)));
    assert.ok(order.ORDEM_PROJETOS.includes(item.collection));
    const config = projetoContagemVendas(item.collection);
    validarUrlContagemVendas(config, item.url);
    assert.throws(() => validarUrlContagemVendas(config, item.url.replace("/venda", "/locacao")));
    assert.equal(parseTotalVendas(item.kind === "imobbrasilClassico" ? "Imóveis Encontrados: 1.340" : "1.340 imóveis encontrados. Página 1", config), 1340);
  }
});

test("card moderno preserva centavos e consulta catalogos de bairro, cidade e tipo", () => {
  const record = parseCardImobBrasil(card(), project);
  assert.equal(Object.keys(record).length, 20);
  assert.equal(record.bairro, "icarai");
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.preco, 27112087.06);
  assert.equal(record.dormitorioValor, 2);
  assert.equal(record.areaValor, 66.63);
  assert.equal(record.linkFoto, new URL("/foto.jpg", project.url).href);
  assert.throws(() => parseCardImobBrasil(card().replaceAll("-venda-", "-locacao-"), project), /fora da origem/);
  assert.throws(() => parseCardImobBrasil(card().replace("R$ 27.112.087,06", ""), project), /Preco ausente/);
});

test("aceita link terminado em venda sem permitir locacao ou outra origem", () => {
  const html = card().replaceAll("apartamento-venda-niteroi-rj-icarai", "apartamento-2-quartos-venda");
  const record = parseCardImobBrasil(html, projetosNiteroiImobBrasil[3]);
  assert.ok(record.linkReal.endsWith("/apartamento-2-quartos-venda"));
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "icarai");
  assert.throws(() => parseCardImobBrasil(html.replaceAll("-venda", "-locacao"), project), /fora da origem/);
  assert.throws(() => parseCardImobBrasil(html.replaceAll("-venda", "-vendavel"), project), /fora da origem/);
  assert.throws(() => parseCardImobBrasil(html.replaceAll('href="/imovel/', 'href="https://outro.example/imovel/'), project), /fora da origem/);
});

test("layout classico le quartos e banheiros e permite preco sob consulta", () => {
  const html = `<div class="imoveis_listar"><div class="imagem"><a href="/imovel/1/apartamento-venda-niteroi-rj-centro" title="Apartamento para Venda"><img src="/f.jpg"></a></div>
    <div class="conteudo1"><h2>Centro, Niterói / RJ</h2><span># Ref: AB1</span></div><div class="valor">Consulte</div>
    <div class="itens">Quartos<br><span>2</span></div><div class="itens">Banheiros<br><span>1</span></div>
    <div class="itens">Área Construído<br><span>28,52 m²</span></div></div>`;
  const record = parseCardImobBrasil(html, projetosNiteroiImobBrasil[3]);
  assert.equal(record.preco, null);
  assert.equal(record.dormitorioValor, 2);
  assert.equal(record.banheiroValor, 1);
  assert.equal(record.areaValor, 28.52);
  assert.equal(record.codigoBase, "AB1");
  const missingUf = parseCardImobBrasil(card().replace("Icaraí, Niterói / RJ", "Icaraí, Niterói /"), project);
  assert.equal(missingUf.cidade, "niteroi-rj");
  assert.equal(missingUf.bairro, "icarai");
});

test("leitura ignora card de paginacao e preserva apenas anuncios", () => {
  const dom = new JSDOM(`${card()}<div class="imovelcard"><a href="/imovel/venda/?pag=2">2</a></div>`, { url: project.url, runScripts: "outside-only" });
  try { assert.equal(dom.window.eval(`(${lerListagemImobBrasil.toString()})()`).cards.length, 1); }
  finally { dom.window.close(); }
});

test("localizacao apenas com bairro consulta titulo e link sem presumir cidade", () => {
  const html = card().replace("Icaraí, Niterói / RJ", "Ingá");
  assert.equal(parseCardImobBrasil(html, project).cidade, "niteroi-rj");
  const semCidade = html.replaceAll("apartamento-venda-niteroi-rj-icarai", "apartamento-venda-inga")
    .replace("Apartamento para Venda, em Niterói, bairro Icaraí", "Apartamento para Venda, em , bairro Ingá");
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const record = parseCardImobBrasil(semCidade, projetosNiteroiImobBrasil[1]);
    assert.equal(record.cidade, "");
    assert.equal(record.bairro, "Ingá");
    assert.equal(record.localizacao, "Ingá");
    assert.equal(record.preco, 27112087.06);
    assert.ok(warnings.some(message => message.includes("Cidade fora do catalogo")));
    assert.ok(warnings.some(message => message.includes("Bairro sem correspondencia")));
  } finally { console.warn = warn; }
});

test("suite nao substitui a quantidade de banheiros na listagem", () => {
  const html = card().replace("</div></div>", `</div>
    <div class="imovelcard__info__feature"><i class="fa fa-bath"></i>1 Suíte</div>
    <div class="imovelcard__info__feature"><i class="fa fa-shower"></i>3 Banheiros</div></div>`);
  assert.equal(parseCardImobBrasil(html, project).banheiroValor, 3);
});

test("nitJn identifica cidade pelo bairro no link e prioriza Niteroi antes de Sao Goncalo", () => {
  const catalogo = [
    { nome: "Centro", slug: "centro", cidade: "niteroi-rj" },
    { nome: "Centro", slug: "centro", cidade: "sao-goncalo-rj" },
    { nome: "Bairro São José", slug: "sao-jose", cidade: "sao-goncalo-rj" },
    { nome: "José", slug: "jose", cidade: "sao-goncalo-rj" },
    { nome: "Centro", slug: "centro", cidade: "marica-rj" },
  ];
  const link = slug => `https://www.jncorretoresdeimoveis.com.br/imovel/1/casa-venda-${slug}`;
  assert.deepEqual(resolverLocalizacaoJnDoLink(link("centro"), catalogo), { cidade: "niteroi-rj", bairro: "centro" });
  assert.deepEqual(resolverLocalizacaoJnDoLink(link("bairro-sao-jose"), catalogo), { cidade: "sao-goncalo-rj", bairro: "sao-jose" });
  assert.deepEqual(resolverLocalizacaoJnDoLink(link("sao-jose"), catalogo), { cidade: "sao-goncalo-rj", bairro: "sao-jose" });
  assert.equal(resolverLocalizacaoJnDoLink(link("desconhecido"), catalogo), null);
  assert.equal(resolverLocalizacaoJnDoLink(link("centrorama"), catalogo), null);
  assert.equal(resolverLocalizacaoJnDoLink(link("centro") + "-condominio", catalogo), null);
  assert.equal(resolverLocalizacaoJnDoLink(link("centro"), catalogo.filter(item => item.cidade === "marica-rj")), null);
  assert.equal(resolverLocalizacaoJnDoLink(link("centro"), [
    ...catalogo, { nome: "Centro", slug: "outro-centro", cidade: "niteroi-rj" },
  ]), null);
});

for (const jn of [projetosNiteroiImobBrasil[4], projetosNiteroiImobBrasil[3]]) {
test(`fallback de bairro no link usa catalogo real para ${jn.collection} e nao substitui cidade explicita`, () => {
  const semCidade = card().replace("Icaraí, Niterói / RJ", "")
    .replace("Apartamento para Venda, em Niterói, bairro Icaraí", "Apartamento para Venda")
    .replace("apartamento-venda-niteroi-rj-icarai", "apartamento-venda-centro");
  const record = parseCardImobBrasil(semCidade, jn);
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "centro");
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(parseCardImobBrasil(semCidade, project).cidade, "");
    const unknown = parseCardImobBrasil(semCidade.replace("-venda-centro", "-venda-bairro-inexistente-xyz"), jn);
    assert.equal(unknown.cidade, "");
    const semBairroNoLink = parseCardImobBrasil(semCidade.replace("-venda-centro", "-venda"), jn);
    assert.equal(semBairroNoLink.cidade, "");
    const explicit = parseCardImobBrasil(semCidade.replace('<h2 class="imovelcard__info__local"></h2>', '<h2 class="imovelcard__info__local">Centro, São Gonçalo / RJ</h2>'), jn);
    assert.equal(explicit.cidade, "sao-goncalo-rj");
    const cityInLink = parseCardImobBrasil(semCidade.replace("-venda-centro", "-venda-sao-goncalo-rj-centro"), jn);
    assert.equal(cityInLink.cidade, "sao-goncalo-rj");
  } finally { console.warn = warn; }
});
}

test("nitNiteroi aplica fallback no layout classico sem depender do titulo ou localizacao", () => {
  const html = `<div class="imoveis_listar"><div class="imagem">
    <a href="/imovel/1/apartamento-venda-centro" title="Apartamento para Venda"><img src="/foto.jpg"></a></div>
    <div class="conteudo1"><h2></h2><span>Ref: AP1</span></div><div class="valor">R$ 300.000,00</div></div>`;
  const record = parseCardImobBrasil(html, projetosNiteroiImobBrasil[3]);
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "centro");
  assert.equal(Object.keys(record).length, 20);
});

test("localizacao com apenas cidade nao e gravada como bairro", () => {
  const html = card().replace("Icaraí, Niterói / RJ", "Niterói / RJ")
    .replace(", bairro Icaraí", "").replace("-niteroi-rj-icarai", "-niteroi-rj");
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const record = parseCardImobBrasil(html, project);
    assert.equal(record.cidade, "niteroi-rj");
    assert.equal(record.bairro, "");
    assert.ok(warnings.some(message => message.includes("Bairro sem correspondencia")));
  } finally { console.warn = warn; }
});

function browserWith(snapshots, status = 200) {
  let destination;
  let closed = 0;
  const routes = [];
  const page = {
    setUserAgent: async () => {}, setExtraHTTPHeaders: async () => {},
    goto: async url => { destination = url; routes.push(url); return { ok: () => status === 200, status: () => status }; },
    url: () => destination,
    evaluate: async () => snapshots[Math.min(routes.length - 1, snapshots.length - 1)],
    close: async () => { closed++; },
  };
  return { browser: { newPage: async () => page }, routes, closed: () => closed };
}
const snapshot = (cards, total = 2, pages = [`${project.url}/?pag=2`]) => ({ cards, labels: [`${total} imóveis encontrados. Página 1`], pages });

test("paginacao une links duplicados, segue pag e so retorna coleta completa", async () => {
  const fake = browserWith([snapshot([card()]), snapshot([card(), card(2)])]);
  const records = await extractImobBrasilSales(fake.browser, project, { totalEsperado: 2 });
  assert.equal(records.length, 2);
  assert.deepEqual(fake.routes.map(url => new URL(url).searchParams.get("pag")), ["1", "2"]);
  assert.equal(fake.closed(), 1);
});

test("HTTP 520 e falhas de navegacao repetem a mesma pagina sem perder os imoveis anteriores", async () => {
  for (const falha of [520, 503, Object.assign(new Error("Navigation timeout"), { name: "TimeoutError" }), new Error("net::ERR_CONNECTION_RESET")]) {
    const fake = browserWith([snapshot([card()]), snapshot([card(2)])]);
    const page = await fake.browser.newPage();
    const goto = page.goto;
    const visits = [];
    let failed = false;
    page.goto = async url => {
      visits.push(new URL(url).searchParams.get("pag"));
      if (visits.at(-1) === "2" && !failed) {
        failed = true;
        if (falha instanceof Error) throw falha;
        return { ok: () => false, status: () => falha };
      }
      return goto(url);
    };
    const records = await extractImobBrasilSales(fake.browser, project, { totalEsperado: 2, retryDelayMs: 0 });
    assert.deepEqual(records.map(record => record.codigoBase), ["AP1", "AP2"]);
    assert.deepEqual(visits, ["1", "2", "2"]);
    assert.equal(fake.closed(), 1);
  }
});

test("HTTP 520 persistente limita tentativas e nao retorna coleta parcial", async () => {
  const fake = browserWith([snapshot([card()])]);
  const page = await fake.browser.newPage();
  const goto = page.goto;
  const visits = [];
  page.goto = async url => {
    visits.push(new URL(url).searchParams.get("pag"));
    return visits.at(-1) === "1" ? goto(url) : { ok: () => false, status: () => 520 };
  };
  await assert.rejects(extractImobBrasilSales(fake.browser, project, { totalEsperado: 2, retryDelayMs: 0 }),
    /HTTP 520 na pagina 2; base preservada/);
  assert.deepEqual(visits, ["1", "2", "2", "2"]);
  assert.equal(fake.closed(), 1);
});

test("retentativas aguardam 3 e 6 segundos e registram pagina e falha", async t => {
  const waits = [];
  const warnings = [];
  t.mock.method(globalThis, "setTimeout", (callback, delay) => { waits.push(delay); callback(); });
  t.mock.method(console, "warn", message => warnings.push(message));
  const fake = browserWith([], 520);
  await assert.rejects(extractImobBrasilSales(fake.browser, project, { totalEsperado: 2 }), /HTTP 520/);
  assert.deepEqual(waits, [3000, 6000]);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every(message => message.includes("pagina 1") && message.includes("HTTP 520")));
  assert.equal(fake.routes.length, 3);
  assert.equal(fake.closed(), 1);
});

test("HTTP permanente e erros nao transitorios nao sao repetidos", async () => {
  for (const status of [403, 429, 404]) {
    const fake = browserWith([], status);
    await assert.rejects(extractImobBrasilSales(fake.browser, project, { totalEsperado: 2, retryDelayMs: 0 }),
      error => error.message.includes(`HTTP ${status}`) &&
        (status === 404 || error.code === "IMOBBRASIL_BLOCKED"));
    assert.equal(fake.routes.length, 1);
    assert.equal(fake.closed(), 1);
  }
  const fake = browserWith([]);
  const page = await fake.browser.newPage();
  const failure = new Error("Falha nao transitoria");
  let visits = 0;
  page.goto = async () => { visits++; throw failure; };
  await assert.rejects(extractImobBrasilSales(fake.browser, project, { totalEsperado: 2, retryDelayMs: 0 }), error => error === failure);
  assert.equal(visits, 1);
  assert.equal(fake.closed(), 1);
});

test("bloqueia coleta parcial, pagina repetida, contador alterado e HTTP invalido", async () => {
  for (const snapshots of [
    [snapshot([card()], 2, [])],
    [snapshot([card()]), snapshot([card()])],
    [snapshot([card()], 3)],
    [snapshot([card(), card(2)], 1)],
  ]) {
    const fake = browserWith(snapshots);
    await assert.rejects(extractImobBrasilSales(fake.browser, project, { totalEsperado: 2 }), /base preservada/);
    assert.equal(fake.closed(), 1);
  }
  const blocked = browserWith([], 403);
  await assert.rejects(extractImobBrasilSales(blocked.browser, project, { totalEsperado: 2 }), { code: "IMOBBRASIL_BLOCKED" });
});

test("aceita vazio confirmado pelo contador e check nao exige todas as paginas", async () => {
  const empty = browserWith([snapshot([], 0, [])]);
  assert.deepEqual(await extractImobBrasilSales(empty.browser, project, { totalEsperado: 0 }), []);
  const check = browserWith([snapshot([card()], 56)]);
  assert.equal((await extractImobBrasilSales(check.browser, project, { totalEsperado: 56, somentePrimeiraPagina: true })).length, 1);
});

test("rota interna enriquece novos e fecha a pagina sem alterar preco", async () => {
  const record = parseCardImobBrasil(card(), project);
  const fake = browserWith([]);
  const page = await fake.browser.newPage();
  const agents = [];
  page.setUserAgent = async value => agents.push(value);
  page.content = async () => "<div id='desc_tags'><p>Endereço: Rua Teste, 10</p></div>";
  await enriquecerNovosImobBrasil(fake.browser, [record], new Map());
  assert.match(record.localizacao, /Rua Teste, 10/);
  assert.equal(record.preco, 27112087.06);
  assert.equal(fake.closed(), 1);
  assert.equal(agents.length, 1);
  assert.match(agents[0], /Chrome/);
});
