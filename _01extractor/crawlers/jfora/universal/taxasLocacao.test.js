import assert from "node:assert/strict";
import { test } from "node:test";
import { extractUniversalRentalFees } from "./taxasLocacao.js";

test("extrai IPTU e condominio da tabela mensal e soma ao aluguel", () => {
  const html = `<table>
    <tr class="imovel--precos--table--item"><td><span>Aluguel</span></td><td>R$ 4.000,00</td></tr>
    <tr class="imovel--precos--table--item"><td><span>Iptu</span></td><td>R$ 390,00</td></tr>
    <tr class="imovel--precos--table--item"><td><span>Condomínio</span></td><td>R$ 1.300,00</td></tr>
  </table>`;

  assert.deepEqual(extractUniversalRentalFees(html, 4000), {
    precoCondominio: 1300,
    precoIptu: 390,
    precoOutros: 0,
    precoTotal: 5690,
  });
});

test("guarda a diferenca positiva entre o total anunciado e os custos identificados", () => {
  const html = `<table class="imovel--precos--table">
    <tbody>
      <tr class="imovel--precos--table--item"><td>Aluguel</td><td>R$ 4.000,00</td></tr>
      <tr class="imovel--precos--table--item"><td>IPTU</td><td>R$ 390,00</td></tr>
      <tr class="imovel--precos--table--item"><td>Condomínio</td><td>R$ 1.300,00</td></tr>
    </tbody>
    <tfoot><tr><td><span>Total mensal</span></td><td><span>R$ 6.050,00</span></td></tr></tfoot>
  </table>`;

  assert.deepEqual(extractUniversalRentalFees(html, 4000), {
    precoCondominio: 1300,
    precoIptu: 390,
    precoOutros: 360,
    precoTotal: 6050,
  });
});

test("preserva total anunciado com aluguel desconhecido e nao cria ajuste negativo", () => {
  const totalMenorQueBase = `<table class="imovel--precos--table">
    <tr class="imovel--precos--table--item"><td>IPTU</td><td>R$ 200,00</td></tr>
    <tfoot><tr><td>Total mensal</td><td>R$ 900,00</td></tr></tfoot>
  </table>`;
  assert.deepEqual(extractUniversalRentalFees(totalMenorQueBase, 1000), {
    precoCondominio: 0,
    precoIptu: 200,
    precoOutros: 0,
    precoTotal: 900,
  });

  const aluguelDesconhecido = `<table class="imovel--precos--table">
    <tfoot><tr><td>Total mensal</td><td>R$ 2.250,00</td></tr></tfoot>
  </table>`;
  assert.deepEqual(extractUniversalRentalFees(aluguelDesconhecido, null), {
    precoCondominio: 0,
    precoIptu: 0,
    precoOutros: 0,
    precoTotal: 2250,
  });
});

test("considera custos ausentes como zero e mantem total desconhecido sem aluguel", () => {
  assert.deepEqual(extractUniversalRentalFees("<p>Valores mensais não informados</p>", 1250.5), {
    precoCondominio: 0,
    precoIptu: 0,
    precoOutros: 0,
    precoTotal: 1250.5,
  });
  assert.deepEqual(extractUniversalRentalFees("<p>Sem tabela</p>", null), {
    precoCondominio: 0,
    precoIptu: 0,
    precoOutros: 0,
    precoTotal: null,
  });
  assert.deepEqual(extractUniversalRentalFees(
    '<table class="imovel--precos--table"><tfoot><tr><td>Total mensal</td><td>—</td></tr></tfoot></table>',
    1250
  ), {
    precoCondominio: 0,
    precoIptu: 0,
    precoOutros: 0,
    precoTotal: 1250,
  });
});

test("rejeita valor monetario invalido ou linhas duplicadas", () => {
  assert.throws(() => extractUniversalRentalFees(
    '<table><tr class="imovel--precos--table--item"><td>IPTU</td><td>consulte a imobiliaria</td></tr></table>',
    1000
  ), /Valor de precoIptu invalido/);
  assert.throws(() => extractUniversalRentalFees(
    '<table><tr class="imovel--precos--table--item"><td>IPTU</td><td>R$ 10,00</td></tr><tr class="imovel--precos--table--item"><td>Iptu</td><td>R$ 20,00</td></tr></table>',
    1000
  ), /precoIptu duplicado/);
  assert.throws(() => extractUniversalRentalFees(
    '<table class="imovel--precos--table"><tfoot><tr><td>Total mensal</td><td>R$ 1.000,00</td></tr><tr><td>Total</td><td>R$ 1.100,00</td></tr></tfoot></table>',
    900
  ), /precoTotal duplicado/);
});
