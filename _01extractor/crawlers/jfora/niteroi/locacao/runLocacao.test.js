import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ABA_RETIRADOS_LOCACAO_NITEROI, carregarPlataforma, runNiteroiLocacao } from "./runLocacao.js";
import { projetosNiteroiLocacao } from "./projects.js";
import { contar, coletarCardsPorPagina, mapearCardKenlo } from "./kenlo.js";

function deps(records, total = records.length) {
  const calls = { registrar: [], sincronizar: [] };
  const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nitloc-")), "nitTetoLocacao.json");
  return {
    calls,
    deps: {
      outputPath,
      abrirBrowser: async () => ({ close: async () => {} }),
      plataforma: { contar: async () => total, coletar: async () => records },
      registrarTotalLocacao: async (...args) => calls.registrar.push(args),
      sincronizarLocacao: async args => { calls.sincronizar.push(args); return { ativos: args.imoveis, retirados: [] }; },
    },
  };
}

test("aluguel de Niteroi grava na planilha de Niteroi com negociacao aluguel", async () => {
  const { calls, deps: injected } = deps([{ linkReal: "https://x/imovel/1", preco: 1500 }]);
  await runNiteroiLocacao("nitTeto", { check: false, deps: injected });
  assert.deepEqual(calls.registrar, [["nitTeto", 1, "10S4YOgBUBB89POe4QKUKw08ZHgQ-htmrobdkZddiMf8"]]);
  const args = calls.sincronizar[0];
  assert.equal(args.spreadsheetId, "10S4YOgBUBB89POe4QKUKw08ZHgQ-htmrobdkZddiMf8");
  assert.equal(args.abaRetirados, ABA_RETIRADOS_LOCACAO_NITEROI);
  assert.deepEqual(args.exportOptions, { negociacao: "aluguel" });
  assert.equal(args.totalEsperado, 1);
  assert.ok(args.outputPath.endsWith("nitTetoLocacao.json"));
});

test("check nao registra nem sincroniza", async () => {
  const { calls, deps: injected } = deps([{ linkReal: "https://x/imovel/1" }], 5);
  const records = await runNiteroiLocacao("nitTeto", { check: true, deps: injected });
  assert.equal(records.length, 1);
  assert.equal(calls.registrar.length, 0);
  assert.equal(calls.sincronizar.length, 0);
});

test("coleta incompleta preserva a base", async () => {
  const { calls, deps: injected } = deps([{ linkReal: "https://x/imovel/1" }], 2);
  await assert.rejects(runNiteroiLocacao("nitTeto", { check: false, deps: injected }), /incompleta/);
  assert.equal(calls.sincronizar.length, 0);
});

test("Kenlo reconta e reinicia apos mudanca de total sem reutilizar coleta parcial", async () => {
  for (const name of ["nitFrancisco", "nitGrupo"]) {
    const { calls, deps: injected } = deps([]);
    const totals = [3, 2];
    let tentativas = 0;
    let closed = 0;
    injected.abrirBrowser = async () => ({ close: async () => { closed++; } });
    injected.plataforma.contar = async () => totals.shift();
    injected.plataforma.coletar = async (_browser, _project, { totalEsperado }) => {
      tentativas++;
      if (tentativas === 1) throw Object.assign(new Error("Total mudou"), { code: "KENLO_TOTAL_ALTERADO" });
      assert.equal(totalEsperado, 2);
      return [{ linkReal: "https://x/novo/1" }, { linkReal: "https://x/novo/2" }];
    };
    await runNiteroiLocacao(name, { check: false, deps: injected });
    assert.equal(tentativas, 2);
    assert.deepEqual(calls.registrar.map(call => call[1]), [3, 2]);
    assert.equal(calls.sincronizar.length, 1);
    assert.equal(calls.sincronizar[0].totalEsperado, 2);
    assert.equal(closed, 1);
  }
});

test("Kenlo limita instabilidade a tres tentativas e nao repete outros erros", async () => {
  for (const changed of [true, false]) {
    const { calls, deps: injected } = deps([]);
    let tentativas = 0;
    let closed = false;
    injected.abrirBrowser = async () => ({ close: async () => { closed = true; } });
    injected.plataforma.coletar = async () => {
      tentativas++;
      throw Object.assign(new Error("Coleta falhou"), changed ? { code: "KENLO_TOTAL_ALTERADO" } : {});
    };
    await assert.rejects(runNiteroiLocacao("nitFrancisco", { check: false, deps: injected }), /Coleta falhou/);
    assert.equal(tentativas, changed ? 3 : 1);
    assert.equal(calls.sincronizar.length, 0);
    assert.equal(closed, true);
  }
});

test("indisponiveis informados pelo coletor saem do total exigido", async () => {
  const records = Object.assign([{ linkReal: "https://x/imovel/1" }], { excluidos: 2 });
  const { calls, deps: injected } = deps(records, 3);
  await runNiteroiLocacao("nitTeto", { check: false, deps: injected });
  assert.deepEqual(calls.registrar, [["nitTeto", 3, "10S4YOgBUBB89POe4QKUKw08ZHgQ-htmrobdkZddiMf8"]]);
  assert.equal(calls.sincronizar[0].totalEsperado, 1);
  assert.equal(calls.sincronizar[0].imoveis.length, 1);
});

test("lista contem os 28 projetos com URLs de aluguel", () => {
  assert.equal(projetosNiteroiLocacao.length, 28);
  assert.equal(new Set(projetosNiteroiLocacao.map(item => item.collection)).size, 28);
  for (const project of projetosNiteroiLocacao.filter(item => item.kind === "kenlo")) {
    assert.equal(new URL(project.url).pathname, "/imoveis/para-alugar");
    assert.equal(new URL(project.url).search, "");
  }
  for (const project of projetosNiteroiLocacao.filter(item => item.kind === "imobbrasil")) assert.match(project.url, /\/imovel\/locacao$/);
});

test("coletor de aluguel Predial esta conectado ao parser compartilhado", async () => {
  const project = projetosNiteroiLocacao.find(item => item.collection === "nitPredial");
  assert.equal(project.kind, "predial");
  assert.equal(new URL(project.url).searchParams.get("finalidade"), "aluguel");
  const platform = await carregarPlataforma(project.kind);
  assert.equal(typeof platform.contar, "function");
  assert.equal(typeof platform.coletar, "function");
});

test("card Kenlo misto usa o preco de aluguel e resolve o bairro", () => {
  const html = `<a class="card-with-buttons" href="https://www.tetoicarai.com.br/imovel/apartamento-2-quartos-icarai-niteroi/AP1">
    <img class="cards_digital_carousel-image" src="https://img/1.jpg" alt="Apartamento, Icaraí, Niterói">
    <p class="card-with-buttons__title">Apartamento</p>
    <h2 class="card-with-buttons__heading">Icaraí - Niterói</h2>
    <ul><li>2 quartos</li><li>80 m²</li></ul>
    <div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Venda</p><p class="card-with-buttons__value">R$ 1.000.000</p></div>
    <div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Aluguel</p><p class="card-with-buttons__value">R$ 3.500</p></div>
    <p class="card-with-buttons__code">AP1</p></a>`;
  const record = mapearCardKenlo(html, projetosNiteroiLocacao.find(item => item.collection === "nitTeto"));
  assert.equal(record.preco, 3500);
  assert.equal(record.cidade, "niteroi-rj");
  assert.equal(record.bairro, "icarai");
  assert.equal(record.tipoImovel, "apartamento");
  assert.equal(record.codigoBase, "AP1");
});

test("Grupo conta e coleta com pagina=1 sem aceitar o total antigo da rota sem parametros", async () => {
  const project = projetosNiteroiLocacao.find(item => item.collection === "nitGrupo");
  let current;
  let closed = 0;
  const page = {
    goto: async url => { current = url; return { status: () => 200 }; },
    evaluate: async () => ({
      url: current,
      heading: `Exibindo ${new URL(current).searchParams.has("pagina") ? 3 : 4} Imóveis para alugar`,
      cards: [],
    }),
    close: async () => { closed++; },
  };
  const browser = { newPage: async () => page };
  assert.equal(await contar(browser, project), 3);
  assert.equal(new URL(current).searchParams.get("pagina"), "1");
  const urls = [];
  const carregar = async (_page, url) => {
    urls.push(url);
    const params = new URL(url).searchParams;
    const number = Number(params.get("pagina"));
    assert.ok(number >= 1);
    const ids = params.get("ordenar") === "recentes" ? [2, 3] : number === 1 ? [1, 2] : [2];
    return {
      info: { cards: ids.map(id => ({ href: `https://x/imovel/${id}`, html: "" })) },
      state: { total: 3, semImoveisConfirmado: false },
    };
  };
  assert.equal((await coletarCardsPorPagina(browser, project, 3, { carregar })).length, 3);
  assert.deepEqual(urls.map(url => new URL(url).search), ["?pagina=1", "?pagina=2", "?ordenar=recentes&pagina=1"]);
  await assert.rejects(coletarCardsPorPagina(browser, project, 3, {
    carregar: async () => ({ info: { cards: [] }, state: { total: 2 } }),
  }), { code: "KENLO_TOTAL_ALTERADO" });
  assert.equal(closed, 3);
});

test("Kenlo de aluguel pagina por URL, deduplica e exige total estavel", async () => {
  const browser = { newPage: async () => ({ close: async () => {} }) };
  const project = { collection: "nitTempo", url: "https://www.tempoimoveisrj.com/imoveis/para-alugar?gclid=x" };
  const urls = [];
  const card = id => ({ href: `https://x/imovel/${id}`, html: "" });
  const paginas = { 1: [card(1), card(2)], 2: [card(2), card(3)], 3: [card(4)] };
  const carregar = async (_page, url) => {
    urls.push(url);
    const n = Number(new URL(url).searchParams.get("pagina") || 1);
    return { info: { cards: paginas[n] || [] }, state: { total: 4, semImoveisConfirmado: false } };
  };
  assert.equal((await coletarCardsPorPagina(browser, project, 4, { carregar })).length, 4);
  assert.deepEqual(urls, [
    "https://www.tempoimoveisrj.com/imoveis/para-alugar",
    "https://www.tempoimoveisrj.com/imoveis/para-alugar?pagina=2",
    "https://www.tempoimoveisrj.com/imoveis/para-alugar?pagina=3",
  ]);
  const mudou = async () => ({ info: { cards: [card(1)] }, state: { total: 5 } });
  await assert.rejects(coletarCardsPorPagina(browser, project, 4, { carregar: mudou }), { code: "KENLO_TOTAL_ALTERADO" });
  const zerou = async () => ({ info: { cards: [] }, state: { total: 0, semImoveisConfirmado: true } });
  await assert.rejects(coletarCardsPorPagina(browser, project, 4, { carregar: zerou }), { code: "KENLO_TOTAL_ALTERADO" });
  const instavel = async (_page, url) => {
    const params = new URL(url).searchParams;
    const n = Number(params.get("pagina") || 1);
    const lista = params.get("ordenar") === "recentes" ? { 1: [card(3), card(4)], 2: [card(1), card(2)] } : { 1: [card(1), card(2)], 2: [card(1), card(2)] };
    return { info: { cards: lista[n] || [] }, state: { total: 4 } };
  };
  assert.equal((await coletarCardsPorPagina(browser, project, 4, { carregar: instavel })).length, 4);
});

test("Coluna recarrega paginas com contador transitoriamente divergente sem baixar a validacao", async () => {
  const browser = { newPage: async () => ({ close: async () => {} }) };
  const project = { collection: "nitColuna", url: "https://www.colunaimoveis.com.br/imoveis/para-alugar" };
  const cards = Array.from({ length: 86 }, (_, index) => ({
    href: `https://www.colunaimoveis.com.br/imovel/${index + 1}`,
    html: "",
  }));
  let calls = 0;
  const carregar = async () => ({
    info: { cards },
    state: { total: ++calls === 1 ? 87 : 86, semImoveisConfirmado: false },
  });
  assert.equal((await coletarCardsPorPagina(browser, project, 86, { carregar })).length, 86);
  assert.equal(calls, 2);

  calls = 0;
  const persistente = async () => {
    calls++;
    return { info: { cards }, state: { total: 87, semImoveisConfirmado: false } };
  };
  await assert.rejects(coletarCardsPorPagina(browser, project, 86, { carregar: persistente }), {
    code: "KENLO_TOTAL_ALTERADO",
  });
  assert.equal(calls, 3);
});

test("Coluna usa ordenacao explicita tambem na primeira pagina para evitar contador antigo", async () => {
  const browser = { newPage: async () => ({ close: async () => {} }) };
  const project = { collection: "nitColuna", url: "https://www.colunaimoveis.com.br/imoveis/para-alugar" };
  const visits = [];
  const carregar = async (_page, url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get("ordenar"), "recentes");
    const pagina = Number(params.get("pagina") || 1);
    visits.push(pagina);
    return {
      state: { total: 3 },
      info: { cards: (pagina === 1 ? [1, 2] : [3]).map(id => ({
        href: `https://www.colunaimoveis.com.br/imovel/${id}`, html: "",
      })) },
    };
  };
  assert.equal((await coletarCardsPorPagina(browser, project, 3, { carregar })).length, 3);
  assert.deepEqual(visits, [1, 2]);
});

test("Kenlo encerra pagina curta e completa anuncios duplicados em outra ordenacao", async () => {
  const browser = { newPage: async () => ({ close: async () => {} }) };
  const project = { collection: "nitAccioly", url: "https://www.acciolygroup.com.br/imoveis/para-alugar" };
  const visits = [];
  const carregar = async (_page, url) => {
    const params = new URL(url).searchParams;
    const pagina = Number(params.get("pagina") || 1);
    visits.push(url);
    assert.ok(pagina <= 2, "Nao deve navegar alem da pagina curta");
    const ids = params.has("ordenar") ? [3, 4] : pagina === 1 ? [1, 2, 3] : [2, 3];
    return { info: { cards: ids.map(id => ({ href: `https://x/imovel/${id}`, html: "" })) }, state: { total: 4 } };
  };
  assert.equal((await coletarCardsPorPagina(browser, project, 4, { carregar })).length, 4);
  assert.equal(visits.length, 3);
});

test("Kenlo trata zero confirmado no fim da ordenacao somente com total inicial ainda estavel", async () => {
  const browser = { newPage: async () => ({ close: async () => {} }) };
  const project = { collection: "nitAccioly", url: "https://www.acciolygroup.com.br/imoveis/para-alugar" };
  for (const changed of [false, true]) {
    let checks = 0;
    const carregar = async (_page, url) => {
      const params = new URL(url).searchParams;
      const pagina = Number(params.get("pagina") || 1);
      if (pagina > 1) return { info: { cards: [] }, state: { total: 0, semImoveisConfirmado: true } };
      if (!params.has("ordenar")) checks++;
      const ids = params.has("ordenar") ? [3, 4] : [1, 2];
      return { info: { cards: ids.map(id => ({ href: `https://x/imovel/${id}`, html: "" })) }, state: { total: changed && checks > 1 ? 5 : 4 } };
    };
    if (changed) await assert.rejects(coletarCardsPorPagina(browser, project, 4, { carregar }), { code: "KENLO_TOTAL_ALTERADO" });
    else assert.equal((await coletarCardsPorPagina(browser, project, 4, { carregar })).length, 4);
  }
});
