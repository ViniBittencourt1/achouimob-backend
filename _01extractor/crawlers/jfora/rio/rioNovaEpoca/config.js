export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda"]),
  folder: "rioNovaEpoca", collection: "rioNovaEpoca", displayName: "NovaEpoca",
  kind: "novaEpoca",
  novaEpoca: Object.freeze({ limitesFaixasVenda: Object.freeze([1000000, 2000000, 5000000, 10000000]) }),
  urlVendas: "https://www.novaepoca.com.br/venda/imoveis?finalidade=venda",
  urlLocacao: null,
});
