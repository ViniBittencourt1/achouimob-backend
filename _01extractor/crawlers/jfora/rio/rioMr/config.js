export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioMr", collection: "rioMr", displayName: "Mr",
  kind: "midas",
  midas: Object.freeze({ agencyId: "2633", locacaoViaControl: true }),
  urlVendas: "https://www.mrinvestimobiliarios.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.mrinvestimobiliarios.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
