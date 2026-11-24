# Uba: raspagem

As nove imobiliarias validas ficam nesta pasta, seguindo a organizacao de `../niteroi`.
A identidade da cidade e Ubá, MG, com slug `uba`.
Cada projeto conserva o identificador `uba...` solicitado.

Em cada pasta:

- `config.js`: identificador, nome, modelo do site, rotas de vendas e aluguel
  e habilitacao. J Xavier, GB, Montezzi, Carlos, Nogueira, Artolex, Cidade,
  RE/MAX e Aloisio estao implementadas. As onze pastas sem paginas identificadas
  foram removidas do cadastro e desta pasta, sem apagar dados de raspagens.
- `index.js`: entrada de vendas.
- `locacao.js`: entrada de aluguel.

O cadastro compartilhado esta em `projects.js`. `runProject.js` bloqueia qualquer
coleta enquanto o crawler nao estiver configurado e implementado.
Uma pendencia termina com codigo 1 e mensagem explicita, nunca como coleta
vazia ou sucesso. Nao abre navegador, nao escreve JSON, nao envia Sheets,
Firestore ou Typesense e nao registra contagens.

No backend:

```powershell
node _01extractor\crawlers\jfora\uba\runAll.js --check
node _01extractor\crawlers\jfora\uba\runAll.js
node _01extractor\crawlers\jfora\uba\ubaJXavier\index.js
node _01extractor\crawlers\jfora\uba\ubaJXavier\locacao.js
```

`runAll.js --check` lista as nove configuracoes sem raspar. `runAll.js` executa
as dezoito etapas de venda/aluguel, **com gravacao**, e termina com codigo 1
se alguma etapa falhar.
Para executar apenas uma imobiliaria, prefira os comandos individuais abaixo.

## J Xavier

Modelo SymCode, com oito anuncios por pagina:

- Vendas: <https://www.jxavier.com.br/sale?finalidade=V>
- Aluguel: <https://www.jxavier.com.br/rent?finalidade=L>

No diretorio `backend`:

```powershell
npm run uba:jxavier:vendas -- --check
npm run uba:jxavier:alugueis -- --check
npm run uba:jxavier:vendas
npm run uba:jxavier:alugueis
```

Nas entradas individuais, `--check` visita todas as paginas da listagem sem
gravar contagem, JSON ou Sheets, nem visitar detalhes. Sem essa opcao, visita
tambem os detalhes dos novos anuncios, registra a precontagem e usa os
sincronizadores compartilhados de ativos/retirados. Falhas de pagina, finalidade,
contador, identidade, categoria ou cidade interrompem a sincronizacao, sem
substituir a base ativa por uma coleta parcial ou vazia.

A planilha de Uba e
<https://docs.google.com/spreadsheets/d/1kBZdeaaD2q-Atu43I8k02zIEu8HrsNkqRFZ8TehaTWE/edit>.
Pode ser substituida por `UBA_SHEETS_SPREADSHEET_ID`. Compartilhe-a como Editor
com a conta de servico usada pelo backend. A aba `ubaJXavier` usa os vinte campos
padronizados e a coluna U `negociacao` (`venda`/`aluguel`); uma rodada preserva
os registros da outra finalidade.

Os JSONs ativos sao `backend/crawler/ubaJXavier.json` e
`backend/crawler/ubaJXavierLocacao.json`. Retirados seguem o padrao
`ubaJXavierRetiradosVendas.json`/`ubaJXavierRetiradosLocacao.json`.
As contagens seguem o fluxo compartilhado da planilha de Uba, nao das outras cidades.

### Particularidades do site

- Bairro e municipio sao separados pelo ultimo delimitador do endereco;
  preserva-se a cidade efetiva do anuncio, inclusive municipios vizinhos.
- Classificacoes confirmadas: `Imovel Comercial/residencial` -> `casa`,
  `Imovel/outros` -> `predio` e `Terraco` -> `cobertura`.
- `Apartamento Cobertura` -> `cobertura`, `Ponto Comercial/residencial` ->
  `ponto`, `Terreno Rural` -> `terreno`, `Barracao` -> `galpao`
  (o anuncio consultado descreve explicitamente um galpao).
- Exclusivamente para o anuncio **8650**, `Campestre/AL` e corrigida para
  `Campestre/MG`, conforme confirmacao: a descricao indica MG, mas o endereco
  cadastrado no site indica AL. A correcao gera aviso e nao se aplica a outros
  anuncios nem quando o endereco ja tiver sido corrigido no site.
- Caracteristicas ausentes permanecem desconhecidas, sem inferir quantidades
  da descricao; fotos `noimage.jpg` nao sao tratadas como fotos reais.

Testes locais, sem publicar:

```powershell
node --test _01extractor\crawlers\jfora\uba\projects.test.js _01extractor\crawlers\jfora\uba\sheets.test.js _01extractor\crawlers\jfora\uba\ubaJXavier\extractor.test.js _01extractor\crawlers\jfora\uba\ubaJXavier\runner.test.js
```

## GB Negocios Imobiliarios

Modelo Imoview / Universal Software, com vinte anuncios por pagina:

- Vendas: <https://www.gbnimob.com.br/venda/?&pagina=1>
- Aluguel: <https://www.gbnimob.com.br/aluguel/?&pagina=1>

No diretorio `backend`:

```powershell
npm run uba:gb:vendas -- --check
npm run uba:gb:alugueis -- --check
npm run uba:gb:vendas
npm run uba:gb:alugueis
```

`--check` coleta **todas** as paginas sem gravar contagem, JSON ou Sheets.
A busca e capturada na pagina oficial: a resposta precisa corresponder ao
endpoint `retornar-imoveis-disponiveis`, metodo POST, finalidade, pagina e
tamanho esperados, sem filtros de cidade, bairro ou tipo. As paginas seguintes
reutilizam esse formulario e os helpers do mesmo sistema usados por Realiza.
O total, a quantidade em cada pagina, os codigos unicos e a primeira pagina
no inicio/fim sao conferidos antes de retornar a coleta.

Os dados estruturados da busca ja contem titulo, preco, endereco, tipo,
quartos, banheiros, salas, vagas, areas e foto. Nao e necessario visitar
detalhes para extrair esses campos. A area prioriza interna, principal e lote,
sem somar area externa; quantidades zero explicitas sao preservadas, campos
ausentes permanecem desconhecidos e precos sob consulta ficam `null`.
Municipios vizinhos conservam seus slugs reais. Numeros de endereco ocultos
com asteriscos nao sao publicados como numeros reais.

Na planilha de Uba, a aba e `ubaGb`, com as mesmas 21 colunas e preservacao
da outra finalidade. Arquivos ativos: `backend/crawler/ubaGb.json` e
`backend/crawler/ubaGbLocacao.json`; retirados:
`ubaGbRetiradosVendas.json`/`ubaGbRetiradosLocacao.json`.
O runner compartilhado de Uba mantem o fluxo de sincronizacao existente de
J Xavier. Falhas e busca vazia nao substituem a base por dados parciais.

Testes locais adicionais:

```powershell
node --test _01extractor\crawlers\jfora\uba\ubaGb\extractor.test.js _01extractor\crawlers\jfora\uba\ubaGb\runner.test.js
```

## Montezzi

Modelo SymCode, rotas `imovel-lista.php` e `imovel-detalhe.php`.
Finalidades `venda` e `locacao`, oito resultados por pagina, filtros vazios/zero
conforme as URLs de `ubaMontezzi/config.js`.

No diretorio `backend`:

```powershell
npm run uba:montezzi:vendas -- --check
npm run uba:montezzi:alugueis -- --check
npm run uba:montezzi:vendas
npm run uba:montezzi:alugueis
```

`--check` valida todas as paginas sem gravar contagens, JSON ou Sheets nem
visitar detalhes. Na execucao normal, os detalhes dos novos codigos sao
visitados para obter apenas caracteristicas estruturadas e endereco
complementar. Nao sao inferidos quartos, vagas ou areas a partir da descricao.
Areas estruturadas priorizam construida sobre terreno; valores ausentes
permanecem desconhecidos. `A combinar` e preco `null`.

A aba e `ubaMontezzi` na mesma planilha de Uba, com vinte campos padronizados
mais `negociacao`. Arquivos ativos: `backend/crawler/ubaMontezzi.json` e
`backend/crawler/ubaMontezziLocacao.json`; historicos:
`ubaMontezziRetiradosVendas.json`/`ubaMontezziRetiradosLocacao.json`.

### Integridade e excecoes confirmadas

- **Todas as ocorrencias do site sao preservadas**, inclusive codigos e links
  repetidos, na ordem da listagem. A configuracao `preservarOcorrencias: true`
  habilita essa excecao nos sincronizadores; nas outras imobiliarias,
  duplicacoes continuam sendo rejeitadas. A contagem esperada refere-se a
  ocorrencias, nao a codigos unicos.
- Na verificacao inicial, vendas continham 333 ocorrencias e 329 codigos:
  `7333` duas vezes, `7358` tres vezes e `7561` duas vezes. Aluguel continha
  156 ocorrencias, sem repeticoes. Repeticoes geram aviso, nao descarte.
- O anuncio `5285`, somente enquanto cadastrado como
  `Kitinet - Indefinido - Indefinida`, conserva cidade e bairro vazios, com aviso.
  O titulo e o texto original da localizacao permanecem preservados.
- Diamante de Uba e Ubari usam `cidade: uba-mg`; seus nomes originais
  permanecem na localizacao. Outros municipios conservam o slug do catalogo.
- Contador, intervalo, quantidade de cards, finalidade, links e identidade
  dos detalhes sao conferidos. Ao final da listagem, total e sequencia de
  codigos da primeira pagina sao conferidos novamente. Coleta parcial ou
  vazia nao substitui a base ativa.

Testes locais adicionais, incluindo persistencia de repeticoes em JSON/Sheets:

```powershell
node --test _01extractor\crawlers\jfora\uba\ubaMontezzi\extractor.test.js _01extractor\crawlers\jfora\uba\ubaMontezzi\runner.test.js
```

## Carlos Corretor de Imoveis

Rotas `imoveis.php` com `tipo_negocio=Venda` ou `tipo_negocio=Aluguel`,
sem os demais filtros. Os resultados sao renderizados em uma unica pagina.

No diretorio `backend`:

```powershell
npm run uba:carlos:vendas -- --check
npm run uba:carlos:alugueis -- --check
npm run uba:carlos:vendas
npm run uba:carlos:alugueis
```

Neste projeto, **inclusive em `--check`**, todos os detalhes sao visitados:
o bairro dos cards esta truncado e a cidade so aparece no detalhe. Cada
detalhe e consultado por GET na mesma sessao do navegador, com prazo de
60 segundos e validacao de HTTP/redirecionamento, sem carregar imagens
ou scripts de cada anuncio. Cada
rodada confere contador, quantidade de cards, codigos/links unicos,
modalidade, titulo, tipo, preco e status ativo. Ao final, a listagem e relida
para conferir total, sequencia, identidades, titulos, tipos e precos.
`--check` nao grava contagem, JSON ou Sheets.

O codigo publico (`#1074`, por exemplo) e diferente do ID usado na URL
(`imovel.php?id=367`). Ambos sao validados; `codigoBase` conserva o codigo
publico, inclusive zeros iniciais como `02`.

Os campos estruturados de tipo, quartos, area e vagas prevalecem sobre
a descricao. Zero explicito e preservado. Suites nao sao contadas como
banheiros; banheiros, ambientes e elevadores permanecem desconhecidos
quando nao fornecidos pelo site. Nao se infere modalidade do titulo:
um titulo que mencione aluguel mas esteja cadastrado como Venda segue
a modalidade estruturada do site.

### Localizacao e revisao manual

- Bairro completo e cidade sao lidos de `.property-meta`, nao do card.
  `localizacao` conserva o texto integral do site.
- Cidades com correspondencia unica no catalogo recebem seu slug; formatos
  como `Uba/MG`, `Uba-MG` e sufixo `| Cod.: 587` sao normalizados apenas
  para consulta ao catalogo, sem reescrever a localizacao original.
- **Cidade fora do catalogo ou ambigua fica vazia, com aviso contendo
  codigo e valor original**, para revisao manual. Isso inclui rodovias,
  `UBA/TOCANTINS`, `Nao Informada` e municipios ausentes no catalogo;
  nao se presume que sejam Uba.
- Conforme confirmacao, `Dores do Turvo Especifica` corresponde a
  `dores-do-turvo-mg`; exclusivamente o codigo `55` com cidade `S`
  corresponde a `sao-geraldo-mg`, conforme seu titulo.
- Exclusivamente o codigo `1059` (`imovel.php?id=352`), quando a cidade
  informada e `UBA/TOCANTINS`, recebe `tocantins-mg`, conforme confirmacao.
  A localizacao original e preservada; a regra nao presume o municipio de
  outros anuncios com dois nomes de cidades ou rodovias.
- **Ubari respeita o cadastro do site**: se informado como cidade, permanece
  como texto `Ubari`, sem converte-lo para Uba; se informado como bairro,
  permanece no bairro. Nenhuma cidade e adicionada ao catalogo automaticamente.

Aba `ubaCarlos` na planilha de Uba, com vinte campos padronizados mais
`negociacao`; vendas e aluguel preservam os registros da outra finalidade.
Arquivos ativos: `backend/crawler/ubaCarlos.json` e
`backend/crawler/ubaCarlosLocacao.json`; historicos:
`ubaCarlosRetiradosVendas.json`/`ubaCarlosRetiradosLocacao.json`.
Duplicacoes continuam bloqueadas neste projeto (a excecao da Montezzi
nao se aplica ao Carlos).

Testes locais adicionais:

```powershell
node --test _01extractor\crawlers\jfora\uba\ubaCarlos\extractor.test.js _01extractor\crawlers\jfora\uba\ubaCarlos\runner.test.js
```

## Nogueira Carvalho

Modelo WordPress / JetEngine. Vendas e aluguel usam a mesma pagina:
<https://nogueiracarvalhoimoveis.com.br/filtrando-imoveis/>.
A API publica `wp-json/wp/v2/imoveis` separa `status-do-imovel=16`
(Para Vender) e `status-do-imovel=11` (Para Alugar), sem filtros adicionais.

No diretorio `backend`:

```powershell
npm run uba:nogueira:vendas -- --check
npm run uba:nogueira:alugueis -- --check
npm run uba:nogueira:vendas
npm run uba:nogueira:alugueis
```

Inclusive em `--check`, todas as paginas da API e todos os detalhes sao
consultados por GET na mesma sessao do navegador. Os cabecalhos de total e
paginas, quantidade por pagina, identidades unicas, finalidade, situacao ativa,
titulo e categoria sao validados. Ao final, a API e relida para conferir
estabilidade da listagem. A tipografia aplicada pelo WordPress ao titulo
(como `12x29` / `12×29`) nao e tratada como troca de identidade.
Falhas interrompem a sincronizacao sem substituir a base por dados parciais.
`--check` nao grava contagens, JSON ou Sheets.

### Criterios confirmados e revisao manual

- Na verificacao inicial: **90 vendas e 3 alugueis**. As contagens de termos
  do WordPress estavam desatualizadas; usam-se os cabecalhos da busca efetiva.
- Os tres alugueis (IDs WordPress `6970`, `6442` e `6003`) estao classificados
  como Para Alugar, mas mostram titulo e preco de venda. A finalidade do site
  e respeitada. **Preco geral/de venda nunca e utilizado como aluguel**.
  Somente um valor explicitamente rotulado `Aluguel:` / `Locacao:` na descricao
  pode preencher o preco de aluguel. Sem ele, o preco fica `null`, com aviso,
  conforme confirmado. Os tres anuncios atuais nao informam esse valor.
- Tipos usam primeiro correspondencia exata de slug/alias no catalogo compartilhado.
  Categorias como `Lotes`, `Sitios e Chacaras` e `Empreendimentos`
  podem nao ter correspondencia exata.
  Quando o tipo estruturado nao resolve, consulta os prefixos do titulo
  no catalogo, do mais especifico ao mais curto, sem substituir tipo valido.
  Assim, `Lote` no inicio do titulo resolve para `terreno`, inclusive quando
  a categoria estruturada `Lotes` nao e reconhecida. Sem correspondencia,
  mantem vazio com aviso. Nao adiciona aliases automaticamente.
  Se o inicio nao resolver, consulta tambem o restante do cabecalho e,
  por ultimo, o caminho `/imoveis/.../` do `linkReal` decodificado.
  Usa a mesma busca textual de Cidade Carinho: nomes especificos prevalecem
  sobre Comercial/Rural, proximidade encerra a busca e tipos conflitantes
  de mesma especificidade ficam pendentes. Nao faz requisicoes adicionais.
- Cidade, estado, bairro e endereco vem dos campos estruturados do detalhe.
  A taxonomia generica da API marca todos como Uba, inclusive anuncios cujo
  detalhe informa Divinesia ou outro municipio; por isso nao e usada como
  substituta. Cidades ausentes, ambiguas ou fora do catalogo ficam vazias,
  com aviso. Bairro estruturado reconhecido no catalogo da cidade tem
  prioridade, incluindo aliases. Quando nao encontrado, a mesma checagem
  compartilhada com Cidade Carinho procura indicacoes explicitas de bairro
  no endereco, titulo e caminho `/imoveis/.../` do link, sem requisicoes
  extras. Somente destinos univocos cadastrados na cidade sao aceitos;
  nao se deduz bairro da descricao, proximidade ou nome de outra cidade.
  Sem resultado seguro, o valor estruturado original e preservado para
  revisao; se ausente, permanece vazio com aviso. `localizacao` conserva
  os textos originais. A regra vale para venda e locacao.
- Quartos, banheiros, vagas e areas usam somente campos estruturados.
  Area construida tem prioridade sobre area total. Zero explicito e
  preservado; area sem numero, ambientes e elevadores permanecem desconhecidos.
- `codigoBase` conserva o codigo publico quando preenchido, inclusive zeros
  iniciais. Quando ausente, usa o ID publico e estavel do WordPress, com aviso.
  Links e codigos repetidos sao bloqueados. `dataInclusao` anterior e preservada.

Aba `ubaNogueira` na planilha de Uba, com as mesmas 21 colunas e preservacao
da outra finalidade. Arquivos ativos: `backend/crawler/ubaNogueira.json` e
`backend/crawler/ubaNogueiraLocacao.json`; historicos:
`ubaNogueiraRetiradosVendas.json`/`ubaNogueiraRetiradosLocacao.json`.

Testes locais adicionais:

```powershell
node --test _01extractor\crawlers\jfora\uba\ubaNogueira\extractor.test.js _01extractor\crawlers\jfora\uba\ubaNogueira\runner.test.js
```

## Artolex

Modelo PHP proprio. O formulario em <https://www.artolex.com.br/?a=busca>
envia `interesse=comprar` / `interesse=alugar` por POST, mas o servidor aceita
os mesmos filtros por GET. O crawler usa essas rotas estaveis, sem depender
de cliques ou do estado anterior do formulario:

- Vendas: <https://www.artolex.com.br/?a=busca&interesse=comprar>
- Aluguel: <https://www.artolex.com.br/?a=busca&interesse=alugar>

No diretorio `backend`:

```powershell
npm run uba:artolex:vendas -- --check
npm run uba:artolex:alugueis -- --check
npm run uba:artolex:vendas
npm run uba:artolex:alugueis
```

Inclusive em `--check`, percorre todas as paginas (dez anuncios por pagina)
e todos os detalhes por GET na mesma sessao do navegador. O HTML usa
ISO-8859-1: os bytes sao decodificados conforme o charset declarado, evitando
perder acentos em cidade, tipo, area e preco mensal.

Confere pagina ativa, paginacao completa, modalidade de cada card,
codigos/links unicos, identidade, endereco e caracteristicas entre card e
detalhe. Ao final, rele **todas** as paginas para detectar mudancas.
URLs de paginacao sao reconstruidas somente com `a`, `interesse` e `pg`,
evitando parametros vazios malformados emitidos pelo proprio site.
Listagem vazia, HTTP/redirecionamento, pagina incompleta ou divergencias
interrompem a coleta sem substituir a base por dados parciais.
`--check` nao grava contagens, JSON ou Sheets.

### Finalidades e precos confirmados

- Na verificacao inicial: **7 vendas e 27 alugueis**, sendo os 7 anuncios de
  venda tambem classificados como `ALUGUEL / VENDA`.
- Imovel com as duas finalidades e gravado **uma vez em cada JSON** e
  **duas vezes na mesma aba**, distinguido por `negociacao=venda/aluguel`.
  Cada execucao preserva os registros da outra finalidade e seus precos.
- **Preco nao informado e zero**, tanto em vendas como em aluguel,
  conforme confirmado para Artolex. `(A COMBINAR)` gera zero e aviso.
- Valores com `/ Mes` pertencem ao aluguel: nunca sao usados como preco
  de venda. Os 7 anuncios atuais nao informam valor de venda, portanto
  recebem preco de venda zero. Nos anuncios duplos, valor sem indicacao
  mensal pertence a venda, nao e copiado para aluguel.
- Tipos usam somente correspondencia exata no catalogo compartilhado.
  `Sitio / Chacara` fica vazio com aviso para revisao manual, sem inferencia.
  A regra e especifica desta agencia e nao altera o tratamento da Nogueira.
- Bairro e cidade sao lidos dos cards; o endereco completo vem do detalhe.
  Cidades fora do catalogo ou ambiguas ficam vazias com aviso.
- Caracteristicas sao lidas somente dos campos estruturados; `N/D`, `-`
  e `(Nao Disponivel)` significam desconhecido (`null`), nao zero.
  Zero explicito e preservado. Nao se extraem quantidades da descricao.
  Ambientes e elevadores permanecem desconhecidos.

Aba `ubaArtolex` na planilha de Uba, com 21 colunas. Arquivos ativos:
`backend/crawler/ubaArtolex.json` e `backend/crawler/ubaArtolexLocacao.json`;
historicos: `ubaArtolexRetiradosVendas.json`/`ubaArtolexRetiradosLocacao.json`.
Os codigos do site sao preservados e a data de inclusao anterior e mantida.

Testes locais adicionais:

```powershell
node --test _01extractor\crawlers\jfora\uba\ubaArtolex\extractor.test.js _01extractor\crawlers\jfora\uba\ubaArtolex\runner.test.js
```

## Corretora Cidade Carinho

Modelo WordPress / RealHomes:

- Vendas: <https://corretoracidadecarinho.com.br/pesquisa-de-imoveis/?status=para-vender>
- Aluguel: <https://corretoracidadecarinho.com.br/pesquisa-de-imoveis/?status=para-alugar>

No diretorio `backend`:

```powershell
npm run uba:cidade:vendas -- --check
npm run uba:cidade:alugueis -- --check
npm run uba:cidade:vendas
npm run uba:cidade:alugueis
```

O crawler usa a API publica `wp-json/wp/v2/properties`, com filtro da
taxonomia `imovel-estados` (nome da chave acentuado no WordPress):
`31` para vendas e `30` para aluguel. Percorre todas as paginas da API,
cem registros por pagina, incluindo termos e foto principal incorporados.
Os dados estruturados ja fornecem codigo publico, preco, tipo, cidade,
quartos, banheiros, vagas e areas; nao e necessario visitar cada detalhe.
Somente os campos necessarios sao retornados da sessao do navegador.

Confere cabecalhos de total/paginas, tamanho de cada pagina, identidades
unicas, finalidade e taxonomias completas. Compara contador bruto e
identidades da primeira e ultima pagina HTML (seis anuncios por pagina)
com as mesmas fatias da API, sem incluir os cards de destaque.
Ao final, rele toda a API e essas paginas HTML, inclusive em `--check`.
Mudancas, respostas incompletas e divergencias interrompem a sincronizacao.
`--check` nao grava contagens, JSON ou Sheets.

### Exclusoes e criterios confirmados

- Na verificacao inicial: **256 vendas brutas, 37 indisponiveis excluidas,
  219 ativas; 6 alugueis brutos, 3 indisponiveis excluidos, 3 ativos**.
- Titulos com palavras inteiras `Vendido`, `Vendida`, `Alugado`, `Alugada`
  ou `Indisponivel` sao excluidos da base ativa, conforme confirmado,
  inclusive com acentos, emojis e entidades HTML. Total bruto e IDs excluidos
  sao informados no log e no resultado (`totalSite` e `excluidos`).
  `totalEsperado` e a contagem registrada correspondem aos **ativos**.
  Registros antes ativos que desaparecerem por essa regra seguem para
  o historico compartilhado de retirados. Base ativa totalmente vazia
  continua bloqueada para evitar retirada em massa sem confirmacao.
- Preco ausente fica **zero com aviso**. O aluguel `19309` informa **R$ 1**:
  o valor cadastrado e preservado com aviso, conforme confirmado.
  Centavos e zero explicito sao preservados; preco de outra finalidade
  indicado pelo sufixo nao e copiado.
- Tipos usam primeiro correspondencia exata das categorias no catalogo.
  Quando o resultado fica vazio (ausencia, categoria desconhecida ou
  conflito), consultam os prefixos do titulo, do mais especifico ao mais
  curto, com a mesma regra compartilhada de Aloisio. `Chacara` resolve
  para `granja` mesmo com emojis ou pontuacao antes do nome. A busca ignora
  esses caracteres iniciais. Sem resultado no inicio, procura tambem
  nomes/aliases completos no restante do cabecalho, inclusive depois de
  frases de propaganda. Correspondencias conflitantes de mesma
  especificidade permanecem vazias; termos compostos mais especificos
  prevalecem sobre nomes genericos contidos neles.
  `Casa Comercial` preserva o tipo mais especifico.
  Tipos estruturados reconhecidos nao sao substituidos. Sem correspondencia
  no titulo, consultam por ultimo o caminho `/property/.../` do `linkReal`,
  decodificando acentos e separadores e validando nomes/aliases no catalogo.
  Essa etapa nao faz requisicoes adicionais nem substitui resultados das
  etapas anteriores. Links com tipos ambiguos ou desconhecidos mantem o
  campo vazio com aviso. Medidas e localizacao
  apos `para Venda` / `para Locacao` nao sao usadas como tipo.
  Na busca textual, nomes especificos como Galpao, Cobertura e Chacara
  prevalecem sobre os qualificadores genericos Comercial e Rural. A busca
  corta trechos de finalidade/localizacao, evitando nomes de bairros como
  Centro. Terraco nao e alias cadastrado; um titulo que informe Cobertura
  continua resolvendo por esse nome, sem cadastrar equivalencias automaticamente.
  Indicacoes de proximidade (`proximo`, `proxima`, `perto`) encerram a busca
  textual: uma pousada vizinha nao muda Chacara para Hotel. O catalogo
  aceita tambem `Chacaras` como alias de `granja`, sem alterar o nome Sítio.
- Cidades sao lidas da taxonomia e consultadas pelo nome/UF no catalogo.
  Ausentes ou sem correspondencia unica, inclusive `Ubari-Uba - MG` e
  `Ubazinho-Uba - MG`, ficam vazias com aviso, sem presumir Uba.
- Bairro consulta primeiro o endereco exato no catalogo da cidade. Sem
  correspondencia, confere indicacoes explicitas (`bairro`, `no`, `na`,
  `nos`, `nas`) no endereco, titulo e caminho do link do imovel.
  Por exemplo, `no-palmeiras` resolve para `palmeiras` somente quando
  cadastrado na cidade identificada. Principais e aliases sao aceitos;
  nomes conflitantes permanecem vazios com aviso, sem escolha arbitraria.
  Nomes de cidade, palavras soltas e indicacoes de proximidade nao bastam.
  `localizacao` continua preservando endereco e cidade. Nao se usam
  coordenadas, descricao (que inclui o endereco da imobiliaria), menus ou
  anuncios relacionados. A checagem do link usa o caminho ja recebido da
  API, sem requisicoes extras ou cadastro automatico de bairros.
- Area construida tem prioridade sobre lote. Unidades precisam indicar
  metros quadrados. Valores estruturados como `APROX. 324,70` sao normalizados,
  sem calcular dimensoes como `10x15`. Ausencia, unidade desconhecida ou
  quantidade nao numerica fica `null` com aviso quando aplicavel.
  Vagas cadastradas como `sim` nao sao convertidas em uma vaga.
  Ambientes e elevadores permanecem desconhecidos.

Aba `ubaCidade` na planilha de Uba, com 21 colunas e preservacao da outra
finalidade. Arquivos ativos: `backend/crawler/ubaCidade.json` e
`backend/crawler/ubaCidadeLocacao.json`; historicos:
`ubaCidadeRetiradosVendas.json`/`ubaCidadeRetiradosLocacao.json`.
O codigo publico completo (`CCC-Imovel n...`, com a grafia original do site)
e a data de inclusao anterior sao preservados.

Testes locais adicionais, com API Sheets simulada inclusive para retirados:

```powershell
node --experimental-test-module-mocks --test _01extractor\crawlers\jfora\uba\ubaCidade\extractor.test.js _01extractor\crawlers\jfora\uba\ubaCidade\runner.test.js
```

## RE/MAX Uba

Rotas oficiais `https://www.remax.com.br/listings`, com cidade `6579726`,
Minas Gerais `9512`, pais `55`, todas as classes (`ListingClass=-1`) e
`TransactionTypeUID=261` para venda / `260` para aluguel.
As URLs completas fornecidas estao em `ubaRemax/config.js`.

No diretorio `backend`:

```powershell
npm run uba:remax:vendas -- --check
npm run uba:remax:alugueis -- --check
npm run uba:remax:vendas
npm run uba:remax:alugueis
```

O crawler captura a requisicao oficial filtrada de
`search/listing-search/docs/search`, ignorando a busca geral inicial.
Exige filtros de cidade, estado, pais, finalidade e anuncios visiveis,
sem filtros adicionais de preco, tipo, bairro ou termos de busca.
Reutiliza `createRemaxSearchBatches` e `requestRemaxSearch` dos crawlers
RE/MAX existentes, parametrizados para Uba, sem alterar Juiz de Fora/Niteroi.
Os lotes excluem chaves ja lidas para evitar duplicacoes da paginacao
instavel do site. A selecao da API solicita apenas os campos usados.

Todos os lotes, totais, chaves, codigos, links e registros sao validados.
A pagina oficial precisa confirmar o total e apresentar cards correspondentes
ao conjunto da API. Toda a busca e repetida para comparar os dados completos
antes de registrar contagem ou sincronizar; mudancas de ordem nao significam
troca de dados. Inclusive em `--check`, todos os registros sao validados,
sem gravar contagens, JSON ou Sheets. Os campos estruturados ja fornecem
os dados necessarios, sem visitas a cada detalhe ou inferencias pela descricao.

### Criterios confirmados

- Na verificacao inicial: **10 vendas e nenhum aluguel em Uba**.
- O aluguel RE/MAX habilita
  `permitirLocacaoVaziaConfirmada: true`. Zero exige resposta filtrada
  da API, ausencia de cards e a mensagem oficial de nenhum resultado
  na pagina, com cidade/finalidade corretas; a API e relida para confirmar.
  Na execucao normal, pode gravar JSON vazio, preservar vendas na aba e
  encaminhar alugueis antes ativos ao historico. Falha de carregamento,
  filtros ausentes ou somente zero na API nao autorizam esvaziar a base.
  Vendas e agencias sem autorizacao explicita continuam bloqueando base totalmente vazia.
- Preco ausente ou oculto pelo anunciante fica **zero com aviso**.
  Precos visiveis precisam estar em BRL; centavos e zero sao preservados.
- Tipos usam correspondencia exata no catalogo compartilhado a partir
  do tipo no link oficial. Sem correspondencia, ficam vazios com aviso.
  Bairro usa o `LocalZone` cadastrado, sem resolver bairros de Juiz de Fora.
  Cidade e consultada pelo nome/UF no catalogo, ficando vazia com aviso
  quando nao houver correspondencia unica.
- O titulo vem do titulo publico em portugues da API e `codigoBase`
  conserva o MLS completo. Links publicos precisam indicar Uba,
  finalidade e o mesmo MLS. `dataInclusao` anterior e preservada.
- Areas priorizam util, total e lote (primeiro positivo; zero explicito
  se nao houver positivo). **O anuncio `860511003-15` conserva
  `2582740000` m2**, exatamente como exibido no site, com aviso,
  conforme confirmado. Nao se corrige pelo texto ou por suposicao.
- Quartos, banheiros, ambientes, vagas e elevadores sao estruturados.
  Campos ausentes permanecem `null`; zero explicito e preservado.
  Salas usam quantidade de salas de estar, com total de ambientes
  como alternativa quando nao informado; vagas priorizam estacionamento
  sobre garagens sem somar os dois.
- A recuperacao de aluguel que perde o filtro para `-1` reutiliza a
  logica existente da aba oficial Alugar, somente na mesma cidade.
  Nao se altera uma busca redirecionada a outra cidade ou finalidade.

Aba `ubaRemax` na planilha de Uba, com 21 colunas e preservacao da outra
finalidade. Arquivos ativos: `backend/crawler/ubaRemax.json` e
`backend/crawler/ubaRemaxLocacao.json`; historicos:
`ubaRemaxRetiradosVendas.json`/`ubaRemaxRetiradosLocacao.json`.

Testes locais adicionais, sem rede e com Sheets simulado inclusive nos retirados:

```powershell
node --experimental-test-module-mocks --test _01extractor\crawlers\jfora\uba\ubaRemax\extractor.test.js _01extractor\crawlers\jfora\uba\ubaRemax\runner.test.js _01extractor\crawlers\jfora\remax\paginacao-api.test.js _01extractor\crawlers\jfora\remax\busca-locacao.test.js
```

## Aloisio Teixeira

Modelo ImobiBrasil classico, com HTML ISO-8859-1:

- Vendas: <https://www.aloisioteixeiraimoveis.com.br/imovel/venda>
- Aluguel: <https://www.aloisioteixeiraimoveis.com.br/imovel/locacao>

No diretorio `backend`:

```powershell
npm run uba:aloisio:vendas -- --check
npm run uba:aloisio:alugueis -- --check
npm run uba:aloisio:vendas
npm run uba:aloisio:alugueis
```

Na verificacao inicial foram confirmados **13 vendas e nenhum aluguel**.
O contador `Imoveis Encontrados`, canonical, pagina ativa, links, codigos
publicos e finalidade sao conferidos em todas as paginas. Todos os detalhes
sao consultados, inclusive no `--check`, comparando codigo, tipo, finalidade,
localizacao, bairro, preco, quartos, banheiros, vagas e area total.
Toda a listagem e relida antes de registrar contagem ou sincronizar.
Erro, paginacao incompleta, repeticao ou divergencia preserva a base.
`--check` nao grava contagens, JSON ou Sheets.

### Excecao HTTPS autorizada

O certificado do dominio apresenta `ERR_TLS_CERT_ALTNAME_INVALID`.
Conforme autorizado, somente as requisicoes GET publicas deste projeto para
`https://www.aloisioteixeiraimoveis.com.br/imovel/...` toleram a divergencia
de nome, com aviso explicito. A cadeia de confianca e a validade do
certificado continuam sendo verificadas pelo Node. Nao se usa
`NODE_TLS_REJECT_UNAUTHORIZED=0`, `rejectUnauthorized: false`, alteracao
global do navegador ou excecao para outros dominios. Redirecionamentos,
credenciais na URL e outras origens sao rejeitados.
Esta excecao reduz a garantia de identidade do servidor; a correcao do
certificado pelo site continua recomendada. Quando corrigido, a verificacao
normal passa sem precisar da excecao nem emitir o aviso.

### Dados e aluguel vazio

- Zero aluguel e permitido somente com canonical correto, contador
  explicitamente zero, ausencia de cards e a mesma confirmacao na releitura.
  Conforme autorizado, uma execucao normal pode zerar o JSON de aluguel
  e encaminhar os anteriores para retirados, preservando vendas na aba.
  Pagina indisponivel/sem contador nao equivale a zero; vendas vazias
  continuam bloqueadas.
- Codigos publicos completos, inclusive prefixos, pontuacao e zeros
  iniciais, sao preservados; o ID numerico da URL nao substitui o codigo.
  `dataInclusao` anterior e mantida.
- Tipos usam primeiro correspondencia exata do campo estruturado no catalogo.
  Se vazios, consultam os prefixos do titulo, do mais especifico ao mais curto,
  somente antes de `para Venda` / `para Locacao`. Assim, `Chacara Condominio
  Rural` usa `Chacara`, alias de `granja`, sem interpretar `terreno` nas
  medidas ou nomes na localizacao como tipo. Sem correspondencia, o tipo
  permanece vazio com aviso. Cidades continuam usando correspondencia exata;
  municipios vizinhos sao preservados, inclusive Astolfo Dutra, sem presumir Uba.
- Bairro ausente permanece vazio com aviso, sem ser inferido do slug ou
  da descricao. O endereco e complemento estruturados compoem `localizacao`.
- Precos visiveis conservam centavos e zero explicito; sob consulta fica
  `null` com aviso. Formato desconhecido bloqueia a coleta.
- Area usa o total estruturado, sem somar area construida e terreno.
  Quartos, banheiros, vagas e salas usam campos estruturados; ausencias
  ficam `null` e zeros explicitos sao preservados. Elevador permanece
  desconhecido. Nao se extraem quantidades da descricao.

Aba `ubaAloisio` na planilha de Uba, com 21 colunas e preservacao da outra
finalidade. Arquivos ativos: `backend/crawler/ubaAloisio.json` e
`backend/crawler/ubaAloisioLocacao.json`; historicos:
`ubaAloisioRetiradosVendas.json`/`ubaAloisioRetiradosLocacao.json`.

Testes locais sem rede, com Sheets simulado inclusive para retirados:

```powershell
node --experimental-test-module-mocks --test _01extractor\crawlers\jfora\uba\ubaAloisio\extractor.test.js _01extractor\crawlers\jfora\uba\ubaAloisio\runner.test.js
```

## Configuracao de cada imobiliaria

Com as rotas e o modelo de site, implementar e testar extratores, parser,
precontagem, sincronizacao e destino de Sheets da cidade. Os nomes planejados
dos arquivos seguem o padrao existente: `ubaJXavier.json`,
`ubaJXavierLocacao.json`, `ubaJXavierRetiradosVendas.json` e
`ubaJXavierRetiradosLocacao.json`, no diretorio `backend/crawler`.

## Execucao automatica, painel e email

Os nove projetos participam da fila oficial depois de Juiz de Fora e Niteroi,
sempre venda seguida de locacao da mesma imobiliaria. Os scripts canonicos
sao `ubajxavier`, `ubagb`, `ubamontezzi`, `ubacarlos`, `ubanogueira`,
`ubaartolex`, `ubacidade`, `ubaremax` e `ubaaloisio`, com o sufixo
`:locacao` para aluguel. Os aliases manuais `uba:<agencia>:vendas` e
`uba:<agencia>:alugueis` continuam funcionando, mas nao geram etapas duplicadas.

O executavel principal descobre as dezoito etapas; o executavel de alugueis
inclui as nove locacoes. O painel principal agrupa as duas finalidades e o
painel de alugueis permite executar cada locacao separadamente. A selecao salva
do painel principal inclui os nove projetos, sem mudar o horario configurado.
Os JSONs ativos de Uba tambem entram nas leituras e checagens do painel,
sem confundir historicos de retirados com ativos.

O relatorio diario HTML/JSON e o mesmo HTML enviado por email identificam a
cidade como **Uba**, com finalidade e resultado de cada etapa, inclusive falhas
e retomadas pelo checkpoint diario. Erros nao impedem os outros projetos.
As planilhas e regras especificas de cada agencia permanecem as mesmas.
Nenhuma publicacao no Firestore/Typesense e iniciada pela inclusao na fila.

## Publicacao no Typesense

Uba usa as mesmas duas rotas de Juiz de Fora e Niteroi, sem novos indices:

- JSON -> Firestore (`__imoveisPublicos`) -> Typesense (`imoveis`) para vendas.
- JSON -> Firestore (`__alugueisPublicos`) -> Typesense (`imoveis_alugueis`)
  para locacoes.
- JSON -> Typesense direto, nas mesmas colecoes, sem ler/gravar Firestore.

Nomes `jf...`, `nit...` e `uba...` sao aceitos na publicacao selecionada
do Firestore, sempre sem sufixo `Locacao` ou historico.
No painel principal, os nove projetos aparecem na selecao JSON de Typesense.
O painel de alugueis oferece as mesmas origens para o perfil de locacao.
O envio direto seletivo preserva os documentos dos projetos desmarcados;
o envio do perfil completo substitui o indice inteiro, nao apenas Uba.

Exemplos de **simulacao**, no backend:

```powershell
node publicar-imoveis.js --tipo=vendas --etapa=firestore ubaJXavier ubaGb ubaMontezzi ubaCarlos ubaNogueira ubaArtolex ubaCidade ubaRemax ubaAloisio --dry-run
node publicar-imoveis.js --tipo=alugueis --etapa=firestore ubaJXavier ubaGb ubaMontezzi ubaCarlos ubaNogueira ubaArtolex ubaCidade ubaRemax ubaAloisio --dry-run
npm run typesense:sync:vendas -- --dry-run
npm run typesense:sync:alugueis -- --dry-run
npm run typesense:sync:vendas -- --origem=json --dry-run
npm run typesense:sync:alugueis -- --origem=json --dry-run
```

As simulacoes Typesense conferem a rota sem acessar a nuvem; nao confirmam
que os documentos ja estejam no indice. Sem `--dry-run`, os comandos enviam
dados reais. No fluxo via Firestore, primeiro publique os JSONs selecionados
e depois sincronize o perfil Typesense completo.

Precos numericos e centavos sao preservados. Sob consulta e projetado como
`preco: 0` e `precoSobConsulta: true`, conforme o contrato existente;
zero informado conserva `precoSobConsulta: false`. Cidade usa o slug real
do municipio, como `uba-mg`, e o nome do catalogo, sem restringir anuncios
de municipios vizinhos.

O indice usa a identidade publica existente: link para vendas e
imobiliaria/codigo para locacoes. Ocorrencias repetidas da Montezzi continuam
no JSON/Sheets, mas geram um unico documento por identidade no Firestore
e Typesense. Isso tambem evita contagem esperada duplicada na importacao.
Na validacao local: 1.380 ocorrencias de venda, 1.376 anuncios unicos, e
308 locacoes. Nenhum envio real foi realizado nesta validacao.
