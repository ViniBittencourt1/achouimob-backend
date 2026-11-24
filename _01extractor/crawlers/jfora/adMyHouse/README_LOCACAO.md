# AdMyHouse: locacao

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


Execute a partir da raiz do projeto:

```powershell
npm --prefix backend run admyhouse:locacao
```

- Busca: https://www.admyhouse.com.br/imoveis/para-alugar/brasil?order=mais_relevantes
- JSON independente: `backend/crawler/jfAdMyHouseLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfAdMyHouse`, selecionada por nome, nunca pelo gid.

A plataforma Arbo/Superlogica substituiu o site antigo. A pre-contagem le
o cabecalho de alugueis, e a coleta consulta a API publica em lotes pelos
IDs do catalogo. O total extraido deve coincidir com a pre-contagem, sem
links duplicados. A execucao usa somente navegador headless.

Cada aluguel e gravado na aba `jfAdMyHouse` com `aluguel` na coluna U
`negociacao`, depois das vendas. O envio preserva as linhas de venda.
`atualizadoEm` registra a data e hora da coleta no fuso de Sao Paulo,
nao a data de alteracao do anuncio na API.

Zero confirmado reconcilia os alugueis anteriores como retirados e limpa
somente os alugueis ativos, preservando as vendas. Contagem invalida,
bloqueio HTTP, redirecionamento ou coleta parcial interrompe a execucao.

Vendas permanece no comando `npm run admyhouse`, sem mudar seu JSON e
usando a mesma planilha principal. Esse comando isolado executa somente
vendas; para atualizar apenas alugueis, execute `npm run admyhouse:locacao`.
A execucao combinada (`npm run raspagem:completa -- admyhouse`) e o painel
de vendas incluem a etapa de locacao depois de vendas. Locacao nao publica
no Firestore.

Testes a partir da raiz (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/adMyHouse/locacao.test.js
```