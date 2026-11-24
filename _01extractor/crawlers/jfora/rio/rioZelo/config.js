export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioZelo", collection: "rioZelo", displayName: "Zelo Imobiliária",
  kind: "inforce",
  inforce: Object.freeze({
    schema: "search",
    endpoint: "https://www.zeloimobiliariarj.com.br/api/anuncios/search",
    siteOrigin: "https://www.zeloimobiliariarj.com.br",
    imageBaseUrl: "https://ks.inforcedata.com.br/api/image/large",
    routeIdentifier: "codigo",
  }),
  urlVendas: "https://www.zeloimobiliariarj.com.br/venda/imoveis?finalidade=venda",
  urlLocacao: "https://www.zeloimobiliariarj.com.br/aluguel/imoveis?finalidade=aluguel",
});
