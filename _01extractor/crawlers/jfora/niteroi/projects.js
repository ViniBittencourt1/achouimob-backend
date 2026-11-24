// Niterói publica em planilha própria, separada da planilha de vendas de Juiz de Fora.
export const NITEROI_SPREADSHEET_ID =
  process.env.NITEROI_SHEETS_SPREADSHEET_ID || "10S4YOgBUBB89POe4QKUKw08ZHgQ-htmrobdkZddiMf8";

export const projetosNiteroiVendas = Object.freeze([
  { folder: "nitKiffer", collection: "nitKiffer", displayName: "Kiffer Imóveis", url: "https://www.kifferimoveis.com.br/imoveis/a-venda" },
  { folder: "nitFrancisco", collection: "nitFrancisco", displayName: "Francisco Egito", url: "https://www.franciscoegito.com.br/imoveis/a-venda" },
  { folder: "nitAccioly", collection: "nitAccioly", displayName: "Accioly Group", url: "https://www.acciolygroup.com.br/imoveis/a-venda" },
  { folder: "nitPredial", collection: "nitPredial", displayName: "Predial Imobiliária", url: "https://www.predialimobiliaria.com/imoveis?finalidade=venda" },
  { folder: "nitNova", collection: "nitNova", displayName: "Nova Imobiliária", url: "https://www.novaimobiliaria.imb.br/imoveis/a-venda" },
  { folder: "nitAmin", collection: "nitAmin", displayName: "Amim Imóveis", url: "https://www.amimimoveis.com.br/imoveis/a-venda" },
  { folder: "nitTeto", collection: "nitTeto", displayName: "Teto Icaraí", url: "https://www.tetoicarai.com.br/imoveis/a-venda" },
  { folder: "nitMarchipp", collection: "nitMarchipp", displayName: "Marchipp Imóveis", url: "https://www.marchippimoveis.com.br/imoveis/a-venda" },
  { folder: "nitElenco", collection: "nitElenco", displayName: "Elenco Imóveis", url: "https://www.elencoimoveis.com.br/imoveis/a-venda" },
  { folder: "nitImob2000", collection: "nitImob2000", displayName: "Imob 2000", url: "https://www.imob2000.com.br/imoveis/a-venda" },
  { folder: "nitFerreira", collection: "nitFerreira", displayName: "Ferreira Souto Imóveis", url: "https://www.ferreirasoutoimoveis.com.br/imoveis/a-venda" },
  { folder: "nitRb2", collection: "nitRb2", displayName: "RB2 Imóveis", url: "https://www.rb2imoveis.com.br/imoveis/a-venda" },
  { folder: "nitColuna", collection: "nitColuna", displayName: "Coluna Imóveis", url: "https://www.colunaimoveis.com.br/imoveis/a-venda" },
  { folder: "nitLuis", collection: "nitLuis", displayName: "Luís Imóveis", url: "https://www.luisimoveis.com.br/imoveis/a-venda" },
  { folder: "nitTempo", collection: "nitTempo", displayName: "Tempo Imóveis", url: "https://www.tempoimoveisrj.com/imoveis/a-venda" },
  { folder: "nitLive", collection: "nitLive", displayName: "Live Negócio Imobiliário", url: "https://www.livenegocioimobiliario.com.br/imoveis/a-venda" },
  { folder: "nitMrm", collection: "nitMrm", displayName: "MRM Imobiliária", url: "https://www.mrmimobiliaria.com.br/imoveis/a-venda" },
  { folder: "nitFlora", collection: "nitFlora", displayName: "Flora Imóveis", url: "https://www.floraimoveis.com/imoveis/a-venda" },
  { folder: "nitDavi", collection: "nitDavi", displayName: "Davi Saramago", url: "https://www.davisaramago.com/imoveis/a-venda" },
  { folder: "nitLopes", collection: "nitLopes", displayName: "Lopes Niterói", url: "https://www.lopesniteroi.com.br/imoveis/a-venda" },
]);

export const projetosNiteroiVendasZerados = Object.freeze([
  { folder: "nitGrupo", collection: "nitGrupo", displayName: "Grupo Niterói", url: null, enabled: false },
]);

export function getProjetoNiteroiVendas(name) {
  const normalized = String(name ?? "").toLowerCase();
  const project = projetosNiteroiVendas.find(({ folder, collection }) =>
    folder.toLowerCase() === normalized || collection.toLowerCase() === normalized
  );
  if (!project) throw new Error(`Projeto de vendas de Niterói não encontrado: ${name}`);
  return project;
}
