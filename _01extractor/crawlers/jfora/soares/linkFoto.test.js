import assert from "node:assert/strict";
import { test } from "node:test";
import { extractLinkFoto, extractLinkFotoDetalhe } from "./extractor-19-linkFoto.js";
import { extractSoaresData } from "./extractor.js";
import { preencherFotosSoaresLocacao } from "./extractor-locacao.js";

const link = "https://www.secimoveis.com.br/imovel/apartamento/REFA10000";
const foto = "https://fotosmd.sitemidas.com.br/midasweb/arquivos/2030/imoveis/fotos/1303/img/1303_G1785257516.jpg";
const html = `<img src="/logo.webp"><div class="slick-slide slick-current slick-active"><img onload="finishLoadImageDetalhe()" src="${foto}" fallback-src="https://static.sitemidas.com.br/imobiliarias/2030/logoTopo.webp"></div>`;

test("card extrai foto antes e depois do lazyload e rejeita placeholders", () => {
  for (const attribute of ["data-flickity-lazyload", "data-src", "data-lazy", "src", "fallback-src"]) {
    assert.equal(extractLinkFoto(`<img src="/logo.webp"><img class="img-responsive" ${attribute}="${foto}">`), foto);
  }
  assert.equal(extractLinkFoto(`<img src="data:image/gif;base64,AAAA" data-flickity-lazyload="${foto}">`), foto);
  assert.equal(extractLinkFoto(`<img data-flickity-lazyload="${foto.replace('https:', '')}">`), foto);
  assert.equal(extractLinkFoto('<img src="/logo.webp" fallback-src="/placeholder.png">'), "");
  assert.equal(extractLinkFoto('<img src="javascript:alert(1)" data-src="data:image/gif;base64,AAAA">'), "");
  assert.equal(extractLinkFoto(`<div class="slick-cloned"><img src="${foto}"></div>`), "");
  assert.equal(extractLinkFoto(""), "");
});

test("coleta de vendas e aluguel usa foto lazyload do card", () => {
  const card = `<div class="box-imovel ng-scope"><img class="img-responsive" data-flickity-lazyload="${foto}">
    <li><span class="descricao-transacao">Venda</span><strong class="valor-transacao">R$ 100.000,00</strong></li>
    <li><span class="descricao-transacao">Aluguel</span><strong class="valor-transacao">R$ 1.000,00</strong></li></div>`;
  for (const options of [{}, { negociacao: "locacao" }]) {
    assert.equal(extractSoaresData(card, new Set(), options).imoveisRaspados[0].linkFoto, foto);
  }
});

test("galeria retorna foto do imovel e nunca logo, placeholder ou clone", () => {
  assert.equal(extractLinkFotoDetalhe(html, link), foto);
  assert.equal(extractLinkFotoDetalhe(`<img onload="finishLoadImageDetalhe()" src="${foto}">`, link), foto);
  assert.equal(extractLinkFotoDetalhe(`<div class="slick-slide"><img src="/logo.webp" data-lazy="${foto}"></div>`, link), foto);
  assert.equal(extractLinkFotoDetalhe('<div class="slick-slide"><img src="data:image/gif;base64,AAAA" fallback-src="/logo.webp"></div>', link), "");
  assert.equal(extractLinkFotoDetalhe('<div class="slick-slide"><img src="/logo.webp"></div>', link), "");
  assert.equal(extractLinkFotoDetalhe(`<div class="slick-slide slick-cloned"><img onload="finishLoadImageDetalhe()" src="${foto}"></div>`, link), "");
});

test("recupera foto ausente nos detalhes e preserva foto existente", async () => {
  let opened = 0;
  let closed = 0;
  const records = [{ linkReal: link, linkFoto: "" }, { linkReal: link, linkFoto: "https://example.com/existente.jpg" }];
  await preencherFotosSoaresLocacao({ newPage: async () => {
    opened++;
    return { goto: async () => ({ ok: () => true }), url: () => link, content: async () => html, close: async () => { closed++; } };
  } }, records);
  assert.equal(records[0].linkFoto, foto);
  assert.equal(records[1].linkFoto, "https://example.com/existente.jpg");
  assert.equal(opened, 1);
  assert.equal(closed, 1);
});

test("erro HTTP ou redirecionamento interrompe coleta e fecha pagina", async () => {
  for (const httpError of [true, false]) {
    let closed = false;
    const record = { linkReal: link, linkFoto: "" };
    await assert.rejects(preencherFotosSoaresLocacao({ newPage: async () => ({
      goto: async () => ({ ok: () => !httpError, status: () => 503 }),
      url: () => "https://www.secimoveis.com.br/",
      close: async () => { closed = true; },
    }) }, [record]), /HTTP 503|redirecionados/);
    assert.equal(closed, true);
    assert.equal(record.linkFoto, "");
  }
});
