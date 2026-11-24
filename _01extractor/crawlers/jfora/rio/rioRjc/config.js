export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda"]),
  folder: "rioRjc", collection: "rioRjc", displayName: "RJC",
  kind: "midas",
  midas: Object.freeze({ agencyId: "957", paginacaoNaMesmaAba: true, tentativasTimeout: 3 }),
  urlVendas: "https://www.rjcimobiliaria.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1",
  urlLocacao: null,
});
