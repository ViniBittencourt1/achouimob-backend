import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listarPendenciasCidadeAlugueis, resolverCidadeAlugueis, aplicarCorrecoesCidadeAlugueis } from './cidades-alugueis.js';
import { criarPainelAlugueis } from './alugueis.js';
import { sincronizarLocacao } from '../_utils/locacaoSincronizacao.js';

test('cidade atribuida ou criada altera apenas aluguel e persiste nas proximas raspagens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cidades-alugueis-'));
  const projects = [{ collection: 'jfTeste' }];
  let panel;
  try {
    fs.mkdirSync(path.join(root, 'crawler'));
    fs.mkdirSync(path.join(root, '_03database/filtros'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { 'bomclima:locacao': 'node _01extractor/crawlers/jfora/bomClima/index-locacao.js' } }));
    fs.writeFileSync(path.join(root, '_03database/filtros/_brCidades.json'), JSON.stringify([{ nome: 'Juiz de Fora', slug: 'juiz-de-fora-mg', principal: 'sim' }]));
    const filename = path.join(root, 'crawler/jfTesteLocacao.json');
    const records = [
      { linkReal: 'https://example.com/1', codigoBase: '1', cidade: '', preco: 850, bairro: 'centro' },
      { linkReal: 'https://example.com/2', codigoBase: '2', cidade: 'INVALIDA', preco: 900 },
      { linkReal: 'https://example.com/3', cidade: '', dataExclusao: '2026-10-01' },
    ];
    fs.writeFileSync(filename, JSON.stringify(records));
    const sale = JSON.stringify([{ cidade: 'VENDA' }]);
    fs.writeFileSync(path.join(root, 'crawler/jfTeste.json'), sale);
    assert.equal(listarPendenciasCidadeAlugueis(root, projects).total, 2);
    const body = { file: 'jfTesteLocacao.json', linkReal: records[0].linkReal, mode: 'assign', targetSlug: 'juiz-de-fora-mg' };
    for (const invalid of [
      { file: 'jfTeste.json' }, { file: '../jfTesteLocacao.json' },
      { targetSlug: 'invalida' }, { mode: 'outro' }, { linkReal: '' }, { linkReal: records[2].linkReal },
    ]) assert.throws(() => resolverCidadeAlugueis(root, projects, { ...body, ...invalid }));
    resolverCidadeAlugueis(root, projects, body);
    const after = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.deepEqual(after, [{ ...records[0], cidade: 'juiz-de-fora-mg' }, ...records.slice(1)]);
    assert.equal(aplicarCorrecoesCidadeAlugueis([{ linkReal: 'novo', codigoBase: '1', cidade: '' }], 'jfTeste', root)[0].cidade, 'juiz-de-fora-mg');
    assert.equal(aplicarCorrecoesCidadeAlugueis([{ linkReal: records[0].linkReal, cidade: '' }], 'jfOutra', root)[0].cidade, '');
    assert.equal(resolverCidadeAlugueis(root, projects, { ...body, linkReal: records[1].linkReal, mode: 'create', targetSlug: '', targetNome: 'Nova Cidade RJ' }).cidade, 'nova-cidade-rj');
    assert.equal(listarPendenciasCidadeAlugueis(root, projects).total, 0);
    assert.equal(fs.readFileSync(path.join(root, 'crawler/jfTeste.json'), 'utf8'), sale);
    fs.writeFileSync(path.join(root, 'crawler/jfBomClimaLocacao.json'), JSON.stringify(records));
    panel = criarPainelAlugueis({ backendRoot: root });
    await new Promise(resolve => panel.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${panel.server.address().port}`;
    const response = await fetch(`${base}/api/city-json-issues`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total, 2);
    assert.ok(data.cityOptions.some(city => city.slug === 'nova-cidade-rj'));
    const corrected = await fetch(`${base}/api/city-json-issues/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, file: 'jfBomClimaLocacao.json' }) });
    assert.equal(corrected.status, 200);
    assert.equal((await corrected.json()).cidade, 'juiz-de-fora-mg');
    panel.state.running = true;
    const busy = await fetch(`${base}/api/city-json-issues/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, file: 'jfBomClimaLocacao.json' }) });
    assert.equal(busy.status, 409);
    panel.state.running = false;
    const blocked = await fetch(`${base}/api/city-json-issues/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, file: 'jfTeste.json' }) });
    assert.equal(blocked.status, 400);
    await sincronizarLocacao({
      imoveis: [{ linkReal: 'https://example.com/novo', codigoBase: '1', cidade: '', preco: 850 }],
      anteriores: [], imobiliaria: 'jfTeste', outputPath: filename, totalEsperado: 1,
      exportToSheets: async ativos => assert.equal([...ativos.values()][0].cidade, 'juiz-de-fora-mg'),
    });
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8'))[0].cidade, 'juiz-de-fora-mg');
  } finally {
    if (panel) await panel.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
