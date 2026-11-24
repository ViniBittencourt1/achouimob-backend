export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioLarDeCarioca", collection: "rioLarDeCarioca", displayName: "LarDeCarioca",
  kind: "midas",
  midas: Object.freeze({ agencyId: "1720", locacaoViaControl: true }),
  urlVendas: "https://www.lardecarioca.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.lardecarioca.com.br/imoveis/venda#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
