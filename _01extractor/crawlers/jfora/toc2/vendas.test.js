import assert from "node:assert/strict";
import { test } from "node:test";
import { validarUrlToc2Venda } from "./extractor-00-rotaExterna.js";

test("vendas TOC2 aceita dominio oficial com e sem www e conserva paginacao", () => {
  for (const host of ["toc2imoveis.com.br", "www.toc2imoveis.com.br"]) {
    for (const query of ["", "?filtros&min=0&max=20000000&ordem=desc-valor&pagination=2"]) {
      assert.doesNotThrow(() => validarUrlToc2Venda(`https://${host}/imoveis/venda/-/-/-/-${query}`, 2));
    }
  }
});

test("vendas TOC2 rejeita aluguel, detalhes, dominios externos e HTTP", () => {
  for (const destination of [
    "https://toc2imoveis.com.br/imoveis/aluguel/-/-/-/-",
    "https://toc2imoveis.com.br/imovel/123",
    "https://outro.example/imoveis/venda/-/-/-/-",
    "https://toc2imoveis.com.br.outro.example/imoveis/venda/-/-/-/-",
    "http://toc2imoveis.com.br/imoveis/venda/-/-/-/-",
  ]) {
    assert.throws(() => validarUrlToc2Venda(destination, 3), error =>
      error.message.includes("Pagina 3") &&
      error.message.includes(destination) &&
      error.message.includes("base preservada"));
  }
});
