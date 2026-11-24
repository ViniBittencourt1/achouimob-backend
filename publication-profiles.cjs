const profiles = {
  vendas: { tipo: 'vendas', negociacao: 'venda', firestore: '__imoveisPublicos', backup: '__imoveisPublicos__backup', typesense: 'imoveis', filtrosPrefix: 'filtros_', jsonSuffix: '.json' },
  alugueis: { tipo: 'alugueis', negociacao: 'locacao', firestore: '__alugueisPublicos', backup: '__alugueisPublicos__backup', typesense: 'imoveis_alugueis', filtrosPrefix: 'filtros_alugueis_', jsonSuffix: 'Locacao.json' },
};

function publicationProfile(tipo = 'vendas') {
  if (!Object.hasOwn(profiles, tipo)) throw new Error('Tipo de publicacao invalido: use vendas ou alugueis.');
  return { ...profiles[tipo] };
}

function publicationArguments(args, env = process.env) {
  const types = args.filter(arg => arg.startsWith('--tipo='));
  if (types.length > 1) throw new Error('Informe somente um tipo de publicacao.');
  const profile = publicationProfile(types[0]?.slice('--tipo='.length) || 'vendas');
  const collections = args.filter(arg => !arg.startsWith('--'));
  const origens = args.filter(arg => arg.startsWith('--origem='));
  if (origens.length > 1) throw new Error('Informe somente uma origem de publicacao.');
  const origem = origens[0]?.slice('--origem='.length) || 'firestore';
  if (!['firestore', 'json'].includes(origem)) throw new Error('Origem de publicacao invalida: use firestore ou json.');
  if (args.some(arg => arg.startsWith('--') && !arg.startsWith('--tipo=') && !arg.startsWith('--origem=') && arg !== '--todos' && arg !== '--dry-run' && arg !== '--allow-empty')) throw new Error('Opcao de publicacao desconhecida.');
  for (const name of collections) {
    if (!/^(?:jf|nit|uba|rio)[A-Za-z0-9]+$/.test(name) || /(?:Locacao|Retirados|Historico)/i.test(name)) throw new Error(`Use o nome do projeto sem sufixo de arquivo: ${name}`);
  }
  return { profile, origem, collections: [...new Set(collections)], todos: args.includes('--todos'), dryRun: args.includes('--dry-run'), allowEmpty: args.includes('--allow-empty') };
}

function typesenseSource(profile, env = process.env) {
  const source = env.TYPESENSE_SOURCE_COLLECTION || profile.firestore;
  if (![profile.firestore, profile.backup].includes(source)) throw new Error(`Origem ${source} nao pertence ao perfil ${profile.tipo}.`);
  return source;
}

module.exports = { publicationProfile, publicationArguments, typesenseSource };