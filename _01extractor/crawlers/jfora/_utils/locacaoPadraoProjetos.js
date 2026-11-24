export const projetosLocacaoPadrao = [
  { folder: "alicerce", collection: "jfAlicerce", extractor: "extractAlicerceData", urlVenda: "https://alicerceimob.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "almar", collection: "jfAlmar", extractor: "extractAlmarData", urlVenda: "https://grupoalmar.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=0%2C01&preco_max=50.000%2C00" },
  { folder: "bargon", collection: "jfBargon", extractor: "extractBargonData", urlVenda: "https://bargonimoveis.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "brasil", collection: "jfBrasil", extractor: "extractBrasilData", urlVenda: "https://brasilimoveisjf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "casaNova", collection: "jfCasaNova", extractor: "extractCasaNovaData", urlVenda: "https://casanovajf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "clientt", collection: "jfClientt", extractor: "extractClienttData", urlVenda: "https://clientt.com.br/imoveis?order=localizacao&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "euro", collection: "jfEuro", extractor: "extractEuroData", urlVenda: "https://euro-imoveis.com/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "InMob", collection: "jfInmob", extractor: "extractInmobData", urlVenda: "https://inmobjf.com.br/imoveis?negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "locato", collection: "jfLocato", extractor: "extractLocatoData", urlVenda: "https://locatoimoveis.com/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "marques", collection: "jfMarques", extractor: "extractMarquesData", urlVenda: "https://marquesmoreiraimoveis.com/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "negociar", collection: "jfNegociar", extractor: "extractNegociarData", urlVenda: "https://negociarimoveisjf.com.br/imoveis?order=recentes&codigo=&negociacao=venda&tipo=&localizacao=&preco_min=&preco_max=50.000%2C00&caracteristicas=" },
  { folder: "nogueira", collection: "jfNogueira", extractor: "extractNogueiraData", urlVenda: "https://nogueiraimoveisjf.com.br/imoveis?order=recentes&codigo=&negociacao=venda&tipo=&localizacao=&preco_min=&preco_max=50.000%2C00&caracteristicas=" },
  { folder: "redentor", collection: "jfRedentor", extractor: "extractRedentorData", urlVenda: "https://redentorimoveis.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "rezende", collection: "jfRezende", extractor: "extractRezendeData", allowConfirmedEmpty: true, urlVenda: "https://rezendeimoveis.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "ribeiroArrabal", collection: "jfRibeiroArrabal", extractor: "extractRibeiroArrabalData", urlVenda: "https://ribeiroearrabal.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&cidade=&bairro=&caracteristicas=&preco_min=0%2C01&preco_max=50.000%2C00" },
  { folder: "select", collection: "jfSelect", extractor: "extractSelectData", urlVenda: "https://selectimoveisjf.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
  { folder: "universal", collection: "jfUniversal", extractor: "extractUniversalData", urlVenda: "https://universalimoveis.com.br/imoveis?order=recentes&negociacao=venda&codigo=&tipo=&localizacao=&caracteristicas=&preco_min=&preco_max=50.000%2C00" },
];

export function buildUrlLocacao(urlVenda) {
  const url = new URL(urlVenda);
  url.searchParams.set("negociacao", "locacao");
  url.searchParams.set("preco_min", "");
  url.searchParams.set("preco_max", "");
  return url.href;
}

export function getProjetoLocacao(nome) {
  const normalized = String(nome ?? "").toLowerCase();
  const projeto = projetosLocacaoPadrao.find(item =>
    item.folder.toLowerCase() === normalized || item.collection.toLowerCase() === normalized
  );
  if (!projeto) throw new Error(`Projeto fora do padrao de locacao: ${nome}`);
  return projeto;
}