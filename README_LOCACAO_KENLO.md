# Locacao: grupo Estrela Sul / Kenlo

Regra atual: principais contem somente ativos; ausentes vao para
`retirados` com imobiliaria e historico recuperavel. Ver
[sincronizacao de alugueis](README_SINCRONIZACAO_LOCACAO.md).
Vazio confirmado arquiva os anteriores antes de limpar os ativos.

Os 12 projetos usam a mesma familia Kenlo, mas com variantes de DOM.
O novo fluxo coleta o HTML real completo e reutiliza os extratores de
campos e a consolidacao proprios, sem alterar os crawlers de vendas.

| Aba herdada | Script individual | Situacao verificada em 2026-10-04 |
| --- | --- | --- |
| jfCrispi | crispi:locacao | layout antigo, 1 aluguel |
| jfLeal | leal:locacao | layout antigo, 37 alugueis |
| jfLocal | local:locacao | moderno, 52 alugueis |
| jfMasson | masson:locacao | moderno, 82 alugueis |
| jfMultimoveis | multimoveis:locacao | site indisponivel: retorna0 e zera locacao, conforme solicitado |
| jfNunes | nunes:locacao | nenhum aluguel, aviso Kenlo com HTTP404 |
| jfOliver | oliver:locacao | nenhum aluguel, aviso Kenlo com HTTP404 |
| jfSpeciale | speciale:locacao | nenhum aluguel, aviso Kenlo com HTTP404 |
| jfToronto | toronto:locacao | split, 138 alugueis |
| jfTriplice | triplice:locacao | moderno, 9 alugueis |
| jfVivaBem | vivabem:locacao | moderno, 55 alugueis |
| jfMoura | moura:locacao | layout antigo, 13 alugueis |

## Comandos

Na raiz do repositorio, todo o lote em processos separados sequenciais:

```powershell
npm --prefix backend run locacao:kenlo -- --todos
```

Um projeto:

```powershell
npm --prefix backend run local:locacao
```

Validar apenas modulos, sem coletar ou escrever:

```powershell
npm --prefix backend run locacao:kenlo -- --check
```

Projetos escolhidos por pasta ou nome da aba:

```powershell
npm --prefix backend run locacao:kenlo -- jfCrispi jfMoura
```

O lote continua os proximos projetos em falhas e retorna erro ao final,
listando os projetos que falharam. Multimoveis so podera ter a coleta
positiva validada quando o site voltar a funcionar.

## Dados

- Busca de cada dominio: `/imoveis/para-alugar`, sem limites de preco de venda.
- JSON separado: `backend/crawler/<nome-da-aba>Locacao.json`.
- Planilha: https://docs.google.com/spreadsheets/d/11MOUe5l8ICx8BJqoBbqCqmeSYNJwYhh7KDilzwoUnxk/edit
- Aba: nome EXATO herdado, nunca o gid.
- Historico: somente o JSON de locacao, sem misturar vendas.

Preco moderno/split e selecionado pelo rotulo de aluguel. No layout
antigo, o valor mensal `/mes` identifica aluguel mesmo em cards mistos.
Centavos sao preservados; Sob consulta resulta em null. Nao ha fallback
de venda. Cards sem codigo/titulo/cidade ou com preco nao reconhecido
abortam a coleta, evitando publicar dados silenciosamente incompletos.

Ver mais aceita `a.btn-next` e `button.btn-next`, ignorando controles
de carrossel. O total do site e conferido e falta de progresso/paginacao
aborta sem salvar resultados parciais. Codigo, bairro e metricas modernas
possuem fallbacks somente no novo modo, quando leitores antigos ficam
vazios, como na Triplice.
Cards modernos tambem oferecem titulo e localizacao no formato esperado
pelos leitores legados, sem substituir os blocos originais de preco.
Na Moura, validado em 2026-10-26 com 10 alugueis no layout card-with-buttons.
Cada coleta bem-sucedida gera atualizadoEm novo; falhas de mapeamento
preservam o JSON e as datas anteriores em vez de registrar uma atualizacao falsa.

Na Leal, na Local e na Oliveira (lote Diversos), Ver mais navega para
`?pagina=2` e paginas seguintes. O coletor
acumula cards unicos entre essas paginas, sem exigir crescimento do DOM.
Mudanca de total, URL fora da busca de aluguel ou pagina sem progresso
interrompem a coleta. Os demais projetos mantem carregamento cumulativo.
Na Local, validado em 2026-10-28 com 51 alugueis em cinco paginas
(12, 12, 12, 12 e 3 cards), sem aumentar o timeout nem aceitar coleta parcial.
A Local usa `ordenar=recentes` em todas as paginas para evitar repeticoes
e omissoes da ordenacao padrao do site.

O aviso Kenlo `Nao encontramos imoveis para a sua busca`, acompanhado
do titulo de aluguel e nenhum card, identifica vazio valido mesmo com
HTTP404. Na primeira checagem prepara JSON[] e cabecalho20colunas.
Se houver historico anterior, ele e preservado. HTTP503, pagina generica
404 ou falha de navegacao nunca e interpretada como ausencia de alugueis.
Excecao solicitada para jfMultimoveis: pagina indisponivel sem cards
(inclusive HTTP503) ou vazio confirmado retorna0, grava[] e limpa sua
aba de locacao mesmo se houver registros anteriores. Falhas com cards
existentes ou paginacao parcial continuam abortando sem apagar dados.

Vendas conserva comandos e GOOGLE_SHEETS_SPREADSHEET_ID originais.
Locacao nao publica no Firestore nem entra automaticamente em agendamento.
A Estrela Sul continua no comando individual `estrelasul:locacao`, ja
adaptado antes deste lote.

## Contagem antes da raspagem

Os 12 projetos do lote e `estrelasul:locacao` registram o total anunciado
pelo cabecalho na aba `retorno` da planilha de alugueis antes da extracao.
Coluna A: `Projeto`; coluna B: `Quantidade`. O numero em `Exibindo 39
Imoveis para alugar` e `39`, independentemente dos cards da primeira pagina.
Os titulos antigos, como `37Imoveis para alugar` ou `1Loja`, tambem sao
reconhecidos. A linha do projeto e atualizada sem apagar os demais totais.

O aviso explicito de busca vazia, com titulo de aluguel e sem cards,
registra zero mesmo em HTTP404. Paginas genericas, falhas de navegacao,
total desconhecido ou erro no Sheets interrompem o projeto antes da
extracao e preservam os dados anteriores. Somente a Multimoveis mantem
a excecao autorizada: indisponibilidade sem cards registra zero. Falhas
na gravacao da contagem nao acionam a limpeza da lista de locacao.

Vendas nao executam a precontagem. A Estrela Sul usa a mesma etapa em
seu comando individual, sem ser adicionada ao lote de 13 projetos.

## Testes

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/_utils/locacaoKenlo.test.js
```