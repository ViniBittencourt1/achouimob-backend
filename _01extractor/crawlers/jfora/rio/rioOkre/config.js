export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioOkre", collection: "rioOkre", displayName: "Okre",
  kind: "midas",
  midas: Object.freeze({ agencyId: "2113", locacaoViaControl: true, paginacaoNaMesmaAba: true, confirmarVendaZeroNoDetalhe: true }),
  urlVendas: "https://www.okreimoveis.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=dataPublicacao-DESC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.okreimoveis.com.br/imoveis/venda#/?n=1&ordem=dataPublicacao-DESC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
