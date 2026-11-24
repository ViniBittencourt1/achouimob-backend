export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioRbs", collection: "rioRbs", displayName: "RBS Imoveis",
  kind: "midas",
  midas: Object.freeze({
    agencyId: "2138", locacaoViaControl: true, confirmarVendaZeroNoDetalhe: true,
  }),
  urlVendas: "https://www.rbsimoveis.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.rbsimoveis.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
