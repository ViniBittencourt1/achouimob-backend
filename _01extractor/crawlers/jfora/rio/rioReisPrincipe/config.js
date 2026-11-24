export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioReisPrincipe", collection: "rioReisPrincipe", displayName: "Reis Principe",
  kind: "midas",
  midas: Object.freeze({ agencyId: "60279", locacaoViaControl: true }),
  urlVendas: "https://www.reisprincipe.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.reisprincipe.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
