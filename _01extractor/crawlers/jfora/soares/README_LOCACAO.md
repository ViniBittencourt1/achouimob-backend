# Soares: locacao

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
npm --prefix backend run soares:locacao
```

- Busca correta: https://www.secimoveis.com.br/imoveis/aluguel/#/?n=1&ordem=valor-ASC&mb=s&slug=0&page=1&tipoNegocio=AA
- JSON separado: `backend/crawler/jfSoaresLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfSoares`, selecionada por nome.

## Rota e filtro

O link informado tinha texto AA, mas destino clicavel VA,VL. Alem disso,
o site sobrescreve AA por VA,VL quando o caminho e `/imoveis/venda/`.
O menu confirmou `/imoveis/aluguel/`, onde AA e mantido. O novo crawler
valida caminho, filtro no hash e titulo da listagem antes de coletar.
Nunca interpretar a busca de venda redirecionada como aluguel.

As paginas sao geradas com URL/URLSearchParams no fragmento apos `#`,
mantendo AA, ordenacao e os demais parametros. O total e conferido e
cards duplicados ou coleta parcial impedem publicacao. Os cards
`.box-imovel.ng-scope` e os extratores de campos existentes sao usados.

## Precos e preservacao

O modo locacao seleciona o `li` cujo `.descricao-transacao` e Aluguel,
ignorando Venda e Condominio, e preserva centavos. Codigo com prefixo
REFV nao exclui aluguel: existem anuncios de ambos os negocios.
O preco de venda e o fluxo original permanecem iguais quando nao ha
opcao de locacao. O campo auxiliar garagem e omitido somente no novo
modo, mantendo os 20 campos usados na planilha.

Historico vem apenas do JSON de locacao. Coleta vazia, redirecionamento
para venda ou erro de pagina preserva os destinos anteriores. JSON e
salvo antes de exportar ao Sheets. Sem Firestore, agendamento automatico
ou alteracao de GOOGLE_SHEETS_SPREADSHEET_ID de vendas.

## Contagem antes da raspagem

Antes de extrair os imoveis, o processo aguarda o Angular carregar o
aviso `Encontramos 4 resultados para sua busca` e registra `jfSoares`
e `4` nas colunas A/B da aba `retornoLocacao`, na planilha de alugueis. O span
`p span.bold.ng-binding` e identificado pelo texto do paragrafo, evitando
capturar outros numeros. A linha do projeto e atualizada sem apagar
as contagens dos demais projetos.

O filtro AA, a rota de aluguel e o titulo da pagina sao conferidos.
Divergencias de total, redirecionamento para venda, HTTP, timeout ou erro
no Sheets interrompem a etapa antes da extracao, preservando os dados
anteriores. Zero precisa ser explicito e coerente com o titulo de aluguel.
Vendas nao executam essa precontagem.

Testes (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/soares/locacao.test.js
```