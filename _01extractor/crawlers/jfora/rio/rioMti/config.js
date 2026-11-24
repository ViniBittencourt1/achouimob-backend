export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioMti", collection: "rioMti", displayName: "Mti",
  kind: "midas",
  midas: Object.freeze({ agencyId: "1778", locacaoViaControl: true }),
  urlVendas: "https://www.mti-administradora.com/imoveis/venda#/?n=1&ordem=valor-ASC&tipoNegocio=VA,VL&mb=s&slug=0&page=1",
  urlLocacao: "https://www.mti-administradora.com/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
