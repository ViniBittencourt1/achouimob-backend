# Publicacao separada: vendas e alugueis

Raspagem, revisao e publicacao sao etapas independentes. Nenhum crawler
ou agendamento de aluguel publica automaticamente na nuvem.

## Destinos

| Perfil | JSON local | Firestore | Backup Firestore | Typesense | Filtros Typesense |
| --- | --- | --- | --- | --- | --- |
| Vendas | jfProjeto.json | __imoveisPublicos | __imoveisPublicos__backup | imoveis | filtros_* |
| Alugueis | jfProjetoLocacao.json | __alugueisPublicos | __alugueisPublicos__backup | imoveis_alugueis | filtros_alugueis_* |

Os nomes de vendas foram preservados para nao mudar a busca existente.
RetiradosLocacao.json, retirados do Sheets e documentos inativos nao
entram na busca publica de aluguel. Firestore de aluguel preserva os
campos do JSON, inclusive preco null; Typesense sinaliza precoSobConsulta.
Cada documento publico identifica imobiliariaId e negociacao.

Os alugueis do Universal tambem incluem `precoCondominio`, `precoIptu`,
`precoTotal` e `precoOutros`. Custos ausentes sao gravados como zero. O
total mensal anunciado e preservado; quando supera aluguel, condominio e
IPTU, a diferenca fica em `precoOutros`. Sem total anunciado, a soma dos
custos conhecidos e usada quando o aluguel e conhecido. Os quatro campos
sao opcionais no schema Typesense para compatibilidade com anuncios
anteriores e projetos que ainda nao extraem esses custos.

## Ordem das rodadas

A sequencia compartilhada dos 56 projetos esta em
[crawler-order.cjs](crawler-order.cjs), de jf1000Imoveis ate jfSouzaRocha.
Vendas e locacao usam a mesma ordem nos paineis, filas agendadas,
executor diario/Windows/Render, grupos --todos e contagem em lote.
Selecoes parciais conservam essa ordem relativa, independentemente da
ordem dos cliques, da configuracao salva ou de SCRAPE_SCRIPTS.
Retomadas ignoram os ja concluidos sem mudar a ordem dos pendentes.
Comandos legados fora da lista sao preservados depois dos 56 projetos.
Reinicie paineis ja abertos para carregar a nova lista.

## Ativos e retirados de vendas

Antes da coleta, os 56 crawlers consultam o total anunciado no site e
registram Projeto e Quantidade em A:B da aba retorno da planilha de
VENDAS (GOOGLE_SHEETS_SPREADSHEET_ID). Atualizam a mesma linha sem apagar
outros projetos. URLs de contagem nao usam as faixas de preco da coleta.
Essa consulta e a primeira etapa apos abrir o navegador, antes da leitura
da base e da preparacao das paginas. Nos crawlers com fallback, cada
tentativa segue abrir navegador -> contar e registrar -> ler base ->
raspar. Se a contagem falhar, a tentativa nao inicia a coleta.
O total esperado e comparado com os imoveis coletados antes da sincronizacao:
se a quantidade difere, a base principal e preservada em vez de retirar
imoveis com base em uma coleta parcial. Zero precisa ser confirmado no site.
Sites inacessiveis, bloqueios, contador ausente ou falhas de Sheets nao
registram zero nem substituem a quantidade anterior.

Somente contar, sem coletar imoveis nem alterar JSONs ou retirados:

```powershell
npm run vendas:contagem -- --todos
npm run vendas:contagem -- jfCrispi jfKantto
npm run vendas:contagem -- jfCrispi --dry-run
npm run vendas:contagem -- jfDecisao --headed
```

O comando respeita o modo de navegador configurado; --headed usa a
janela visivel, como nos crawlers que exigem esse modo. --dry-run nao
grava Sheets. O comando em lote consulta os sites primeiro e grava os
totais validos juntos para reduzir uso da quota de leitura do Sheets.
Falhas individuais preservam os valores anteriores e retornam codigo 1.
Alugueis conserva seus proprios destinos e contadores.

Na Crispi, GM, Leal, Nunes, Oliver, Speciale, Toronto, Masson e Estrela Sul de vendas, a paginacao segue os links Ver mais e mantem
ordenar=recentes em cada pagina. O total vem do h1, nunca do preco.
A coleta deduplica por URL, confirma o total esperado e nao salva
resultado parcial em falhas HTTP ou quando faltam paginas.
Os nove projetos usam vendasKenloPaginacao.js, conservando seus campos
para seus extratores de campos. Leal e Oliver coletam pelo card inteiro,
nao por todos os links, preservando fotos e codigos fora do link do titulo.
Leal e Oliver tambem reconhecem o layout card-with-buttons e adaptam titulo,
localizacao, preco, codigo, foto e metricas aos seus extratores legados.
Os comandos npm run leal e npm run oliver executam o navegador em modo
headless, sem janela na tela, independentemente de CRAWLER_HEADLESS.
Nunes inclui os cards de /empreendimento/ que fazem parte do total anunciado,
com codigo proprio, sem confundi-los com links adicionais do mesmo anuncio.
Toronto e Masson consultam uma rota unica de venda sem faixas de preco,
validando o total antes de salvar. Toronto preserva os cards split e
Masson preserva os campos card-with-buttons. Se o estoque mudar durante
uma rodada, a coleta falha sem substituir a base; nova rodada usa a
precontagem atual do site.
Estrela Sul tem um ramo exclusivo de vendas que preserva o HTML completo
dos containers de preco. Sua rotina de locacao continua independente.

Fogel de vendas usa os botoes JavaScript de searchResultsPagination,
nao a antiga query pagina=2. Confirma o total anunciado e acumula links
unicos antes do enriquecimento dos detalhes, sem assumir 24 cards por
pagina como regra de fim. Sua rotina de aluguel permanece separada.

Kantto combina paginas publicas pagina=1..N com rolagem interna: cada
pagina de servidor contem ate 32 anuncios, apresentados em lotes de oito.
O coletor completa cada bloco antes de avancar e valida URLs unicas e
total esperado. Somente mudar pagina ou somente rolar nao basta para
coletar o catalogo completo. O enriquecimento seletivo de detalhes e
mantido depois da confirmacao da listagem.

Invest de vendas segue as URLs oficiais com pag, posicao e qtdeitens,
incluindo a ultima pagina menor que 135 anuncios. Confirma o total da
precontagem e a unicidade de links e codigos antes de sincronizar.
O extrator nao sobrescreve o JSON principal nem grava invest.skip em
falhas de vendas: a gravacao fica somente na sincronizacao, depois do
historico e da exportacao. A rotina de aluguel permanece independente.

Os 56 crawlers de vendas usam vendasSincronizacao.js. A cada coleta,
ausentes sao arquivados em crawler/jfProjetoRetiradosVendas.json e na aba
retirados da planilha de VENDAS antes de substituir a principal.
Os JSONs jfProjeto.json e abas jfProjeto mantem somente anuncios atuais,
com precos novos e dataInclusao preservada. Correcoes manuais continuam
sendo reaplicadas. Nenhum envio automatico para Firestore ou Typesense.

Retirados no Sheets conserva os 20 campos padrao, imobiliaria, retiradaId
e dadosExtras (JSON dos demais campos). O historico local conserva o
objeto completo. Envio e conferido por leitura de volta; retomadas nao
repetem o mesmo snapshot. Falha de arquivo ou exportacao preserva o JSON
principal; a exportacao da aba ativa nao e uma transacao Google Sheets.
Coleta vazia com base anterior ativa e rejeitada, salvo confirmacao
explicita. Total esperado, quando fornecido, tambem deve coincidir.
Uma coleta parcial que o parser preservou como ativa e bloqueada.

Migracao de excluidos anteriores, com diagnostico como comportamento
padrao e --aplicar somente para confirmar a movimentacao:

```powershell
npm run vendas:migrar-retirados -- --dry-run
npm run vendas:migrar-retirados -- --aplicar
```

A migracao examina apenas vendas, inclusive abas e JSONs legados sem
crawler atual. Backup integral dos JSONs e das abas alteradas fica em
_03database/outros/migracao-retirados-vendas/<data>/, antes da limpeza.
Versoes diferentes de JSON e Sheets sao preservadas no arquivo. Mudanca
concorrente da principal interrompe a limpeza. Nao executar junto com
raspagens ou correcoes manuais. Alugueis nao sao modificados.
Na migracao inicial, cada fonte conserva seus proprios ativos e valores:
o JSON nao substitui os ativos da planilha, nem o contrario.

## Cobertura e Apartamento

Cobertura e um tipo residencial independente, com slug cobertura.
Apartamento continua com slug apartamento. Os catalogos do backend e
Colab, os extratores, os seletores de revisao e a busca usam essa
separacao para vendas e alugueis. Cobertura Duplex, Cobertura Triplex e
Penthouse pertencem a cobertura; Duplex e Triplex sem identificacao de
cobertura continuam como apartamento.

JSONs existentes nao sao reclassificados por palavras no titulo ou URL.
Para atualizar os dados antigos, execute novamente as raspagens e revise
correcoes manuais anteriores que tenham atribuido apartamento a uma
cobertura. Depois publique os JSONs no Firestore e sincronize o Typesense
do perfil correspondente. Apenas alterar o catalogo nao atualiza os
documentos nem os filtros ja publicados na nuvem.

## Revisao de fotos no painel

Na checagem de linkFoto, cada card do painel de vendas possui
**Confirmar sem foto**, alem de **Salvar link da foto** e da confirmacao
em lote. A confirmacao individual e persistida somente para o registro
escolhido e remove sua pendencia sem alterar o JSON do imovel ou publicar
na nuvem. Se uma foto tiver sido adicionada depois da checagem, atualize
a lista antes de confirmar. O painel de alugueis mantem sua confirmacao
individual independente.

## Sala

Sala e um tipo comercial valido com slug `sala`. Os catalogos do backend
e Colab usam Sala como nome principal; Centro Clinico, Cj Comercial,
Conjunto, Salas e Sala comercial continuam como aliases do mesmo slug.
Os seletores de revisao de vendas e alugueis exibem Sala, e a exportacao
Typesense preserva `tipoImovel: sala` e `tipoImovelNome: Sala`, inclusive
nos filtros. Salao (`salao`) e Loja (`loja`) permanecem tipos separados.

Reinicie o painel para recarregar o catalogo e execute novamente a
sincronizacao Typesense do perfil desejado para atualizar dados e filtros
ja publicados. Alterar o catalogo local nao publica automaticamente.

## Comandos

Na raiz ou em backend, conferir o plano sem enviar nada:

```powershell
npm run publicar:vendas -- jfCrispi --dry-run
npm run publicar:alugueis -- jfCrispi --dry-run
```

Etapas individuais:

```powershell
npm run firestore:publish:vendas -- jfCrispi
npm run firestore:publish:alugueis -- jfCrispi
npm run typesense:sync:vendas
npm run typesense:sync:alugueis
```

Fluxo completo JSON -> Firestore -> Typesense:

```powershell
npm run publicar:vendas -- --todos
npm run publicar:alugueis -- --todos
```

Um nome jf... atualiza somente os documentos dessa imobiliaria no
Firestore, mantendo os de outras imobiliarias. --todos substitui
integralmente apenas a colecao do perfil escolhido; todos os JSONs
esperados devem existir e ser validos antes do envio. Sem nomes,
publicar:vendas/alugueis assume --todos. Typesense sincroniza a colecao
Firestore completa do perfil, mesmo apos uma publicacao selecionada.

Na aba Typesense do painel de vendas, a origem **JSON local direto**
oferece uma selecao independente de projetos, salva neste navegador.
Todos comecam marcados; desmarque, por exemplo, jfAcervo e jfSouzaGomes.
O resumo da origem considera somente os marcados; o total do destino
continua mostrando a base completa. Nenhum envio ocorre ao marcar,
desmarcar ou atualizar o resumo.

Esse envio seletivo faz upsert somente dos projetos marcados, sem
recriar a colecao de imoveis. Projetos desmarcados sao preservados.
Nos marcados, anuncios ausentes dos JSONs sao removidos somente depois
de concluir os upserts, mantendo a sincronizacao do estoque selecionado.
Os filtros sao reconstruidos a partir da base final completa. Um ID
que ja pertence a um projeto desmarcado bloqueia o envio antes de
alterar indices, evitando sobrescrita acidental. Selecao vazia ou
projetos desconhecidos tambem bloqueiam o envio.
Reinicie o servidor do painel e recarregue a pagina apos atualizar.
As origens Firestore e os comandos sem selecao mantem a substituicao
completa anterior.

Se uma etapa falhar, a seguinte nao sera executada e o comando retorna
erro. Publicacao vazia exige --allow-empty para confirmar limpeza.
Os indices Typesense sao reconstruidos no perfil escolhido; nao ha
troca atomica de indice e pode haver indisponibilidade durante o envio.
O backup Firestore do perfil guarda os dados anteriores para recuperacao.
Os ativos sao gravados antes de excluir os ausentes. Firestore utiliza
lotes, nao uma transacao global: se houver falha, os dados podem ficar
parcialmente atualizados, mas o erro e reportado e Typesense nao prossegue.

Os comandos legados publish:json e typesense:sync continuam sendo de
vendas quando nao ha --tipo explicito. PUBLICATION_MODE nao muda esse
default. TYPESENSE_SOURCE_COLLECTION aceita somente a colecao principal
ou o backup DO MESMO perfil; fonte de outro perfil e bloqueada.
O fluxo completo sempre envia ao Typesense a principal recem-atualizada,
mesmo se havia backup selecionado no ambiente. Backup e usado somente
quando a etapa Typesense e executada separadamente.

## Ambiente

Firebase usa backend/credentials/firebase-key.json, como anteriormente.
Para Typesense, configure no ambiente ou backend/.env, sem colocar chaves
em comandos, logs ou arquivos versionados:

- TYPESENSE_API_KEY: chave com permissao para os indices do perfil.
- TYPESENSE_HOST: host do servidor, se diferente da configuracao existente.
- TYPESENSE_PORT: porta, normalmente 443.
- TYPESENSE_PROTOCOL: normalmente https.

Alugueis exige TYPESENSE_API_KEY. Alugueis nao utiliza a chave legada
automaticamente: configure uma chave autorizada para imoveis_alugueis
e filtros_alugueis_* no ambiente ou em backend/.env. Nao envie chaves
pela conversa. O painel mostra apenas se a configuracao esta presente.
Sem chave, envio real de Typesense/completo e bloqueado antes da fila;
FireStore isolado e --dry-run continuam disponiveis. Alteracoes do
arquivo .env sao consideradas na proxima tentativa, sem reiniciar painel.

O codigo legado de vendas ainda possui
o fallback de credencial anterior; prefira o ambiente para ambos os perfis.
O frontend de vendas continua consultando imoveis. Uma busca de aluguel
deve apontar para imoveis_alugueis e filtros_alugueis_*, nao para vendas.

## Painel

Em npm run alugueis, as abas Firestore e Typesense mostram os destinos
e permitem Simular envio da respectiva etapa. Confirmar envio exige
confirmacao explicita. O perfil
e fixo em alugueis no servidor; nao e possivel selecionar vendas nessa
rota. Para Firestore ou fluxo completo, usam-se os projetos marcados
na aba Raspagem; Typesense envia todos os ativos publicados do perfil.

Esta implementacao nao executa publicacao real nem cria colecoes na
nuvem por apenas iniciar o painel. Elas sao criadas no primeiro envio
confirmado. Ajustes de regras Firebase, credenciais, permissoes e da
interface de busca publicada continuam sendo responsabilidade do deploy.

## Testes

```powershell
node --test backend/publication.test.cjs
```