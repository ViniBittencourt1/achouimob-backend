# Locacao: grupo AdMyHouse

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


Regra atual: principais contem somente ativos; ausentes vao para
`retiradosLocacao` com imobiliaria e historico recuperavel. Ver
[sincronizacao de alugueis](README_SINCRONIZACAO_LOCACAO.md).
Vazio confirmado arquiva os anteriores antes de limpar os ativos.

Projetos confirmados e adaptados:

| Aba herdada | Script | Cards |
| --- | --- | --- |
| jfDecisao | decisao:locacao | .imovelcard |
| jfFluxo | fluxo:locacao | .imovelcard |
| jfFontes | fontes:locacao | .imovelcard |
| jfImperial | imperial:locacao | .item-lista |
| jfLider | lider:locacao | API publica do site novo |
| jfPositivo | positivo:locacao | .imovelcard |
| jfRVNegocios | rv:locacao | .imovelcard / links de detalhes |
| jfTriade | triade:locacao | .imovelcard |

Imperial usa outra variante de DOM; seu extrator proprio foi mantido,
incluindo a leitura de preco em `li`, sem confundir valor por metro
quadrado com aluguel. Os demais mantem seus seletores de preco,
tratamento de endereco, fotos e detalhes existentes.

## Execucao

Na raiz do repositorio, um projeto:

```powershell
npm --prefix backend run decisao:locacao
```

Todo o grupo, em processos separados e sequenciais:

```powershell
npm --prefix backend run locacao:imobbrasil -- --todos
```

Apenas validar modulos, sem coletar ou escrever dados:

```powershell
npm --prefix backend run locacao:imobbrasil -- --check
```

Projetos escolhidos pelo nome da pasta ou da aba:

```powershell
npm --prefix backend run locacao:imobbrasil -- jfFluxo jfTriade
```

## Destinos

- JSON: `backend/crawler/<nome-da-aba>Locacao.json`.
- Planilha: https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba: nome EXATO herdado, nunca o gid do link.
- Historico: somente o JSON de locacao. Vendas mantem comandos e configuracao originais.
- Sem publicacao no Firestore e sem inclusao automatica em agendamento.

URL de locacao e configuravel apenas no novo fluxo. Falhas de pagina
abortam sem salvar uma coleta parcial. Em bloqueio HTTP ha tentativa
com navegador visivel quando a primeira execucao estiver em headless,
exceto nos projetos fixados em modo oculto. `decisao:locacao` sempre roda
em headless, independentemente de `CRAWLER_HEADLESS`, sem abrir janela
visivel como alternativa em caso de bloqueio. Nesse caso, o erro e
propagado e os dados anteriores sao preservados.
`fluxo:locacao`, `positivo:locacao` e `rv:locacao` tambem permanecem em headless; suas
precontagens usam o mesmo User-Agent dos respectivos extratores para
evitar a divergencia que causava HTTP 403
antes da coleta. Se o site ainda negar acesso, a execucao falha sem
substituir os dados anteriores.
No lote, uma falha nao impede os proximos projetos, mas retorna erro
final identificando os projetos que falharam.

Aviso explicito `0 imoveis encontrados` permite preparar JSON `[]` e
cabecalho de 21 colunas na primeira coleta. Se ja houver historico de
locacao, JSON e Sheets sao preservados quando a listagem ficar vazia.
Sem aviso de zero ou com erro HTTP, dados anteriores nao sao alterados.

## Lider: layout atual ImobBrasil

`jfLider` usa um adaptador de locacao para o layout ImobBrasil atual, na rota
`https://www.lidernegociosimob.com.br/imovel/locacao`. As rotas `/alugar` e
`/busca` retornavam HTTP 404. Tanto `lider:locacao` quanto o lote rodam sempre
em headless, sem tentativa com navegador visivel.
O extrator segue os links oficiais `pag`, valida o total em todas as paginas
e exige a quantidade exata de anuncios unicos antes de salvar. Repeticoes
do mesmo link e referencia sao deduplicadas; divergencias e coleta parcial
interrompem o fluxo, preservando a base anterior. O preco vem somente do
card de locacao, sem taxas ou fallback de venda. Os detalhes sao visitados
para complementar o endereco quando publicado.

### Vendas da Lider

O comando `npm --prefix backend run lider` tambem usa o adaptador ImobBrasil,
na rota `/imovel/venda`, com precontagem e raspagem sempre em headless.
A rota `/comprar` nao e mais usada no orquestrador nem no contador geral.
O User-Agent da precontagem e o mesmo da coleta. Venda e locacao exigem
titulo e rotulo de negociacao correspondentes, sem misturar precos.
`Consulte` e `Sob consulta` em vendas geram preco `null`.

O site repete anuncios nas linhas da listagem e seus links de paginacao
terminam antes do fim real. Em vendas, se uma pagina ainda tem 15 linhas
e faltam anuncios para o total informado, a coleta avanca pelo parametro
`pag` existente ate completar o total unico. Falta de progresso, preco
divergente em duplicatas, erro HTTP ou total alterado abortam sem publicar.
Validado em 2026-10-28 com 112 vendas unicas distribuidas em 14 paginas.

## Contagem antes da raspagem

Os oito projetos do lote e `admyhouse:locacao` registram o total disponivel
na aba `retornoLocacao` da planilha de alugueis, antes da extracao. Coluna A:
`Projeto`; coluna B: `Quantidade`. Cada execucao atualiza a linha do
projeto, mantendo as contagens dos demais projetos e layouts.

O layout antigo usa `.topsearch__total strong`: no texto `44 imoveis
encontrados. Pagina 1`, registra `44`, nao o numero da pagina nem apenas
os cards visiveis. A Triade usa `b` no lugar de `strong`; a Imperial usa
`.grid-3 strong`, junto ao aviso de imoveis encontrados. Zero e valido
somente quando confirmado. A contagem da Triade usa o mesmo User-Agent
do extrator, mantendo o navegador headless e rejeitando respostas HTTP
403 sem alterar a base ou registrar zero. A Lider usa
`total_count` da primeira resposta da API publica da busca de aluguel,
sem paginar ou abrir detalhes na etapa de contagem.

Falhas de HTTP, seletor, total ou gravacao no Sheets interrompem o projeto
antes da extracao, preservando os dados anteriores. Bloqueios HTTP seguem
a tentativa com navegador visivel ja existente. Vendas nao executam esta
etapa. Os comandos individuais e o lote utilizam a mesma precontagem.

## Testes

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/_utils/locacaoImobBrasil.test.js
```
## Niteroi: Oceanica, Simark, RCA e JN

O adaptador `niteroi\locacao\imobBrasil.js` reutiliza o extrator de vendas
com `negociacao: "aluguel"`, sem alterar o padrao de vendas. Aceita links
`-locacao` e `-aluguel`, conserva o valor mensal do card (sem somar taxas)
e retorna `null` quando o anuncio informa consulta de preco.

Validacao real, em headless e sem salvar JSON ou publicar:

```powershell
Set-Location backend
node _01extractor\crawlers\jfora\niteroi\locacao\runLocacao.js nitOceanica nitSimark nitRca nitJn --check
```

Nesse runner, `--check` coleta a primeira pagina e enriquece os detalhes;
nao e apenas uma verificacao de importacao dos modulos. A funcao `contar`
le o total sem escrever em planilhas. A coleta completa exige exatamente
esse total, deduplica links e valida o contador a cada pagina `?pag=`.
Registros anteriores reaproveitam detalhes; imoveis novos consultam a
ficha. A JN tambem recupera bairro/cidade da descricao exclusiva do
anuncio quando faltam no card, usando os catalogos e criterios existentes
de Niteroi. Um timeout na ficha de aluguel e repetido uma unica vez;
falhas persistentes interrompem a coleta sem retornar resultado parcial.
