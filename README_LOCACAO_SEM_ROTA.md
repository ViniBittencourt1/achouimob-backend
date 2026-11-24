# Locacao sem rota disponivel

Antes de zerar os destinos, os registros anteriores sao arquivados em
`retirados`, com imobiliaria, e no historico local recuperavel. Ver
[sincronizacao de alugueis](README_SINCRONIZACAO_LOCACAO.md).

Comandos na raiz do repositorio:

```powershell
npm --prefix backend run kantto:locacao
npm --prefix backend run souzarocha:locacao
npm --prefix backend run gm:locacao
npm --prefix backend run multimoveis:locacao
```

## GM

O site atual apresenta apenas vendas. A coleta de locacao da GM foi
desativada e, conforme confirmado pelo usuario, `gm:locacao` prepara zero
em `jfGmLocacao.json` e na aba compartilhada `jfGm`, preservando vendas.
O zero representa uma configuracao sem rota, nao uma busca de aluguel.
O projeto nao participa do lote Kenlo; o agendamento automatico trata
projetos sem rota como indisponiveis.

## Kantto e Souza Rocha

Conforme informado, ainda nao ha rota ou informacoes de locacao
disponiveis. Os projetos estao cadastrados em
`_utils/locacaoPreparacao.js` com `urlLocacao: null`.
Seus comandos retornam0, gravam JSONs separados `jfKanttoLocacao.json`
e `jfSouzaRochaLocacao.json` e zeram a lista nas abas herdadas
`jfKantto` e `jfSouzaRocha`, mantendo os 20 campos do cabecalho.

Kantto e Souza Rocha tambem registram seu nome e `0` nas colunas A/B da aba
`retorno` antes de preparar os destinos vazios. A linha de cada projeto e atualizada
sem apagar as contagens dos demais projetos. Esse zero indica ausencia
de uma rota de aluguel valida/configurada, nao uma consulta de vendas.
Falhas na gravacao da contagem sao reportadas, sem prosseguir com a limpeza.

Quando uma URL real estiver disponivel, sera necessario cadastra-la e
validar seu extrator antes de habilitar coleta positiva. O comando
nao inventa uma URL nem confunde dados de venda com aluguel.

## Multimoveis

Continua verificando a rota conhecida:
https://www.multimoveisjf.com.br/imoveis/para-alugar

A configuracao `zeroIfUnavailable` aplica a excecao solicitada:
se a pagina estiver indisponivel e sem cards, ou confirmar lista vazia,
retorna0 e zera `jfMultimoveisLocacao.json` e a lista da aba
`jfMultimoveis`, mesmo que existam registros anteriores de locacao.
Se houver cards mas erros de mapeamento/paginacao, nao apaga dados.
Quando a pagina voltar e publicar alugueis, a coleta Kenlo existente
e usada normalmente. Os outros projetos mantem sua regra original.

## Destinos e Preservacao

JSONs ficam em `backend/crawler/`. Sheets usa a planilha de alugueis:
https://docs.google.com/spreadsheets/d/11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk/edit

As abas sao escolhidas pelo nome EXATO herdado. Vendas, seus JSONs e
GOOGLE_SHEETS_SPREADSHEET_ID nao mudam. Sem Firestore ou agendamento
automatico. JSON vazio significa `[]`, nao arquivo JSON invalido de
zero bytes. Falhas de acesso ao Sheets continuam sendo reportadas.