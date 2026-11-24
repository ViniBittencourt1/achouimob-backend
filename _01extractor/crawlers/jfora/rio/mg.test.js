import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUrlApiMg, mapearImovelMg, validarEstadoMg } from "./mg.js";
import { getProjetoRio } from "./projects.js";

const project = getProjetoRio("rioMg");
const center = { lat: -14.235004, lng: -51.92528 };
const location = { id: 12, imv_cod_gaia: "AP0322_MGI" };
const state = overrides => ({
  count: 1, totalPages: 1, isNational: true,
  request_filters: { cidade: "brasil", tipovar: "a-venda", order: "mais_relevantes" },
  geometry: { location: center }, locations: [location],
  ...overrides,
});
const property = overrides => ({
  id: 12, imv_ativo: true, imv_cod_gaia: "AP0322_MGI",
  imv_titulo: "Apartamento à venda ou para alugar em Senador Vasconcelos",
  imv_preco_venda: 100000, imv_preco_locacao: 1090, imv_ocultar_preco: false,
  imv_area_util: 46, imv_area_total: null, imv_qtd_dorm: 2, imv_qtd_vagas: 0,
  imv_qtd_banheiros: 1, imv_estado: "RJ", imv_cidade: "Rio de Janeiro",
  imv_bairro: "Senador Vasconcelos", imv_endereco: "Rua A", imv_end_numero: 12,
  imv_hide_address_wl: false,
  url_amiga: "https://www.mgimoveis.rio.br/imovel/apartamento/venda-e-locacao/rio-de-janeiro/rj/senador-vasconcelos/AP0322_MGI",
  tipo_imovel: { timv_nome: "Apartamento" }, tipo_negocio: { tpng_nome: "Venda e Locação" },
  fotos: [{ imvft_url: "https://static.arboimoveis.com.br/photo.jpg" }],
  ...overrides,
});

test("valida finalidade, contagem, IDs e paginacao do Next data", () => {
  const parsed = validarEstadoMg(state(), project, "venda", "1 Imóveis à venda");
  assert.equal(parsed.total, 1);
  assert.throws(() => validarEstadoMg(
    state({ request_filters: { ...state().request_filters, tipovar: "para-alugar" } }),
    project, "venda", "1 Imóveis à venda",
  ), /Contagem, finalidade/);
  assert.throws(() => validarEstadoMg(state({ locations: [] }), project, "venda", "1 Imóveis à venda"), /Contagem, finalidade/);
});

test("monta URL API e mapeia venda/aluguel com catálogo e detalhes", () => {
  const url = new URL(buildUrlApiMg([location], { order: "mais_relevantes", tipovar: "a-venda", center }));
  assert.equal(url.origin + url.pathname, "https://api-site.arboimoveis.com.br/api/imoveis-replica/get-imoveis-new");
  assert.deepEqual(JSON.parse(url.searchParams.get("where")), { id: { inq: [12] } });

  const now = new Date("2026-11-19T15:00:00.000Z");
  const sale = mapearImovelMg(property(), project, "venda", now);
  assert.equal(sale.preco, 100000);
  assert.equal(sale.cidade, "rio-de-janeiro-rj");
  assert.equal(sale.bairro, "senador-vasconcelos");
  assert.equal(sale.tipoImovel, "apartamento");
  assert.equal(sale.areaValor, 46);
  const rent = mapearImovelMg(property(), project, "locacao", now);
  assert.equal(rent.preco, 1090);
  assert.equal(rent.linkReal, sale.linkReal);
});

test("rejeita imóvel fora da finalidade e preço inválido", () => {
  assert.throws(() => mapearImovelMg(
    property({ tipo_negocio: { tpng_nome: "Locação" } }), project, "venda",
  ), /fora da finalidade/);
  assert.throws(() => mapearImovelMg(property({ imv_preco_venda: 0 }), project, "venda"), /Preco ausente ou invalido/);
  assert.throws(() => mapearImovelMg(
    property({ url_amiga: "https://example.com/imovel/apartamento/venda/rio-de-janeiro/rj/centro/AP0322_MGI" }),
    project, "venda",
  ), /Link fora/);
});
