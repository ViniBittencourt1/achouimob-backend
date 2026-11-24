export const projetosLocacaoImobBrasil = [
  { folder: "decisao", collection: "jfDecisao", extractor: "extractDecisaoData", url: "https://www.imobiliariadecisaojf.com.br/imovel/locacao" },
  { folder: "fluxo", collection: "jfFluxo", extractor: "extractFluxoData", url: "https://www.fluxoimoveis.com/imovel/locacao" },
  { folder: "fontes", collection: "jfFontes", extractor: "extractFontesData", url: "https://www.fontesimoveis.com.br/imovel/locacao" },
  { folder: "imperial", collection: "jfImperial", extractor: "extractImperialData", url: "https://www.imperialimoveisjf.com/imovel/locacao" },
  { folder: "lider", collection: "jfLider", extractor: "extractLiderNovaData", extractorFile: "extractor-locacao.js", url: "https://www.lidernegociosimob.com.br/imovel/locacao" },
  { folder: "positivo", collection: "jfPositivo", extractor: "extractPositivoData", url: "https://www.positivoimoveis.com.br/imovel/locacao" },
  { folder: "rvNegocios", collection: "jfRVNegocios", extractor: "extractRVNegociosData", url: "https://www.rvnegociosimobiliariosjf.com.br/imovel/locacao" },
  { folder: "triade", collection: "jfTriade", extractor: "extractTriadeData", url: "https://www.triadeimoveisjf.com.br/imovel/locacao" },
];

export function getProjetoLocacaoImobBrasil(nome) {
  const normalized = String(nome ?? "").toLowerCase();
  const projeto = projetosLocacaoImobBrasil.find(item => item.folder.toLowerCase() === normalized || item.collection.toLowerCase() === normalized);
  if (!projeto) throw new Error(`Projeto fora do grupo AdMyHouse: ${nome}`);
  return projeto;
}