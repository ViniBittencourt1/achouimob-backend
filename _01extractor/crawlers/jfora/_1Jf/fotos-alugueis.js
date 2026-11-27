import fs from 'node:fs';
import path from 'node:path';

const read=(file,fallback=[])=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
const save=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(data,null,2)}\n`,'utf8');};
const confirmationKey=item=>{
  const codigo=String(item.codigoBase ?? '').trim();
  return JSON.stringify([item.file,codigo && codigo!=='0'?codigo:String(item.linkReal || item.index)]);
};

export function linkFotoValido(value) {
  try {return ['http:','https:'].includes(new URL(String(value || '').trim()).protocol);} catch {return false;}
}

export function listarPendenciasFotoAlugueis(backendRoot,projects) {
  const confirmed=read(path.join(backendRoot,'_03database/outros/alugueis-linkfoto-confirmacoes.json'));
  const issues=[];
  const projectStats=[];
  for (const project of projects) {
    const file=`${project.collection}Locacao.json`;
    const records=read(path.join(backendRoot,'crawler',file));
    if (!Array.isArray(records)) throw new Error(`JSON invalido: ${file}`);
    let total=0,emptyLinkFotoCount=0;
    records.forEach((item,index)=>{
      if (String(item.dataExclusao || '').trim()) return;
      total++;
      const linkFoto=String(item.linkFoto || '').trim();
      const empty=!linkFoto;
      if (empty) emptyLinkFotoCount++;
      if (linkFotoValido(linkFoto)) return;
      const issue={file,index,codigoBase:item.codigoBase || '',linkFoto,motivo:empty?'vazio':'invalido',titulo:item.titulo || '',tipoImovel:item.tipoImovel || '',cidade:item.cidade || '',bairro:item.bairro || '',linkReal:item.linkReal || ''};
      if (confirmed.some(saved=>confirmationKey(saved)===confirmationKey(issue) && String(saved.linkFotoAtual ?? '').trim()===linkFoto)) return;
      issues.push(issue);
    });
    if (total) projectStats.push({file,total,emptyLinkFotoCount,emptyLinkFotoPercentage:Number((emptyLinkFotoCount/total*100).toFixed(1))});
  }
  issues.sort((left,right)=>left.file.localeCompare(right.file,'pt-BR') || left.index-right.index);
  projectStats.sort((left,right)=>right.emptyLinkFotoPercentage-left.emptyLinkFotoPercentage || left.file.localeCompare(right.file,'pt-BR'));
  return {ok:true,total:issues.length,issues,projectStats};
}

export function resolverFotoAlugueis(backendRoot,projects,body) {
  if (!projects.some(project=>`${project.collection}Locacao.json`===body.file)) throw new Error('Arquivo invalido: corrija somente JSONs ativos de aluguel.');
  const linkFoto=String(body.linkFoto || '').trim();
  if (!linkFotoValido(linkFoto)) throw new Error('Informe um link de foto HTTP ou HTTPS valido.');
  if (!String(body.linkReal || '').trim()) throw new Error('linkReal obrigatorio para localizar o registro.');
  const file=path.join(backendRoot,'crawler',body.file);
  const records=read(file);
  const index=records.findIndex(item=>item.linkReal===body.linkReal && !String(item.dataExclusao || '').trim());
  if (index<0) throw new Error('Registro ativo nao encontrado pelo linkReal.');
  const correctionsPath=path.join(backendRoot,'_03database/outros/alugueis-linkfoto-correcoes.json');
  const corrections=read(correctionsPath);
  const correction={file:body.file,linkReal:body.linkReal,codigoBase:records[index].codigoBase || '',linkFoto};
  const previous=corrections.findIndex(item=>item.file===body.file && item.linkReal===body.linkReal);
  if (previous<0) corrections.push(correction); else corrections[previous]=correction;
  save(correctionsPath,corrections);
  records[index]={...records[index],linkFoto};
  save(file,records);
  return {ok:true,file:body.file,linkReal:body.linkReal,linkFoto};
}

export function confirmarFotoIndividualAlugueis(backendRoot,projects,body) {
  if (!projects.some(project=>`${project.collection}Locacao.json`===body.file)) throw new Error('Arquivo invalido: confirme somente registros ativos de aluguel.');
  const records=read(path.join(backendRoot,'crawler',body.file));
  const index=body.linkReal ? records.findIndex(item=>item.linkReal===body.linkReal) : Number.isInteger(body.index)?body.index:-1;
  const item=records[index];
  if (!item || String(item.dataExclusao || '').trim()) throw new Error('Registro ativo nao encontrado.');
  const linkFotoAtual=String(item.linkFoto || '').trim();
  if (linkFotoValido(linkFotoAtual)) throw new Error('O registro possui linkFoto valido. Atualize a checagem.');
  if (body.linkFotoAtual !== undefined && String(body.linkFotoAtual).trim()!==linkFotoAtual) throw new Error('O linkFoto mudou. Atualize a checagem antes de confirmar.');
  const file=path.join(backendRoot,'_03database/outros/alugueis-linkfoto-confirmacoes.json');
  const confirmations=read(file);
  const confirmation={file:body.file,linkReal:item.linkReal || '',codigoBase:item.codigoBase || '',index,linkFotoAtual};
  const previous=confirmations.findIndex(saved=>confirmationKey(saved)===confirmationKey(confirmation));
  if (previous>=0 && String(confirmations[previous].linkFotoAtual ?? '').trim()===linkFotoAtual) return {ok:true,confirmed:0};
  if (previous<0) confirmations.push(confirmation); else confirmations[previous]=confirmation;
  save(file,confirmations);
  return {ok:true,confirmed:1,file:body.file,linkReal:confirmation.linkReal};
}

export function confirmarSemFotoAlugueis(backendRoot,projects) {
  const pending=listarPendenciasFotoAlugueis(backendRoot,projects).issues.filter(item=>item.motivo==='vazio');
  const file=path.join(backendRoot,'_03database/outros/alugueis-linkfoto-confirmacoes.json');
  const confirmations=read(file);
  let confirmed=0;
  for (const issue of pending) {
    const key=confirmationKey(issue);
    const previous=confirmations.findIndex(item=>confirmationKey(item)===key);
    if (previous>=0 && String(confirmations[previous].linkFotoAtual ?? '').trim()==='') continue;
    const confirmation={file:issue.file,linkReal:issue.linkReal,codigoBase:issue.codigoBase,index:issue.index,linkFotoAtual:''};
    if (previous<0) confirmations.push(confirmation); else confirmations[previous]=confirmation;
    confirmed++;
  }
  if (confirmed) save(file,confirmations);
  return {ok:true,confirmed,total:pending.length};
}

export function aplicarCorrecoesFotoAlugueis(records,collection,backendRoot,suppliedCorrections) {
  const corrections = suppliedCorrections === undefined
    ? read(path.join(backendRoot,'_03database/outros/alugueis-linkfoto-correcoes.json')) : suppliedCorrections;
  if (!Array.isArray(corrections)) throw new Error('Correcoes de foto de aluguel invalidas.');
  return records.map(item=>{
    const correction=corrections.find(saved=>saved.file===`${collection}Locacao.json` && (saved.linkReal===item.linkReal || (saved.codigoBase && String(saved.codigoBase)!=='0' && String(saved.codigoBase)===String(item.codigoBase))));
    return correction?{...item,linkFoto:correction.linkFoto}:item;
  });
}