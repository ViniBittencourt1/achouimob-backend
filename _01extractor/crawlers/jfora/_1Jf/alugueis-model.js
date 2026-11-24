import { projetosLocacaoPadrao } from '../_utils/locacaoPadraoProjetos.js';
import { projetosLocacaoImobBrasil } from '../_utils/locacaoImobBrasilProjetos.js';
import { projetosLocacaoKenlo } from '../_utils/locacaoKenloProjetos.js';
import { projetosLocacaoDiversos } from '../_utils/locacaoDiversosProjetos.js';
import { projetosSemRotaLocacao } from '../_utils/locacaoPreparacao.js';
import { projetosNiteroiLocacao } from '../niteroi/locacao/projects.js';
import { projetosUba } from '../uba/projects.js';
import { projetosRioHabilitados } from '../rio/projects.js';
import { ordenarProjetos, ordenarScripts } from '../../../../crawler-order.cjs';

const individuais = {
  '1000imoveis': 'jf1000Imoveis', acasas: 'jfACasas', acervo: 'jfAcervo', admyhouse: 'jfAdMyHouse',
  bomclima: 'jfBomClima', estrelasul: 'jfEstrelaSul', fogel: 'jfFogel', holder: 'jfHolder', lider: 'jfLider',
  remax: 'jfRemax', soares: 'jfSoares', start: 'jfStart', souzagomes: 'jfSouzaGomes', toc2: 'jfToc2',
};
const aliases = { rv: 'rvNegocios' };

export function listarProjetosAlugueis(scripts) {
  const groups = [...projetosLocacaoPadrao, ...projetosLocacaoImobBrasil, ...projetosLocacaoKenlo, ...projetosLocacaoDiversos, ...projetosSemRotaLocacao];
  return ordenarProjetos(Object.entries(scripts).filter(([name, cmd]) => name.endsWith(':locacao') && typeof cmd === 'string' && cmd.startsWith('node ') && cmd.includes('_01extractor/crawlers/jfora/')).map(([name, cmd]) => {
    const slug = name.slice(0, -':locacao'.length);
    const group = groups.find(project => project.folder.toLowerCase() === (aliases[slug] || slug).toLowerCase());
    const collection = individuais[slug] || group?.collection
      || projetosNiteroiLocacao.find(project => project.collection.toLowerCase() === slug.toLowerCase())?.collection
      || projetosUba.find(project => project.collection.toLowerCase() === slug.toLowerCase())?.collection
      || projetosRioHabilitados.find(project => project.collection.toLowerCase() === slug.toLowerCase() && project.urlLocacao)?.collection;
    if (!collection) throw new Error(`Projeto de aluguel nao identificado: ${name}`);
    return { name, collection, args: cmd.split(/\s+/).slice(1) };
  }));
}

export function validarConfiguracaoAlugueis(body, projects) {
  if (!body || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.hour)) throw new Error('Horario diario invalido.');
  const allowed = new Set(projects.map(project => project.name));
  if (!Array.isArray(body.selectedScripts) || body.selectedScripts.some(name => !allowed.has(name))) throw new Error('Selecao deve conter somente projetos de aluguel.');
  if (typeof body.enabled !== 'boolean') throw new Error('Agendamento invalido.');
  return { hour: body.hour, enabled: body.enabled, timezone: 'America/Sao_Paulo', selectedScripts: ordenarScripts(body.selectedScripts) };
}

export function validarRegistrosAlugueis(records, campo, catalogos) {
  const fields = { cidades:'cidade', bairros:'bairro', titulo:'titulo', localizacao:'localizacao', tipoImovel:'tipoImovel', preco:'preco', linkFoto:'linkFoto', linkReal:'linkReal' };
  const field = fields[campo];
  if (!field) throw new Error('Campo de validacao invalido.');
  return records.flatMap(item => {
    const value = item[field];
    let problema = '';
    if (field === 'preco') {
      if (value !== null && (!Number.isFinite(value) || value < 0)) problema = 'Preco invalido';
    } else if (!String(value ?? '').trim()) problema = 'Campo vazio';
    else if (field === 'cidade' && !catalogos.cidades.some(city => city.slug === value)) problema = 'Cidade fora do catalogo de slugs';
    else if (field === 'bairro' && !catalogos.bairros.some(bairro => bairro.slug === value && bairro.cidade === item.cidade)) problema = 'Bairro fora do catalogo da cidade';
    else if (field === 'tipoImovel' && !catalogos.tipos.includes(value)) problema = 'Tipo fora do catalogo de slugs';
    else if (field === 'linkFoto' || field === 'linkReal') {
      try { if (!['http:', 'https:'].includes(new URL(value).protocol)) problema = 'URL deve ser HTTP ou HTTPS'; }
      catch { problema = 'URL invalida'; }
    }
    return problema ? [{ imobiliaria:item.imobiliaria, codigoBase:item.codigoBase || '', titulo:item.titulo || '', valor:value ?? '', problema }] : [];
  });
}

export function filtrosRegistrosAlugueis(records, campo) {
  if (!['cidade','bairro','tipoImovel','dormitorioValor','banheiroValor','garagemValor'].includes(campo)) throw new Error('Campo de filtro invalido.');
  const groups = new Map();
  for (const item of records) {
    const valor = String(item[campo] ?? '');
    const cidade = campo === 'bairro' ? String(item.cidade || '') : '';
    const key = JSON.stringify([valor,cidade]);
    const row = groups.get(key) || { valor,cidade,quantidade:0 };
    row.quantidade++;
    groups.set(key,row);
  }
  return [...groups.values()].sort((left,right)=>right.quantidade-left.quantidade || left.valor.localeCompare(right.valor,'pt-BR'));
}

export function duplicadosRegistrosAlugueis(records) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const groups = new Map();
  const add = (key, tipo, identificacao, item) => {
    const group = groups.get(key) || { tipo,identificacao,imobiliarias:new Set(),registros:new Set() };
    group.imobiliarias.add(item.imobiliaria);
    group.registros.add(item);
    groups.set(key,group);
  };
  for (const item of records) {
    if (item.codigoBase) add(`codigo:${item.imobiliaria}:${item.codigoBase}`,'Codigo repetido',String(item.codigoBase),item);
    try { const url = new URL(item.linkReal); url.search=''; url.hash=''; add(`link:${url.href}`,'Link repetido',url.href,item); } catch {}
    const endereco = normalize(item.localizacao);
    if (Number(item.areaValor) > 0 && endereco && /\d/.test(endereco) && item.cidade && item.tipoImovel) {
      const key = JSON.stringify([endereco,item.cidade,item.tipoImovel,Number(item.areaValor),Number(item.dormitorioValor || 0),Number(item.banheiroValor || 0),Number(item.garagemValor || 0)]);
      add(`endereco:${key}`,'Candidato por endereco e caracteristicas',item.localizacao,item);
    }
  }
  return [...groups.values()].filter(group => group.registros.size > 1).map(group => ({ tipo:group.tipo,identificacao:group.identificacao,imobiliarias:[...group.imobiliarias].sort(),quantidade:group.registros.size }));
}