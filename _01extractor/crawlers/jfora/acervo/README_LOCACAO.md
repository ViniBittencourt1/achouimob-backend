# Acervo: locacao

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
npm --prefix backend run acervo:locacao
```

- Busca: https://www.acervoimoveis.com.br/imoveis/para-alugar/brasil?order=mais_relevantes
- JSON independente: `backend/crawler/jfAcervoLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfAcervo`, selecionada por nome, nunca pelo gid.

O titulo inclui os textos dos elementos `ImovelCardInfo_feesValue__`,
normalizando espacos HTML e ignorando o divisor visual:
`Titulo | Condominio R$ 168,50 / IPTU R$ 87,22`.
Os acentos e valores originais do site sao preservados. Sem taxas, o
titulo permanece sem complemento. O preco corresponde apenas ao aluguel,
sem somar condominio ou IPTU.

A extracao reutiliza os cards, a rolagem, os detalhes e a consolidacao do
projeto de vendas. O filtro de links de locacao usa `/locacao/`; vendas
continua usando `/venda/juiz-de-fora/`. O historico de locacao e lido
somente do JSON de locacao.

O comando `npm run acervo` e a variavel `GOOGLE_SHEETS_SPREADSHEET_ID` de
vendas permanecem iguais. Locacao nao publica no Firestore nem entra no
agendamento de vendas. Coleta vazia ou aluguel sem link/preco valido
aborta antes de sobrescrever o JSON e a planilha. O JSON e salvo antes
da exportacao ao Sheets.

Testes a partir da raiz (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/acervo/locacao.test.js backend/_01extractor/crawlers/jfora/acervo/extractor-04-localizacao.test.js
```