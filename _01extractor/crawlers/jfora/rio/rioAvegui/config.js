export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioAvegui", collection: "rioAvegui", displayName: "Avegui",
  kind: "midas",
  midas: Object.freeze({ agencyId: "2517", locacaoViaControl: true, paginacaoNaMesmaAba: true, vendaZeroSemPreco: true }),
  urlVendas: "https://www.avegui.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.avegui.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
