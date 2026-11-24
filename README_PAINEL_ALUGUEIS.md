# Painel de alugueis

Na raiz do repositorio ou dentro de backend:

```powershell
npm run alugueis
```

Endereco padrao: http://127.0.0.1:3106 . Se a porta estiver ocupada,
o servidor usa a proxima disponivel e informa o endereco no terminal.
O navegador abre automaticamente. Para nao abrir, defina
ALUGUEIS_OPEN_BROWSER=false. A porta pode ser definida por ALUGUEIS_PORT.

O painel reaproveita o tema do painel de vendas, mas tem servidor,
fila, logs e agenda separados. Lista somente as 56 rotas individuais
de aluguel. Publicacao em Firestore e Typesense e manual e exclusiva de
alugueis, com destinos separados. O painel nunca
executa comandos de venda. A publicacao manual separada, com simulacao
e confirmacao, e descrita em [publicacao separada](README_PUBLICACAO_SEPARADA.md).
O painel de vendas continua em sua porta
original e exclui aluguel tanto da descoberta quanto da fila antiga.

## Funcionalidades

As abas seguem o painel de vendas: Raspagem, Json, Firestore, Typesense,
Filtros e Duplicados. Retirados fica ao final, exclusivo do aluguel.
Json abre em Cidades e oferece Bairros, Titulo, Localizacao, Tipo Imovel,
Preco, linkFoto, linkReal, Resumo e consulta dos Ativos.

As validacoes conferem os campos locais e slugs pelos catalogos; as de
URL verificam formato HTTP/HTTPS, nao disponibilidade remota dos sites.
Filtros agrega somente os ativos de aluguel. Duplicados identifica
codigo/link repetidos e candidatos com endereco numerado e mesmas
caracteristicas; nao mescla nem exclui registros automaticamente.
Essas consultas nao publicam na nuvem. A checagem de bairros usa o mesmo
modelo de cards do painel de vendas: arquivo, motivo, cidade, bairro
atual, titulo, link do imovel e cidade selecionavel. Pode atribuir bairro
existente ou criar novo e aplicar. Somente a confirmacao de Aplicar ou
Criar e aplicar altera o JSON ativo de aluguel.

As correcoes ficam em _03database/outros/alugueis-bairro-correcoes.json
e sao reaplicadas na proxima sincronizacao, por link ou codigo do mesmo
projeto. Bairros novos ficam em alugueis-bairros-catalogo.json nessa mesma
pasta, sem modificar o catalogo de vendas. Firestore, Typesense e Sheets
nao sao atualizados automaticamente por essa correcao. A gravacao fica
bloqueada enquanto o painel executa um crawler ou publicacao.

Tipo Imovel tambem usa o mesmo modelo de cards de vendas: arquivo,
valor atual, motivo, titulo, localizacao, cidade, bairro, link e seletor
de slugs do catalogo com Aplicar. A escolha fica em
_03database/outros/alugueis-tipo-imovel-correcoes.json e e reaplicada nas
proximas raspagens. Somente o JSON ativo de aluguel e corrigido; vendas,
retirados e envios de nuvem nao sao alterados automaticamente.

linkFoto usa o modelo de cards de vendas: arquivo, foto atual, titulo,
tipo, cidade, bairro, link clicavel do imovel, campo para URL da foto e
Salvar link da foto. As URLs manuais aceitam apenas HTTP/HTTPS e ficam em
_03database/outros/alugueis-linkfoto-correcoes.json, reaplicadas na proxima
sincronizacao. O imovel pode ser aberto em outra aba para revisao manual;
a checagem nao faz requisicoes remotas para verificar fotos ou anuncios.

Confirmar todos sem foto exige confirmacao explicita e grava somente
alugueis-linkfoto-confirmacoes.json nessa mesma pasta. Isso nao apaga
imoveis ou fotos e nao oculta URLs preenchidas invalidas. Alertas por
imobiliaria indicam quando mais de 50% dos ativos estao sem foto.
Cada card tambem tem Confirmar sem foto: confirma somente aquele registro
revisado e o remove da lista, sem alterar o JSON ou apagar o imovel.
A confirmacao individual pode registrar uma URL invalida apos revisao
manual; ela vale apenas para o valor de linkFoto visto no card. Se esse
valor mudar para outra pendencia, o registro reaparece para nova revisao.
As confirmacoes individuais e em lote usam o mesmo arquivo persistente.
Vendas, retirados, Firestore, Typesense e Sheets nao sao alterados
automaticamente ao salvar uma foto manual ou confirmar ausencia.

Firestore e Typesense possuem suas proprias abas com a etapa fixada,
e a aba Json oferece Transmitir JSONs para o Firestore em todas as suas
subtabs. Esse botao sempre usa a etapa Firestore dos projetos marcados
em Raspagem, independentemente da ultima aba de publicacao visitada.
O conteudo atual completo de __alugueisPublicos e copiado primeiro para
__alugueisPublicos__backup; somente apos concluir o backup o publicador
atualiza os ativos selecionados. Uma falha no backup interrompe o envio.
Esse botao nao publica Typesense nem muda colecoes de vendas.

As abas Firestore e Typesense mantem suas proprias etapas fixadas,
simulacao e confirmacao explicita, usando apenas destinos de aluguel.

- Raspagem: selecionar imobiliarias, executar em ordem alfabetica,
  acompanhar logs ao vivo e parar a rodada e o processo atual.
- Agenda: horario de Sao Paulo, ativacao explicita e selecao salva em
  backend/_03database/outros/alugueis-scheduler-config.json. Comeca
  desativada quando ainda nao existe configuracao.
- Resumo: contagem de ativos e retirados por imobiliaria e falhas de leitura.
- Ativos e retirados: consulta por imobiliaria, busca, paginacao,
  fotografias, links e todos os campos do registro em detalhes.

Os ativos sao lidos apenas de crawler/<projeto>Locacao.json; retirados,
de crawler/<projeto>RetiradosLocacao.json. Dados de vendas nao entram
nessas consultas. A consulta nao reexecuta raspagens nem muda JSONs.
A sincronizacao de ativos/retirados e feita pelos crawlers existentes.

## Testes

```powershell
node --test backend/_01extractor/crawlers/jfora/_1Jf/alugueis.test.js
```