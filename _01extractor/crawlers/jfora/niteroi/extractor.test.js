import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildNiteroiSalesLinks, extractNiteroiSales, parseNiteroiCard } from "./extractor.js";
import { NITEROI_SPREADSHEET_ID, projetosNiteroiVendas } from "./projects.js";
import { projetoContagemVendas } from "../_utils/vendasContagemProjetos.js";
import { resolverTipoNiteroi, resolverTipoNiteroiDoLink } from "./tipoImovel.js";

const backendRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const card = `
  <a class="card-with-buttons borderHover" href="/imovel/apartamento-icarai/AP123">
    <p class="card-with-buttons__code">AP123</p>
    <p class="card-with-buttons__title">Apartamento</p>
    <h2 class="card-with-buttons__heading">Icaraí - Niterói - RJ</h2>
    <ul><li>95 m²</li><li>3 Quartos</li><li>2 Banheiros</li><li>1 Vaga</li></ul>
    <p class="card-with-buttons__value">R$ 850.000</p>
    <img class="cards_digital_carousel-image" src="https://img.example/imovel.jpg">
  </a>`;

test("nitFlora segue paginacao padrao sem forcar ordenar=recentes", async () => {
  const visits = [];
  let destination;
  let closed = false;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, waitForFunction: async () => {},
    goto: async url => {
      destination = new URL(url);
      assert.equal(destination.searchParams.has("ordenar"), false);
      visits.push(url);
      return { status: () => 200 };
    },
    url: () => destination.href,
    evaluate: async () => {
      const pagina = Number(destination.searchParams.get("pagina") || 1);
      return {
        heading: "2 Imoveis a venda",
        cards: [{ href: `https://www.floraimoveis.com/imovel/AP${pagina}`, html: card.replaceAll("AP123", `AP${pagina}`) }],
        next: pagina === 1 ? "https://www.floraimoveis.com/imoveis/a-venda?pagina=2" : "",
      };
    },
    close: async () => { closed = true; },
  };
  const items = await extractNiteroiSales({ newPage: async () => page }, {
    projectName: "nitFlora", displayName: "Flora",
    baseUrl: "https://www.floraimoveis.com/imoveis/a-venda", totalEsperado: 2,
  });
  assert.deepEqual(items.map(item => item.codigoBase), ["AP1", "AP2"]);
  assert.equal(visits.length, 2);
  assert.equal(closed, true);
});

test("nitNova consulta linkReal somente quando o tipo do card nao resolve no catalogo", () => {
  const link = "/empreendimento/jardim-dos-manacas-apartamentos-e-coberturas-niteroi-1-a-2-quartos-41-a-216-m/24365929-PCCO?from=sale";
  const html = `<a class="card-with-buttons" href="${link}">
    <h2 class="card-with-buttons__heading">Jardim dos Manacás, com 1 a 2 quartos, 41 a 216 m²</h2>
    <img class="cards_digital_carousel-image" alt="Jardim dos Manacás, Niterói - RJ"></a>`;
  const options = { baseUrl: "https://www.novaimobiliaria.imb.br", displayName: "Nova Imobiliária", now: new Date("2026-10-16T12:00:00Z") };
  const original = parseNiteroiCard(html, options);
  assert.equal(original.tipoImovel, "");
  assert.equal(resolverTipoNiteroiDoLink(new URL(link, options.baseUrl).href), "apartamento");
  const baseline = parseNiteroiCard(html.replace("<h2", '<p class="card-with-buttons__title">Apartamento</p><h2'), { ...options, projectName: "nitNova" });
  assert.deepEqual(parseNiteroiCard(html, { ...options, projectName: "nitNova" }), { ...baseline, titulo: original.titulo });
  for (const [tipo, esperado] of [["Cobertura", "cobertura"], ["Tipo desconhecido", "apartamento"]]) {
    const comTipo = html.replace("<h2", `<p class="card-with-buttons__title">${tipo}</p><h2`);
    assert.equal(parseNiteroiCard(comTipo, { ...options, projectName: "nitNova" }).tipoImovel, esperado);
  }
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const desconhecido = html.replace("apartamentos-e-coberturas", "unidades");
    assert.equal(parseNiteroiCard(desconhecido, { ...options, projectName: "nitNova" }).tipoImovel, "");
    assert.ok(warnings.some(message => message.startsWith("[nitNova] Tipo sem correspondencia")));
  } finally { console.warn = warn; }
});

test("parser Kenlo de Niteroi gera as 20 colunas de vendas", () => {
  const result = parseNiteroiCard(card, {
    baseUrl: "https://example.com/imoveis/a-venda",
    displayName: "Imobiliária Teste",
    now: new Date("2026-10-13T12:00:00.000Z"),
  });

  test("Kiffer, Amin, Lopes e Nova usam tres faixas de preco, e os demais conservam rota unica", () => {
    for (const project of projetosNiteroiVendas) {
      const baseUrl = `${project.url}?origem=teste`;
      const links = buildNiteroiSalesLinks(project.collection, baseUrl);
      if (["nitKiffer", "nitAmin", "nitLopes", "nitNova"].includes(project.collection)) {
        assert.deepEqual(links.map(link => new URL(link).searchParams.get("preco-de-venda")),
          ["0~500000", "500001~1000000", project.collection === "nitLopes" ? "1000001~" : "1000001~100000000"]);
        assert.ok(links.every(link => link.includes("~") && !/%7e/i.test(link)));
        assert.ok(links.every(link => new URL(link).searchParams.get("origem") === "teste"));
      } else {
        assert.deepEqual(links, [baseUrl], project.collection);
      }
    }
  });

  assert.equal(Object.keys(result).length, 20);
  assert.equal(result.linkReal, "https://example.com/imovel/apartamento-icarai/AP123");
  assert.equal(result.preco, 850000);
  assert.equal(result.cidade, "niteroi-rj");
  assert.equal(result.bairro, "Icaraí");
  assert.equal(result.tipoImovel, "apartamento");
  assert.equal(result.titulo, "Apartamento em Icaraí - Niterói - RJ");
  assert.equal(result.dormitorioValor, 3);
  assert.equal(result.banheiroValor, 2);
  assert.equal(result.areaValor, 95);
  assert.equal(result.garagemValor, 1);
  assert.equal(result.codigoBase, "AP123");
});

test("preco Kenlo preserva centavos sem concatenar outros valores", () => {
  for (const [texto, esperado] of [
    ["R$ 27.112.087,06", 27112087.06],
    ["R$ 850.000", 850000],
    ["R$ 850.000,00", 850000],
    ["A partir de R$ 2.744.000", 2744000],
    ["R$ 950,50", 950.5],
    ["R$ 0,00", 0],
    ["R$ 27.112.087,06 IPTU R$ 500,00", 27112087.06],
    ["Sob consulta", null],
    ["", null],
  ]) {
    const html = card.replace(
      '<p class="card-with-buttons__value">R$ 850.000</p>',
      `<div class="card-with-buttons__value-container"><p class="card-with-buttons__value-title">Venda</p><p class="card-with-buttons__value">${texto}</p></div>`
    );
    const result = parseNiteroiCard(html, {
      baseUrl: "https://www.kifferimoveis.com.br", displayName: "Kiffer", projectName: "nitKiffer",
    });
    assert.equal(result.preco, esperado, texto);
  }
});

test("nitLopes coleta acima de 100 milhoes e segue a faixa sem teto normalizada pelo site", async () => {
  const visits = [];
  let closed = 0;
  const baseUrl = "https://www.lopesniteroi.com.br/imoveis/a-venda";
  const browser = { newPage: async () => {
    let destination;
    return {
      setUserAgent: async () => {},
      setViewport: async () => {},
      goto: async url => {
        destination = new URL(url);
        visits.push(destination);
        return { status: () => 200 };
      },
      url: () => destination.href,
      waitForFunction: async () => {},
      evaluate: async () => {
        const range = destination.searchParams.get("preco-de-venda");
        const pagina = Number(destination.searchParams.get("pagina") || 1);
        const ultimaFaixa = range === "1000001~" || range === "1000001 ";
        const codigo = ultimaFaixa ? `APALTO${pagina}` : range === "0~500000" ? "APBAIXO" : "APMEDIO";
        const html = card.replaceAll("AP123", codigo).replace("R$ 850.000", ultimaFaixa ? "R$ 2.100.000.000" : "R$ 850.000");
        return {
          heading: `${ultimaFaixa ? 2 : 1} Imoveis a venda`,
          cards: [{ href: `https://www.lopesniteroi.com.br/imovel/${codigo}`, html }],
          next: ultimaFaixa && pagina === 1 ? `${baseUrl}?preco-de-venda=1000001+&pagina=2` : "",
        };
      },
      close: async () => { closed++; },
    };
  } };
  const items = await extractNiteroiSales(browser, {
    projectName: "nitLopes", displayName: "Lopes Niteroi", baseUrl, totalEsperado: 4,
  });
  assert.deepEqual(visits.map(url => url.searchParams.get("preco-de-venda")),
    ["0~500000", "500001~1000000", "1000001~", "1000001 "]);
  assert.deepEqual(items.map(item => item.codigoBase), ["APBAIXO", "APMEDIO", "APALTO1", "APALTO2"]);
  assert.equal(items.find(item => item.codigoBase === "APALTO1").preco, 2100000000);
  assert.equal(closed, 3);
});

for (const projectName of ["nitAmin", "nitLopes", "nitNova"]) {
const project = projetosNiteroiVendas.find(item => item.collection === projectName);
test(`${projectName} une as faixas e rejeita coleta global abaixo da precontagem`, async () => {
  for (const totalEsperado of [3, 4]) {
    const routes = [];
    let closed = 0;
    const browser = { newPage: async () => {
      let destination;
      return {
        setUserAgent: async () => {},
        setViewport: async () => {},
        goto: async url => { destination = new URL(url); routes.push(destination); return { status: () => 200 }; },
        url: () => destination.href,
        waitForFunction: async () => {},
        evaluate: async () => {
          const range = destination.searchParams.get("preco-de-venda");
          return { heading: "1 Imóvel à venda", cards: [{ href: `https://example.com/imovel/${range}`, html: card }], next: "" };
        },
        close: async () => { closed++; },
      };
    } };
    const collect = () => extractNiteroiSales(browser, {
      projectName, displayName: project.displayName,
      baseUrl: project.url, totalEsperado,
    });
    if (totalEsperado === 3) assert.equal((await collect()).length, 3);
    else await assert.rejects(collect, /difere da precontagem 4; base preservada/);
    assert.equal(routes.length, 3);
    assert.equal(closed, 3);
  }
});

test(`${projectName} complementa faixa incompleta com ordenacao alternativa sem reiniciar coleta`, async () => {
  const orders = [];
  let destination;
  let closed = false;
  const page = {
    setUserAgent: async () => {},
    setViewport: async () => {},
    goto: async url => { destination = new URL(url); orders.push(destination.searchParams.get("ordenar")); return { status: () => 200 }; },
    url: () => destination.href,
    waitForFunction: async () => {},
    evaluate: async () => ({
      heading: "2 Imóveis à venda",
      cards: [{ href: `https://example.com/imovel/${destination.searchParams.get("ordenar")}`, html: card }],
      next: "",
    }),
    close: async () => { closed = true; },
  };
  const result = await extractNiteroiSales({ newPage: async () => page }, {
    projectName, displayName: project.displayName,
    baseUrl: project.url, totalEsperado: 2,
  });
  assert.equal(result.length, 2);
  assert.deepEqual(orders, ["recentes", "maior-valor"]);
  assert.equal(closed, true);
});
}

test("todos os projetos nit consultam tipos no catalogo antes de gravar o slug", () => {
  for (const project of projetosNiteroiVendas) {
    const result = parseNiteroiCard(card.replace(">Apartamento</p>", ">Chácara</p>"), {
      baseUrl: project.url, displayName: project.displayName, projectName: project.collection,
    });
    assert.equal(result.tipoImovel, "granja", project.collection);
    assert.ok(result.titulo.startsWith("Chácara em "), project.collection);
  }
});

test("tipos Niteroi resolvem aliases e compostos sem inventar destinos", () => {
  for (const [value, slug] of [
    ["Casa", "casa"], ["Cobertura", "cobertura"], ["Sítio", "granja"],
    ["Kitnet", "loft"], ["Andar corporativo", "andar"], ["Área", "terreno"],
    ["Apartamento duplex", "apartamento"], ["Apartamento garden", "apartamento"],
    ["Casa comercial", "casa-comercial"], ["apartamento", "apartamento"],
    ["Box-Garagem", "garagem"],
  ]) assert.equal(resolverTipoNiteroi(value), slug, value);
  assert.equal(resolverTipoNiteroi(""), "");
  assert.equal(resolverTipoNiteroi("Tipo Sem Cadastro Teste"), "");
  assert.equal(resolverTipoNiteroi("Casamento"), "");
  assert.equal(resolverTipoNiteroi("Casa e Apartamento"), "");
});

test("nitAmin e nitKiffer resolvem o primeiro tipo do link sem substituir tipos preenchidos", () => {
  const links = [
    "https://www.amimimoveis.com.br/empreendimento/the-grove-icarai-apartamentos-e-coberturas-niteroi-2-a-4-quartos-80-a-236-m/25387413-AMIM?from=sale",
    "https://www.amimimoveis.com.br/empreendimento/nice-camboinhas-apartamentos-e-coberturas-niteroi-2-a-4-quartos-66-a-317-m/25396852-AMIM?from=sale",
  ];
  for (const link of links) {
    assert.equal(resolverTipoNiteroiDoLink(link), "apartamento");
    const html = `<a href="${link}">
      <h2 class="card-with-buttons__heading">Empreendimento Teste</h2>
      <img class="cards_digital_carousel-image" alt="Teste, Niterói - RJ">
    </a>`;
    const options = { baseUrl: link, displayName: "Teste" };
    assert.equal(parseNiteroiCard(html, { ...options, projectName: "nitAccioly" }).tipoImovel, "");
    const preenchido = html.replace("</a>", '<p class="card-with-buttons__title">Casa</p></a>');
    for (const projectName of ["nitAmin", "nitKiffer"]) {
      const projectOptions = { ...options, projectName };
      assert.equal(parseNiteroiCard(html, projectOptions).tipoImovel, "apartamento", projectName);
      assert.equal(parseNiteroiCard(preenchido, projectOptions).tipoImovel, "casa", projectName);
      const semTipo = html.replace(link, "https://example.com/empreendimento/sem-tipo/123");
      assert.equal(parseNiteroiCard(semTipo, projectOptions).tipoImovel, "", projectName);
    }
  }
});

test("tipo pelo link usa apenas palavras completas do caminho e aliases do catalogo", () => {
  assert.equal(resolverTipoNiteroiDoLink("https://example.com/imovel/casa-comercial-com-garagem/CA123"), "casa-comercial");
  assert.equal(resolverTipoNiteroiDoLink("https://example.com/imovel/galp%C3%A3o/GA123"), "galpao");
  assert.equal(resolverTipoNiteroiDoLink("https://casa.example/empreendimento/casamento/123?tipo=apartamento#cobertura"), "");
  assert.equal(resolverTipoNiteroiDoLink(""), "");
  assert.equal(resolverTipoNiteroiDoLink("https://example.com/empreendimento/sem-tipo/123"), "");
});

test("parser aceita card de empreendimento com faixas de valores", () => {
  const result = parseNiteroiCard(`
    <a class="card-with-buttons borderHover" href="/empreendimento/gaea-home-resort/20535932-BCC">
      <p class="card-with-buttons__code">20535932-BCC</p>
      <h2 class="card-with-buttons__heading">GAEA Home Resort, com 3 a 4 quartos, 123 a 365 m²</h2>
      <img class="cards_digital_carousel-image" alt="GAEA Home Resort, com 3 a 4 quartos, 123 a 365 m², Rio de Janeiro - RJ" src="https://img.example/e.jpg">
      <ul><li>123.35 a 365.16 m²</li><li>3 a 4 Quartos</li><li>4 a 5 Banheiros</li><li>2 a 3 Vagas</li></ul>
      <p class="card-with-buttons__value">A partir de R$ 2.744.000</p>
    </a>`, { baseUrl: "https://www.kifferimoveis.com.br/imoveis/a-venda", displayName: "Kiffer" });

  assert.equal(result.linkReal, "https://www.kifferimoveis.com.br/empreendimento/gaea-home-resort/20535932-BCC");
  assert.equal(result.preco, 2744000);
  assert.equal(result.cidade, "rio-de-janeiro-rj");
  assert.equal(result.bairro, "");
  assert.equal(result.areaValor, 123);
  assert.equal(result.dormitorioValor, 3);
  assert.equal(result.garagemValor, 2);
});

test("cadastro possui os 20 projetos solicitados com colecoes e dominios unicos", () => {
  assert.equal(projetosNiteroiVendas.length, 20);
  assert.equal(new Set(projetosNiteroiVendas.map(project => project.collection)).size, 20);
  assert.equal(new Set(projetosNiteroiVendas.map(project => new URL(project.url).hostname)).size, 20);
  assert.ok(projetosNiteroiVendas.some(project => project.collection === "nitAccioly"));
});

test("cada projeto possui wrapper, script, scheduler e configuracao de contagem", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"));
  const scheduler = JSON.parse(fs.readFileSync(path.join(backendRoot, "_01extractor/crawlers/jfora/_1Jf/site-scheduler-config.json"), "utf8"));

  for (const project of projetosNiteroiVendas) {
    const scriptName = project.collection.toLowerCase();
    const relativeWrapper = `_01extractor/crawlers/jfora/niteroi/${project.folder}/index.js`;
    assert.equal(packageJson.scripts[scriptName], `node ${relativeWrapper}`, scriptName);
    assert.ok(scheduler.selectedScripts.includes(scriptName), scriptName);
    assert.ok(fs.existsSync(path.join(backendRoot, relativeWrapper)), relativeWrapper);
    const count = projetoContagemVendas(project.collection);
    assert.equal(count.kind, project.collection === "nitPredial" ? "predial" : "kenlo");
    assert.equal(new URL(count.url).hostname, new URL(project.url).hostname);
  }
});

test("Niteroi publica na planilha propria, sem usar a de Juiz de Fora nem a de aluguel", () => {
  const niteroiRoot = path.join(backendRoot, "_01extractor/crawlers/jfora/niteroi");
  const runProject = fs.readFileSync(path.join(niteroiRoot, "runProject.js"), "utf8");
  const sheets = fs.readFileSync(path.join(niteroiRoot, "sheets.js"), "utf8");

  assert.equal(NITEROI_SPREADSHEET_ID, "10S4YOgBUBB89POe4QKUKw08ZHgQ-htmrobdkZddiMf8");
  assert.notEqual(NITEROI_SPREADSHEET_ID, process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
  assert.notEqual(NITEROI_SPREADSHEET_ID, "11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk");
  assert.ok(runProject.includes("spreadsheetId: NITEROI_SPREADSHEET_ID"));
  assert.ok(sheets.includes("options.spreadsheetId ?? NITEROI_SPREADSHEET_ID"));
  assert.ok(!sheets.includes("GOOGLE_SHEETS_SPREADSHEET_ID"));
});
