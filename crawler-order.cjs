const ORDEM_PROJETOS = Object.freeze([
  'jf1000Imoveis', 'jfAlicerce', 'jfAlmar', 'jfBargon', 'jfBrasil', 'jfCasaNova',
  'jfClientt', 'jfEuro', 'jfInmob', 'jfLocato', 'jfMarques', 'jfNegociar',
  'jfNogueira', 'jfRedentor', 'jfRibeiroArrabal', 'jfUniversal', 'jfSelect',
  'jfRezende', 'jfSouzaGomes', 'jfAdMyHouse', 'jfDecisao', 'jfFluxo', 'jfFontes',
  'jfImperial', 'jfLider', 'jfPositivo', 'jfRVNegocios', 'jfTriade', 'jfCrispi',
  'jfEstrelaSul', 'jfGm', 'jfLeal', 'jfLocal', 'jfMasson', 'jfMultimoveis',
  'jfNunes', 'jfOliver', 'jfSpeciale', 'jfToronto', 'jfTriplice', 'jfVivaBem',
  'jfMoura', 'jfAcervo', 'jfBomClima', 'jfACasas', 'jfFogel', 'jfRemax',
  'jfSoares', 'jfStart', 'jfToc2', 'jfCouto', 'jfInvest', 'jfKantto',
  'jfOliveira', 'jfMega', 'jfSouzaRocha', 'jfHolder', 'nitKiffer', 'nitFrancisco',
  'nitGrupo', 'nitAccioly', 'nitPredial', 'nitNova', 'nitAmin', 'nitTeto',
  'nitMarchipp', 'nitElenco', 'nitImob2000', 'nitFerreira', 'nitRb2', 'nitColuna',
  'nitLuis', 'nitTempo', 'nitLive', 'nitMrm', 'nitFlora', 'nitDavi', 'nitLopes',
  'nitOceanica', 'nitSimark', 'nitRca', 'nitNiteroi', 'nitJn', 'nitSiciliano',
  'nitGustavo', 'nitSelfSpin', 'nitDrin', 'nitRealiza', 'nitRemax',
  'ubaJXavier', 'ubaGb', 'ubaMontezzi', 'ubaCarlos', 'ubaNogueira',
  'ubaArtolex', 'ubaCidade', 'ubaRemax', 'ubaAloisio',
  'rioApsa', 'rioAtento', 'rioAtlantica', 'rioAtma', 'rioAvegui', 'rioChaves', 'rioDna', 'rioEdgard', 'rioImobras', 'rioImoveisDoRio',
  'rioJulio', 'rioLarDeCarioca', 'rioLopes', 'rioMaisVeloz', 'rioMelhores', 'rioMr', 'rioMti', 'rioNovaEpoca', 'rioOkre', 'rioOlympica', 'rioPrivilegio', 'rioRemax',
  'rioCasalta', 'rioFrassetti', 'rioGriffe', 'rioBaez',
  'rioMetropole', 'rioJc', 'rioLopa', 'rioMansou', 'rioRjc', 'rioRDiniz', 'rioReisPrincipe', 'rioRbs', 'rioSampaio', 'rioSergioCastro', 'rioSimoes', 'rioVivax', 'rioWalker', 'rioZelo', 'rioLuciene', 'rioFr', 'rioForte', 'rioHomeHub', 'rioInvexo', 'rioJailson',     'rioMg', 'rioRJardim', 'rioCabral', 'rioNovi', 'rioRamiro', 'rioRenascenca',
]);

const aliases = { rv: 'rvnegocios' };
const positions = new Map(ORDEM_PROJETOS.flatMap((name, index) => [[name.toLowerCase(), index], [name.slice(2).toLowerCase(), index]]));
const PROJETOS_SUSPENSOS = new Set(['riometropole']);
const PROJETOS_FORA_DA_RASPAGEM = new Set(['acervo', 'souzagomes', 'multimoveis', ...PROJETOS_SUSPENSOS]);

function projetoSuspenso(name) {
  return PROJETOS_SUSPENSOS.has(String(name ?? '').replace(/:locacao$/i, '').toLowerCase());
}

function projetoHabilitadoNaRaspagem(name) {
  return !PROJETOS_FORA_DA_RASPAGEM.has(String(name).replace(/:locacao$/i, '').replace(/^jf/i, '').toLowerCase());
}

function indiceProjeto(value) {
  const name = String(value ?? '').replace(/:locacao$/i, '').toLowerCase();
  return positions.get(aliases[name] || name) ?? ORDEM_PROJETOS.length;
}

function cidadeProjeto(value) {
  const project = ORDEM_PROJETOS[indiceProjeto(value)] ?? String(value ?? '');
  if (/^uba/i.test(project)) return 'Ub\u00e1';
  if (/^rio/i.test(project)) return 'Rio de Janeiro';
  return /^nit/i.test(project) ? 'Niteroi' : 'Juiz de Fora';
}

function ordenarProjetos(items, identify = item => item.collection ?? item.name ?? item.folder ?? item) {
  return items.map((item, position) => ({ item, position, order: indiceProjeto(identify(item)) }))
    .sort((left, right) => left.order - right.order || left.position - right.position)
    .map(entry => entry.item);
}

function ordenarScripts(names) {
  return [...new Set(names)].map((name, position) => ({
    name,
    position,
    projectOrder: indiceProjeto(name),
    rentalOrder: /:locacao$/i.test(name) ? 1 : 0,
  }))
    .sort((left, right) =>
      left.projectOrder - right.projectOrder ||
      left.rentalOrder - right.rentalOrder ||
      left.position - right.position
    )
    .map(entry => entry.name);
}

function incluirAlugueisConfigurados(names, availableScripts) {
  const available = new Set(availableScripts);
  const rentals = names
    .filter(name => !/:locacao$/i.test(name))
    .map(name => `${name}:locacao`)
    .filter(name => available.has(name));
  return ordenarScripts([...names, ...rentals].filter(projetoHabilitadoNaRaspagem));
}

module.exports = { ORDEM_PROJETOS, indiceProjeto, cidadeProjeto, ordenarProjetos, ordenarScripts, incluirAlugueisConfigurados, projetoHabilitadoNaRaspagem, projetoSuspenso };