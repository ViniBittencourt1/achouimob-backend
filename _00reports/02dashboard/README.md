# Dashboard local de imoveis

Na raiz de `backend-backup-limpo` ou dentro de `_00reports\02dashboard`, execute:

```powershell
npm run dash
```

Abra <http://127.0.0.1:3110>. Para encerrar, use `Ctrl+C`.
Nao abra o HTML diretamente: o servidor local le os JSONs sem expor o restante
do backend. Nao ha dependencias adicionais nem acesso a Firestore ou Typesense.
Para outra porta, defina `$env:DASHBOARD_PORT = '3111'` antes do comando.

## Consulta

- Fonte fixa: `backend-backup-limpo\crawler`, na mesma copia deste dashboard.
- Telas separadas: **Entradas** (`/entradas`) e **Saidas** (`/saidas`).
  Os filtros sao mantidos nos links de navegacao entre as telas.
  Cada tela mostra somente a quantidade da movimentacao correspondente e o
  estoque atual. Os avisos gerais ficam depois da listagem e da paginacao.
- Filtros: cidade, tipo de imovel, venda/aluguel e datas inclusivas. Atalhos de ultimos 7,
  30 ou 365 dias incluem hoje; nao representam semana, mes ou ano civil anterior.
- Tipos: somente nomes principais de `_03database\filtros\_brTipoImovel.json`,
  uma opcao por slug. Respeita `principal: "sim"`; em entradas legadas sem essa
  propriedade, o primeiro nome do grupo e o principal, como no painel de filtros.
  Nomes e aliases dos anuncios sao resolvidos pelo catalogo para o mesmo slug,
  sem alterar os JSONs. Tipos desconhecidos permanecem em **Todos os tipos**,
  mas nao criam opcoes extras. Grupos sem principal unico geram erro explicito.
- Entradas: `dataInclusao`, inclusive de anuncios que depois foram retirados.
- Retiradas: `dataExclusao`, dos JSONs principais e `*RetiradosVendas.json`
  ou `*RetiradosLocacao.json`.
- Ativos: estoque atual dos JSONs principais, independente do periodo escolhido.
  A listagem continua disponivel pelo link **Ver ativos** no card.
- A lista possui 50 anuncios por pagina. Use **Atualizar JSONs** apos raspagens;
  os filtros consultam a ultima leitura indicada no rodape.

## Evolucao temporal e comparativo

Nas telas Entradas e Saidas, entre os cards e o ranking, o grafico mostra a
quantidade de movimentacoes de toda a selecao, incluindo intervalos com zero.
Entradas usam inclusao; saidas usam retirada. O estoque Ativos nao tem esse grafico.
A escala automatica e diaria ate 31 dias, semanal ate 120, mensal ate 730 e
anual acima disso; o seletor permite trocar. Semanas vao de segunda a domingo,
meses e anos sao civis. As bordas sao limitadas ao periodo filtrado e podem
ser parciais. A tabela expansivel informa contagens e variacao vs. intervalo
anterior. Sem base positiva, o percentual nao e calculado. Mais de 1000
intervalos exige reduzir o periodo ou escolher uma escala maior.

A direita, o comparativo usa os mesmos filtros de cidade, tipo e negociacao
para o periodo filtrado e, por padrao, as mesmas datas do mes anterior.
Dias inexistentes nesse mes sao limitados ao ultimo dia (31/mar vira 28 ou
29/fev). Pode escolher manualmente outro intervalo, inclusive um unico dia.
Mostra totais, diferenca, `(total atual / total comparado - 1) * 100` e medias
diarias. Base zero nao gera percentual. Duracoes diferentes e sobreposicao
sao indicadas; os totais nao sao normalizados nem representam vendas confirmadas.
Escala e comparacao usam os filtros ja aplicados, nao alteracoes ainda nao
confirmadas no formulario superior. As escolhas sao mantidas entre as telas.

Depois de atualizar o codigo do servidor, reinicie `npm run dash` e atualize
a pagina para carregar os novos dados temporais.

## Ranking por bairros

Abaixo dos cards, um grafico de barras horizontais ordena os bairros do maior
para o menor, com seletor de **Quantidade de imoveis**, **Total $ Vendas** ou
**Ticket medio (venda)**. A escolha e preservada ao trocar de tela.

O ranking considera a lista filtrada completa: entradas na tela Entradas,
retiradas na tela Saidas e estoque na tela Ativos. A quantidade inclui a
negociacao selecionada; os dois criterios financeiros usam somente vendas com
preco maior que zero, com as mesmas regras dos cards.

O agrupamento usa cidade e bairro registrados nos JSONs: bairros de cidades
diferentes nao sao somados. Bairro vazio aparece como **Bairro nao informado**.
Grupos sem preco valido ficam no fim dos rankings financeiros com
**Nao disponivel**, sem simular valor zero. Empates sao ordenados por bairro
e cidade. Todos os bairros ficam disponiveis na area rolavel do grafico;
nao ha corte oculto em um top 10. As barras sao proporcionais ao maior valor
do criterio selecionado, com valores exatos ao lado, sem bibliotecas externas.

Cada bairro mostra quantidade de anuncios, ticket medio, valor por m2 e total
anunciado de venda. Os valores financeiros usam as mesmas regras dos cards e
nao indicam vendas confirmadas ou faturamento. A quantidade inclui a negociacao
selecionada, inclusive alugueis quando aplicavel.

No ranking de quantidade, o percentual e a quantidade do bairro dividida pela
quantidade total filtrada; no de valor, e o total anunciado do bairro dividido
pelo total anunciado de venda filtrado. No ticket medio, e o desvio percentual
em relacao ao ticket medio geral: `(ticket do bairro / ticket geral - 1) * 100`.
Quando nao ha precos validos, valor e percentual financeiro ficam indisponiveis.
A largura da barra continua proporcional ao maior valor do ranking, nao ao percentual.

Clique na barra para abrir a lista paginada dos anuncios daquele bairro e cidade,
com os mesmos filtros aplicados ao grafico. O bairro sem nome tambem pode ser
aberto. No criterio de quantidade, a janela inclui todos os anuncios do grupo;
nos criterios financeiros, somente as vendas com preco valido que formam a
barra. Feche a janela ou pressione Esc para voltar ao dashboard.

Na janela do bairro, **Valor m2 (venda)** mostra preco / area de cada anuncio,
e **Variacao m2 / bairro** mostra `(m2 do anuncio / m2 do bairro - 1) * 100`.
A referencia do bairro e a mesma media ponderada do grafico (soma dos precos /
soma das areas validas), na mesma cidade, periodo, tipo e movimentacao, incluindo
todas as paginas. Sinal positivo indica acima da referencia; negativo, abaixo.
Sem preco/area numericos, finitos e positivos, ou para alugueis, o valor e a
variacao exibem **-**. A tabela calcula preco / area diretamente; em servidores
anteriores sem a referencia no detalhe, usa a referencia do bairro clicado no grafico.

## Permanencia e valores

- **Tempo de permanencia**: dias corridos entre inclusao e retirada. Para ativos,
  usa a data de hoje em America/Sao_Paulo, mesmo sem atualizar a leitura dos JSONs.
  Inclusao e retirada no mesmo dia representam zero dias. Datas ausentes,
  invalidas ou invertidas exibem **Nao disponivel**, sem estimativa.
- Os indicadores abaixo dos cards usam todos os anuncios da tela selecionada,
  nao apenas a pagina de 50 registros, respeitando cidade, tipo, negociacao e periodo.
- **Total $ Vendas**: soma dos precos de venda maiores que zero.
- **Ticket medio (venda)**: Total $ Vendas dividido pela quantidade de anuncios
  de venda com preco maior que zero, em toda a lista filtrada, nao so na pagina.
- **Valor m2 (venda)**: soma dos precos dividida pela soma das areas (`areaValor`),
  usando somente vendas com preco e area numericos, finitos e maiores que zero.
  Nao e a media simples dos valores individuais por metro quadrado.
- Alugueis nao entram nesses tres indicadores para nao misturar valores de venda
  com valores mensais. Sem vendas elegiveis, o respectivo indicador exibe
  **Nao disponivel**. Os cards informam quantos anuncios participaram do calculo.
- Sao precos anunciados registrados nos JSONs, nao valores de negocios fechados
  ou uma reconstituicao historica de alteracoes de preco.

Retirada nao significa venda ou locacao confirmada. Inclusao significa primeira
observacao na base, e pode coincidir com a importacao inicial. Nao e possivel
reconstruir movimentacoes anteriores ao historico disponivel.

A identidade usa imobiliaria, negociacao e link sem query/hash (codigo quando
nao ha link). Copias de uma entrada na mesma data e snapshots de uma retirada
na mesma data contam uma vez. Datas diferentes permitem reentradas/novas retiradas;
movimentos repetidos no mesmo dia nao sao distinguidos. Nao ha deduplicacao de
imoveis fisicos entre imobiliarias.

Datas ISO com fuso sao convertidas para America/Sao_Paulo; datas sem horario
e datas brasileiras preservam o dia informado. Datas ausentes/invalidas nao sao
estimadas, e os registros afetados sao sinalizados em um aviso global.
Registros sem link nem codigo sao excluidos das contagens e quantificados no aviso.
Arquivos ilegais ou malformados interrompem a leitura com erro visivel, evitando
relatorios parciais apresentados como completos.

## Testes

```powershell
node --test .\_00reports\02dashboard\dados.test.js
```
