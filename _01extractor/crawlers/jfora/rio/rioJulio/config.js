export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioJulio", collection: "rioJulio", displayName: "Julio",
  kind: "midas",
  midas: Object.freeze({ agencyId: "60321", locacaoViaControl: true, paginacaoNaMesmaAba: true, tentativasTimeout: 3, confirmarVendaZeroNoDetalhe: true, confirmarAluguelZeroNoDetalhe: true, limitesFaixasVenda: Object.freeze([1000000, 2000000, 5000000, 10000000]) }),
  urlVendas: "https://www.juliobogoricin.com/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.juliobogoricin.com/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
