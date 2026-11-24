export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioNovi", collection: "rioNovi", displayName: "Novi",
  kind: "universal",
  universal: Object.freeze({
    schema: "imoview",
    endpoint: "https://www.imoveisnovi.com.br/imoveis/ajax/",
    siteOrigin: "https://www.imoveisnovi.com.br",
    ordenacao: "valordesc",
    condominio: true,
  }),
  urlVendas: "https://www.imoveisnovi.com.br/venda/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais/todos-os-condominios?valorminimo=0&valormaximo=0&pagina=1",
  urlLocacao: "https://www.imoveisnovi.com.br/aluguel/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais/todos-os-condominios?valorminimo=0&valormaximo=0&pagina=1",
});
