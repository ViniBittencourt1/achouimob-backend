# Locacao: padrao 1000 Imoveis

Regra atual: principais contem somente ativos; ausentes vao para
`retirados` com imobiliaria e historico recuperavel. Ver
[sincronizacao de alugueis](README_SINCRONIZACAO_LOCACAO.md).
Vazio confirmado arquiva os anteriores antes de limpar os ativos.

Os 17 projetos abaixo compartilham cards `.imovel-item.imovel-item-show`,
precos em `.imovel-item--preco--item` e busca por `negociacao=locacao`.
Cada um continua usando seus proprios extratores, detalhes e consolidacao.

No Universal e na Ribeiro & Arrabal, as paginas seguintes sao coletadas pelas respostas HTML de
`/imoveis?tmpl=imoveis/list_items&page=2`, mantendo os filtros de locacao.
O fluxo nao depende do botao no DOM e exige o total completo de links
unicos; respostas vazias, repetidas, HTTP invalido ou redirecionamento
para outra busca interrompem a coleta sem publicar resultados parciais.
A Ribeiro & Arrabal compara a listagem com a precontagem, informa progresso
por pagina e limita cada requisicao de paginacao a 60 segundos, sem o loop
indefinido de cliques em "Mostrar mais imoveis". As consultas de enderecos
RobustCRM informam progresso a cada 20 detalhes, para distinguir trabalho
em andamento de uma espera travada.

| Projeto / aba herdada | Script individual |
| --- | --- |
| jfAlicerce | alicerce:locacao |
| jfAlmar | almar:locacao |
| jfBargon | bargon:locacao |
| jfBrasil | brasil:locacao |
| jfCasaNova | casanova:locacao |
| jfClientt | clientt:locacao |
| jfEuro | euro:locacao |
| jfInmob | inmob:locacao |
| jfLocato | locato:locacao |
| jfMarques | marques:locacao |
| jfNegociar | negociar:locacao |
| jfNogueira | nogueira:locacao |
| jfRedentor | redentor:locacao |
| jfRezende | rezende:locacao |
| jfRibeiroArrabal | ribeiroarrabal:locacao |
| jfSelect | select:locacao |
| jfUniversal | universal:locacao |

Execute a partir da raiz do repositorio:

```powershell
npm --prefix backend run alicerce:locacao
```

Para coletar os 17 sequencialmente, continuando os demais se um falhar:

```powershell
npm --prefix backend run locacao:padrao -- --todos
```

Para validar apenas os modulos, sem abrir navegador ou publicar dados:

```powershell
npm --prefix backend run locacao:padrao -- --check
```

Tambem e possivel escolher projetos pelo nome da aba:

```powershell
npm --prefix backend run locacao:padrao -- jfAlicerce jfAlmar
```

## Destinos e seguranca

- JSON: `backend/crawler/<nome-da-aba>Locacao.json`, criado na primeira coleta valida.
- Planilha de alugueis: https://docs.google.com/spreadsheets/d/11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk/edit
- Aba: nome EXATO herdado, como `jfAlicerce`, nunca o gid da URL.
- URL: conserva dominio e parametros do projeto, muda negociacao e remove limites de preco de venda.
- Preco: selecionado pelo rotulo de locacao/aluguel, mesmo em anuncios mistos.
- Aluguel sem valor numerico, como `Aceita proposta.`: preservado com `preco: null`, sem usar valor de venda.
- Universal: extrai condomínio, IPTU e o total mensal anunciado. Valores de custos ausentes são `0`; quando o total anunciado superar aluguel + condomínio + IPTU, a diferença fica em `precoOutros`. `precoTotal` preserva o total anunciado quando disponível; sem ele, soma os custos identificados sem substituir `preco`.
- Historico: apenas o JSON de locacao, sem ler ou atualizar o JSON de vendas.
- Coleta vazia ou sem link/preco valido: aborta sem sobrescrever os dados anteriores.
- Excecao jfRezende: resposta valida com aviso explicito de nenhum imovel zera o JSON de locacao (`[]`) e a lista no Sheets, preservando o cabecalho. Falhas e vazio sem confirmacao continuam preservando dados.
- Sem publicacao no Firestore e sem inclusao no agendamento de vendas.

Os comandos originais e `GOOGLE_SHEETS_SPREADSHEET_ID` de vendas ficam
inalterados. JSON e salvo antes do Sheets, permitindo preservar a coleta
se houver erro de permissao ou aba ausente. O processo retorna erro se
qualquer projeto escolhido falhar e identifica os nomes no resumo.

A 1000 Imoveis ja usa `1000imoveis:locacao` e nao foi refeita nem incluida
no novo lote. Acervo, Bom Clima e Toronto tem outro DOM e nao devem ser
incluidos apenas por terem um botao de paginacao semelhante. Acervo,
A Casas e AdMyHouse conservam suas adaptacoes individuais anteriores.

## Contagem antes da raspagem

Os 17 projetos deste lote, `1000imoveis:locacao` e `souzagomes:locacao`
leem o total entre parenteses em `#title--label` antes de extrair os imoveis.
Na planilha de alugueis, a aba `retorno` recebe duas colunas: `Projeto` e
`Quantidade`. Cada nova execucao atualiza a linha do projeto, sem apagar
as contagens dos demais. A aba e criada automaticamente se nao existir.

O total e o anunciado pelo site para a busca de locacao, nao apenas o
numero de cards visiveis na primeira pagina. Zero precisa ser confirmado;
na Rezende, o aviso explicito de filtro sem imoveis tambem confirma zero.
Falhas de HTTP, leitura do total ou gravacao em `retorno` interrompem o
projeto antes da extracao, preservando os dados anteriores. Os comandos
de vendas nao executam essa etapa. Os demais layouts ainda nao estao
incluidos nesta primeira implementacao.

## Testes

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/_utils/locacaoContagem.test.js
```

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/_utils/locacaoPadrao.test.js
```