# Sincronizacao de alugueis

Esta regra vale para todas as entradas de locacao e substitui a antiga
manutencao de imoveis com dataExclusao nos JSONs e abas principais.
Comandos, parsers, JSONs e planilha de vendas permanecem inalterados.

## Sequencia

1. Ler o JSON atual e consultar o total disponivel na busca de aluguel.
2. Coletar a lista completa, com precos e detalhes atuais de todos os imoveis.
3. Conferir total, links, precos e duplicacoes. Uma coleta parcial ou uma
   falha nao pode ser usada para decidir que um imovel foi retirado.
4. Comparar por codigoBase da imobiliaria, ou por URL sem query/hash
   quando nao houver codigo. Mudanca de URL do mesmo codigo nao e retirada.
5. Gravar os ausentes no historico local e na aba retirados ANTES de
   substituir a lista principal.
6. Publicar somente os ativos na aba principal e no JSON principal.

Os ativos recebem os dados da coleta atual, inclusive precos alterados,
zero ou Sob consulta (null), sem reaproveitar campos obsoletos. A data
historica de inclusao e preservada para os imoveis que continuam ativos;
dataExclusao fica vazia. Imoveis antigos ja marcados como excluidos sao
arquivados se nao estiverem na coleta atual.

O enriquecimento atualiza detalhes de todos os imoveis, nao somente os
novos. O aluguel da listagem e preservado para que a pagina interna nao
o substitua por valor de venda ou total com taxas.

## Retirados

A planilha de alugueis e:
https://docs.google.com/spreadsheets/d/11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk/edit

Na aba retirados, as colunas A:T mantem os mesmos 20 campos da listagem.
A coluna U, imobiliaria, identifica o projeto (ex.: jfCouto). O registro
mantem os dados anteriores, inclusive o ultimo preco conhecido. Quando
nao havia dataExclusao, ela recebe a data/hora da retirada.

O arquivo crawler/<projeto>RetiradosLocacao.json preserva os objetos
completos e uma identificacao de retirada para recuperacao. Ele e gravado
antes da publicacao. Se o Sheets falhar, o JSON principal anterior nao e
substituido; a proxima execucao reenvia o historico pendente sem duplicar
as linhas ja publicadas. A aba retirados nunca e limpa pelo crawler.

Retirada indica ausencia no site, nao prova que o imovel foi alugado.
O historico fica disponivel para a analise futura solicitada.

## Vazios e falhas

Zero confirmado pelo site arquiva os antigos e deixa os ativos vazios.
Kantto/Souza Rocha mantem o zero configurado por falta de rota valida.
A Multimoveis mantem a excecao de zero por indisponibilidade autorizada
anteriormente; esse caso nao comprova aluguel ou retirada real do site.
Erros de rede, coleta parcial e falhas do Sheets continuam reportados.

Os dados existentes so sao reconciliados quando o respectivo comando de
locacao e executado. Esta implementacao nao dispara automaticamente todo
o lote nem afirma que todas as imobiliarias foram raspadas novamente.

## Testes

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/_utils/locacaoSincronizacao.test.js
```