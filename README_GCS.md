# Infraestrutura GCS: etapa inicial

O backup inicial nao integra os processos legados, correcoes do painel ou
publicacao. Existe um piloto isolado para vendas da Universal, descrito abaixo;
os demais processos continuam dependendo de arquivos locais, Sheets e
Firestore. Nao use esta copia em producao antes das demais migracoes e
validacoes.

Os caminhos locais identificados foram ajustados para esta copia. Isso nao
integra os processos existentes ao GCS nem remove suas dependencias legadas:
nao execute crawlers legados, agendamentos ou o painel ate substituir os controles
operacionais e validar as publicacoes.

## Isolamento dos caminhos locais

Os crawlers que dependiam do diretorio atual usam agora a raiz da propria
copia, mesmo se o comando for iniciado de outra pasta. Logs, relatorios,
checkpoint e disponibilidade locais usam `logs/` dentro da copia; essa pasta
e ignorada pelo Git e nao e fonte oficial. O carregamento de `.env` usa o
arquivo da copia, nao o arquivo da pasta pai.

Os launchers exigem o arquivo `.achouimob-backend-isolado` junto ao
`package.json` e recusam `RASPAGEM_IMOVEIS_BACKEND` apontando para outra
pasta. Executaveis compilados devem permanecer junto desses arquivos na copia
isolada; eles ainda precisam ser recompilados e testados antes do uso.
`CRAWLER_REPORT_PATH`, quando usado pelo executor diario, deve apontar para
dentro da copia. A validacao de caminhos rejeita os diretorios principais e
destinos de log quando redirecionados para fora por links ou junctions; nao
substitui uma auditoria de todas as entradas programaticas e efeitos externos.

O script de backup inicial e uma excecao deliberada: ele le a instalacao e os
logs originais para preservacao no GCS, sem gravar neles. Nao reative o
agendamento antigo nem utilize os caminhos locais como substitutos da base
compartilhada no GCS.

## Bucket e autenticacao

Use um bucket privado com acesso uniforme, prevencao de acesso publico,
versionamento e exclusao reversivel habilitados. Versionamento e exclusao
reversivel ocupam armazenamento e podem gerar custos; defina uma politica de
retencao adequada antes de automatizar limpezas.

Instale o Google Cloud CLI e configure em cada computador, com sua propria
identidade autorizada:

```powershell
gcloud auth application-default login
```

Nao copie o arquivo local de credenciais entre computadores nem o coloque no
repositorio. Use `.env.example` como referencia para a configuracao local.

## Camada JSON

`src/infra/gcs/jsonStorage.js` usa Application Default Credentials. A leitura
retorna o JSON e sua geracao. A escrita exige a geracao lida, ou `0` apenas
para criar objeto ausente; uma alteracao concorrente causa erro explicito.

```javascript
import { JsonStorage } from './src/infra/gcs/jsonStorage.js';

const storage = new JsonStorage({ bucketName: process.env.GCS_BUCKET });
const anterior = await storage.read('crawler/vendas/jfExemplo.json');
await storage.write('crawler/vendas/jfExemplo.json', anterior.data, {
  expectedGeneration: anterior.generation,
});
```

Esse controle e por objeto e nao substitui o protocolo de operacoes completas
descrito abaixo. Os processos existentes ainda nao utilizam esse protocolo.
O exemplo nao e executado automaticamente.

## Concorrencia e versoes de uma operacao

`src/infra/gcs/transactionStore.js` oferece um protocolo para um escopo logico.
O estado do escopo guarda conjuntamente o lock, a revisao e o ponteiro para
o manifesto confirmado. Cada transicao usa a geracao GCS desse mesmo estado.
Os documentos e o manifesto sao preparados em objetos com nomes unicos e a
troca do ponteiro confirma o conjunto em uma unica escrita condicional.
Um processo retomado com uma geracao antiga nao consegue confirmar, renovar
ou liberar depois de uma disputa ou retomada por outro computador. Documentos
preparados que nao chegam a ser confirmados nao fazem parte da versao atual.

Exemplo de uso para os futuros consumidores:

```javascript
import { JsonStorage } from './src/infra/gcs/jsonStorage.js';
import { TransactionStore } from './src/infra/gcs/transactionStore.js';

const storage = new JsonStorage({ bucketName: process.env.GCS_BUCKET });
const operacao = new TransactionStore({
  storage, scope: 'exemplo', computerId: process.env.ACHOUIMOB_COMPUTER_ID,
});
let lock = await operacao.acquire(60000);
const dados = await operacao.stage(lock, [{ exemplo: true }]);
const confirmacao = await operacao.commit(lock, { imoveis: dados });
lock = confirmacao.lease;
await operacao.release(lock);

const versao = await operacao.current();
const imoveis = await operacao.readDocument(versao, 'imoveis');
```

Uma renovacao ou confirmacao retorna um novo lock com nova geracao; descarte
o anterior. Se o processo cair, outro pode assumir apos a validade expirar.
Se a resposta de uma confirmacao se perder, a gravacao pode ter sido aceita:
consulte a versao atual e seu historico antes de tentar novamente.
Os computadores devem manter relogios sincronizados: a validade usa o relogio
local, nao o horario autoritativo do servidor GCS. A exclusao mutua baseada em
tempo pode ser antecipada ou atrasada por diferencas de relogio; a protecao
contra confirmacao apos uma tomada de posse depende da escrita condicional
no estado, nao dos relogios. Uma pausa entre a ultima verificacao de validade
e a escrita pode permitir confirmacao apos o prazo se ninguem tiver assumido.

Este protocolo protege somente consumidores que usem o mesmo escopo e
consultem os documentos pelo manifesto e geracao confirmados. Escopos
diferentes nao bloqueiam uns aos outros. Escritas diretas, processos legados,
efeitos externos como atualizacoes no Typesense e exclusao de objetos por
outros programas nao sao protegidos por esse mecanismo. Nao use esses locks
para autorizar publicacoes ou executar os processos antigos. O bucket deve
manter o versionamento habilitado e conservar as geracoes referenciadas; nao
configure limpeza de versoes sem considerar todos os manifestos e historicos.
A coleta de objetos preparados abandonados e o historico operacional completo
ainda precisam ser implementados. O teste com dois computadores fisicos e a
integracao dos crawlers permanecem pendentes.

## Fundacao para operacoes auditadas

`src/infra/gcs/operationalStore.js` prepara a integracao dos consumidores:
le documentos obrigatorios de um mesmo manifesto e confirma alteracoes apenas
se a revisao lida continuar atual. A confirmacao preserva os demais documentos
e inclui, na mesma revisao, um registro de auditoria e um relatorio pendente.
Ela rele os documentos alterados, a auditoria e o relatorio apos confirmar.
Conflitos exigem reler e refazer a operacao; nao reutilize resultados calculados
sobre a revisao antiga. O identificador UUID da operacao deve ser guardado pelo
executor antes de confirmar: se a resposta se perder, procure esse identificador
em `controles/operacoes/` no manifesto antes de tentar novamente.

O componente de armazenamento nao valida coletas nem aplica correcoes por
conta propria. O piloto Universal usa essa camada e o envio de relatorios
descrito abaixo; os outros processos legados nao a utilizam e devem continuar
pausados. A identidade do operador e fornecida pelo chamador e ainda nao e
autenticada. O escopo `base-preparacao-inicial` e bloqueado para escrita por
esse componente e permanece apenas como preparacao.

O protocolo verifica todas as referencias do manifesto antes de confirmar;
uma operacao na base completa pode exigir muitas requisicoes e expirar o lock
de 15 minutos. Custos, tempo de execucao, recuperacao e validacao de dados
precisam ser avaliados antes de ativar um fluxo real.

## Piloto isolado: vendas Universal

O piloto usa um escopo independente cujo nome obrigatoriamente comeca por
`piloto-jfuniversal-`. A preparacao copia do manifesto inicial apenas os
documentos necessarios a Universal, incluindo os arquivos compartilhados de
correcoes, duplicados e catalogos de cidades, bairros e tipos, e registra a origem.
A coleta usa esses catalogos do mesmo manifesto GCS, nao os arquivos locais.
Ela nao modifica a base preparada
nem ativa uma base oficial. Nao aponta crawlers legados para esse escopo.
Os dados copiados permanecem privados no mesmo bucket e podem gerar custos;
versionamento e exclusao reversivel tambem conservam versoes removidas.

A coleta valida contagem, paginacao, links e duplicidades com as regras de
vendas existentes; reusa conciliacao, correcoes manuais, grupos duplicados e
historicos de retirados e raspagens. Dados, historicos e relatorio pendente sao
confirmados juntos, sem acesso ao Sheets ou Typesense antes da confirmacao.
Falhas persistentes na leitura de detalhes interrompem o piloto, sem confirmar
uma coleta parcialmente enriquecida. Os crawlers legados mantem seu
comportamento anterior para detalhes indisponiveis.
Se a base mudar durante a coleta, a operacao falha sem substituir os dados;
releia e refaca a coleta. O indicador de site indisponivel e consultado sem
acionar a retirada automatica legada. O piloto nao publica no Typesense.
Falhas anteriores a confirmacao sao exibidas no terminal, mas ainda nao geram
historico de execucoes ou controle de disponibilidade no GCS.

O piloto foi testado com dados sinteticos e tambem com uma coleta real de
vendas em um escopo isolado do bucket. A base preparada permaneceu intacta.
O envio do resumo de operacao ao Sheets ainda foi testado apenas com simulacao;
o envio manual de vendas para a aba jfUniversal foi validado na planilha real.
Nao houve teste com dois computadores. O piloto nao e uma base oficial: nao
habilite o painel nem o agendamento ate concluir a migracao e as validacoes.

Para executar o piloto ja preparado com a configuracao local deste computador:

```powershell
cd C:\Projetos\raspagemimoveis\backend-backup-limpo
npm run universal:gcs
```

O comando le `.env.piloto-universal`, ignorado pelo Git, e mostra o bucket e
escopo antes da coleta. Ele mantem o relatorio pendente mesmo se houver uma
planilha configurada no ambiente; nao envia ao Sheets nem publica no Typesense.
Configure nesse arquivo um identificador de computador distinto em cada maquina
e uma etiqueta de operador; essa etiqueta nao e autenticacao. Configure tambem
o caminho do navegador conforme a maquina e mantenha ADC autorizado. Para
recuperar uma operacao usando o UUID informado na primeira tentativa, execute
`npm run universal:gcs -- UUID`. Nao repita sem antes consultar o estado no GCS.
O comando `npm run universal` continua sendo o fluxo legado e nao usa o piloto.

Para enviar manualmente as vendas do snapshot atual para a aba existente
`jfUniversal` na planilha de Juiz de Fora:

```powershell
cd C:\Projetos\raspagemimoveis\backend-backup-limpo
npm run universal:gcs:enviar
```

O envio substitui as vendas da aba pelo snapshot isolado, sem deslocar ou
escrever nas linhas de aluguel. Antes da escrita, salva e verifica no GCS um
backup dos valores anteriores e imprime seu caminho e geracao; depois, rele
a aba para confirmar. O envio e separado da coleta e nao publica no Typesense.
O comando exige no `.env.piloto-universal` o ID da planilha, o ID da aba e
`SHEETS_SERVICE_ACCOUNT_FILE`. Neste computador o ultimo aponta, somente para
leitura, para a credencial Sheets ja usada pelo backend original; ela nao foi
copiada para esta pasta. O GCS continua usando ADC. Em outro computador,
configure uma credencial Sheets autorizada e um ID de computador diferente.

O lock protege apenas processos que usam o mesmo escopo GCS. Pause os crawlers
legados e nao edite a aba durante o envio: eles nao participam desse lock, e o
Sheets nao oferece comparacao atomica com a leitura anterior. Se houver erro
apos iniciar a escrita, confira a aba e o backup indicado antes de repetir.
O resumo de operacao GCS continua pendente e e independente deste envio.

Os scripts leem variaveis de ambiente do processo. Em PowerShell, na copia
isolada, configure-as localmente (nao registre credenciais em arquivos Git):

```powershell
$env:GCS_BUCKET = 'nome-do-bucket'
$env:GCS_OPERATION_SCOPE = 'piloto-jfuniversal-identificador-unico'
$env:ACHOUIMOB_COMPUTER_ID = 'identificador-do-computador'
$env:ACHOUIMOB_ACTOR = 'identificador-do-operador'
# Opcional se o Chromium do Puppeteer nao estiver instalado.
$env:PUPPETEER_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:CRAWLER_HEADLESS = 'true'
# Opcional durante a coleta; necessario para enviar e reprocessar relatorios.
$env:GCS_REPORTS_SPREADSHEET_ID = 'id-da-planilha-exclusiva-de-relatorios'
```

Uma vez autorizado o teste supervisionado, prepare um escopo novo com
`node scripts\preparar-piloto-universal-gcs.js`. O comando nao sobrescreve um
escopo existente. A coleta manual e executada por
`node --expose-gc scripts\piloto-universal-vendas-gcs.js`. A opcao `--expose-gc`
permite liberar memoria periodicamente ao processar os cards. Anote o UUID
impresso antes de comecar. Uma falha de resposta pode ocorrer depois da confirmacao: consulte
`controles/operacoes/<UUID>.json` no manifesto antes de repetir. Reexecutar com
o mesmo UUID nao reaplica uma operacao confirmada. O lock pode permanecer ate
15 minutos apos interrupcao.

O envio usa ADC, uma aba separada `GCS-<escopo>` e somente resumos da operacao,
nao a aba legada de imoveis. O resumo inclui quantidades de ativos, novos,
alterados e retirados; a contagem de alterados desconsidera mudancas somente
em `atualizadoEm`. A planilha precisa ser acessivel pela identidade
autorizada e a credencial ADC precisa ter autorizacao para a API Sheets alem
do GCS. O fluxo nao modifica credenciais automaticamente. Se a planilha nao
estiver configurada ou ocorrer falha, os dados confirmados permanecem no GCS e
o relatorio fica pendente. Depois de corrigir a configuracao ou acesso, execute
`node scripts\reprocessar-relatorios-gcs.js`. Cada relatorio usa uma linha
fixa pela revisao da operacao e e confirmado por leitura; repeticoes nao
regravam outra linha. Nao ordene nem edite manualmente essa aba, e nao use a
mesma aba de escopo em buckets diferentes. Se uma linha estiver ocupada com
outros dados ou o cabecalho for diferente, o envio falha sem sobrescrever.
Na primeira tentativa o relatorio e vinculado a planilha informada; se ela
estiver errada, nao envie para outra sem antes investigar possivel escrita na
planilha anterior. Falha apos gravar no Sheets pode exigir reprocessamento para
confirmar o estado no GCS.

## Backup inicial das fontes locais

O comando abaixo foi preparado para a copia em `backend-backup-limpo`, com
`backend` e `logs` ao lado dela. Antes de executar, pause todas as gravacoes
nas duas copias e nos logs durante toda a operacao. Use um identificador
unico por backup e a mesma identificacao de computador ao retomar uma falha:

```powershell
$env:GCS_BUCKET = 'nome-do-bucket'
$env:ACHOUIMOB_COMPUTER_ID = 'identificador-do-computador'
node scripts\backup-inicial-gcs.js identificador-do-backup
```

O backup armazena bytes originais de `crawler`, `_03database`, dos controles
de execucao e de `logs`, mais as versoes diferentes ou exclusivas da copia.
O inventario registra SHA-256, tamanho e validade JSON. Os dados sao criados
sem sobrescrita e lidos novamente do GCS; o manifesto de conclusao registra
as geracoes verificadas. Arquivos invalidos sao preservados e sinalizados,
nao convertidos em dados operacionais. Se arquivos locais mudarem, a operacao
falha sem registrar conclusao; investigue e inicie outro identificador apos
estabilizar as fontes. Para falhas de rede, repetir o mesmo comando retoma
os objetos ja verificados, desde que o inventario nao tenha mudado.

O backup em `backups/importacao-inicial/` nao e uma base operacional ativa.
Nao habilite os processos legados com base neste backup; ainda sao necessarios
o mapeamento e a migracao dos consumidores e os controles de concorrencia.

## Preparacao versionada da base inicial

`scripts/preparar-base-inicial-gcs.js` le exclusivamente um backup concluido
no GCS. Verifica o inventario e os bytes de cada arquivo original pela geracao,
tamanho e SHA-256, depois prepara uma versao no escopo
`base-preparacao-inicial`. O manifesto conserva os caminhos logicos existentes
(`crawler/`, `_03database/`, `logs/` e controles), evitando classificacoes
prematuras de vendas, alugueis ou historicos. Os objetos preparados sao
individuais e preservam exatamente os bytes originais; seus nomes fisicos
identificam conteudo, enquanto o manifesto associa cada caminho a sua geracao.

O arquivo legado vazio `_03database/jfora/jfClientt.json` permanece no
backup e e registrado como invalido no comprovante, mas nao entra como JSON
operacional. Qualquer outro JSON invalido interrompe a preparacao. As versoes
divergentes da copia permanecem no backup, sem substituir a fonte original.

```powershell
$env:GCS_BUCKET = 'nome-do-bucket'
$env:ACHOUIMOB_COMPUTER_ID = 'identificador-do-computador'
node scripts\preparar-base-inicial-gcs.js identificador-do-backup
```

Uma interrupcao antes da confirmacao pode ser retomada com o mesmo backup:
objetos preparados sao reutilizados somente depois de verificar seus bytes.
O manifesto so e confirmado apos validar todos os originais. Uma versao
existente diferente nao e sobrescrita; repetir a mesma preparacao confere as
referencias e nao cria outra revisao. O comprovante em
`_migracao/backup-inicial.json` associa cada arquivo ao backup e sua geracao.
Uma falha de resposta apos a confirmacao exige verificar o estado antes de
tentar novamente. Se um processo for interrompido abruptamente, o lock expira
em ate 15 minutos, sujeito aos relogios dos computadores.

Esta versao e **preparacao, nao ativacao**. Nao executa raspagens nem publica
no Typesense e nao substitui os arquivos locais. Custos adicionais de
armazenamento e requisicoes podem ocorrer. A migracao dos consumidores,
classificacao definitiva, auditoria operacional e validacao dos dois
computadores continuam pendentes.

Para executar os testes locais:

```powershell
node --test src\infra\gcs\jsonStorage.test.js src\infra\gcs\initialBackup.test.js src\infra\gcs\transactionStore.test.js src\infra\gcs\operationalStore.test.js src\infra\gcs\prepareInitialData.test.js src\infra\gcs\pilotUniversal.test.js
```

Teste opcional no bucket privado, com objetos temporarios sob um escopo
aleatorio. Requer permissao para criar, ler, listar e excluir esses objetos.
O versionamento e a exclusao reversivel podem conservar geracoes de teste:

```powershell
$env:GCS_BUCKET = 'nome-do-bucket'
$env:GCS_INTEGRATION_TESTS = '1'
node --test src\infra\gcs\transactionStore.integration.test.js
```
