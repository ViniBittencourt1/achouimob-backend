export const projetosLocacaoKenlo = [
  { folder: "crispi", collection: "jfCrispi", extractor: "extractLocalData", url: "https://www.crispiimoveis.com.br/imoveis/para-alugar" },
  { folder: "leal", collection: "jfLeal", extractor: "extractLocalData", url: "https://www.lealimoveismb.com.br/imoveis/para-alugar" },
  { folder: "local", collection: "jfLocal", extractor: "extractLocalData", url: "https://www.localimoveisjf.com.br/imoveis/para-alugar" },
  { folder: "masson", collection: "jfMasson", extractor: "extractMassonData", url: "https://www.massonimoveis.com.br/imoveis/para-alugar" },
  { folder: "multimoveis", collection: "jfMultimoveis", extractor: "extractLocalData", zeroIfUnavailable: true, url: "https://www.multimoveisjf.com.br/imoveis/para-alugar" },
  { folder: "nunes", collection: "jfNunes", extractor: "extractLocalData", url: "https://www.nunesimoveisjf.com.br/imoveis/para-alugar" },
  { folder: "oliver", collection: "jfOliver", extractor: "extractLocalData", url: "https://www.oliverimoveisjf.com.br/imoveis/para-alugar" },
  { folder: "speciale", collection: "jfSpeciale", extractor: "extractLocalData", url: "https://www.specialeimobiliaria.com.br/imoveis/para-alugar" },
  { folder: "toronto", collection: "jfToronto", extractor: "extractTorontoData", url: "https://www.torontoimoveis.com/imoveis/para-alugar" },
  { folder: "triplice", collection: "jfTriplice", extractor: "extractLocalData", bairroUsesTitulo: true, url: "https://www.tripliceimoveis.com/imoveis/para-alugar" },
  { folder: "vivaBem", collection: "jfVivaBem", extractor: "extractLocalData", url: "https://www.vivabemimoveisjf.com.br/imoveis/para-alugar" },
  { folder: "moura", collection: "jfMoura", extractor: "extractLocalData", url: "https://www.mouraimoveisjf.com.br/imoveis/para-alugar" },
];

export function getProjetoLocacaoKenlo(nome) {
  const normalized = String(nome ?? "").toLowerCase();
  const projeto = projetosLocacaoKenlo.find(item => item.folder.toLowerCase() === normalized || item.collection.toLowerCase() === normalized);
  if (!projeto) throw new Error(`Projeto fora do grupo Kenlo: ${nome}`);
  return projeto;
}