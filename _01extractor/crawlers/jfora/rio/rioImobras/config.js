export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioImobras", collection: "rioImobras", displayName: "Imobras",
  kind: "midas",
  midas: Object.freeze({ agencyId: "502123", locacaoViaControl: true, tentativasTimeout: 3, confirmarVendaZeroNoDetalhe: true }),
  urlVendas: "https://www.imobrasrj.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.imobrasrj.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
