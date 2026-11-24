# Souza Gomes: locacao

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


Execute a partir da raiz do repositorio:

```powershell
npm --prefix backend run souzagomes:locacao
```

- Busca: https://souzagomes.com.br/imoveis?order=recentes&codigo=&negociacao=locacao&tipo=&localizacao=&preco_min=&preco_max=&caracteristicas=
- JSON separado: `backend/crawler/jfSouzaGomesLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfSouzaGomes`, selecionada por nome.

A extracao reaproveita os cards e a paginacao da Souza Gomes. O modo de
locacao recebe links proprios e nao executa a gravacao intermediaria de
`jfSouzaGomes.json` existente no extrator de vendas. Preco de locacao e
selecionado pelo rotulo de aluguel, inclusive em anuncios mistos, sem
usar venda como fallback. O tratamento original de valores e centavos
e mantido.

Endereco e detalhes continuam no enriquecimento existente; o historico
de locacao e lido apenas do JSON de locacao. Coleta vazia ou invalida
aborta antes de sobrescrever os destinos. JSON e salvo antes do envio
ao Sheets.

Vendas conserva `npm run souzagomes` e sua configuracao
`GOOGLE_SHEETS_SPREADSHEET_ID`. O fluxo de locacao nao publica no
Firestore nem entra automaticamente no agendamento ou no lote
`locacao:padrao`, pois o extrator possui uma interface diferente.

Testes a partir da raiz (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/souzagomes/locacao.test.js
```