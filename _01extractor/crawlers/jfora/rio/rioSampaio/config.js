export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioSampaio", collection: "rioSampaio", displayName: "Sampaio Imóveis",
  kind: "inforce",
  inforce: Object.freeze({
    schema: "search",
    endpoint: "https://www.sampaioimoveis.com.br/api/anuncios/search",
    siteOrigin: "https://www.sampaioimoveis.com.br",
    imageBaseUrl: "https://sampaio.inforcedata.com.br/api/image/large",
    routeIdentifier: "codigo",
  }),
  urlVendas: "https://www.sampaioimoveis.com.br/venda/imoveis?busca=JTdCJTIyZmluYWxpZGFkZSUyMiUzQSUyMnZlbmRhJTIyJTdE",
  urlLocacao: "https://www.sampaioimoveis.com.br/aluguel/imoveis?busca=JTdCJTIyZmluYWxpZGFkZSUyMiUzQSUyMmFsdWd1ZWwlMjIlMkMlMjJwYWdlJTIyJTNBMSU3RA%3D%3D",
});
