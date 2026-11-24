export const project = Object.freeze({
  enabled: true, negociacoes: Object.freeze(["venda", "locacao"]),
  folder: "rioRamiro", collection: "rioRamiro", displayName: "Ramiro Sa",
  kind: "universal",
  universal: Object.freeze({
    schema: "imoview",
    endpoint: "https://www.ramirosaimoveis.com.br/imoveis/ajax/",
    siteOrigin: "https://www.ramirosaimoveis.com.br",
    ordenacao: "valorasc",
    condominio: true,
  }),
  urlVendas: "https://www.ramirosaimoveis.com.br/venda/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais/todos-os-condominios?valorminimo=0&valormaximo=0&pagina=1",
  urlLocacao: "https://www.ramirosaimoveis.com.br/aluguel/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais/todos-os-condominios?valorminimo=0&valormaximo=0&pagina=1",
});
