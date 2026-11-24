import fs from 'node:fs';
import path from 'node:path';

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
const read = (file, fallback = []) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback;
const save = (file, data) => {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(data,null,2)}\n`,'utf8');};
const defaultCatalog = JSON.parse(fs.readFileSync(new URL('../../../../_03database/filtros/_brTipoImovel.json',import.meta.url),'utf8'));

function typeEntries(catalog) {
  if (catalog.tiposPorSlug) return Object.entries(catalog.tiposPorSlug).map(([slug,aliases])=>({slug,aliases:Array.isArray(aliases)?aliases:[]}));
  return Object.values(catalog.tiposFiltro || {}).flat().map(item=>({slug:item.slug,aliases:[item]}));
}

export function resolverTipoCatalogo(value, catalog = defaultCatalog) {
  const text = normalize(value);
  if (!text) return '';
  const entries = typeEntries(catalog);
  const canonical = entries.find(entry=>normalize(entry.slug)===text);
  if (canonical) return canonical.slug;
  const matches = new Set(entries.filter(entry=>entry.aliases.some(alias=>normalize(alias.nome)===text)).map(entry=>entry.slug));
  return matches.size===1 ? [...matches][0] : '';
}

export function resolverTipoCatalogoInicioTitulo(value, catalog = defaultCatalog) {
  const cabecalho = String(value ?? '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim()
    .split(/\s+para\s+(?:venda|loca[cç][aã]o)\b/i)[0];
  const palavras = cabecalho.split(/\s+/);
  for (let length = palavras.length; length > 0; length--) {
    const tipo = resolverTipoCatalogo(palavras.slice(0, length).join(' ').replace(/[^\p{L}\p{N}]+$/u, ''), catalog);
    if (tipo) return tipo;
  }
  return '';
}

export function resolverTipoCatalogoContido(value, catalog = defaultCatalog) {
  const text = ` ${normalize(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim()} `;
  if (!text.trim()) return '';
  const entries = typeEntries(catalog);
  const exact = resolverTipoCatalogo(value, catalog);
  if (exact) return exact;

  const matches = entries.flatMap(entry => entry.aliases.map(alias => ({
    slug: entry.slug,
    name: normalize(alias.nome).replace(/[^\p{L}\p{N}]+/gu,' ').trim(),
  }))).filter(alias => alias.name && text.includes(` ${alias.name} `));
  if (!matches.length) return '';

  const mostSpecific = Math.max(...matches.map(alias => alias.name.split(' ').length));
  const slugs = new Set(matches.filter(alias => alias.name.split(' ').length === mostSpecific).map(alias => alias.slug));
  return slugs.size === 1 ? [...slugs][0] : '';
}

export function resolverTipoCatalogoTextoAnuncio(value, catalog = defaultCatalog) {
  const cabecalho = normalize(value).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(/\b(?:para venda|para locacao|a venda|para alugar|no bairro|na rodovia|no centro|proximo|proxima|perto)\b/)[0];
  const especificos = {
    tiposPorSlug: Object.fromEntries(typeEntries(catalog).map(entry => [
      entry.slug, entry.aliases.filter(alias => !['comercial', 'rural'].includes(normalize(alias.nome))),
    ])),
  };
  return resolverTipoCatalogoContido(cabecalho, especificos) || resolverTipoCatalogoContido(cabecalho, catalog);
}

export function catalogoTiposAlugueis(backendRoot) {
  const catalog = read(path.join(backendRoot,'_03database/filtros/_brTipoImovel.json'),{});
  const typeOptions = [...new Map(typeEntries(catalog).map(entry=>[entry.slug,{slug:entry.slug,nome:entry.aliases[0]?.nome || entry.slug}])).values()].sort((left,right)=>left.slug.localeCompare(right.slug,'pt-BR'));
  return {catalog,typeOptions};
}

export function listarPendenciasTipoAlugueis(backendRoot, projects) {
  const {typeOptions}=catalogoTiposAlugueis(backendRoot);
  const allowed=new Set(typeOptions.map(item=>item.slug));
  const issues=[];
  for (const project of projects) {
    const file=`${project.collection}Locacao.json`;
    const records=read(path.join(backendRoot,'crawler',file));
    if (!Array.isArray(records)) throw new Error(`JSON invalido: ${file}`);
    records.forEach((item,index)=>{
      if (String(item.dataExclusao || '').trim()) return;
      const tipoImovel=String(item.tipoImovel || '').trim();
      const motivo=!tipoImovel?'vazio':!allowed.has(tipoImovel)?'fora-do-catalogo':'';
      if (motivo) issues.push({file,index,tipoImovel,motivo,titulo:item.titulo || '',localizacao:item.localizacao || '',cidade:item.cidade || '',bairro:item.bairro || '',linkReal:item.linkReal || ''});
    });
  }
  const totalVazios=issues.filter(item=>item.motivo==='vazio').length;
  return {ok:true,total:issues.length,totalVazios,totalForaDoCatalogo:issues.length-totalVazios,issues,typeOptions};
}

export function resolverTipoAlugueis(backendRoot, projects, body) {
  if (!projects.some(project=>`${project.collection}Locacao.json`===body.file)) throw new Error('Arquivo invalido: corrija somente JSONs ativos de aluguel.');
  const {typeOptions}=catalogoTiposAlugueis(backendRoot);
  if (!typeOptions.some(item=>item.slug===body.tipoImovel)) throw new Error('Tipo de imovel invalido: selecione um slug do catalogo.');
  const file=path.join(backendRoot,'crawler',body.file);
  const records=read(file);
  const index=records.findIndex(item=>item.linkReal===body.linkReal && !String(item.dataExclusao || '').trim());
  if (index<0) throw new Error('Registro ativo nao encontrado pelo linkReal.');
  const correctionsPath=path.join(backendRoot,'_03database/outros/alugueis-tipo-imovel-correcoes.json');
  const corrections=read(correctionsPath);
  const correction={file:body.file,linkReal:body.linkReal,codigoBase:records[index].codigoBase || '',tipoImovel:body.tipoImovel};
  const previous=corrections.findIndex(item=>item.file===body.file && item.linkReal===body.linkReal);
  if (previous<0) corrections.push(correction); else corrections[previous]=correction;
  save(correctionsPath,corrections);
  records[index]={...records[index],tipoImovel:body.tipoImovel};
  save(file,records);
  return {ok:true,file:body.file,linkReal:body.linkReal,tipoImovel:body.tipoImovel};
}

export function aplicarCorrecoesTipoAlugueis(records, collection, backendRoot) {
  const corrections=read(path.join(backendRoot,'_03database/outros/alugueis-tipo-imovel-correcoes.json'));
  return records.map(item=>{
    const correction=corrections.find(saved=>saved.file===`${collection}Locacao.json` && (saved.linkReal===item.linkReal || (saved.codigoBase && String(saved.codigoBase)===String(item.codigoBase))));
    return correction?{...item,tipoImovel:correction.tipoImovel}:item;
  });
}