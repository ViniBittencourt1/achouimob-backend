# TOC2: locacao

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
npm --prefix backend run toc2:locacao
```

- Busca: https://toc2imoveis.com.br/imoveis/aluguel/-/-/-/-?ordem=desc-inclusao
- JSON separado: `backend/crawler/jfToc2Locacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfToc2`, selecionada por nome.

O modo locacao reutiliza os cards React e os extratores de campos atuais,
aceitando classes parciais para evitar dependencia do hash do CSS.
Preco e selecionado pelo rotulo Aluguel/Locacao, preservando centavos.
Sob consulta resulta em null; sem bloco de aluguel a coleta e rejeitada.
Os detalhes de anuncios mistos podem ter `/venda/` na URL, portanto o
rotulo do preco, e nao esse caminho, valida a finalidade do card.

Pagina=1 usa a rota fornecida. Outras paginas usam `pagination=N`,
mantendo aluguel e ordem=desc-inclusao, sem faixas de preco de venda.
O extrator aguarda o total Encontrados e o carregamento dos cards.
Quantidade final, links unicos e filtro de aluguel sao conferidos;
falhas ou coleta parcial preservam os destinos anteriores.

Cidade e bairro conservam os fallbacks por URL do projeto. Os novos
imoveis recebem os detalhes pelo enriquecimento existente, sem mudar
o aluguel obtido na listagem. O campo auxiliar garagem e removido
apenas no novo modo, mantendo os 20 campos usados no Sheets.

Historico vem apenas do JSON de locacao e usa a consolidacao do projeto.
JSON e salvo antes de enviar Sheets. Vendas conserva seu comando,
rota e GOOGLE_SHEETS_SPREADSHEET_ID. Sem Firestore, extractCard1 ou
agendamento automatico no fluxo de locacao.

## Contagem antes da raspagem

Antes da extracao, o processo aguarda o contador e os primeiros cards
da pagina, ou um zero explicito, e le `h2[class*="Properties_qtd1__"]`.
Em `64 Encontrados`, registra `jfToc2` e `64` nas colunas A/B da aba
`retornoLocacao`, na planilha de alugueis. O total nao e limitado aos cards
visiveis da primeira pagina. A classe CSS e identificada pelo prefixo,
sem dependencia do sufixo gerado. A linha e atualizada sem apagar os
totais dos outros projetos.

A rota de aluguel e validada antes e depois da navegacao. HTTP,
redirecionamento para venda, timeout, total desconhecido ou falha no
Sheets interrompem a etapa antes da extracao, preservando os dados
anteriores. Vendas nao executam essa precontagem.

## Validacao da listagem de vendas

O site redireciona o dominio com `www` para `toc2imoveis.com.br`.
O crawler de vendas aceita os dois dominios oficiais em HTTPS, mantendo
a rota exata `/imoveis/venda/-/-/-/-` e a paginacao. Aluguel, detalhes
e dominios externos continuam rejeitados, preservando a base anterior.
Falhas de rota incluem a URL recebida no diagnostico.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/toc2/locacao.test.js backend/_01extractor/crawlers/jfora/toc2/vendas.test.js
```