import assert from "node:assert/strict";
import { test } from "node:test";
import { mapearCardRjardim, parseDetalheLocacaoRjardim, parsePaginaRjardim } from "./rjardim.js";
import { getProjetoRio } from "./projects.js";

const project = getProjetoRio("rioRJardim");
const link = "https://rjardim.com.br/imovel/casa-em-condominio-duplex-venda-em-ipanema-sul-rio-de-janeiro/CO0001";
const detailLink = "https://rjardim.com.br/imovel/sobreloja-venda-para-alugar-em-botafogo-sul-rio-de-janeiro-427-m2/RJSJ00007";
const cardHtml = ({ href = link, business = "Venda", type = "Casa em Condomínio Duplex", price = "R$ 1" } = {}) => `
  <article id="imoveis-destaques">
    <div class="imovel-destaque">
      <a class="imagem-destaque" href="${href}"><img src="https://fotos.infoideias.net/img.jpg"></a>
      <span class="tipo-negocio">${business}</span><span class="tipo-imovel">${type}</span>
      <a href="${href}">
        <div class="preco"><span>${price}</span></div>
        <div class="location">Ipanema<br>Rua A</div>
        <ul class="box"><li><p>2 Quartos</p></li><li><p>1 Banheiros</p></li><li><p>1 Vaga(s)</p></li><li><p>65,5 m²</p></li></ul>
      </a>
    </div>
  </article>`;
const pageHtml = (card = cardHtml(), total = 1, page = 1) => `
  <script>$('#quantos').html('${total}')</script>
  <div class="paginacao"><a data-p="${page}" class="ativo">${page}</a></div>${card}`;
const detailHtml = `
  <link rel="canonical" href="${detailLink}">
  <meta property="og:title" content="Sobreloja para alugar Botafogo - Rio de Janeiro">
  <section id="preco-mobile"><div class="row">
    <div class="col-5"><p>Valor venda:</p><p>Valor aluguel:</p><p>Condomínio</p><p>IPTU</p></div>
    <div class="col-7"><p class="preco">R$ 3.480.000</p><p class="preco">R$ 28.450</p><p>R$ 14.704</p><p>R$ 3.898</p></div>
  </div></section>`;

test("parseia pagina AJAX, valida contagem, links e pagina atual", () => {
  const result = parsePaginaRjardim(pageHtml(), project, "venda", 1);
  assert.equal(result.total, 1);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].bairroNome, "Ipanema");
  assert.equal(result.cards[0].endereco, "Rua A");
  assert.throws(() => parsePaginaRjardim(pageHtml("", 2), project, "venda", 1), /divergentes/);
  assert.throws(() => parsePaginaRjardim(pageHtml(), project, "locacao", 2), /divergentes/);
});

test("mapeia tipo cadastrado, dados do card e preco anunciado de venda", async () => {
  const [card] = parsePaginaRjardim(pageHtml(), project, "venda", 1).cards;
  const record = await mapearCardRjardim(card, project, "venda", new Date("2026-11-19T15:00:00.000Z"));
  assert.equal(record.tipoImovel, "casa");
  assert.equal(record.preco, 1);
  assert.equal(record.cidade, "rio-de-janeiro-rj");
  assert.equal(record.dormitorioValor, 2);
  assert.equal(record.areaValor, 65.5);
  assert.equal(record.codigoBase, "CO0001");
  assert.match(record.titulo, /Casa em Condomínio Duplex 2 quartos à venda Ipanema/);
  await assert.rejects(mapearCardRjardim({ ...card, business: "aluguel" }, project, "venda"), /fora da finalidade venda/);
});

test("resolve variantes de casa e Gleba Plano nos slugs canonicos", async () => {
  const [card] = parsePaginaRjardim(pageHtml(), project, "venda", 1).cards;
  for (const typeName of [
    "Casa de Vila Duplex", "Casa de Vila Triplex", "Casa de rua Duplex",
    "Casa de rua Triplex", "Casa em Condomínio Duplex", "Casa em Condomínio Triplex",
  ]) {
    const record = await mapearCardRjardim({ ...card, typeName }, project, "venda");
    assert.equal(record.tipoImovel, "casa", typeName);
  }
  const terrain = await mapearCardRjardim({ ...card, typeName: "Gleba Plano" }, project, "venda");
  assert.equal(terrain.tipoImovel, "terreno");
});

test("resolve cidade fora da capital pelo slug com caracteres acentuados substituidos", async () => {
  const card = {
    linkReal: "https://rjardim.com.br/imovel/gleba-venda-em-praia-do-canto-arma-o-dos-b-zios/RJGL00001",
    typeName: "Gleba Plano", business: "venda", priceText: "R$ 100.000",
    bairroNome: "Praia do Canto", endereco: "", image: "", features: [],
  };
  const record = await mapearCardRjardim(card, project, "venda");
  assert.equal(record.cidade, "armacao-dos-buzios-rj");
  assert.match(record.localizacao, /Armação dos Búzios - RJ/);
});

test("usa o preco de aluguel do detalhe para anuncios de venda e locacao", () => {
  const parsed = parseDetalheLocacaoRjardim(detailHtml, detailLink);
  assert.equal(parsed.price, 28450);
  assert.equal(parsed.title, "Sobreloja para alugar Botafogo - Rio de Janeiro");
  assert.throws(() => parseDetalheLocacaoRjardim(detailHtml.replace(detailLink, link), detailLink), /divergente/);
});

test("mapeia cards de aluguel sem confundir a finalidade com venda", async () => {
  const rentalLink = "https://rjardim.com.br/imovel/sala-para-alugar-em-ipanema-sul-rio-de-janeiro-25-m2/RJSL00123";
  const html = pageHtml(cardHtml({ href: rentalLink, business: "Aluguel", type: "Sala", price: "R$ 4.200" }));
  const [card] = parsePaginaRjardim(html, project, "locacao", 1).cards;
  const record = await mapearCardRjardim(card, project, "locacao", new Date("2026-11-19T15:00:00.000Z"));
  assert.equal(record.tipoImovel, "sala");
  assert.equal(record.preco, 4200);
  assert.match(record.titulo, /para alugar Ipanema/);
});
