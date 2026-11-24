import { projetosNiteroiVendas, projetosNiteroiVendasZerados } from "../projects.js";
import { projetosNiteroiImobBrasil } from "../imobBrasil/projects.js";

const vendas = new Map([...projetosNiteroiVendas, ...projetosNiteroiVendasZerados, ...projetosNiteroiImobBrasil]
  .map(project => [project.collection, project]));

const kenlo = (collection, host, extra = {}) => ({
  collection, displayName: vendas.get(collection).displayName, url: `https://${host}/imoveis/para-alugar`, kind: "kenlo", ...extra,
});
const imobBrasil = collection => {
  const venda = vendas.get(collection);
  return { collection, displayName: venda.displayName, url: venda.url.replace(/\/imovel\/venda$/, "/imovel/locacao"), kind: "imobbrasil", layout: venda.kind };
};

export const projetosNiteroiLocacao = Object.freeze([
  kenlo("nitKiffer", "www.kifferimoveis.com.br", {
    // O DNS público do Kiffer aponta para uma hospedagem antiga; o site permanece ativo na Kenlo.
    hostResolverRules: "MAP www.kifferimoveis.com.br 170.82.174.30",
  }),
  kenlo("nitFrancisco", "www.franciscoegito.com.br"),
  kenlo("nitGrupo", "www.grupoimoveis.com"),
  kenlo("nitAccioly", "www.acciolygroup.com.br"),
  { collection: "nitPredial", displayName: "Predial Imobiliária", url: "https://www.predialimobiliaria.com/imoveis?finalidade=aluguel", kind: "predial" },
  kenlo("nitNova", "www.novaimobiliaria.imb.br"),
  kenlo("nitTeto", "www.tetoicarai.com.br"),
  kenlo("nitMarchipp", "www.marchippimoveis.com.br"),
  kenlo("nitElenco", "www.elencoimoveis.com.br"),
  kenlo("nitImob2000", "www.imob2000.com.br"),
  kenlo("nitFerreira", "www.ferreirasoutoimoveis.com.br"),
  kenlo("nitRb2", "www.rb2imoveis.com.br"),
  kenlo("nitColuna", "www.colunaimoveis.com.br"),
  kenlo("nitLuis", "www.luisimoveis.com.br"),
  kenlo("nitTempo", "www.tempoimoveisrj.com"),
  kenlo("nitLive", "www.livenegocioimobiliario.com.br"),
  kenlo("nitMrm", "www.mrmimobiliaria.com.br"),
  kenlo("nitFlora", "www.floraimoveis.com"),
  kenlo("nitLopes", "www.lopesniteroi.com.br"),
  imobBrasil("nitOceanica"),
  imobBrasil("nitSimark"),
  imobBrasil("nitRca"),
  imobBrasil("nitJn"),
  { collection: "nitSiciliano", displayName: "Siciliano Imoveis", url: "https://sicilianoimoveis.com.br/imoveis/aluguel", kind: "siciliano" },
  { collection: "nitGustavo", displayName: "Gustavo Ferreira", url: "https://www.corretorgustavoferreira.com.br/imobiliaria/locacao/imoveis/78963?tipo=2&ordem=recentes", kind: "gustavo" },
  { collection: "nitSelfSpin", displayName: "SelfSpin", url: "https://www.selfspin.com.br/imoveis/para-alugar/brasil?order=mais_relevantes", kind: "selfspin" },
  { collection: "nitRemax", displayName: "Remax", url: "https://www.remax.com.br/listings?Country=Brasil&Province=9517&City=6580792&CountryId=55&CityNM=6580792-Niter%C3%B3i%2C+Rio+de+Janeiro&ProvinceNM=9517-Rio+de+Janeiro%2C+Regi%C3%A3o+Sudeste&ListingClass=-1&TransactionTypeUID=260", kind: "remax" },
  { collection: "nitRealiza", displayName: "Realiza Imoveis", url: "https://www.realizaimoveisrj.com.br/aluguel/?&pagina=1", kind: "realiza" },
].map(project => Object.freeze(project)));

export function getProjetoNiteroiLocacao(name) {
  const project = projetosNiteroiLocacao.find(item => item.collection.toLowerCase() === String(name).toLowerCase());
  if (!project) throw new Error(`Projeto de aluguel de Niteroi invalido: ${name}`);
  return project;
}
