# 1000 Imoveis: locacao

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


Execute a partir da pasta `backend`:

```powershell
npm run 1000imoveis:locacao
```

O comando usa a listagem com `negociacao=locacao`, reaproveita os extratores
e a paginacao de vendas e seleciona o valor de locacao em anuncios mistos.
O formato dos registros e as 20 colunas originais sao mantidos, incluindo
a convencao atual de preco inteiro (sem centavos).

- JSON: `backend/crawler/jf1000ImoveisLocacao.json`, independente da pasta de execucao.
- Planilha: https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba: `jf1000Imoveis`, mantendo o nome herdado do projeto de vendas.
- O `gid` do link nao define o destino da exportacao.

Compartilhe a nova planilha como Editor com a conta de servico:
`firebase-adminsdk-fbsvc@rampagemimoveis.iam.gserviceaccount.com`.
O destino padrao dos dois fluxos vem de `_utils/jfSheetsConfig.js`.

O comando de vendas `npm run 1000imoveis` permanece independente. Locacao
nao publica no Firestore e preserva o JSON e as linhas de venda na aba
compartilhada. Uma coleta vazia encerra com erro sem
sobrescrever os dados anteriores. O JSON e salvo antes da exportacao ao
Sheets; falha de permissao nao remove o arquivo local.

Vendas usam faixas de preco sobrepostas, com faixa final sem teto. Os links
repetidos nas fronteiras sao deduplicados, e cada faixa e conferida com sua
contagem. Se a uniao nao corresponder a contagem global, a coleta tenta a
listagem sem filtro de preco, incluindo possiveis anuncios sem preco. Se a
conferencia ainda falhar, a base anterior e preservada. A locacao continua
usando sua propria listagem sem faixas. Nas vendas, as paginas adicionais
sao carregadas pelo mesmo endpoint usado pelo botao do site, com tentativas
limitadas para erros transitorios.

Testes a partir da pasta `backend` (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test _01extractor/crawlers/jfora/1000Imoveis/locacao.test.js
```