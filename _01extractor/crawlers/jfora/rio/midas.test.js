import assert from "node:assert/strict";
import { test } from "node:test";
import { project as atento } from "./rioAtento/config.js";
import { project as atma } from "./rioAtma/config.js";
import { project as avegui } from "./rioAvegui/config.js";
import { project as edgard } from "./rioEdgard/config.js";
import { project as imobras } from "./rioImobras/config.js";
import { project as imoveisDoRio } from "./rioImoveisDoRio/config.js";
import { project as maisVeloz } from "./rioMaisVeloz/config.js";
import { project as okre } from "./rioOkre/config.js";
import { project as rdiniz } from "./rioRDiniz/config.js";
import { project as rjc } from "./rioRjc/config.js";
import { buildUrlMidas, coletarMidasRio, contarMidasRio, mapearMidas, validarConsultaDetalheMidas, validarSnapshotMidas, validarUrlMidas } from "./midas.js";

const cardAtento = overrides => ({
  codigo: "AISL00021",
  link_detalhe: "/imovel/sala-comercial-30m2-a-venda-rio-de-janeiro-rj-meier/AISL00021",
  titulo: "Sala Comercial 30m² à venda Rio de Janeiro,RJ Méier - R$ 90.000",
  cidade_nome: "Rio de Janeiro",
  estado_sigla: "RJ",
  localizacao: "Méier, Rio de Janeiro - RJ",
  tipoImovel: "Sala Comercial",
  bairro: "Méier",
  dormitorios: "0",
  banheiros: "1",
  garagem: "0.00",
  areaUtil: "30.00",
  areaTotal: "30.00",
  areaTerreno: "0.00",
  valorVenda: "90000.00",
  tipo_negocio_descricao: "Venda",
  imagem_caminho: [{ imagem_caminho: "https://fotosmd.sitemidas.com.br/foto.jpg", principal: "1" }],
  ...overrides,
});

function snapshot({ negociacao = "venda", page = 1, total = 92, count = 15, from = (page - 1) * 15 + 1, agencyId = "1955", overrides = {} } = {}) {
  const to = total === 0 ? 0 : Math.min(page * 15, total);
  const rental = negociacao === "locacao";
  return {
    heading: `${total} Imóveis ${rental ? "para alugar" : "à Venda"}`,
    label: `Encontramos ${total} resultados para sua busca`,
    total,
    de: from,
    ate: to,
    currentPage: String(page),
    items: Array.from({ length: count }, () => ({
      tipo_negocio_descricao: rental ? "Aluguel Anual" : "Venda",
      imobiliaria: agencyId,
      codigo: "codigo",
      ...overrides,
    })),
  };
}

test("URLs Midas mantêm a finalidade e alteram somente a página", () => {
  const sale = new URL(buildUrlMidas(atento, "venda", 2));
  assert.equal(sale.origin, "https://www.atentoimoveis.com");
  assert.equal(sale.pathname, "/imoveis/venda");
  assert.equal(new URLSearchParams(sale.hash.slice(3)).get("tipoNegocio"), "VA,VL");
  assert.equal(new URLSearchParams(sale.hash.slice(3)).get("page"), "2");
  assert.equal(validarUrlMidas(buildUrlMidas(atento, "venda", 7), atento, "venda", 7), buildUrlMidas(atento, "venda", 7));
  assert.throws(() => buildUrlMidas(atento, "venda", 0), /Pagina invalida/);
  const rental = new URL(buildUrlMidas(atento, "locacao", 1));
  assert.equal(new URLSearchParams(rental.hash.slice(3)).get("tipoNegocio"), "AA");
  assert.throws(() => validarUrlMidas("https://example.com/imoveis/venda#/?tipoNegocio=VA,VL&page=1", atento, "venda"));
});

test("URL de aluguel da Atma preserva AA e a coleta pode validar a rota canônica", () => {
  const page = buildUrlMidas(atma, "locacao", 1);
  assert.equal(new URL(page).origin, "https://www.atmaimobiliaria.com.br");
  assert.equal(new URLSearchParams(new URL(page).hash.slice(3)).get("tipoNegocio"), "AA");
  assert.equal(validarUrlMidas(page, atma, "locacao", 1), page);
  assert.throws(() => validarUrlMidas(buildUrlMidas(atma, "venda", 1), atma, "locacao", 1), /Rota nao corresponde/);
});

test("URL de aluguel da R. Diniz valida a rota /imoveis/aluguel", () => {
  const page = buildUrlMidas(rdiniz, "locacao", 2);
  assert.equal(new URL(page).pathname, "/imoveis/aluguel");
  assert.equal(new URLSearchParams(new URL(page).hash.slice(3)).get("tipoNegocio"), "AA");
  assert.equal(new URLSearchParams(new URL(page).hash.slice(3)).get("page"), "2");
  assert.equal(validarUrlMidas(page, rdiniz, "locacao", 2), page);
  assert.throws(() => validarUrlMidas(page, rdiniz, "venda", 2), /Rota nao corresponde/);
});

test("venda Okre preserva finalidade e ordenacao configuradas", () => {
  const url = buildUrlMidas(okre, "venda", 42);
  const params = new URLSearchParams(new URL(url).hash.slice(3));
  assert.equal(params.get("tipoNegocio"), "VA,VL");
  assert.equal(params.get("ordem"), "dataPublicacao-DESC");
  assert.equal(params.get("page"), "42");
  assert.equal(validarUrlMidas(url, okre, "venda", 42), url);
  assert.throws(() => validarUrlMidas(url.replace("dataPublicacao-DESC", "valor-ASC"), okre, "venda", 42), /Rota nao corresponde/);
  assert.equal(validarSnapshotMidas(snapshot({ agencyId: "2113" }), okre, "venda", 1, 92).items.length, 15);
});

test("RJC valida rota de venda, imobiliaria e campos do anuncio", () => {
  const url = buildUrlMidas(rjc, "venda", 192);
  const params = new URLSearchParams(new URL(url).hash.slice(3));
  assert.equal(new URL(url).origin, "https://www.rjcimobiliaria.com.br");
  assert.equal(params.get("tipoNegocio"), "VA,VL");
  assert.equal(params.get("ordem"), "valor-ASC");
  assert.equal(params.get("page"), "192");
  assert.throws(() => buildUrlMidas(rjc, "locacao", 1), /negociacao invalida/);
  assert.equal(validarSnapshotMidas(snapshot({ agencyId: "957" }), rjc, "venda", 1, 92).items.length, 15);
  assert.throws(() => validarSnapshotMidas(snapshot({ agencyId: "999" }), rjc, "venda", 1, 92), /outra imobiliaria/);
  assert.throws(() => validarSnapshotMidas(snapshot({ agencyId: "957", count: 14 }), rjc, "venda", 1, 92), /Pagina incompleta/);

  const record = mapearMidas(cardAtento({
    codigo: "TISL00054",
    link_detalhe: "/imovel/sala-comercial-38m2-a-venda-centro-rio-de-janeiro/TISL00054",
    titulo: "Sala Comercial 38m² à venda Praça Olavo Bilac, Centro, Rio de Janeiro - R$ 50.000",
    localizacao: "Praça Olavo Bilac - Centro, Rio de Janeiro - RJ",
    bairro: "Centro",
    areaUtil: "38.00",
    valorVenda: "50000.00",
  }), rjc, "venda", new Date("2026-11-17T10:00:00Z"));
  assert.equal(record.linkReal, "https://www.rjcimobiliaria.com.br/imovel/sala-comercial-38m2-a-venda-centro-rio-de-janeiro/TISL00054");
  assert.equal(record.preco, 50000);
  assert.equal(record.bairro, "centro");
  assert.equal(record.cidade, "rio-de-janeiro-rj");
  assert.equal(record.tipoImovel, "sala");
  assert.equal(record.corretor, "RJC");
  assert.equal(Object.keys(record).length, 20);
});

test("valida contador, total da API, finalidade, imobiliaria, pagina e tamanho integral dos cards", () => {
  assert.equal(validarSnapshotMidas(snapshot(), atento, "venda", 1, 92).items.length, 15);
  assert.equal(validarSnapshotMidas(snapshot({ page: 7, count: 2 }), atento, "venda", 7, 92).items.length, 2);
  assert.equal(validarSnapshotMidas(snapshot({ total: 0, count: 0 }), atento, "venda", 1, 0).total, 0);
  assert.equal(validarSnapshotMidas(snapshot({ negociacao: "locacao", total: 10, count: 10, agencyId: "1221" }), atma, "locacao", 1, 10).items.length, 10);
  assert.throws(() => validarSnapshotMidas(snapshot(), atento, "venda", 2, 92), /Pagina carregada diverge/);
  assert.throws(() => validarSnapshotMidas(snapshot(), atento, "venda", 1, 91), /Total alterado/);
  assert.throws(() => validarSnapshotMidas(snapshot({ count: 14 }), atento, "venda", 1, 92), /Pagina incompleta/);
  assert.throws(() => validarSnapshotMidas(snapshot({ negociacao: "locacao", total: 10, count: 10, agencyId: "1221" }), atma, "venda", 1, 10), /Titulo da listagem/);
  assert.equal(validarSnapshotMidas(snapshot({ negociacao: "locacao", total: 10, count: 10, agencyId: "1221", overrides: { tipo_negocio_descricao: "Venda e Aluguel" } }), atma, "locacao", 1, 10).items.length, 10);
  assert.throws(() => validarSnapshotMidas(snapshot({ overrides: { tipo_negocio_descricao: "Aluguel Anual" } }), atma, "venda", 1, 92), /finalidade inesperada/);
  assert.throws(() => validarSnapshotMidas(snapshot({ overrides: { imobiliaria: "999" } }), atma, "venda", 1, 92), /outra imobiliaria/);
  assert.throws(() => validarSnapshotMidas({ ...snapshot(), label: "Nenhum resultado" }, atento, "venda", 1, 92), /Contador da listagem/);
});

test("mapeia os 20 campos de venda e remove o preco do titulo", () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const item = mapearMidas(cardAtento(), atento, "venda", new Date("2026-10-19T12:00:00Z"));
    assert.equal(Object.keys(item).length, 20);
    assert.equal(item.linkReal, "https://www.atentoimoveis.com/imovel/sala-comercial-30m2-a-venda-rio-de-janeiro-rj-meier/AISL00021");
    assert.equal(item.titulo, "Sala Comercial 30m² à venda Rio de Janeiro,RJ Méier");
    assert.equal(item.preco, 90000);
    assert.equal(item.tipoImovel, "sala");
    assert.equal(item.cidade, "rio-de-janeiro-rj");
    assert.equal(item.dormitorioValor, 0);
    assert.equal(item.banheiroValor, 1);
    assert.equal(item.areaValor, 30);
    assert.equal(item.codigoBase, "AISL00021");
    assert.equal(item.bairro, "meier");
    assert.equal(item.linkCard, item.linkReal);
    assert.equal(item.corretor, "Atento");
    assert.equal(item.linkFoto, "https://fotosmd.sitemidas.com.br/foto.jpg");
    assert.equal(item.dataInclusao, "2026-10-19T12:00:00.000Z");
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

test("Mais Veloz extrai bairro da localizacao quando o campo especifico esta vazio", () => {
  const card = cardAtento({ bairro: "", localizacao: "Méier, Rio de Janeiro - RJ" });
  assert.equal(mapearMidas(card, maisVeloz, "venda").bairro, "meier");
  assert.equal(mapearMidas({ ...card, localizacao: "Rua Dias da Cruz, 100 - Méier, Rio de Janeiro - RJ" }, maisVeloz, "venda").bairro, "meier");
  assert.equal(mapearMidas({ ...card, bairro: "Copacabana" }, maisVeloz, "venda").bairro, "copacabana");
  assert.equal(mapearMidas(card, atento, "venda").bairro, "");
  assert.throws(() => mapearMidas({ ...card, localizacao: "Méier, Niterói - RJ" }, maisVeloz, "venda"), /Localizacao sem cidade/);
  assert.throws(() => mapearMidas({ ...card, localizacao: ", Rio de Janeiro - RJ" }, maisVeloz, "venda"), /Bairro ausente/);
});

test("ImoveisDoRio recupera bairro do link somente quando o campo do card esta vazio", () => {
  const card = cardAtento({
    codigo: "APCE0218",
    link_detalhe: "/imovel/estudio-com-32m-a-venda-no-centro/APCE0218",
    titulo: "Estúdio com 32m, a venda no Centro",
    localizacao: "Centro, Rio de Janeiro - RJ",
    bairro: "",
  });
  assert.equal(mapearMidas(card, imoveisDoRio, "venda").bairro, "centro");

  const copacabana = cardAtento({
    codigo: "SACO0001",
    link_detalhe: "/imovel/sala-comercial-reformada-a-venda-no-posto-5-em-copacabana/SACO0001",
    titulo: "Sala comercial reformada, a venda no Posto 5, em Copacabana.",
    localizacao: "Copacabana, Rio de Janeiro - RJ",
    bairro: "",
  });
  assert.equal(mapearMidas(copacabana, imoveisDoRio, "venda").bairro, "copacabana");

  assert.equal(mapearMidas({ ...card, bairro: "Copacabana" }, imoveisDoRio, "venda").bairro, "copacabana");
  assert.equal(mapearMidas(card, atento, "venda").bairro, "");
  const unknown = { ...card, link_detalhe: "/imovel/estudio-sem-bairro-identificavel/APCE0218" };
  assert.equal(mapearMidas(unknown, imoveisDoRio, "venda").bairro, "");
});

test("mapeia aluguel anual Midas e valida origem, codigo e preco", () => {
  const item = {
    codigo: "VPCA10016",
    link_detalhe: "/imovel/casa-1-quarto-para-alugar-vista-alegre-rio-de-janeiro/VPCA10016",
    titulo: "Casa para alugar Avenida Meriti, Vista Alegre, Rio de Janeiro - R$ 1.000",
    cidade_nome: "Rio de Janeiro",
    estado_sigla: "RJ",
    localizacao: "Avenida Meriti - Vista Alegre, Rio de Janeiro - RJ",
    tipoImovel: "Casa",
    bairro: "Vista Alegre",
    dormitorios: "1",
    banheiros: "1",
    garagem: "0",
    areaUtil: "40.00",
    valorVenda: null,
    valorAluguelAnual: "1000.00",
    tipo_negocio_descricao: "Aluguel Anual",
    imobiliaria: "1221",
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const mapped = mapearMidas(item, atma, "locacao");
    assert.equal(Object.keys(mapped).length, 20);
    assert.equal(mapped.linkReal, "https://www.atmaimobiliaria.com.br/imovel/casa-1-quarto-para-alugar-vista-alegre-rio-de-janeiro/VPCA10016");
    assert.equal(mapped.preco, 1000);
    assert.equal(mapped.corretor, "Atma");
    assert.throws(() => mapearMidas({ ...item, codigo: "OTHER" }, atma, "locacao"), /codigo esperado/);
    assert.throws(() => mapearMidas({ ...item, valorAluguelAnual: "invalido" }, atma, "locacao"), /invalido/);
  } finally {
    console.warn = warn;
  }
});

test("Avegui preserva como desconhecido preco de venda zero nao publicado no titulo", () => {
  const item = cardAtento({
    codigo: "NSCA40001", link_detalhe: "/imovel/casa/NSCA40001",
    titulo: "Casa à venda Rua Peri, Jardim Botânico, Rio de Janeiro", valorVenda: "0.00",
  });
  const warnings = [];
  const warn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    assert.equal(mapearMidas(item, avegui, "venda").preco, null);
    assert.ok(warnings.some(message => message.includes("Preco de venda nao informado")));
    assert.throws(() => mapearMidas({ ...item, titulo: `${item.titulo} - R$ 1.000` }, avegui, "venda"), /Preco de venda zero/);
    assert.throws(() => mapearMidas(item, atento, "venda"), /Preco de venda zero/);
    assert.throws(() => mapearMidas({ ...item, valorVenda: null }, avegui, "venda"), /Preco de venda ausente/);
  } finally { console.warn = warn; }
});

test("detalhe deve confirmar codigo e aluguel sob consulta sem valores conflitantes", () => {
  const detalhe = { codigo: "EC8258", precos: [
    { tipo: "Aluguel", valor: "Sob Consulta" }, { tipo: "Venda", valor: "R$ 10.000" },
  ] };
  assert.doesNotThrow(() => validarConsultaDetalheMidas(detalhe, "EC8258", edgard));
  assert.throws(() => validarConsultaDetalheMidas(detalhe, "OUTRO", edgard), /nao confirmado/);
  assert.throws(() => validarConsultaDetalheMidas({ ...detalhe, precos: [] }, "EC8258", edgard), /nao confirmado/);
  assert.throws(() => validarConsultaDetalheMidas({ ...detalhe, precos: [...detalhe.precos, { tipo: "Aluguel", valor: "R$ 3.000" }] }, "EC8258", edgard), /nao confirmado/);
  assert.throws(() => validarConsultaDetalheMidas({ ...detalhe, precos: [{ tipo: "Venda", valor: "Sob Consulta" }] }, "EC8258", edgard), /nao confirmado/);
});

test("aluguel zero consulta detalhe e encerra abas ao confirmar ou rejeitar", async () => {
  const item = cardAtento({
    codigo: "EC8258", link_detalhe: "/imovel/andar-corrido-locacao/EC8258",
    titulo: "Andar Corrido,Locação", valorAluguelAnual: "0.00",
    tipo_negocio_descricao: "Aluguel Anual", imobiliaria: "372",
  });
  for (const valor of ["Sob Consulta", "R$ 3.000"]) {
    let fechadas = 0;
    let quantidade = 0;
    const listing = {
      goto: async () => ({ status: () => 200 }),
      waitForFunction: async () => {},
      evaluate: async fn => fn.name === "lerSnapshotMidas"
        ? snapshot({ negociacao: "locacao", total: 1, count: 1, agencyId: "372", overrides: item })
        : undefined,
      url: () => buildUrlMidas(edgard, "locacao", 1),
      close: async () => { fechadas++; },
    };
    const detail = {
      goto: async () => ({ status: () => 200 }),
      url: () => "https://www.edgardclare.com.br/imovel/andar-corrido-locacao/EC8258",
      evaluate: async () => ({ codigo: "EC8258", precos: [{ tipo: "Aluguel", valor }] }),
      close: async () => { fechadas++; },
    };
    const browser = { newPage: async () => quantidade++ === 0 ? listing : detail };
    const coleta = () => coletarMidasRio(browser, edgard, "locacao", { totalEsperado: 1 });
    if (valor === "Sob Consulta") {
      const [mapped] = await coleta();
      assert.equal(mapped.preco, null);
      assert.equal(mapped.codigoBase, "EC8258");
    } else await assert.rejects(coleta(), /nao confirmado/);
    assert.equal(quantidade, 2);
    assert.equal(fechadas, 2);
  }
});

test("venda Imobras confirma zero na modalidade correta do detalhe", async () => {
  const item = cardAtento({
    codigo: "CPAP40725", link_detalhe: "/imovel/apartamento/CPAP40725",
    titulo: "Apartamento à venda Rua Santa Clara", valorVenda: "0.00", imobiliaria: "502123",
  });
  for (const detalhe of [
    { codigo: item.codigo, precos: [{ tipo: "Venda:", valor: "Sob Consulta" }] },
    { codigo: item.codigo, precos: [{ tipo: "Aluguel", valor: "Sob Consulta" }] },
    { codigo: item.codigo, precos: [{ tipo: "Venda", valor: "R$ 1.790.000" }] },
    { codigo: "OUTRO", precos: [{ tipo: "Venda", valor: "Sob Consulta" }] },
  ]) {
    let abertas = 0;
    let fechadas = 0;
    const listing = {
      goto: async () => ({ status: () => 200 }),
      waitForFunction: async () => {},
      evaluate: async () => snapshot({ total: 1, count: 1, agencyId: "502123", overrides: item }),
      url: () => buildUrlMidas(imobras, "venda", 1),
      close: async () => { fechadas++; },
    };
    const detail = {
      goto: async () => ({ status: () => 200 }),
      url: () => "https://www.imobrasrj.com.br/imovel/apartamento/CPAP40725",
      evaluate: async () => detalhe,
      close: async () => { fechadas++; },
    };
    const browser = { newPage: async () => abertas++ === 0 ? listing : detail };
    const coleta = () => coletarMidasRio(browser, imobras, "venda", { totalEsperado: 1 });
    if (detalhe.precos[0].tipo === "Venda:") {
      const [mapped] = await coleta();
      assert.equal(mapped.preco, null);
      assert.equal(mapped.codigoBase, item.codigo);
      assert.equal(Object.keys(mapped).length, 20);
    } else await assert.rejects(coleta(), /Preco de venda sob consulta nao confirmado/);
    assert.equal(abertas, 2);
    assert.equal(fechadas, 2);
  }
});

test("projeto somente aluguel carrega controle de locacao e mapeia sem habilitar venda", async () => {
  const project = { ...atma, negociacoes: ["locacao"] };
  const item = cardAtento({
    codigo: "VPCA10016", link_detalhe: "/imovel/casa/VPCA10016",
    valorAluguelAnual: "1000.00", tipo_negocio_descricao: "Aluguel Anual", imobiliaria: "1221",
    imagem_caminho: [{ imagem_caminho: "/foto.jpg" }],
  });
  let inicial;
  let controles = 0;
  let fechada = false;
  const page = {
    goto: async url => { inicial = url; return { status: () => 200 }; },
    waitForFunction: async () => {},
    evaluate: async fn => {
      if (fn.name === "lerSnapshotMidas") return snapshot({ negociacao: "locacao", total: 1, count: 1, agencyId: "1221", overrides: item });
      controles++;
    },
    url: () => buildUrlMidas(project, "locacao", 1),
    close: async () => { fechada = true; },
  };
  const items = await coletarMidasRio({ newPage: async () => page }, project, "locacao", { totalEsperado: 1 });
  assert.equal(new URLSearchParams(new URL(inicial).hash.slice(3)).get("tipoNegocio"), "VA,VL");
  assert.equal(controles, 1);
  assert.equal(items[0].preco, 1000);
  assert.equal(items[0].linkFoto, "https://www.atmaimobiliaria.com.br/foto.jpg");
  assert.equal(fechada, true);
  assert.throws(() => buildUrlMidas(project, "venda", 1), /negociacao invalida/);
});

test("paginacao na mesma aba valida cada pagina e fecha a aba mesmo em caso de erro", async () => {
  const project = { ...atento, midas: { ...atento.midas, paginacaoNaMesmaAba: true } };
  for (const repetirLink of [false, true]) {
    let numeroPagina = 1;
    let navegacoes = 0;
    let fechamentos = 0;
    let aberturas = 0;
    const page = {
      goto: async () => { navegacoes++; return { status: () => 200 }; },
      waitForFunction: async () => {},
      evaluate: async (fn, target) => {
        if (fn.name !== "lerSnapshotMidas") {
          numeroPagina = target;
          return;
        }
        const count = numeroPagina === 1 ? 15 : 1;
        const result = snapshot({ page: numeroPagina, total: 16, count, agencyId: project.midas.agencyId });
        result.items = result.items.map((item, index) => {
          const codigo = `COD${repetirLink && numeroPagina === 2 ? 0 : (numeroPagina - 1) * 15 + index}`;
          return { ...cardAtento(), ...item, codigo, link_detalhe: `/imovel/sala/${codigo}` };
        });

        return result;
      },
      url: () => buildUrlMidas(project, "venda", numeroPagina),
      close: async () => { fechamentos++; },
    };
    const browser = { newPage: async () => { aberturas++; return page; } };
    const collect = () => coletarMidasRio(browser, project, "venda", { totalEsperado: 16 });
    if (repetirLink) await assert.rejects(collect(), /Imovel repetido/);
    else assert.equal((await collect()).length, 16);
    assert.equal(aberturas, 1);
    assert.equal(navegacoes, 1);
    assert.equal(fechamentos, 1);
  }
});

test("Imobras repete apenas timeouts em abas novas e preserva as validacoes", async () => {
  for (const scenario of ["recupera", "esgota", "dados invalidos"]) {
    let abertas = 0;
    let fechadas = 0;
    const browser = {
      newPage: async () => {
        const tentativa = ++abertas;
        return {
          goto: async () => ({ status: () => 200 }),
          waitForFunction: async () => {
            if (scenario === "esgota" || scenario === "recupera" && tentativa < 3) {
              const error = new Error("Tempo esgotado");
              error.name = "TimeoutError";
              throw error;
            }
          },
          evaluate: async fn => fn.name === "lerSnapshotMidas"
            ? snapshot({ negociacao: "locacao", total: 1, count: 1, agencyId: scenario === "dados invalidos" ? "999" : "502123" })
            : undefined,
          url: () => buildUrlMidas(imobras, "locacao", 1),
          close: async () => { fechadas++; },
        };
      },
    };
    if (scenario === "recupera") assert.equal(await contarMidasRio(browser, imobras, "locacao"), 1);
    if (scenario === "esgota") await assert.rejects(contarMidasRio(browser, imobras, "locacao"), /pagina 1 apos 3 tentativa/);
    if (scenario === "dados invalidos") await assert.rejects(contarMidasRio(browser, imobras, "locacao"), /outra imobiliaria/);
    assert.equal(abertas, scenario === "dados invalidos" ? 1 : 3);
    assert.equal(fechadas, abertas);
  }
});

test("paginacao compartilhada substitui aba apos timeout e continua na pagina seguinte", async () => {
  const project = { ...atento, midas: { ...atento.midas, paginacaoNaMesmaAba: true, tentativasTimeout: 2 } };
  for (const timeoutPagina of [1, 2]) {
    let abertas = 0;
    let fechadas = 0;
    let falhou = false;
    const browser = {
      newPage: async () => {
        abertas++;
        let pagina = 0;
        return {
          goto: async url => {
            pagina = Number(new URLSearchParams(new URL(url).hash.slice(3)).get("page"));
            return { status: () => 200 };
          },
          waitForFunction: async () => {
            if (pagina === timeoutPagina && !falhou) {
              falhou = true;
              const error = new Error("Tempo esgotado");
              error.name = "TimeoutError";
              throw error;
            }
          },
          evaluate: async (fn, target) => {
            if (fn.name !== "lerSnapshotMidas") { pagina = target; return; }
            const result = snapshot({ page: pagina, total: 31, count: pagina === 3 ? 1 : 15, agencyId: project.midas.agencyId });
            result.items = result.items.map((item, index) => {
              const codigo = `COD${(pagina - 1) * 15 + index}`;
              return { ...cardAtento(), ...item, codigo, link_detalhe: `/imovel/sala/${codigo}` };
            });
            return result;
          },
          url: () => buildUrlMidas(project, "venda", pagina),
          close: async () => { fechadas++; },
        };
      },
    };
    assert.equal((await coletarMidasRio(browser, project, "venda", { totalEsperado: 31 })).length, 31);
    assert.equal(abertas, 2);
    assert.equal(fechadas, 2);
  }
});
