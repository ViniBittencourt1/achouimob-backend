import path from 'node:path';

export function manualCorrectionMaps(file, cityCorrections, bairroCorrections) {
  const fileLower = String(file || '').trim().toLowerCase();
  const cityByLink = new Map(cityCorrections
    .filter(item => String(item?.file || '').trim().toLowerCase() === fileLower)
    .map(item => [String(item?.linkReal || '').trim(), item?.limparCidade === true ? '' : String(item?.cidade || '').trim(), item?.limparCidade === true])
    .filter(([link, city, clear]) => link && (city || clear))
    .map(([link, city]) => [link, city]));
  const bairroByLink = new Map(bairroCorrections
    .filter(item => String(item?.file || '').trim().toLowerCase() === fileLower)
    .map(item => [String(item?.linkReal || '').trim(), String(item?.bairro || '').trim()])
    .filter(([link, bairro]) => link && bairro));
  return { cityByLink, bairroByLink };
}

export function applyManualCorrection(record, key, corrections) {
  const link = String(record?.linkReal || key || '').trim();
  if (!link) return 0;
  const city = corrections.cityByLink.get(link);
  const bairro = corrections.bairroByLink.get(link);
  let applied = 0;
  if (corrections.cityByLink.has(link) && String(record.cidade || '').trim() !== city) {
    record.cidade = city;
    applied++;
  }
  if (bairro && String(record.bairro || '').trim() !== bairro) {
    record.bairro = bairro;
    applied++;
  }
  return applied;
}

export function duplicateGroupsForFile(file, store) {
  const grupos = store?.grupos && typeof store.grupos === 'object' ? store.grupos : {};
  const collection = path.basename(String(file || ''), '.json').toLowerCase();
  const map = new Map();
  for (const [id, grupo] of Object.entries(grupos)) {
    for (const membro of grupo?.membros || []) {
      if (String(membro?.collectionName || '').trim().toLowerCase() !== collection) continue;
      const link = String(membro?.linkReal || '').trim();
      if (link) map.set(link, id);
    }
  }
  return map;
}

export function applyDuplicateGroups(records, map) {
  let applied = 0;
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const link = String(record.linkReal || '').trim();
    const grupo = link ? map.get(link) || '' : '';
    if ((record.duplicado_grupo || '') !== grupo) {
      record.duplicado_grupo = grupo;
      applied++;
    }
  }
  return applied;
}

export function mergeScrapeHistory(history, project, records, date = new Date()) {
  const valid = records.filter(record => record && typeof record === 'object' && !record.dataExclusao);
  const byType = new Map();
  for (const record of valid) {
    const type = String(record.tipoImovel || 'outros').trim() || 'outros';
    if (!byType.has(type)) byType.set(type, { quantidade: 0, somaPreco: 0, comPreco: 0 });
    const group = byType.get(type);
    group.quantidade++;
    const price = Number(record.preco);
    if (Number.isFinite(price) && price > 0) {
      group.somaPreco += price;
      group.comPreco++;
    }
  }
  const tipos = Array.from(byType.entries()).map(([tipo, group]) => ({
    tipo, quantidade: group.quantidade, precoMedio: group.comPreco ? Math.round(group.somaPreco / group.comPreco) : 0,
  })).sort((a, b) => b.quantidade - a.quantidade);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return {
    ...history,
    [project]: {
      ...history[project],
      [day]: { atualizadoEm: date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), totalImoveis: valid.length, tipos },
    },
  };
}
