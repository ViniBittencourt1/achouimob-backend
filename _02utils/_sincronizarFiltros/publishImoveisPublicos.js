import { getFirestore } from 'firebase-admin/firestore';
import { replicarParaImoveisPublicos } from './__imoveisPublicos.js';
import '../../_01extractor/services/firebase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPLICACAO_CONCURRENCY = 30;
const LOG_PROGRESS_STEP = 500;

function isQuotaExceededError(error) {
  const message = String(error?.message || error?.details || '');
  const code = Number(error?.code ?? error?.status ?? 0);
  return code === 8 || /quota exceeded|resource_exhausted/i.test(message);
}

async function firestoreDisponivelParaLeitura(db, colecoes) {
  for (const collectionName of colecoes) {
    try {
      await db.collection(collectionName).limit(1).get();
    } catch (error) {
      if (isQuotaExceededError(error)) {
        console.warn(`[PUBLICACAO] Quota do Firestore excedida ao verificar ${collectionName}. Publicação adiada; __imoveisPublicos foi preservada.`);
        return false;
      }
      throw error;
    }
  }

  return true;
}

async function limparColecao(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`[PUBLICACAO] Coleção ${collectionName} já estava vazia.`);
    return;
  }

  const batchSize = 400;
  let apagados = 0;

  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db.batch();
    const docs = snapshot.docs.slice(i, i + batchSize);
    docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    apagados += docs.length;
    console.log(`[PUBLICACAO] Limpando ${collectionName}: ${apagados}/${snapshot.docs.length}`);
  }
}

async function copiarColecao(db, origem, destino) {
  const snapshot = await db.collection(origem).get();
  await limparColecao(db, destino);
  const batchSize = 400;

  for (let index = 0; index < snapshot.docs.length; index += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + batchSize).forEach((doc) => batch.set(db.collection(destino).doc(doc.id), doc.data()));
    await batch.commit();
  }

  console.log(`[PUBLICACAO] Backup ${destino} concluído: ${snapshot.size} imóvel(is).`);
}

function descobrirColecoesJfora() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const jforaRoot = path.join(__dirname, '..', '..', '_01extractor', 'crawlers', 'jfora');

  const entradas = fs
    .readdirSync(jforaRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'));

  const colecoes = new Set();

  for (const entrada of entradas) {
    const indexPath = path.join(jforaRoot, entrada.name, 'index.js');
    if (!fs.existsSync(indexPath)) continue;

    const source = fs.readFileSync(indexPath, 'utf8');
    const match = source.match(/const\s+COLLECTION_NAME\s*=\s*"([^"]+)"/);
    if (match && match[1]) {
      colecoes.add(match[1]);
    }
  }

  return Array.from(colecoes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function publicarImoveisPublicos() {
  const db = getFirestore();
  const colecoes = descobrirColecoesJfora();

  if (colecoes.length === 0) {
    throw new Error('Nenhuma coleção jfora encontrada para publicação.');
  }

  console.log(`Coleções jfora detectadas para publicação: ${colecoes.length}`);

  if (!(await firestoreDisponivelParaLeitura(db, colecoes))) {
    console.log('[PUBLICACAO] Nenhuma alteração foi aplicada nesta rodada.');
    return;
  }

  await copiarColecao(db, '__imoveisPublicos', '__imoveisPublicos__backup');
  console.log('[PUBLICACAO] Limpando __imoveisPublicos antes de reconstruir a base sem duplicidades...');
  await limparColecao(db, '__imoveisPublicos');

  let totalReplicados = 0;
  let totalErros = 0;
  let totalSemLinkReal = 0;

  for (const col of colecoes) {
    console.log(`Lendo coleção: ${col}`);
    let snapshot;
    try {
      snapshot = await db.collection(col).get();
    } catch (error) {
      if (isQuotaExceededError(error)) {
        console.warn(`[PUBLICACAO] Quota excedida ao ler ${col}. Publicação interrompida nesta rodada.`);
        return;
      }
      throw error;
    }

    if (snapshot.empty) {
      console.log(`[PUBLICACAO] Coleção ${col} sem registros.`);
      continue;
    }

    const docs = snapshot.docs;
    let processed = 0;
    let replicatedInCollection = 0;
    let errorsInCollection = 0;
    let semLinkRealInCollection = 0;
    let cursor = 0;

    async function worker() {
      while (cursor < docs.length) {
        const index = cursor;
        cursor += 1;
        const doc = docs[index];
        const imovel = doc.data();
        imovel.id = doc.id;

        const linkReal = String(imovel.linkReal || '').trim();
        if (!linkReal) {
          totalSemLinkReal++;
          semLinkRealInCollection++;
          processed++;
          if (processed % LOG_PROGRESS_STEP === 0 || processed === docs.length) {
            console.log(`[PUBLICACAO] ${col}: ${processed}/${docs.length} processados.`);
          }
          continue;
        }

        try {
          await replicarParaImoveisPublicos(imovel, col);
          totalReplicados++;
          replicatedInCollection++;
        } catch (err) {
          totalErros++;
          errorsInCollection++;
          console.error(`Erro ao replicar imóvel ${doc.id} da coleção ${col}:`, err.message);
        }

        processed++;
        if (processed % LOG_PROGRESS_STEP === 0 || processed === docs.length) {
          console.log(`[PUBLICACAO] ${col}: ${processed}/${docs.length} processados.`);
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(REPLICACAO_CONCURRENCY, docs.length) },
      () => worker()
    );

    await Promise.all(workers);
    console.log(
      `[PUBLICACAO] ${col} finalizada. Replicados: ${replicatedInCollection}, Sem linkReal: ${semLinkRealInCollection}, Erros: ${errorsInCollection}, Total: ${docs.length}`
    );
  }
  console.log(`Publicação concluída. Total de imóveis replicados: ${totalReplicados}. Sem linkReal: ${totalSemLinkReal}. Erros: ${totalErros}`);
}

// Executa o script
publicarImoveisPublicos()
  .then(() => process.exit(0))
  .catch(err => {
    if (isQuotaExceededError(err)) {
      console.warn('[PUBLICACAO] Quota do Firestore excedida. Publicação adiada sem derrubar a rodada.');
      process.exit(0);
    }
    console.error('Erro geral na publicação:', err);
    process.exit(1);
  });
