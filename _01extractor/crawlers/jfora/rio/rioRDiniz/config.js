export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioRDiniz", collection: "rioRDiniz", displayName: "R. Diniz",
  kind: "midas",
  midas: Object.freeze({
    agencyId: "501170",
    confirmarVendaZeroNoDetalhe: true,
    confirmarAluguelZeroNoDetalhe: true,
  }),
  urlVendas: "https://www.rdiniz.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.rdiniz.com.br/imoveis/aluguel#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
