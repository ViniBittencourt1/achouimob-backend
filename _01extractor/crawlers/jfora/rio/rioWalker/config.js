export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioWalker", collection: "rioWalker", displayName: "Walker",
  kind: "midas",
  midas: Object.freeze({ agencyId: "2286", locacaoViaControl: true }),
  urlVendas: "https://www.walkerimobiliaria.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.walkerimobiliaria.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
