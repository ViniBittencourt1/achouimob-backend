export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioAtma", collection: "rioAtma", displayName: "Atma",
  kind: "midas",
  midas: Object.freeze({ agencyId: "1221", locacaoViaControl: true }),
  urlVendas: "https://www.atmaimobiliaria.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=VA,VL",
  urlLocacao: "https://www.atmaimobiliaria.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
