export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda"]),
  folder: "rioMelhores", collection: "rioMelhores", displayName: "Melhores",
  kind: "midas",
  midas: Object.freeze({ agencyId: "854" }),
  urlVendas: "https://www.melhoresimoveisnorio.com.br/imoveis/venda#/?n=1&ordem=codigo-ASC&tipoNegocio=VA,VL&mb=s&slug=0&page=1",
  urlLocacao: null,
});
