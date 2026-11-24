import { ConcurrentModificationError } from './jsonStorage.js';

export function memoryStorage() {
  const current = new Map();
  const versions = new Map();
  let generation = 0;
  return {
    async read(name) {
      const item = current.get(name);
      if (!item) throw Object.assign(new Error('not found'), { code: 404 });
      return { data: structuredClone(item.data), generation: item.generation };
    },
    async readVersion(name, gen) {
      const data = versions.get(`${name}:${gen}`);
      if (data === undefined) throw Object.assign(new Error('not found'), { code: 404 });
      return { data: structuredClone(data), generation: gen };
    },
    async write(name, data, { expectedGeneration }) {
      if ((current.get(name)?.generation || '0') !== String(expectedGeneration)) throw new ConcurrentModificationError(name);
      const gen = String(++generation);
      current.set(name, { generation: gen, data: structuredClone(data) });
      versions.set(`${name}:${gen}`, structuredClone(data));
      return { generation: gen };
    },
  };
}

export function pilotValues() {
  const first = 'https://universalimoveis.com.br//imovel/1';
  const second = 'https://universalimoveis.com.br//imovel/2';
  return {
    'crawler/jfUniversal.json': [
      { linkReal: first, codigoBase: '1', preco: 100, dataInclusao: '2020-01-01', cidade: 'antiga' },
      { linkReal: second, codigoBase: '2', preco: 200, campoExtra: 'preservado' },
    ],
    'crawler/jfUniversalRetiradosVendas.json': [{ retiradaId: 'historico-anterior', linkReal: 'https://example.com/antigo' }],
    '_03database/filtros/jfHistoricoRaspagens.json': { outroProjeto: { anterior: { totalImoveis: 3 } } },
    '_03database/outros/duplicados-grupos.json': { grupos: { grupo1: { membros: [{ collectionName: 'jfUniversal', linkReal: first }] } } },
    '_03database/outros/city-json-manual-corrections.json': [{ file: 'jfUniversal.json', linkReal: first, limparCidade: true }],
    '_03database/filtros/_jfBairrosManualCorrections.json': [{ file: 'jfUniversal.json', linkReal: first, bairro: 'bairro-corrigido' }],
    '_03database/outros/tipo-imovel-json-manual-corrections.json': [{ file: 'jfUniversal.json', linkReal: first, tipoImovel: 'casa' }],
    '_03database/outros/localizacao-json-manual-corrections.json': [{ file: 'jfUniversal.json', linkReal: first, localizacao: 'corrigida' }],
    '_03database/outros/linkfoto-json-manual-corrections.json': [{ file: 'jfUniversal.json', linkReal: first, linkFoto: 'foto-corrigida' }],
    '_03database/outros/preco-json-manual-corrections.json': [{ file: 'jfUniversal.json', linkReal: first, preco: 123 }],
    '_03database/filtros/_brCidades.json': [{ nome: 'Cidade Teste', slug: 'cidade-teste' }],
    '_03database/filtros/_jfBairros.json': [{ nome: 'Centro Teste', slug: 'centro-teste', cidade: 'cidade-teste', principal: 'sim' }],
    '_03database/filtros/_brTipoImovel.json': { tipos: [{ nome: 'Casa Teste', slug: 'casa-teste' }] },
  };
}

export function fakeSheets() {
  const cells = new Map();
  const writes = [];
  return {
    cells, writes,
    async ensureSheet(_id, title) { return title; },
    async readSheet(_id, range) { return cells.has(range) ? [structuredClone(cells.get(range))] : []; },
    async writeSheet(_id, range, values) { cells.set(range, structuredClone(values[0])); writes.push(range); },
  };
}
