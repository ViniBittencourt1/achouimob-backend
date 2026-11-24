export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioChaves", collection: "rioChaves", displayName: "Chaves",
  kind: "midas",
  midas: Object.freeze({ agencyId: "1948", locacaoViaControl: true }),
  urlVendas: "https://www.chavescsi.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=dataPublicacao-DESC&mb=s&slug=0&page=1",
  urlLocacao: "https://www.chavescsi.com.br/imoveis/venda#/?n=1&ordem=dataPublicacao-DESC&mb=s&slug=0&page=1&tipoNegocio=AA",
});
