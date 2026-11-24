# RE/MAX: locacao

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
npm --prefix backend run remax:locacao
```

- Busca: https://www.remax.com.br/listings?Country=Brasil&Province=9512&City=6579324&CountryId=55&CityNM=6579324-Juiz+de+Fora%2C+Minas+Gerais&ProvinceNM=9512-Minas+Gerais%2C+Regi%C3%A3o+Sudeste&ListingClass=-1&TransactionTypeUID=260
- JSON separado: `backend/crawler/jfRemaxLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfRemax`, selecionada por nome.

O modo locacao usa TransactionTypeUID=260 e City=6579324 (Juiz de Fora).
Vendas continua no 261. A URL pode ser normalizada pelo proprio site,
mas o extrator valida links de detalhes com `/alugar/` ou `/locacao/`
e codigos. Venda e compra nao sao aceitas nesse fluxo.

Os cards `.listing-card`, campos e fotos Gryphtech sao reaproveitados.
Preco de aluguel preserva centavos; Sob consulta gera null. O parse
original de vendas e mantido. HTML bruto e bairroRaw nao entram nos
registros de locacao, evitando inflar o JSON.

Em vendas e alugueis, links ja presentes no JSON da mesma modalidade
nao visitam novamente a rota interna: `corretor` e reaproveitado do JSON.
Valores antigos, inclusive `Remax` ou vazio, permanecem como estavam.
Somente novos `linkReal` consultam o link de escritorio da rota interna
para obter a franquia, como `REMAX ELOS`. Essa visita altera somente
`corretor`, preservando preco e foto da listagem. Franquia ausente ou
erro HTTP em um imovel novo interrompe a extracao; nao existe fallback
automatico para `Remax`.

Datas exportadas para a planilha usam `DD/MM/AAAA HH:mm:ss` no fuso
`America/Sao_Paulo`. O formato original das datas no JSON e preservado.

A paginacao segue o total informado no site, verifica progresso e
ignora links ja coletados quando existe sobreposicao entre paginas.
Paginas sem novos alugueis, falta de pagina ou total de links unicos
diferente do anunciado interrompem a coleta.
Coleta parcial ou vazia nao sobrescreve destinos anteriores. A cada
pagina pode haver coleta de lixo quando Node esta com --expose-gc.

O extrator nao grava seu JSON intermediario de vendas no modo locacao.
Em vendas, tambem nao ha gravacao intermediaria: o JSON principal so e
atualizado pela sincronizacao apos validar a coleta completa. Vendas
usam paginacao por total unico, comparando com a precontagem. O contador
aguarda os filtros React terminarem de carregar para nao registrar o
total geral antes do filtro de cidade. Cards de cada pagina sao lidos
como um snapshot de HTML antes do processamento dos campos.
Para vendas, a API usa lotes que excluem `ListingKey` ja recebidos, sempre
com `skip=0`, em vez de depender de posicoes em uma ordenacao por data.
Na precontagem de vendas, a URL inicial exige cidade e `TransactionTypeUID=261`.
Depois da navegacao, o total vem exclusivamente da API com esses filtros:
o React pode normalizar a URL para `TransactionTypeUID=-1` ou remover a cidade.
Essa URL transitoria nao e usada como prova dos filtros nem para ler o total geral.
Cidade, negociacao e demais filtros sao preservados. O HTML continua
sendo renderizado pelo site para reaproveitar os extratores existentes.
Mudanca do total, chaves repetidas ou filtros diferentes bloqueiam a
coleta. Chamadas repetidas da mesma pagina reutilizam o mesmo lote.
O historico de locacao e lido apenas do JSON de locacao e usa a
consolidacao existente. A exportacao ocorre depois de salvar o JSON.
Nao ha Firestore, extractCard1, atualizacao de bairros ou agendamento
automatico nesse comando. GOOGLE_SHEETS_SPREADSHEET_ID de vendas nao muda.

## Contagem antes da raspagem

Antes da extracao, o processo aguarda o paragrafo com o texto
`698 Numero total de correspondencias` e registra `jfRemax` e `698`
nas colunas A/B da aba `retornoLocacao`, na planilha de alugueis. A leitura
usa o texto estavel, sem depender da classe CSS gerada, e nao limita
o total aos 24 cards da primeira pagina. Essa etapa nao pagina nem
salva dados de imoveis; a linha e atualizada sem apagar os demais totais.

O filtro `TransactionTypeUID=260` e validado antes e depois da navegacao.
Depois da navegacao, a contagem aguarda ate 30 segundos pela estabilizacao
dos filtros de cidade e locacao na URL, pois o site os normaliza via React.
Uma URL transitoria nao interrompe imediatamente a coleta. Se os filtros
nao estabilizarem, o erro informa a URL recebida e preserva a contagem anterior.
Se o site substituir aluguel por `TransactionTypeUID=-1` na mesma cidade,
a contagem e a extracao reaplicam uma vez o filtro pela aba `Alugar`.
Depois das requisicoes terminarem, a pagina e recarregada com a URL filtrada
para sincronizar tambem o contador exibido pelo React.
O processo exige novamente `260` e a cidade correta, e a API da extracao
aceita somente locacao. Nao ha conversao de resultados gerais em alugueis.
Zero exige um total zero explicito. HTTP, timeout, total desconhecido,
redirecionamento para venda ou falha no Sheets interrompem o processo
antes da extracao, preservando os dados anteriores. Vendas nao executam
esta precontagem.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/remax/locacao.test.js
```