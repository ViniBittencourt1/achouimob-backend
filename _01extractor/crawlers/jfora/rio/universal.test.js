import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyBuscaUniversal, buscarPaginaUniversal, coletarUniversal, contarUniversal, mapearUniversal } from "./universal.js";
import { getProjetoRio } from "./projects.js";

const cabral = getProjetoRio("rioCabral");
const renascenca = getProjetoRio("rioRenascenca");
const now = new Date("2026-01-02T03:04:05.000Z");

function imoviewItem(code, overrides = {}) {
  return {
    codigo: code,
    titulo: `apartamento-copacabana-${code}`,
    tipo: "Apartamento",
    bairro: "Copacabana",
    cidade: "Rio de Janeiro",
    estado: "RJ",
    finalidade: "Venda",
    valor: "R$ 1.250.000,00",
    endereco: "Rua Barata Ribeiro",
    numero: "100",
    areainterna: "80,50",
    arealote: "0,00",
    numeroquartos: "2",
    numerobanhos: "1",
    numerovagas: "1",
    urlfotoprincipal: "https://cdn.example.com/photo.jpg",
    ...overrides,
  };
}

function renascencaItem(code, overrides = {}) {
  return {
    codigo: code,
    url_amigavel: `apartamento-copacabana-${code}`,
    titulo: "Apartamento à venda, Copacabana - Rio de Janeiro/RJ",
    tipo: "Apartamento",
    bairro: "Copacabana",
    cidade: "Rio de Janeiro",
    estado: "RJ",
    codigofinalidade: 2,
    valor: "R$ 0,00",
    endereco: "Rua Barata Ribeiro",
    numero: "100",
    areainterna: "80,50",
    numeroquartos: "2",
    numerobanhos: "1",
    numerovagas: "1",
    fotos: [{ urlp: "https://cdn.example.com/photo.jpg" }],
    ...overrides,
  };
}

test("monta requests da Universal com filtros e pagina corretos", () => {
  const params = new URLSearchParams(bodyBuscaUniversal(getProjetoRio("rioNovi"), "locacao", 3));
  assert.equal(params.get("imovel[finalidade]"), "aluguel");
  assert.equal(params.get("imovel[numeropagina]"), "3");
  assert.equal(params.get("imovel[numeroregistros]"), "20");
  assert.equal(params.get("imovel[codigoTipo][codigo][]"), "0");
  assert.equal(params.get("imovel[condominio][nomeUrl]"), "todos-os-condominios");

  const renascencaParams = new URLSearchParams(bodyBuscaUniversal(renascenca, "venda", 2));
  assert.equal(renascencaParams.get("finalidade"), "venda");
  assert.equal(renascencaParams.get("numeropagina"), "2");
  assert.equal(renascencaParams.get("bairros[0][nomeUrl]"), "todos-os-bairros");
});

test("busca e mapeia imoveis Universal com moeda brasileira e link canônico", async () => {
  let request;
  const page = await buscarPaginaUniversal(cabral, "venda", 1, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ quantidade: 1, lista: [imoviewItem(44)] }),
    };
  });
  assert.equal(page.total, 1);
  assert.equal(page.items.length, 1);
  assert.equal(request.url, cabral.universal.endpoint);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["X-Requested-With"], "XMLHttpRequest");
  assert.equal(new URLSearchParams(request.options.body).get("imovel[finalidade]"), "venda");

  const item = mapearUniversal(page.items[0], cabral, "venda", now);
  assert.equal(item.linkReal, "https://www.cabralemesack.com.br/imovel/apartamento-copacabana-44/44");
  assert.equal(item.preco, 1250000);
  assert.equal(item.localizacao, "Rua Barata Ribeiro, 100, Copacabana, Rio de Janeiro - RJ");
  assert.equal(item.cidade, "rio-de-janeiro-rj");
  assert.equal(item.bairro, "copacabana");
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(item.areaValor, 80.5);
  assert.equal(item.linkFoto, "https://cdn.example.com/photo.jpg");
  assert.equal(item.codigoBase, "44");
  assert.equal(mapearUniversal(imoviewItem(45, { valor: "Sob consulta" }), cabral, "venda", now).preco, null);
});

test("coleta todas as paginas e rejeita total instavel ou anuncios repetidos", async () => {
  const data = (page, total = 21) => ({
    total,
    items: Array.from({ length: page === 1 ? 20 : 1 }, (_, index) =>
      imoviewItem((page - 1) * 20 + index + 1)),
  });
  const calls = [];
  const buscar = async (_project, _negotiation, page) => {
    calls.push(page);
    const result = data(page);
    return { total: result.total, items: result.items };
  };
  assert.equal(await contarUniversal(null, cabral, "venda", { buscar }), 21);
  calls.length = 0;
  const records = await coletarUniversal(null, cabral, "venda", { totalEsperado: 21 }, { buscar });
  assert.equal(records.length, 21);
  assert.deepEqual(calls, [1, 2]);

  await assert.rejects(coletarUniversal(null, cabral, "venda", { totalEsperado: 1 }, {
    buscar: async () => ({ total: 2, items: [imoviewItem(1)] }),
  }), { code: "UNIVERSAL_TOTAL_ALTERADO" });
  await assert.rejects(coletarUniversal(null, cabral, "venda", { totalEsperado: 1 }, {
    buscar: async () => ({ total: 1, items: [imoviewItem(1), imoviewItem(1)] }),
  }), /Anuncio repetido/);
});

test("mapeia Renascenca e valida finalidade e contagem da pagina", async () => {
  const item = mapearUniversal(renascencaItem(550), renascenca, "venda", now);
  assert.equal(item.linkReal, "https://admrenascenca.com.br/imovel/apartamento-copacabana-550/550");
  assert.equal(item.titulo, "Apartamento à venda, Copacabana - Rio de Janeiro/RJ");
  assert.equal(item.preco, 0);
  assert.equal(item.linkFoto, "https://cdn.example.com/photo.jpg");
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(mapearUniversal(renascencaItem(552, { valor: "Sob consulta" }), renascenca, "venda", now).preco, null);
  assert.throws(() => mapearUniversal(renascencaItem(551, { codigofinalidade: 1 }), renascenca, "venda", now), /Finalidade inesperada/);
  await assert.rejects(buscarPaginaUniversal(renascenca, "venda", 1, async () => ({
    ok: true,
    json: async () => ({ quantidade: 2, lista: [renascencaItem(1)] }),
  })), { code: "UNIVERSAL_TOTAL_ALTERADO" });
});

test("repete apenas falhas transitórias de rede e HTTP", async () => {
  let tentativas = 0;
  const result = await buscarPaginaUniversal(cabral, "venda", 1, async () => {
    tentativas += 1;
    if (tentativas === 1) throw new Error("socket reset");
    return { ok: true, json: async () => ({ quantidade: 0, lista: [] }) };
  });
  assert.equal(tentativas, 2);
  assert.equal(result.total, 0);

  let tentativasHttp = 0;
  const respostaHttp = await buscarPaginaUniversal(cabral, "venda", 1, async () => {
    tentativasHttp += 1;
    if (tentativasHttp === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ quantidade: 0, lista: [] }) };
  });
  assert.equal(tentativasHttp, 2);
  assert.equal(respostaHttp.total, 0);
});
