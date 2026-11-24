# Estrela Sul: locacao

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


Na raiz do repositorio:

```powershell
npm --prefix backend run estrelasul:locacao
```

- Busca: https://www.estrelasulimoveis.com.br/imoveis/para-alugar
- JSON separado: `backend/crawler/jfEstrelaSulLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfEstrelaSul`, selecionada por nome.

Os cards `a.card-with-buttons.borderHover` e os extratores existentes
sao reutilizados. Preco e selecionado pelo rotulo Aluguel/Locacao,
inclusive em anuncios que tambem possuem Venda. Valores com centavos
sao preservados, e Sob consulta gera `preco: null`, sem fallback de venda.

No modo locacao, a paginacao utiliza o link `a.btn-next` com texto
Ver mais, que acrescenta cards e atualiza `?pagina=N`. O total da
listagem e conferido antes de publicar. Falta de progresso, controle
ausente antes do total ou duplicacao de cards aborta sem sobrescrever
JSON e Sheets. A paginacao original de vendas nao foi alterada.

O historico vem apenas do JSON de locacao e a consolidacao do projeto
e reutilizada. Coleta vazia preserva os destinos anteriores. Locacao
nao publica no Firestore, nao executa extractCard1 e nao entra em
agendamento ou nos lotes de plataformas diferentes.
Vendas conserva `npm run estrelasul` e `GOOGLE_SHEETS_SPREADSHEET_ID`.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/estrelaSul/locacao.test.js
```