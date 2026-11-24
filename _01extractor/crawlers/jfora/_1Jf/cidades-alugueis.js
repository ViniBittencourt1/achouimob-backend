import fs from 'node:fs';
import path from 'node:path';
import { catalogosBairroAlugueis } from './bairros-alugueis.js';

const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const save = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

export function listarPendenciasCidadeAlugueis(root, projects) {
  const { cidades, cityOptions } = catalogosBairroAlugueis(root);
  const slugs = new Set(cidades.map(item => item.slug));
  const issues = [];
  for (const project of projects) {
    const file = `${project.collection}Locacao.json`;
    const records = read(path.join(root, 'crawler', file));
    if (!Array.isArray(records)) throw new Error(`JSON invalido: ${file}`);
    records.forEach((item, index) => {
      if (String(item.dataExclusao || '').trim()) return;
      const cidade = String(item.cidade || '').trim();
      const motivo = !cidade ? 'vazio' : !slugs.has(cidade) ? 'sem-slug' : '';
      if (motivo) issues.push({ file, index, cidade, motivo, codigoBase: item.codigoBase || '', titulo: item.titulo || '', linkReal: item.linkReal || '' });
    });
  }
  return { ok: true, total: issues.length, issues, cityOptions };
}

export function resolverCidadeAlugueis(root, projects, body) {
  if (!projects.some(project => `${project.collection}Locacao.json` === body.file)) throw new Error('Arquivo invalido: corrija somente JSONs ativos de aluguel.');
  if (!['assign', 'create'].includes(body.mode)) throw new Error('Modo invalido.');
  if (!String(body.linkReal || '').trim()) throw new Error('linkReal obrigatorio.');
  const file = path.join(root, 'crawler', body.file);
  const records = read(file);
  if (!Array.isArray(records)) throw new Error('JSON de aluguel invalido.');
  const index = records.findIndex(item => item.linkReal === body.linkReal && !String(item.dataExclusao || '').trim());
  if (index < 0) throw new Error('Registro ativo nao encontrado pelo linkReal.');
  const { cidades } = catalogosBairroAlugueis(root);
  let cidade = String(body.targetSlug || '').trim();
  let nome = String(body.targetNome || '').trim();
  if (body.mode === 'create') {
    if (!nome && !cidade) throw new Error('Informe nome ou slug para criar a cidade.');
    cidade = (cidade || nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!cidade) throw new Error('Slug de cidade invalido.');
    nome = nome || cidade.replace(/-/g, ' ');
    if (!cidades.some(item => item.slug === cidade)) {
      cidades.push({ nome, slug: cidade, principal: 'sim' });
      save(path.join(root, '_03database/filtros/_brCidades.json'), cidades);
    }
  } else {
    const found = cidades.find(item => item.slug === cidade);
    if (!found) throw new Error('Cidade invalida para atribuicao.');
    nome = found.nome || cidade;
  }
  const correctionsPath = path.join(root, '_03database/outros/alugueis-cidade-correcoes.json');
  const corrections = read(correctionsPath);
  const correction = { file: body.file, linkReal: body.linkReal, codigoBase: records[index].codigoBase || '', cidade };
  const previous = corrections.findIndex(item => item.file === body.file && item.linkReal === body.linkReal);
  if (previous < 0) corrections.push(correction); else corrections[previous] = correction;
  save(correctionsPath, corrections);
  records[index] = { ...records[index], cidade };
  save(file, records);
  return { ok: true, file: body.file, cidade, nome };
}

export function aplicarCorrecoesCidadeAlugueis(records, collection, root) {
  const corrections = read(path.join(root, '_03database/outros/alugueis-cidade-correcoes.json'));
  return records.map(item => {
    const correction = corrections.find(saved => saved.file === `${collection}Locacao.json` &&
      (saved.linkReal === item.linkReal || (saved.codigoBase && String(saved.codigoBase) === String(item.codigoBase))));
    return correction ? { ...item, cidade: correction.cidade } : item;
  });
}
