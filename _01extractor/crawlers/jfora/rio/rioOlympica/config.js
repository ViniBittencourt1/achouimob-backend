export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioOlympica", collection: "rioOlympica", displayName: "Olympica",
  kind: "midas",
  midas: Object.freeze({ agencyId: "2372", locacaoViaControl: true }),
  urlVendas: "https://www.olympica.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-DESC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.olympica.com.br/imoveis/venda#/?n=1&ordem=valor-DESC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
