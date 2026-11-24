import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { linksBusca } from './extractor-00-rotaExterna.js';
import { extractListagemAlicerce as extractAlicerceData, paginarAlicerce } from './extractor.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

test('extrai 1078 cards e 20 campos com heap limitado a 256 MB, sem criar janelas por campo', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { extractListagemAlicerce as extractAlicerceData } from ${JSON.stringify(new URL('./extractor.js', import.meta.url).href)};
    const cards = Array.from({ length: 1078 }, (_, index) => \`
      <div class="imovel-item"><a href="https://alicerceimob.com.br/imovel/cod-\${index + 1}"></a>
        <div class="imovel-item--titulo">Apartamento teste</div>
        <div class="imovel-item--preco"><b>R$ 415.000,75</b></div>
        <div class="imovel-item--localizacao">Juiz de Fora</div>
        <div class="imovel-item--tipo"><span>Apartamento</span></div>
        <div class="imovel--icon" data-icon="quartos"><small>2 quartos</small></div>
        <div class="imovel--icon" data-icon="banheiros"><small>3 banheiros</small></div>
        <div class="imovel--icon" data-icon="area_iptu"><small>96,16 m²</small></div>
        <div class="imovel--icon" data-icon="vagas"><small>1 vaga</small></div>
        <div class="imovel--icon" data-icon="elevadores"><small>2 elevadores</small></div>
        <div class="imovel-item--cod"><span>Cód. \${index + 1}</span></div>
        <img src="https://example.com/foto.jpg">
      </div>\`);
    let closed = false;
    const page = {
      setRequestInterception: async () => {}, on: () => {},
      setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
      evaluate: async () => ({ clicked: false, count: cards.length }),
      waitForFunction: async () => {}, $$eval: async () => cards,
      close: async () => { closed = true; },
    };
    const rows = await extractAlicerceData({ newPage: async () => page }, ['https://alicerceimob.com.br/imoveis'], { totalEsperado: 1078 });
    assert.equal(rows.length, 1078);
    assert.equal(new Set(rows.map(row => row.linkReal)).size, 1078);
    for (const [index, row] of rows.entries()) {
      assert.equal(Object.keys(row).length, 20);
      assert.equal(row.titulo, 'Apartamento teste');
      assert.equal(row.preco, 415000);
      assert.equal(row.localizacao, 'Juiz de Fora');
      assert.equal(row.tipoImovel, 'apartamento');
      assert.equal(row.codigoBase, String(index + 1));
      assert.equal(row.dormitorioValor, 2);
      assert.equal(row.banheiroValor, 3);
      assert.equal(row.areaValor, 96.16);
      assert.equal(row.garagemValor, 1);
      assert.equal(row.elevadorValor, 2);
      assert.equal(row.linkFoto, 'https://example.com/foto.jpg');
      assert.equal(row.dataExclusao, '');
    }
    assert.equal(closed, true);
    console.log('Heap final MB:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
  `;
  const result = spawnSync(process.execPath, ['--max-old-space-size=256', '--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 120000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('Alicerce coleta todas as vendas sem limites de preco', () => {
  assert.equal(linksBusca.length, 1);
  const url = new URL(linksBusca[0]);
  const contagem = new URL(projetoContagemVendas('jfAlicerce').url);
  assert.equal(url.origin, contagem.origin);
  assert.equal(url.pathname, contagem.pathname);
  assert.equal(url.searchParams.get('negociacao'), 'venda');
  assert.equal(url.searchParams.has('preco_min'), false);
  assert.equal(url.searchParams.has('preco_max'), false);
});

test('Alicerce rejeita coleta incompleta antes dos detalhes', async () => {
  await assert.rejects(extractAlicerceData({}, [], { totalEsperado: 1 }), /Coleta incompleta: 0\/1/);
});

test('Alicerce nao interrompe vendas completas ao atingir 50 cliques', async () => {
  let clicks = 0;
  let closed = false;
  const page = {
    setRequestInterception: async () => {}, on: () => {},
    setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
    evaluate: async (_fn, limit) => {
      if (limit === undefined) return;
      if (clicks >= 53) return { clicked: false, count: clicks };
      assert.equal(limit, false);
      return { clicked: true, count: clicks++ };
    },
    waitForFunction: async () => {},
    $$eval: async () => [], close: async () => { closed = true; },
  };
  await extractAlicerceData({ newPage: async () => page }, linksBusca, { totalEsperado: 0 });
  assert.equal(clicks, 53);
  assert.equal(closed, true);
});

test('clique atomico suporta botao substituido a cada carregamento e aguarda crescimento', async () => {
  const dom = new JSDOM('<section id="imoveis--listing--items"><div class="imovel-item imovel-item-show"></div></section><button class="more-results--button"></button>', { runScripts: 'outside-only' });
  let clicks = 0;
  let checks = 0;
  const install = () => {
    const button = dom.window.document.querySelector('button');
    button.onclick = () => {
      clicks++;
      button.disabled = true;
      queueMicrotask(() => {
        dom.window.document.querySelector('section').insertAdjacentHTML('afterbegin', '<div class="imovel-item imovel-item-show"></div>');
        if (clicks === 3) button.remove();
        else {
          button.outerHTML = '<button class="more-results--button"></button>';
          install();
        }
      });
    };
  };
  install();
  const page = {
    evaluate: async (fn, arg) => dom.window.eval(`(${fn.toString()})(${JSON.stringify(arg)})`),
    waitForFunction: async (fn, _options, arg) => {
      checks++;
      assert.equal(dom.window.eval(`(${fn.toString()})(${JSON.stringify(arg)})`), true);
    },
  };
  try {
    await paginarAlicerce(page);
    assert.equal(clicks, 3);
    assert.equal(checks, 7);
    assert.equal(dom.window.document.querySelectorAll('.imovel-item-show').length, 4);
  } finally { dom.window.close(); }
});

test('paginacao aguarda inside-loading e ignora animacao dos cards antes do proximo clique', async () => {
  const dom = new JSDOM('<section id="imoveis--listing--items"><div class="imovel-item"></div></section><button class="more-results--button"></button>', { runScripts: 'outside-only' });
  const document = dom.window.document;
  let clicks = 0;
  let loadingChecks = 0;
  const install = () => {
    const button = document.querySelector('button');
    button.onclick = () => {
      assert.equal(button.classList.contains('inside-loading'), false);
      clicks++;
      button.classList.add('inside-loading');
      document.querySelector('section').insertAdjacentHTML('beforeend', '<div class="imovel-item"></div>');
    };
  };
  install();
  const evaluate = (fn, arg) => dom.window.eval(`(${fn.toString()})(${JSON.stringify(arg)})`);
  const page = {
    evaluate: async (fn, arg) => evaluate(fn, arg),
    waitForFunction: async (fn, _options, arg) => {
      const button = document.querySelector('button');
      if (button?.classList.contains('inside-loading')) {
        assert.equal(evaluate(fn, arg), false);
        assert.equal(button.disabled, false);
        loadingChecks++;
        if (clicks === 3) button.remove();
        else {
          button.outerHTML = '<button class="more-results--button"></button>';
          install();
        }
      }
      assert.equal(evaluate(fn, arg), true);
    },
  };
  try {
    await paginarAlicerce(page);
    assert.equal(clicks, 3);
    assert.equal(loadingChecks, 3);
    assert.equal(document.querySelectorAll('.imovel-item').length, 4);
    assert.equal(document.querySelectorAll('.imovel-item-show').length, 0);
  } finally { dom.window.close(); }
});

test('paginacao sem progresso falha explicitamente e fecha a pagina', async () => {
  let closed = false;
  const page = {
    setRequestInterception: async () => {}, on: () => {},
    setUserAgent: async () => {}, setViewport: async () => {}, goto: async () => {},
    evaluate: async (_fn, limit) => limit === undefined ? undefined : { clicked: true, count: 20 },
    waitForFunction: async () => { throw new Error('Timeout aguardando novos cards'); },
    close: async () => { closed = true; },
    $$eval: async () => assert.fail('Nao deve extrair listagem incompleta'),
  };
  await assert.rejects(extractAlicerceData({ newPage: async () => page }, linksBusca, { totalEsperado: 1081 }), /Timeout/);
  assert.equal(closed, true);
});

test('listagem nao baixa midias mas permite HTML, scripts e requisicoes de paginacao', async () => {
  let requestHandler;
  let closed = false;
  const page = {
    setRequestInterception: async enabled => assert.equal(enabled, true),
    on: (event, callback) => { assert.equal(event, 'request'); requestHandler = callback; },
    setUserAgent: async () => {}, setViewport: async () => {},
    goto: async () => {
      for (const type of ['image', 'media', 'font', 'document', 'script', 'stylesheet', 'xhr', 'fetch']) {
        let action;
        await requestHandler({
          resourceType: () => type,
          abort: async () => { action = 'abort'; },
          continue: async () => { action = 'continue'; },
        });
        assert.equal(action, ['image', 'media', 'font'].includes(type) ? 'abort' : 'continue');
      }
    },
    evaluate: async () => ({ clicked: false, count: 0 }),
    waitForFunction: async () => {},
    $$eval: async selector => { assert.equal(selector, '#imoveis--listing--items .imovel-item'); return []; },
    close: async () => { closed = true; },
  };
  assert.deepEqual(await extractAlicerceData({ newPage: async () => page }, linksBusca, { totalEsperado: 0 }), []);
  assert.equal(closed, true);
});

test('limite de seguranca nao retorna coleta parcial como sucesso', async () => {
  let clicks = 0;
  await assert.rejects(paginarAlicerce({
    evaluate: async (_fn, limit) => {
      if (limit) throw new Error('Limite de paginacao Alicerce atingido; base preservada.');
      return { clicked: true, count: clicks++ };
    },
    waitForFunction: async () => {},
  }), /Limite de paginacao/);
  assert.equal(clicks, 150);
});