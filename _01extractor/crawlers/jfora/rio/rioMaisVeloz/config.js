export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda"]),
  folder: "rioMaisVeloz", collection: "rioMaisVeloz", displayName: "MaisVeloz",
  kind: "midas",
  midas: Object.freeze({ agencyId: "1458", paginacaoNaMesmaAba: true, tentativasTimeout: 3, confirmarVendaZeroNoDetalhe: true, bairroNaLocalizacao: true, limitesFaixasVenda: Object.freeze([1000000, 2000000, 5000000, 10000000]) }),
  urlVendas: "https://www.maisvelozimoveis.com/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=dataPublicacao-DESC&mb=s&slug=0&page=1",
  urlLocacao: null,
});
