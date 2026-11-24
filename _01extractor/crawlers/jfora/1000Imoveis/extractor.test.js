import assert from "node:assert/strict";
import { test } from "node:test";
import { carregarResultadosPorEndpoint, carregarTodosResultados } from "./extractor.js";

function pagina({ quantidades, botaoDisponivel = true }) {
  let indice = 0;
  let cliques = 0;
  const botao = { click: async () => { cliques++; indice = Math.min(indice + 1, quantidades.length - 1); } };

  return {
    page: {
      $$: async () => Array.from({ length: quantidades[indice] }),
      $: async () => botaoDisponivel ? botao : null,
      evaluate: async () => false,
    },
    cliques: () => cliques,
  };
}

test("repete cliques de paginacao quando uma resposta nao adiciona cards", async () => {
  const fixture = pagina({ quantidades: [20, 40, 40, 60] });
  const resultado = await carregarTodosResultados(fixture.page, {
    totalEsperado: 60,
    waitAfterClickMs: 0,
    sleep: async () => {},
  });

  assert.equal(fixture.cliques(), 3);
  assert.deepEqual(resultado, { paginacaoClicks: 3, cardsCarregados: 60 });
});

test("interrompe a paginacao apos varias tentativas consecutivas sem novos cards", async () => {
  const fixture = pagina({ quantidades: [20, 40, 40, 40, 60] });
  const resultado = await carregarTodosResultados(fixture.page, {
    maxNoGrowthAttempts: 2,
    waitAfterClickMs: 0,
    sleep: async () => {},
  });

  assert.equal(fixture.cliques(), 3);
  assert.deepEqual(resultado, { paginacaoClicks: 3, cardsCarregados: 40 });
});

test("encerra ao atingir a precontagem sem clicar novamente", async () => {
  const fixture = pagina({ quantidades: [20, 40, 60, 80] });
  const resultado = await carregarTodosResultados(fixture.page, {
    totalEsperado: 60,
    waitAfterClickMs: 0,
    sleep: async () => {},
  });

  assert.equal(fixture.cliques(), 2);
  assert.deepEqual(resultado, { paginacaoClicks: 2, cardsCarregados: 60 });
});

test("limite de seguranca impede loops mesmo quando os cards continuam aumentando", async () => {
  const fixture = pagina({ quantidades: [20, 40, 60, 80, 100] });
  const resultado = await carregarTodosResultados(fixture.page, {
    maxClicks: 3,
    waitAfterClickMs: 0,
    sleep: async () => {},
  });

  assert.equal(fixture.cliques(), 3);
  assert.deepEqual(resultado, { paginacaoClicks: 3, cardsCarregados: 80 });
});

test("reobtem botao e tenta novamente quando ele muda durante o clique", async () => {
  let tentativas = 0;
  let quantidade = 20;
  const page = {
    $$: async () => Array.from({ length: quantidade }),
    $: async () => ({ click: async () => {
      if (++tentativas === 1) throw new Error("Node is either not clickable or not an Element");
      quantidade = 40;
    } }),
    evaluate: async () => false,
  };
  const resultado = await carregarTodosResultados(page, {
    totalEsperado: 40, waitAfterClickMs: 0, retryClickMs: 0, sleep: async () => {},
  });
  assert.equal(tentativas, 2);
  assert.deepEqual(resultado, { paginacaoClicks: 1, cardsCarregados: 40 });
});

test("aguarda botao temporariamente ausente e considera cards carregados em atraso", async () => {
  let quantidade = 20;
  const page = {
    $$: async () => Array.from({ length: quantidade }),
    $: async () => null,
  };
  const resultado = await carregarTodosResultados(page, {
    totalEsperado: 40, retryClickMs: 0, sleep: async () => { quantidade = 40; },
  });
  assert.deepEqual(resultado, { paginacaoClicks: 0, cardsCarregados: 40 });
});

test("nao oculta erros inesperados do navegador", async () => {
  const page = {
    $$: async () => [1],
    $: async () => { throw new Error("Connection closed"); },
  };
  await assert.rejects(carregarTodosResultados(page, { totalEsperado: 2 }), /Connection closed/);
});

test("limita tentativas quando o botao continua indisponivel", async () => {
  let tentativas = 0;
  const page = {
    $$: async () => Array.from({ length: 20 }),
    $: async () => { tentativas++; return null; },
  };
  const resultado = await carregarTodosResultados(page, {
    totalEsperado: 40, maxNoGrowthAttempts: 3, retryClickMs: 0, sleep: async () => {},
  });
  assert.equal(tentativas, 3);
  assert.deepEqual(resultado, { paginacaoClicks: 0, cardsCarregados: 20 });
});

test("pagina pelo endpoint e repete falha transitoria sem duplicar cards", async () => {
  let quantidade = 20;
  let chamadas = 0;
  const page = {
    $$: async () => Array.from({ length: quantidade }),
    evaluate: async () => {
      chamadas++;
      if (chamadas === 1) return { erro: "HTTP 503", transitorio: true };
      quantidade += 20;
      return { cards: 20 };
    },
  };
  const resultado = await carregarResultadosPorEndpoint(page, { totalEsperado: 60, sleep: async () => {} });
  assert.equal(chamadas, 3);
  assert.deepEqual(resultado, { paginas: 2, cardsCarregados: 60 });
});

test("rejeita erro definitivo ou esgotamento de tentativas do endpoint", async () => {
  for (const resposta of [
    { erro: "URL da próxima página não corresponde à busca", transitorio: false },
    { erro: "HTTP 503", transitorio: true },
  ]) {
    let chamadas = 0;
    const page = {
      $$: async () => [1],
      evaluate: async () => { chamadas++; return resposta; },
    };
    await assert.rejects(carregarResultadosPorEndpoint(page, {
      totalEsperado: 2, maxAttempts: 2, sleep: async () => {},
    }), /Falha na paginação/);
    assert.equal(chamadas, resposta.transitorio ? 2 : 1);
  }
});

test("rejeita paginacao por endpoint sem uma contagem valida", async () => {
  await assert.rejects(carregarResultadosPorEndpoint({}, {}), /Total esperado inválido/);
});
