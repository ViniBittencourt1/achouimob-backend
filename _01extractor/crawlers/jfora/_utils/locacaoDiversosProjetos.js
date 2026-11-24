export const projetosLocacaoDiversos = [
  { folder: 'couto', collection: 'jfCouto', extractor: 'extractCoutoData', url: 'https://www.coutoguerraimoveis.com.br/search?acao=s3&finalidade_s=3' },
  { folder: 'invest', collection: 'jfInvest', extractor: 'extractInvestData', url: 'https://www.invest.com.br/ResultadoBusca.aspx?fin=2&tit=Imovel-para-Locacao', browserOptions: true },
  { folder: 'oliveira', collection: 'jfOliveira', extractor: 'extractOliveiraLocacao', url: 'https://www.joliveirajf.com.br/imoveis/para-alugar', file: 'extractor-locacao.js', adapter: true },
  { folder: 'mega', collection: 'jfMega', extractor: 'extractMegaData', url: 'https://megacasaimoveis.com.br/imovel/?_cidade=juiz-de-fora&_acao=alugar' },
];

export function getProjetoLocacaoDiversos(nome) {
  const normalized = String(nome || '').toLowerCase();
  const project = projetosLocacaoDiversos.find(item => item.folder.toLowerCase() === normalized || item.collection.toLowerCase() === normalized);
  if (!project) throw new Error(`Projeto desconhecido: ${nome}`);
  return project;
}