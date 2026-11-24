export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioVivax", collection: "rioVivax", displayName: "Vivax Prime",
  kind: "inforce",
  inforce: Object.freeze({
    schema: "search",
    endpoint: "https://www.vivaxprime.com.br/api/anuncios/search",
    siteOrigin: "https://www.vivaxprime.com.br",
    imageBaseUrl: "https://vivazprime.inforcedata.com.br/api/image/thumb",
    routeIdentifier: "id",
  }),
  urlVendas: "https://www.vivaxprime.com.br/venda/imoveis?busca=JTdCJTIyZmluYWxpZGFkZSUyMiUzQSUyMnZlbmRhJTIyJTdE",
  urlLocacao: "https://www.vivaxprime.com.br/aluguel",
});
