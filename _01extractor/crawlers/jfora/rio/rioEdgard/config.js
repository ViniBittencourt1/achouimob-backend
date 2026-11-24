export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioEdgard", collection: "rioEdgard", displayName: "Edgard",
  kind: "midas",
  midas: Object.freeze({ agencyId: "372", locacaoViaControl: true, confirmarAluguelZeroNoDetalhe: true }),
  urlVendas: "https://www.edgardclare.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&tipoNegocio=VA,VL&mb=s&slug=0&page=1",
  urlLocacao: "https://www.edgardclare.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
