export const projetosNiteroiImobBrasil = Object.freeze([
  { folder: "nitOceanica", collection: "nitOceanica", displayName: "Oceânica Imobiliária", url: "https://www.oceanicaimobiliaria.com.br/imovel/venda", kind: "imobbrasil" },
  { folder: "nitSimark", collection: "nitSimark", displayName: "Simark Imóveis", url: "https://www.simarkimoveis.com.br/imovel/venda", kind: "imperial" },
  { folder: "nitRca", collection: "nitRca", displayName: "RCA Imóveis", url: "https://www.rcaimoveisrj.com/imovel/venda", kind: "imobbrasil" },
  { folder: "nitNiteroi", collection: "nitNiteroi", displayName: "Niterói Imob", url: "https://www.niteroiimob.com.br/imovel/venda", kind: "imobbrasilClassico" },
  { folder: "nitJn", collection: "nitJn", displayName: "JN Corretores de Imóveis", url: "https://www.jncorretoresdeimoveis.com.br/imovel/venda", kind: "imperial" },
]);

export function getProjetoNiteroiImobBrasil(name) {
  const project = projetosNiteroiImobBrasil.find(item => item.collection.toLowerCase() === String(name).toLowerCase());
  if (!project) throw new Error(`Projeto ImobiBrasil de Niteroi invalido: ${name}`);
  return project;
}
