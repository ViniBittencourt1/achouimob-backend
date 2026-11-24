export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioSergioCastro", collection: "rioSergioCastro", displayName: "Sergio Castro Imóveis",
  kind: "inforce",
  inforce: Object.freeze({
    schema: "sergioCastro",
    endpoint: "https://lin01-api-site-release.inforcedata.com.br/api/sergiocastro/Anuncio/",
    siteOrigin: "https://www.sergiocastro.com.br",
    imageBaseUrl: "https://sergiocastro.inforcedata.com.br/api/image/thumb",
    routeIdentifier: "id",
    routeIdentifierPrefix: "ID-",
  }),
  urlVendas: "https://www.sergiocastro.com.br/venda/imoveis",
  urlLocacao: "https://www.sergiocastro.com.br/aluguel/imoveis",
});
