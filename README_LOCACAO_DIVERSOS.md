# Locacao: Couto, Invest, Oliveira e Mega

Regra atual: principais contem somente ativos; ausentes vao para
`retirados` com imobiliaria e historico recuperavel. Ver
[sincronizacao de alugueis](README_SINCRONIZACAO_LOCACAO.md).
Esta regra substitui a antiga consolidacao com excluidos na lista principal.

Na raiz do repositorio, todo o grupo em processos separados sequenciais:

```powershell
npm --prefix backend run locacao:diversos -- --todos
```

Comandos individuais:

```powershell
npm --prefix backend run couto:locacao
npm --prefix backend run invest:locacao
npm --prefix backend run oliveira:locacao
npm --prefix backend run mega:locacao
```

Apenas carregar e validar modulos, sem coletar:

```powershell
npm --prefix backend run locacao:diversos -- --check
```

`jfOliveira` (joliveirajf.com.br) e diferente de `jfOliver`
(oliverimoveisjf.com.br). O lote `locacao:kenlo -- --todos` executa
Oliver, nao Oliveira. Para os alugueis da J Oliveira, use
`oliveira:locacao` ou este lote `locacao:diversos`.

## Rotas e Particularidades

- Couto: https://www.coutoguerraimoveis.com.br/search?acao=s3&finalidade_s=3 . O texto do link fornecido e a busca correta; seu href apontava a home. Cards sao dd.foto-lista + dd.det-lista, paginacao pag=N. Total e comparado, erros propagados e aluguel preservado durante detalhes.
- Invest: https://www.invest.com.br/ResultadoBusca.aspx?fin=2&tit=Imovel-para-Locacao . Paginas conservam fin=2 e seguem o link nativo com pag/qtdeitens/posicao (ultima pagina usa quantidade restante, nao135fixo). Coleta parcial/timeouts abortam sem gravar invest.skip ou o JSON intermediario de vendas.
- Oliveira: https://www.joliveirajf.com.br/imoveis/para-alugar . Adaptador Kenlo especifico; vendas no dominio antigo oliveiramendesimoveisjf permanece inalterada. Ver mais segue total; preco somente pelo rotulo Aluguel; 20campos, cidade/bairro por catalogos existentes.
- Mega: https://megacasaimoveis.com.br/imovel/?_cidade=juiz-de-fora&_acao=alugar . WP Grid Builder usa article.wpgb-card e Carregar Mais. Aluguel e wpgb-block-13; wpgb-block-16 e venda, e o pai block-10 concatena ambos. Nao usar texto geral para decidir preco. Bairros de titulos/URLs de aluguel aceitos sem mudar os slugs de vendas.

Na Oliveira, `Ver mais` navega pelos links `?pagina=N`, sem carregamento
cumulativo no mesmo DOM. O coletor acumula links unicos entre as paginas
e valida origem, rota, total e progresso antes de publicar. Em 2026-10-28,
foram verificados 52 alugueis em cinco paginas (12, 12, 12, 12 e 4 cards).
Pagina ausente, repetida ou com total alterado interrompe a coleta sem
salvar resultados parciais; nao ha aumento de timeout para mascarar a falha.

## Destinos e Seguranca

JSONs separados em `backend/crawler/<nome-da-aba>Locacao.json`, abas
herdadas EXATAS jfCouto, jfInvest, jfOliveira e jfMega na planilha de
alugueis: https://docs.google.com/spreadsheets/d/11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk/edit

Historico e lido somente dos JSONs de locacao. Comandos e configuracao
GOOGLE_SHEETS_SPREADSHEET_ID de vendas permanecem iguais. Sem Firestore,
agendamento automatico ou atualizacao de filtros no novo fluxo.
Coleta vazia, duplicada, parcial ou invalida preserva destinos anteriores.
JSON e salvo antes de Sheets. No lote, falhas nao impedem os proximos
projetos, mas retornam erro ao final com os nomes afetados.

## Contagem antes da raspagem: Invest

A Invest le `#ContentPlaceHolder1_lblQuantidadeImoveisEncontrados h1`
antes da extracao. Em `Locacao - 163 Imoveis encontrados`, registra
`jfInvest` e `163` nas colunas A/B da aba `retorno`, na planilha de
alugueis. O intervalo `Exibindo 1 ate 135` nao e usado como total.
A linha e atualizada sem apagar as contagens dos demais projetos.

O filtro `fin=2` e conferido na URL inicial e final, junto ao titulo de
locacao. Zero precisa ser explicito. Falhas de HTTP, seletor, total ou
Sheets interrompem o projeto antes da extracao, sem gravar os JSONs
ou `invest.skip`. Vendas nao executam essa etapa. Os quatro projetos
deste lote possuem precontagem, cada um com seu leitor de total.

## Contagem antes da raspagem: Oliveira

A Oliveira reutiliza o leitor do cabecalho Kenlo: `Exibindo 47 Imoveis
para alugar` registra `jfOliveira` e `47` nas colunas A/B de `retorno`,
antes de extrair os imoveis ou paginar. O total vem do `h1`, nao da
quantidade de cards visiveis na primeira pagina. A linha do projeto
e atualizada sem apagar as contagens dos demais.

Falhas de pagina, total desconhecido ou gravacao no Sheets interrompem
a etapa antes da extracao, preservando os dados anteriores. O fluxo de
vendas no dominio antigo permanece inalterado. Esta etapa e usada tanto
em `oliveira:locacao` quanto na execucao da Oliveira pelo lote.

## Contagem antes da raspagem: Mega

A Mega le `.wpgb-result-count` na faceta `data-facet="10"` do grid
`data-grid="4"`, sem depender do ID gerado do conteiner. Em `10`,
registra `jfMega` e `10` nas colunas A/B da aba `retorno`, antes da
extracao ou paginacao. A linha e atualizada sem apagar os demais totais.

O filtro `_acao=alugar` e conferido na URL inicial e final. Zero precisa
ser explicito. Falhas de HTTP, faceta, total ou Sheets interrompem a
etapa antes da extracao, preservando os dados anteriores. Vendas nao
executam esta precontagem. Comando individual e lote usam a mesma etapa.

## Contagem antes da raspagem: Couto

A Couto le o total depois de `de` em `.pagesNav`. No texto
`Resultado(s) 1 - 27 de 27 resultados`, registra `jfCouto` e `27`
nas colunas A/B da aba `retorno`, antes da extracao ou paginacao.
O inicio e o fim do intervalo exibido nao sao usados como total.
A linha do projeto e atualizada sem apagar as contagens dos demais.

Os filtros `acao=s3` e `finalidade_s=3` sao validados na URL inicial
e final. Zero exige um total zero explicito. Falhas de HTTP, seletor,
total ou Sheets interrompem a etapa antes da extracao, preservando os
dados anteriores. Vendas nao executam esta precontagem. Comando
individual e lote usam a mesma etapa.

## Testes

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/_utils/locacaoDiversos.test.js
```