# Start: locacao

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
npm --prefix backend run start:locacao
```

- Busca: https://www.startimoveisjf.com.br/imoveis.php?negocio=2&tipo=&cidade2=&dormitorios=&vagas=&faixapreco1=&faixapreco2=&condo=
- JSON separado: `backend/crawler/jfStartLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfStart`, selecionada por nome.

O link informado tinha negocio=2 no texto, mas estava sem esse filtro
no destino clicavel. O formulario confirma 1=Venda e 2=Aluguel. O novo
modo valida negocio=2 antes da navegacao e apos carregar a busca.

Cards `div.listing-item`, extratores e fallbacks existentes de endereco,
bairro e cidade por slug sao reutilizados. A paginacao continua via
`a[data-page]` com espera de novos cards; erros, falta de progresso e
limite de paginas abortam sem salvar uma coleta parcial.
O aluguel da listagem e preservado durante o enriquecimento de detalhes.

Historico e consolidacao usam somente o JSON de locacao. Coleta vazia
preserva os destinos anteriores. JSON e salvo antes de exportar Sheets.
Vendas conserva seu comando, negocio=1 e GOOGLE_SHEETS_SPREADSHEET_ID.
Sem Firestore, extractCard1 ou agendamento automatico em locacao.
Ha fallback para navegador visivel em bloqueio HTTP403.

## Contagem antes da raspagem

Antes da extracao, o processo le `h4.top15.left15`. Em `1 imoveis
encontrados`, registra `jfStart` e `1` nas colunas A/B da aba `retornoLocacao`,
na planilha de alugueis. Cada execucao atualiza a linha do projeto,
mantendo as contagens dos demais projetos.

O filtro `negocio=2` e validado antes e depois da navegacao. Zero exige
um total zero explicito. Falhas de HTTP, seletor, total ou gravacao no
Sheets interrompem a etapa antes da extracao, preservando os dados
anteriores. Bloqueios HTTP mantem a tentativa com navegador visivel.
Vendas nao executam essa precontagem.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/start/locacao.test.js
```