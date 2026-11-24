export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda"]),
  folder: "rioDna", collection: "rioDna", displayName: "Dna",
  kind: "midas",
  midas: Object.freeze({ agencyId: "28860", paginacaoNaMesmaAba: true, tentativasTimeout: 3, confirmarVendaZeroNoDetalhe: true, limitesFaixasVenda: Object.freeze([1000000, 2000000, 5000000, 10000000]) }),
  urlVendas: "https://www.dnaimoveis.rio.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: null,
});
