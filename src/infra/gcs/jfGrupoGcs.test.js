import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, pilotValues } from './pilotTestSupport.js';
import { TransactionStore } from './transactionStore.js';
import { OperationalStore } from './operationalStore.js';
import { prepareUniversalPilot } from './prepareUniversalPilot.js';
import { prepareJfSharedPilot } from './prepareJfSharedPilot.js';
import { projetoJfGcs, runProjetoJfGcs } from '../../../_01extractor/crawlers/jfora/_utils/jfGrupoGcs.js';
import { consolidateData as bargonConsolidate } from '../../../_01extractor/crawlers/jfora/bargon/parser.js';
import { consolidateData as universalConsolidate } from '../../../_01extractor/crawlers/jfora/universal/parser.js';
import { consolidateData as brasilConsolidate } from '../../../_01extractor/crawlers/jfora/brasil/parser.js';
import { consolidateData as casaNovaConsolidate } from '../../../_01extractor/crawlers/jfora/casaNova/parser.js';
import { runJfSalesGcs } from '../../../_01extractor/crawlers/jfora/universal/gcsVendas.js';
import { runJfRentGcs } from '../../../_01extractor/crawlers/jfora/universal/gcsLocacao.js';

test('grupo rejeita projetos nao adaptados e preserva consolidacao Bargon', () => {
  assert.equal(projetoJfGcs('bargon'), 'jfBargon');
  assert.equal(projetoJfGcs('brasil'), 'jfBrasil');
  assert.equal(projetoJfGcs('casaNova'), 'jfCasaNova');
  assert.throws(() => projetoJfGcs('outro'), /nao adaptado/);
  const old = [{ linkReal: 'https://bargonimoveis.com.br/imovel/1', dataInclusao: '2020-01-01', linkCard: 'anterior' },
    { linkReal: 'https://bargonimoveis.com.br/imovel/2' }];
  const items = [{ linkReal: old[0].linkReal, preco: 300, linkCard: 'novo' },
    { linkReal: 'https://bargonimoveis.com.br/imovel/3', preco: 400 }];
  const map = () => new Map(structuredClone(old).map(item => [item.linkReal, item]));
  assert.deepEqual(bargonConsolidate(structuredClone(items), map()), universalConsolidate(structuredClone(items), map()));
});

test('grupo reconcilia Bargon sem misturar projetos nem publicar relatorios', async () => {
  const storage = memoryStorage();
  const tx = scope => new TransactionStore({ storage, scope, computerId: 'pc' });
  const source = tx('base-preparacao-inicial'), pilot = tx('piloto-jfuniversal-teste'), shared = tx('piloto-jf-compartilhado-teste');
  const link = 'https://bargonimoveis.com.br/imovel/1';
  const data = {
    ...pilotValues(),
    'crawler/jfBargon.json': [{ linkReal: link, codigoBase: '1', preco: 100, dataInclusao: '2020-01-01' }],
    'crawler/jfBargonRetiradosVendas.json': [],
    'crawler/jfBargonLocacao.json': [{ linkReal: link, codigoBase: '1', preco: 1000, dataInclusao: '2020-01-01' }],
    'crawler/jfBargonRetiradosLocacao.json': [],
    '_03database/outros/alugueis-bairro-correcoes.json': [],
    '_03database/outros/alugueis-cidade-correcoes.json': [],
    '_03database/outros/alugueis-tipo-imovel-correcoes.json': [],
    '_03database/outros/alugueis-linkfoto-correcoes.json': [],
  };
  let lease = await source.acquire(60000);
  const docs = {};
  for (const [key, value] of Object.entries(data)) docs[key] = await source.stage(lease, value);
  lease = (await source.commit(lease, docs)).lease;
  await source.release(lease);
  await prepareUniversalPilot({ source, destination: pilot, actor: 'operador' });
  await prepareJfSharedPilot({ source, universal: pilot, destination: shared, actor: 'operador' });
  const store = new OperationalStore({ transaction: shared });
  const collect = async () => ({ totalEsperado: 1, imoveis: [{ linkReal: link, codigoBase: '1', preco: 200 }] });
  const venda = await runProjetoJfGcs({ projeto: 'bargon', negociacao: 'venda', actor: 'operador', store, collect });
  const aluguel = await runProjetoJfGcs({ projeto: 'bargon', negociacao: 'aluguel', actor: 'operador', store, collect });
  const snapshot = await store.read(['crawler/jfBargon.json', 'crawler/jfBargonLocacao.json', 'crawler/jfUniversal.json', venda.reportKey, aluguel.reportKey]);
  assert.equal(snapshot.values['crawler/jfBargon.json'][0].preco, 200);
  assert.equal(snapshot.values['crawler/jfBargonLocacao.json'][0].preco, 200);
  assert.equal(snapshot.values['crawler/jfUniversal.json'].length, 2);
  assert.equal(snapshot.values[venda.reportKey].status, 'pendente');
  assert.equal(snapshot.values[aluguel.reportKey].status, 'pendente');
  await assert.rejects(runProjetoJfGcs({ projeto: 'bargon', negociacao: 'venda', actor: 'operador', store,
    collect: async () => ({ totalEsperado: 2, imoveis: [{ linkReal: link, preco: 100 }] }) }), /incompleta/);
  assert.equal((await shared.current()).revision, 3);
});

for (const [project, host, consolidate] of [
  ['jfBrasil', 'brasilimoveisjf.com.br', brasilConsolidate],
  ['jfCasaNova', 'casanovajf.com.br', casaNovaConsolidate],
]) {
  test(`${project} preserva regras, historico e demais projetos nas duas negociacoes`, async () => {
    const storage = memoryStorage();
    const tx = scope => new TransactionStore({ storage, scope, computerId: 'pc' });
    const source = tx('base-preparacao-inicial'), pilot = tx('piloto-jfuniversal-teste'), shared = tx('piloto-jf-compartilhado-teste');
    const link = `https://${host}/imovel/1`;
    const old = [{ linkReal: link, codigoBase: '1', preco: 100, dataInclusao: '2020-01-01' },
      { linkReal: `https://${host}/imovel/2`, codigoBase: '2', preco: 200 }];
    const items = [{ linkReal: link, codigoBase: '1', preco: 300 },
      { linkReal: `https://${host}/imovel/3`, codigoBase: '3', preco: 400 }];
    const map = () => new Map(structuredClone(old).map(item => [item.linkReal, item]));
    assert.deepEqual(consolidate(structuredClone(items), map()), universalConsolidate(structuredClone(items), map()));
    const data = {
      ...pilotValues(),
      [`crawler/${project}.json`]: structuredClone(old),
      [`crawler/${project}RetiradosVendas.json`]: [{ retiradaId: 'venda-anterior' }],
      [`crawler/${project}Locacao.json`]: structuredClone(old),
      [`crawler/${project}RetiradosLocacao.json`]: [{ retiradaId: 'aluguel-anterior' }],
      '_03database/outros/alugueis-bairro-correcoes.json': [],
      '_03database/outros/alugueis-cidade-correcoes.json': [],
      '_03database/outros/alugueis-tipo-imovel-correcoes.json': [],
      '_03database/outros/alugueis-linkfoto-correcoes.json': [],
    };
    let lease = await source.acquire(60000);
    const docs = {};
    for (const [key, value] of Object.entries(data)) docs[key] = await source.stage(lease, value);
    lease = (await source.commit(lease, docs)).lease;
    await source.release(lease);
    await prepareUniversalPilot({ source, destination: pilot, actor: 'operador' });
    await prepareJfSharedPilot({ source, universal: pilot, destination: shared, actor: 'operador' });
    const store = new OperationalStore({ transaction: shared });
    const collect = async () => ({ totalEsperado: 2, imoveis: structuredClone(items) });
    const options = { store, actor: 'operador', project, collect };
    const venda = await runJfSalesGcs(options);
    const aluguel = await runJfRentGcs(options);
    const snapshot = await store.read([
      `crawler/${project}.json`, `crawler/${project}Locacao.json`,
      `crawler/${project}RetiradosVendas.json`, `crawler/${project}RetiradosLocacao.json`,
      'crawler/jfUniversal.json', venda.reportKey, aluguel.reportKey,
    ]);
    assert.equal(snapshot.values[`crawler/${project}.json`][0].preco, 300);
    assert.equal(snapshot.values[`crawler/${project}Locacao.json`][0].dataInclusao, '2020-01-01');
    assert.equal(snapshot.values[`crawler/${project}RetiradosVendas.json`].length, 2);
    assert.equal(snapshot.values[`crawler/${project}RetiradosLocacao.json`].length, 2);
    assert.equal(snapshot.values['crawler/jfUniversal.json'].length, 2);
    assert.equal(snapshot.values[venda.reportKey].status, 'pendente');
    assert.equal(snapshot.values[aluguel.reportKey].status, 'pendente');
    await assert.rejects(runJfSalesGcs({ ...options, collect: async () => ({ totalEsperado: 2, imoveis: [items[0]] }) }), /incompleta/);
    assert.equal((await shared.current()).revision, 3);
  });
}
