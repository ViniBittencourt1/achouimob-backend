# Vendas: paginacao padrao

Almar, Bargon, Casa Nova, Clientt, Euro, Locato, Marques, Negociar,
Ribeiro Arrabal, Universal e Rezende usam a rota de vendas da precontagem,
sem dividir a busca em faixas de preco.

As paginas seguintes sao lidas pelas respostas HTML de
`/imoveis?negociacao=venda&tmpl=imoveis/list_items&page=2`, mantendo os
demais filtros. Os campos continuam sendo processados pelos extratores
de cada projeto. Alugueis mantem seu caminho de coleta anterior.

O coletor exige o total completo de links unicos e bloqueia mudanca de
total, paginas repetidas ou vazias, HTTP invalido e redirecionamento para
outra busca. A contagem e validada antes das visitas aos detalhes e da
sincronizacao. As protecoes de JSON, Sheets e historico permanecem ativas.

Os comandos individuais continuam iguais. Na raiz do repositorio:

```powershell
npm --prefix backend run almar
```

Testes do coletor e das integracoes:

```powershell
node --test backend/_01extractor/crawlers/jfora/_utils/vendasPadraoPaginacao.test.js
```