export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioAtento", collection: "rioAtento", displayName: "Atento",
  kind: "midas",
  midas: Object.freeze({ agencyId: "1955", locacaoViaControl: true }),
  urlVendas: "https://www.atentoimoveis.com/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.atentoimoveis.com/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
