export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioRenascenca", collection: "rioRenascenca", displayName: "Renascenca",
  kind: "renascenca",
  universal: Object.freeze({
    schema: "renascenca",
    endpoint: "https://admrenascenca.com.br/retornar-imoveis-disponiveis",
    siteOrigin: "https://admrenascenca.com.br",
  }),
  urlVendas: "https://admrenascenca.com.br/venda/?&pagina=1",
  urlLocacao: "https://admrenascenca.com.br/aluguel/imovel/regiao-do-rio/todos-os-bairros/todos-os-condominios/&pagina=1",
});
