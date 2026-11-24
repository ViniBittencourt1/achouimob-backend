export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioCabral", collection: "rioCabral", displayName: "Cabral",
  kind: "universal",
  universal: Object.freeze({
    schema: "imoview",
    endpoint: "https://www.cabralemesack.com.br/imoveis/ajax/",
    siteOrigin: "https://www.cabralemesack.com.br",
    ordenacao: "",
  }),
  urlVendas: "https://www.cabralemesack.com.br/venda/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais?valorminimo=0&valormaximo=0&pagina=1",
  urlLocacao: "https://www.cabralemesack.com.br/aluguel/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais?valorminimo=0&valormaximo=0&pagina=1",
});
