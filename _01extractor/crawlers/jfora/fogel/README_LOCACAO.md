# Fogel: locacao

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
npm --prefix backend run fogel:locacao
```

- Busca: https://fogel.com.br/pesquisa?transacao=Loca%C3%A7%C3%A3o&ordena=menor_valor
- JSON separado: `backend/crawler/jfFogelLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfFogel`, selecionada por nome.

O DOM e o mesmo padrao Colibex da A Casas: cards
`div.feat_property.search-feat-card`, links `/detalhes/`, aluguel em
`.search-feat-card__hero-valor` e taxas em `.search-feat-card__taxas`.
IPTU, condominio e valor total entram no titulo separados por ` | `.
Quando nao houver taxas, o titulo permanece sem complemento.

O campo preco mantem o aluguel da listagem. A rota interna nao pode
substitui-lo pelo total com taxas. Os demais campos continuam nos
extratores proprios, incluindo normalizacao de cidade e bairro.
A paginacao propria da Fogel e mantida (pagina=2 em diante); em locacao,
o total de resultados e conferido e erros/duplicacoes impedem publicacao
de uma coleta parcial.

Historico vem apenas do JSON de locacao e utiliza a consolidacao atual.
Coleta vazia ou invalida preserva destinos anteriores. JSON e salvo
antes do envio ao Sheets. Ha fallback para navegador visivel em HTTP403.
Vendas conserva `npm run fogel` e `GOOGLE_SHEETS_SPREADSHEET_ID`.
Locacao nao publica no Firestore nem entra em agendamento ou em lotes
de outras plataformas.

## Contagem antes da raspagem

Fogel e A Casas leem `span.heading-color.fw600` antes da extracao e
registram projeto/quantidade em `retornoLocacao`, colunas A/B da planilha de
alugueis. No texto `Pagina 1 de 2 - 1-24 de 36 resultados`, registra-se
`36`, nao o numero da pagina, a quantidade de paginas ou o intervalo.
Cada execucao atualiza a linha do projeto sem apagar os demais totais.

Zero exige um total zero explicito. Falhas de HTTP, seletor, total ou
gravacao no Sheets interrompem o projeto antes da extracao, preservando
os dados anteriores. Bloqueios HTTP mantem a tentativa com navegador
visivel. Vendas nao executam essa etapa.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/fogel/locacao.test.js backend/_01extractor/crawlers/jfora/aCasas/locacao.test.js
```