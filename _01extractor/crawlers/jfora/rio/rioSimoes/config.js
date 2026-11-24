export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioSimoes", collection: "rioSimoes", displayName: "Simoes e Fernandes",
  kind: "midas",
  midas: Object.freeze({ agencyId: "601834", locacaoViaControl: true }),
  urlVendas: "https://www.simoesefernandesimoveis.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=dataPublicacao-ASC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.simoesefernandesimoveis.com.br/imoveis/venda#/?n=1&ordem=dataPublicacao-ASC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
