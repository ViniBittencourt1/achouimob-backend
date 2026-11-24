# Bom Clima: locacao

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
npm --prefix backend run bomclima:locacao
```

- Busca: https://www.bomclimaimoveisjf.com.br/imoveis/para-alugar/brasil?order=mais_relevantes
- JSON separado: `backend/crawler/jfBomClimaLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfBomClima`, selecionada por nome.

Mesmo padrao atual do Acervo: links de imoveis com `/locacao/`, preco
em `ImovelCardInfo_priceRow__` pelo rotulo Aluguel/Locacao e taxas em
`ImovelCardInfo_feesValue__`. Condominio e IPTU entram no titulo,
normalizando espacos HTML e separados por ` | ` e ` / `.
O preco e apenas o aluguel, sem taxas e sem fallback de venda.

A rolagem carrega os cards da listagem. Antes de salvar, a quantidade
e conferida contra o total informado pelo site. Coleta parcial, vazia,
duplicada ou invalida preserva JSON e Sheets anteriores.
Codigo, garagem e foto sao obtidos na listagem quando disponiveis e
complementados pela rota interna existente; o titulo/preco de aluguel
nao e substituido nessa etapa.

O bairro valido extraido do HTML tem prioridade. Quando nao existe
resultado valido, usa-se o segmento do linkReal logo depois da UF e
antes do codigo, validado no catalogo da cidade. Exemplo:
`/juiz-de-fora/mg/parque-guarani/CA0032_BCIMOB` retorna `parque-guarani`.
A rota interna resolve a cidade antes do bairro e recebe o link, evitando
escolher `guarani` de outra cidade. Bairro desconhecido nao e inventado.
As fotos da listagem sao preservadas no modo locacao para evitar que
a rota interna as troque pela marca-dagua da imobiliaria.

Historico vem apenas do JSON de locacao e usa a consolidacao do projeto.
Vendas mantem seu comando e GOOGLE_SHEETS_SPREADSHEET_ID. Locacao nao
publica no Firestore, nao altera bairros manualmente e nao entra
automaticamente em agendamento ou nos lotes de outros layouts.

## Contagem antes da raspagem

Bom Clima e Acervo leem `h1[class*="Title_resultTitle__"]` antes da
extracao e registram projeto/quantidade nas colunas A/B de `retornoLocacao`,
na planilha de alugueis. Em `18 Imoveis para alugar`, o total e `18`,
independentemente de quantos cards ja apareceram antes da rolagem.
O seletor nao depende do sufixo gerado da classe CSS. Cada execucao
atualiza a linha do projeto sem apagar as contagens dos demais.

Zero exige um total zero explicito no titulo de aluguel. Falhas de HTTP,
seletor, titulo ou gravacao no Sheets interrompem o processo antes da
extracao, preservando os dados anteriores. Vendas nao usam essa etapa.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/bomClima/locacao.test.js backend/_01extractor/crawlers/jfora/acervo/locacao.test.js
```