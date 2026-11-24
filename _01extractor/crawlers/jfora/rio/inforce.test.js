import assert from "node:assert/strict";
import { test } from "node:test";
import { buscarPaginaInforce, coletarInforce, contarInforce, mapearInforce, urlBuscaInforce } from "./inforce.js";
import { getProjetoRio } from "./projects.js";

const vivax = getProjetoRio("rioVivax");
const sergio = getProjetoRio("rioSergioCastro");
const agora = new Date("2026-01-02T03:04:05.000Z");

function camelItem(id, overrides = {}) {
  return {
    id,
    tipoAnuncio: "Imovel",
    codigo: `AP${id}`,
    url: `venda+apartamento+copacabana+rio-de-janeiro+rj+80m2+rs1000000,00`,
    tipo: "Apartamento",
    bairro: "Copacabana",
    cidade: "Rio de Janeiro",
    estadoSigla: "RJ",
    valorVenda: 1000000,
    valorLocacao: null,
    areaConstruida: 80,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    imagens: ["12345"],
    ...overrides,
  };
}

test("URLs de busca Inforce usam paginacao e filtros da API correspondente", () => {
  const vivaxUrl = new URL(urlBuscaInforce(vivax, "venda", 3));
  assert.equal(vivaxUrl.origin, "https://www.vivaxprime.com.br");
  assert.equal(vivaxUrl.pathname, "/api/anuncios/search");
  assert.equal(vivaxUrl.searchParams.get("finalidade"), "venda");
  assert.equal(vivaxUrl.searchParams.get("page"), "3");
  assert.equal(vivaxUrl.searchParams.get("pagesize"), "100");

  const vivaxRent = new URL(urlBuscaInforce(vivax, "locacao", 1));
  assert.equal(vivaxRent.searchParams.get("finalidade"), "aluguel");

  const sergioUrl = new URL(urlBuscaInforce(sergio, "locacao", 2));
  assert.equal(sergioUrl.pathname, "/api/sergiocastro/Anuncio/");
  assert.equal(sergioUrl.searchParams.get("Finalidade"), "aluguel");
  assert.equal(sergioUrl.searchParams.get("Page"), "2");
  assert.equal(sergioUrl.searchParams.get("PageSize"), "100");
  assert.equal(sergioUrl.searchParams.get("Natureza"), '["Residencial", "Mista"]');
  assert.throws(() => urlBuscaInforce(vivax, "locacao", 0), /Pagina invalida/);
});

test("mapeia os campos da API Inforce e preserva preco anunciado zero", () => {
  const item = mapearInforce(camelItem(55, { valorVenda: 0, ocultarValor: true }), vivax, "venda", agora);
  assert.equal(item.linkReal, "https://www.vivaxprime.com.br/imovel/venda+apartamento+copacabana+rio-de-janeiro+rj+80m2+rs1000000,00/55");
  assert.equal(item.preco, 0);
  assert.equal(item.tipoImovel, "apartamento");
  assert.equal(item.cidade, "rio-de-janeiro-rj");
  assert.equal(item.bairro, "copacabana");
  assert.equal(item.linkFoto, "https://vivazprime.inforcedata.com.br/api/image/thumb/12345.jpg");
  assert.equal(item.codigoBase, "AP55");
  assert.equal(item.atualizadoEm, agora.toISOString());
  assert.throws(() => mapearInforce(camelItem(56, { valorVenda: null }), vivax, "venda"), /Preco ausente/);
});

test("mapeia API legada de Sergio Castro e constrói URL com ID-", () => {
  const item = mapearInforce({
    ID: 13845,
    Codigo: "SCVC3392",
    TipoNome: "Apartamento",
    UrlTrack: "venda+apartamento+3-quartos+copacabana+rio-de-janeiro+rj+77.00m2+rs1300000.00",
    BairroNome: "Copacabana",
    CidadeNome: "Rio de Janeiro",
    EstadoSigla: "RJ",
    ValorVenda: 1300000,
    ValorLocacao: null,
    AreaUtil: 77,
    QtdQuarto: 3,
    QtdWcTotal: 2,
    QtdVaga: 1,
    EnderecoLogradouro: "Rua Domingos Ferreira",
    Imagens: ["2484419"],
  }, sergio, "venda", agora);
  assert.equal(item.linkReal, "https://www.sergiocastro.com.br/imovel/venda+apartamento+3-quartos+copacabana+rio-de-janeiro+rj+77.00m2+rs1300000.00/ID-13845");
  assert.equal(item.localizacao, "Rua Domingos Ferreira, Copacabana, Rio de Janeiro - RJ");
  assert.equal(item.preco, 1300000);
  assert.equal(item.banheiroValor, 2);
  assert.equal(item.linkFoto, "https://sergiocastro.inforcedata.com.br/api/image/thumb/2484419.jpg");
});

test("contagem reconcilia totais entre paginas sem aceitar coleta incompleta ou duplicada", async () => {
  const chamadas = [];
  const buscar = async (_project, _negociacao, page) => {
    chamadas.push(page);
    const total = page === 1 ? 100 : 101;
    return {
      total,
      items: Array.from({ length: Math.max(0, Math.min(100, total - (page - 1) * 100)) }, (_, index) =>
        camelItem((page - 1) * 100 + index + 1)),
    };
  };
  const items = await coletarInforce(null, vivax, "venda", { totalEsperado: 101 }, { buscar });
  assert.equal(items.length, 101);
  assert.deepEqual(chamadas, [1, 2]);

  const contagemChamadas = [];
  const totalEstavel = await contarInforce(null, vivax, "venda", {
    buscar: async (_project, _negociacao, page) => {
      contagemChamadas.push(page);
      return { total: page === 1 ? 100 : 101, items: [] };
    },
  });
  assert.equal(totalEstavel, 101);
  assert.deepEqual(contagemChamadas, [1, 2]);

  await assert.rejects(coletarInforce(null, vivax, "venda", {
    totalEsperado: 1,
  }, { buscar: async () => ({ total: 2, items: [camelItem(1)] }) }), { code: "INFORCE_TOTAL_ALTERADO" });

  await assert.rejects(coletarInforce(null, vivax, "venda", {
    totalEsperado: 101,
  }, { buscar: async (_project, _negociacao, page) => ({
    total: 100,
    items: page === 1 ? Array.from({ length: 100 }, (_, index) => camelItem(index + 1)) : [],
  }) }), { code: "INFORCE_TOTAL_ALTERADO", message: /Coleta incompleta: 100\/101/ });

  await assert.rejects(coletarInforce(null, vivax, "venda", {
    totalEsperado: 2,
  }, { buscar: async () => ({ total: 2, items: [camelItem(1), camelItem(1)] }) }), /Imovel repetido/);
});

test("busca Inforce rejeita respostas e paginas incompletas", async () => {
  const project = getProjetoRio("rioZelo");
  await assert.rejects(buscarPaginaInforce(project, "venda", 1, async () => ({
    ok: true,
    json: async () => ({ total: 1, page: 1, pagesize: 100, items: [] }),
  })), /Pagina 1 incompleta/);
  await assert.rejects(buscarPaginaInforce(project, "venda", 1, async () => ({
    ok: true,
    json: async () => ({ total: 0, page: 2, pagesize: 100, items: [] }),
  })), /Resposta invalida/);
});

test("busca API legada valida totalCount e pagina", async () => {
  const data = await buscarPaginaInforce(sergio, "venda", 1, async url => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.searchParams.get("Finalidade"), "venda");
    return {
      ok: true,
      json: async () => ({ totalCount: 1, page: 1, pagesize: 100, items: [{}] }),
    };
  });
  assert.equal(data.total, 1);
  assert.equal(data.items.length, 1);
});
