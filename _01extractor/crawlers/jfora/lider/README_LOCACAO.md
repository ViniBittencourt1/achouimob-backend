# Lider: locacao

## Fluxo atual: ImobBrasil

Vendas e locacao usam `/imovel/venda` e `/imovel/locacao`. As referencias
ao Larbase abaixo descrevem a plataforma anterior, nao as rotas atuais.
A locacao valida o total de `.topsearch__total`, coleta `.imovelcard`
e visita os detalhes para complementar o endereco.

O site pode repetir cards e omitir o link da proxima pagina antes do fim
do catalogo. Quando a pagina tem 15 cards e faltam links unicos, o extrator
consulta `?pag=N` mesmo sem link seguinte, tanto em vendas quanto em
locacao. O total unico deve coincidir com a pre-contagem; contagem alterada,
pagina sem progresso, erro HTTP ou coleta parcial abortam sem sincronizar.
O comando individual de locacao usa somente navegador headless.

## Vendas: site Larbase (outubro de 2026)

O comando `npm --prefix backend run lider` usa `/comprar`. A antiga busca
`/busca?finalidade=comprar` retorna HTTP 404 e nao deve ser usada como
contagem zero. A contagem vem de `.ct-lista-topo__total`, sob o titulo
`Imoveis a venda`, e nao mais da antiga API `listar_imoveis_publicos`.

O extrator de vendas segue os links oficiais `?pagina=N`, exige o mesmo
total da precontagem e rejeita paginas incompletas e anuncios repetidos.
Depois visita cada `/imovel/<slug>` para ler os dados estruturados
`RealEstateListing` e as caracteristicas visiveis. Preco, codigo e
localizacao invalidos impedem a sincronizacao. As 20 colunas existentes
e a preservacao da negociacao de aluguel no Sheets continuam iguais.
O preco vem exclusivamente do valor visivel rotulado `Venda`: em anuncios
mistos o JSON-LD pode informar o valor de aluguel, mesmo na busca de vendas.

Validacao sem executar a sincronizacao:

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/lider/vendas.test.js backend/_01extractor/crawlers/jfora/_utils/vendasContagem.test.js
```

## Locacao: site Larbase

O comando individual e o adaptador do lote ImobBrasil usam `/alugar`.
A antiga `/busca?finalidade=alugar` tambem retorna HTTP 404: isso e falha
de navegacao, nunca confirmacao de ausencia de imoveis. Contagem, paginacao
e detalhes reutilizam a mesma implementacao de vendas, selecionando
explicitamente a negociacao correta.

## Sheets unificado de Juiz de Fora

Vendas e alugueis usam a mesma planilha principal e a mesma aba da imobiliaria.
As 20 colunas originais sao preservadas, com a coluna U `negociacao` ao fim:
`venda` ou `aluguel`. Cada envio substitui somente sua negociacao, preservando
a outra (inclusive quando a coleta vazia foi confirmada). Os JSONs continuam
separados. O destino padrao vem de `_utils/jfSheetsConfig.js`, e nao da variavel
`GOOGLE_SHEETS_SPREADSHEET_ID`. Retirados de aluguel usam `retiradosLocacao`;
suas contagens usam `retornoLocacao`, na mesma planilha principal.
Os dados da planilha antiga nao sao migrados automaticamente: a principal
sera atualizada nas proximas raspagens.


Tipo Imovel e convertido para o slug de `_brTipoImovel.json` usando
os nomes e aliases de tiposPorSlug, incluindo termos completos contidos
em tipos compostos. Exemplos: Apartamento Garden e Apartamento Duplex ->
apartamento, Terreno Urbano -> terreno, Casa Comercial -> casa-comercial.
Aliases mais especificos tem prioridade; resultados ambiguos ou desconhecidos
permanecem para revisao. Atribuicoes manuais do painel sao preservadas.

O bairro recebido como nome no detalhe e convertido pelo catalogo da cidade
antes de montar os 20 campos. Exemplo:
`Bom Jardim` -> `bom-jardim`, `Sao Mateus` -> `sao-mateus`.
Nomes, aliases, acentos e caixa sao tratados pelo resolvedor existente.
Um resultado de outra cidade nao e aceito. Se nao houver correspondencia
valida, o nome original permanece para revisao no painel, sem inventar slug.

Na raiz do repositorio:

```powershell
npm --prefix backend run lider:locacao
```

- Busca: https://www.lidernegociosimob.com.br/alugar
- JSON: `backend/crawler/jfLiderLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfLider`, selecionada por nome.

O navegador le `.ct-lista-topo__total` sob o titulo `Imoveis para alugar`,
segue os cards `article.ct-card` e a paginacao oficial `?pagina=N`.
Nao ha dependencia da antiga API `listar_imoveis_publicos`.
Cada anuncio `/imovel/<slug>` e visitado para ler JSON-LD e campos visiveis.
Coleta parcial, total alterado, links/codigos repetidos, falha no detalhe
ou preco invalido abortam sem sobrescrever JSON e Sheets.

O aluguel vem exclusivamente do valor visivel rotulado `Aluguel`, retirando
a indicacao `/mes`, sem somar condominio/IPTU, usar o total mensal ou o valor
de venda. Anuncios mistos sao aceitos somente com aluguel explicito,
independentemente do preco informado no JSON-LD. Cidade e normalizada
pelo catalogo existente.

Os 20 campos do projeto e a consolidacao existente sao mantidos.
Historico e lido apenas do JSON de locacao. Vazio preserva os dados
anteriores, salvo quando a precontagem e a listagem confirmam zero.
A sincronizacao de vendas continua independente; locacao nao publica
no Firestore. Ha fallback visivel em bloqueio HTTP 403/429.

A Lider tambem integra `locacao:imobbrasil -- --todos` com seu adaptador
especifico, sem reutilizar o DOM legado dos demais projetos.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/lider/locacao.test.js backend/_01extractor/crawlers/jfora/lider/vendas.test.js backend/_01extractor/crawlers/jfora/_utils/locacaoContagem.test.js backend/_01extractor/crawlers/jfora/_utils/locacaoImobBrasil.test.js
```