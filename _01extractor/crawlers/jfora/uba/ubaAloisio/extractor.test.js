import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import { test } from "node:test";
import { project } from "./config.js";
import {
  coletarAloisio, extrairListagemAloisio, extrairDetalhesAloisio,
  fetchAloisio, validarUrlAloisio, verificarCertificadoAloisio, resolverTipoTituloAloisio,
} from "./extractor.js";

const origin = "https://www.aloisioteixeiraimoveis.com.br";
const link = `${origin}/imovel/123/casa-venda-uba-mg-ligacao`;
const field = (label, value, cls) => `<div class="${cls}">${label}<span>${value}</span></div>`;
function listing({ mode = "venda", total = 1, pg = 1, id = 123, next = false } = {}) {
  const url = `${origin}/imovel/${mode}${pg > 1 ? `?pag=${pg}` : ""}`;
  const itemLink = `${origin}/imovel/${id}/casa-${mode}-uba-mg-ligacao`;
  return `<link rel="canonical" href="${url}">
    <div class="lista_imoveis_paginacao"><span class="fontepadrao_cor_grande">Imóveis Encontrados: ${total}</span>
    ${total ? `<a class="lipagina-btn-paginacao-atual" href="/imovel/${mode}/?pag=${pg}">${pg}</a>` : ""}
    ${next ? `<a href="/imovel/${mode}/?pag=${pg + 1}">Próxima</a>` : ""}</div>
    ${total ? `<div class="imoveis_listar">
      <div class="imagem"><a href="${itemLink}"><img src="https://imgs1.cdn-imobibrasil.com.br/foto.jpg"></a></div>
      <div class="conteudo1"><h2>Ligação, Ubá / MG</h2>Casa para ${mode === "venda" ? "Venda" : "Locação"}<br><span># Ref: CSA.: 001${id}</span></div>
      <div class="valor">R$ 400.000,75</div>
      ${[["Área Total", "142,00 m²"], ["Quartos", "4"], ["Banheiros", "3"], ["Vagas", "0 vagas"]].map(([k, v]) => field(k, v, "itens")).join("")}
      <a href="${itemLink}">Mais Informações</a></div>` : ""}`;
}
function detail(id = 123, mode = "venda") {
  return `<link rel="canonical" href="${origin}/imovel/${id}/casa-${mode}-uba-mg-ligacao">
    <div class="blm_pesquisando_item"><h1>Casa para ${mode === "venda" ? "Venda" : "Locação"}, Ubá / MG, bairro Ligação</h1></div>
    <div class="imovel_detalhes_titulo2">Ligação, Ubá / MG</div>
    <div class="imodet_item1val">R$ 400.000,75</div>
    <div class="imodet_item1_cx">
      ${[["Código:", `CSA.: 001${id}`], ["Endereço:", "Rua Um, 175"], ["Complemento:", "Casa"], ["Bairro:", "Ligação"],
    ["Área Total:", "142,00 m²"], ["Área Construída:", "130,00 m²"], ["Área Terreno:", "260,00 m²"],
    ["Dormitórios:", "4"], ["Banheiros:", "3"], ["Vaga:", "0"], ["Salas:", "2"]].map(([k, v]) => field(k, v, "imodet_item1")).join("")}
    </div><div class="imovel_detalhes_imagem1"><img src="https://imgs1.cdn-imobibrasil.com.br/original.jpg"></div>`;
}
const item = () => extrairListagemAloisio(listing(), "venda").imoveis[0];

test("card e detalhe preservam codigo, centavos, zero, acentos e vinte campos", () => {
  const result = extrairDetalhesAloisio(detail(), item(), "venda", "2020-01-01");
  assert.equal(Object.keys(result).length, 20);
  assert.equal(result.codigoBase, "CSA.: 001123");
  assert.equal(result.preco, 400000.75);
  assert.equal(result.cidade, "uba-mg");
  assert.equal(result.bairro, "ligacao");
  assert.equal(result.tipoImovel, "casa");
  assert.equal(result.areaValor, 142);
  assert.equal(result.ambienteValor, 2);
  assert.equal(result.garagemValor, 0);
  assert.equal(result.localizacao, "Rua Um, 175, Casa, Ligação, Ubá / MG");
  assert.equal(result.linkFoto, "https://imgs1.cdn-imobibrasil.com.br/original.jpg");
  assert.equal(result.elevadorValor, null);
});

test("catalogo nao reconhecido fica vazio sem adivinhar categoria ou municipio", () => {
  const unknown = html => html.replaceAll("Casa", "Categoria desconhecida").replaceAll("Ubá", "Cidade inexistente");
  const entry = extrairListagemAloisio(unknown(listing()), "venda").imoveis[0];
  const result = extrairDetalhesAloisio(unknown(detail()), entry, "venda");
  assert.equal(result.cidade, "");
  assert.equal(result.tipoImovel, "");
});

test("tipo vazio consulta inicio do titulo no catalogo sem usar terreno ou localizacao", () => {
  assert.equal(resolverTipoTituloAloisio("Ch\u00e1cara Condom\u00ednio Rural para Venda, Astolfo Dutra / MG, terreno 800 m\u00b2"), "granja");
  assert.equal(resolverTipoTituloAloisio("Casa Comercial para Venda, Uba / MG"), "casa-comercial");
  assert.equal(resolverTipoTituloAloisio("Categoria desconhecida para Venda, bairro Casa, terreno 800 m\u00b2"), "");
  for (const mode of ["venda", "locacao"]) {
    const change = html => html.replaceAll("Casa", "Ch\u00e1cara Condom\u00ednio Rural");
    const entry = extrairListagemAloisio(change(listing({ mode })), mode).imoveis[0];
    const result = extrairDetalhesAloisio(change(detail(123, mode)), entry, mode);
    assert.equal(result.tipoImovel, "granja");
    assert.equal(result.cidade, "uba-mg");
    assert.equal(result.areaValor, 142);
    assert.equal(Object.keys(result).length, 20);
  }
});

test("finalidades, origens, filtros adicionais e credenciais sao rejeitados", () => {
  for (const url of [
    "https://outro.com/imovel/venda", `${origin}/imovel/locacao`,
    `${origin}/imovel/venda?pag=1&tipo=casa`, `${origin}/imovel/venda?pag=1&pag=1`,
    `${origin}/imovel/venda#teste`, `https://usuario:senha@www.aloisioteixeiraimoveis.com.br/imovel/venda`,
  ]) assert.throws(() => validarUrlAloisio(url, "venda", 1));
  assert.throws(() => validarUrlAloisio(`${origin}/imovel/123/casa-locacao-uba`, "venda"));
  assert.throws(() => extrairListagemAloisio(listing({ mode: "locacao" }), "venda"));
  assert.throws(() => extrairDetalhesAloisio(detail(123, "locacao"), item(), "venda"));
});

test("contador, pagina ativa, links e identidade divergentes bloqueiam coleta", () => {
  for (const html of [
    listing().replace("Encontrados: 1", "Encontrados: x"),
    listing().replace('>1</a>', '>2</a>'),
    listing().replace(`<a href="${link}">Mais`, `<a href="${origin}/imovel/124/casa-venda-uba">Mais`),
    listing().replace("R$ 400.000,75", "preco desconhecido"),
  ]) assert.throws(() => extrairListagemAloisio(html, "venda"));
  for (const html of [
    detail(124), detail().replace("CSA.: 001123", "OUTRO"),
    detail().replace("400.000,75", "400.000,74"), detail().replace(">4</span>", ">5</span>"),
    detail().replace("142,00 m²", "143,00 m²"),
  ]) assert.throws(() => extrairDetalhesAloisio(html, item(), "venda"));
});

test("ausencia numerica e preco sob consulta nao viram zero nem usam narrativa", () => {
  const entry = extrairListagemAloisio(listing().replace("R$ 400.000,75", "Sob Consulta").replace(">4</span>", ">-</span>"), "venda").imoveis[0];
  const result = extrairDetalhesAloisio(detail().replace("R$ 400.000,75", "Sob Consulta").replace(">4</span>", ">-</span>"), entry, "venda");
  assert.equal(result.preco, null);
  assert.equal(result.dormitorioValor, null);
});

test("zero e permitido somente para locacao com canonical e contador presentes, sem cards", () => {
  assert.equal(extrairListagemAloisio(listing({ mode: "locacao", total: 0 }), "locacao").total, 0);
  assert.throws(() => extrairListagemAloisio(listing({ total: 0 }), "venda"));
  assert.throws(() => extrairListagemAloisio(listing({ mode: "locacao" }).replace("Encontrados: 1", "Encontrados: 0"), "locacao"));
  assert.throws(() => extrairListagemAloisio("<html>indisponivel</html>", "locacao"));
});

test("coletor percorre paginas e detalhes, rele listagem e preserva inclusao anterior", async () => {
  const calls = [];
  const result = await coletarAloisio(null, project, "venda", {
    anteriores: new Map([[link, { dataInclusao: "2000-01-01" }]]),
    request: async (url, mode, pg) => {
      calls.push(url);
      if (pg) return listing({ total: 2, pg, id: pg === 1 ? 123 : 124, next: pg === 1 });
      return detail(Number(new URL(url).pathname.split("/")[2]), mode);
    },
    onCount: async total => assert.equal(total, 2),
  });
  assert.equal(result.imoveis.length, 2);
  assert.equal(result.totalEsperado, 2);
  assert.equal(result.imoveis[0].dataInclusao, "2000-01-01");
  assert.equal(calls.length, 6);
});

test("paginacao incompleta, repetida e listagem alterada impedem sincronizacao", async () => {
  await assert.rejects(coletarAloisio(null, project, "venda", {
    request: async () => listing({ total: 2 }),
  }), /incompleta/);
  await assert.rejects(coletarAloisio(null, project, "venda", {
    request: async (_url, _mode, pg) => listing({ total: 2, pg, next: pg === 1 }),
  }), /repetida/);
  let listCalls = 0;
  await assert.rejects(coletarAloisio(null, project, "venda", {
    request: async (_url, _mode, pg) => pg ? listing().replace("400.000,75", ++listCalls === 1 ? "400.000,75" : "400.000,76") : detail(),
    onCount: async () => assert.fail("Nao deve registrar coleta instavel"),
  }), /mudou/);
});

test("aluguel vazio e reconferido antes de confirmar resultado", async () => {
  let calls = 0;
  const result = await coletarAloisio(null, project, "locacao", {
    request: async () => { calls++; return listing({ mode: "locacao", total: 0 }); },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { imoveis: [], totalEsperado: 0, vazioConfirmado: true });
});

test("excecao TLS aceita somente nome divergente no dominio autorizado", () => {
  const cert = { subjectaltname: "DNS:outro.com" };
  assert.equal(verificarCertificadoAloisio(new URL(origin).hostname, cert), undefined);
  assert.equal(verificarCertificadoAloisio("outro.com", cert), undefined);
  assert.equal(verificarCertificadoAloisio("terceiro.com", cert).code, "ERR_TLS_CERT_ALTNAME_INVALID");
});

test("transporte mantem verificacao TLS, decodifica Latin1 e rejeita redirecionamentos", async t => {
  let status = 200;
  t.mock.method(https, "get", (url, options, callback) => {
    assert.equal(url.origin, origin);
    assert.equal(options.agent, false);
    assert.notEqual(options.rejectUnauthorized, false);
    assert.equal(options.checkServerIdentity, verificarCertificadoAloisio);
    const request = new EventEmitter();
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = status;
      response.headers = { "content-type": "text/html; charset=iso-8859-1" };
      response.resume = () => {};
      callback(response);
      if (status === 200) {
        response.emit("data", Buffer.from("Ub\xe1", "latin1"));
        response.emit("end");
      }
    });
    return request;
  });
  assert.equal(await fetchAloisio(project.urlVendas, "venda", 1), "Ubá");
  status = 302;
  await assert.rejects(fetchAloisio(project.urlVendas, "venda", 1), /redirecionamentos nao permitidos/);
  await assert.rejects(fetchAloisio("https://outro.com/imovel/venda", "venda", 1), /Origem/);
});
