import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { arquivoPrincipalVendas } from "./_01extractor/crawlers/jfora/_utils/vendasSincronizacao.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const crawlerDir = path.join(__dirname, "crawler");
const serviceAccountPath = path.join(__dirname, "credentials", "firebase-key.json");
const require = createRequire(import.meta.url);
const { formatarNomeRemax } = require('./formatarNomeRemax.cjs');
const { projectImovelForTypesense } = require("./_02utils/typesense/projectImovelForTypesense.cjs");
const { publicationArguments } = require('./publication-profiles.cjs');
const { projetoSuspenso } = require('./crawler-order.cjs');
const BATCH_SIZE = 400;

function publicId(linkReal) {
  return crypto.createHash("sha1").update(String(linkReal).trim()).digest("hex");
}

function identidadeAluguel(collectionName, record) {
  return ['rioluciene', 'riofr'].includes(String(collectionName).toLowerCase())
    ? String(record.linkReal || '').trim()
    : record.codigoBase || record.linkReal || '';
}

function isDataExclusaoVazia(record) {
  const raw = String(record?.dataExclusao ?? "").trim();
  return !raw || raw === "0";
}

async function commitOperations(db, operations, onProgress, progressBase = 0) {
  let committed = 0;
  for (let index = 0; index < operations.length; index += BATCH_SIZE) {
    const batch = db.batch();
    operations.slice(index, index + BATCH_SIZE).forEach((operation) => operation(batch));
    await batch.commit();
    committed += Math.min(BATCH_SIZE, operations.length - index);
    onProgress?.(progressBase + committed);
  }
}

// Mesmos documentos gravados em __imoveisPublicos/__alugueisPublicos; usado tambem no envio direto JSON -> Typesense.
export function buildPublicDocs(recordsByCollection, profile, replicatedAt = new Date().toISOString()) {
  const docs = [];
  for (const [collectionName, records] of recordsByCollection) {
    for (const record of records) {
      const linkReal = String(record.linkReal || "").trim();
      if (!linkReal) continue;
      const id = publicId(profile.tipo === 'vendas' ? linkReal : `${collectionName}|${identidadeAluguel(collectionName, record)}`);
      docs.push({
        id,
        data: {
          ...record,
          ...(Object.hasOwn(record, 'corretor') ? { corretor: formatarNomeRemax(record.corretor) } : {}),
          id,
          sourceDocId: String(record.id || ""),
          imobiliariaId: collectionName,
          negociacao: profile.negociacao,
          ativo: true,
          replicatedAt,
        },
      });
    }
  }
  return [...new Map(docs.map(doc => [doc.id, doc])).values()];
}

export async function replacePublicCollection(db, recordsByCollection, profile, { replaceAll = false } = {}) {
  const currentSnapshot = await db.collection(profile.firestore).get();
  const backupSnapshot = await db.collection(profile.backup).get();
  const backupOperations = [
    ...backupSnapshot.docs.map((doc) => (batch) => batch.delete(doc.ref)),
    ...currentSnapshot.docs.map((doc) => (batch) => batch.set(db.collection(profile.backup).doc(doc.id), doc.data())),
  ];

  const selected = new Set(recordsByCollection.keys());
  const docs = buildPublicDocs(recordsByCollection, profile);
  const publishedIds = new Set(docs.map(doc => doc.id));
  const replaceOperations = docs.map(doc => (batch) => batch.set(db.collection(profile.firestore).doc(doc.id), doc.data));
  const total = docs.length;
  const removedOperations = currentSnapshot.docs.filter(doc => (replaceAll || selected.has(doc.data().imobiliariaId)) && !publishedIds.has(doc.id)).map(doc => batch => batch.delete(doc.ref));
  const operationTotal = backupOperations.length + replaceOperations.length + removedOperations.length;
  const reportProgress = (completed) => {
    console.log(`FIRESTORE_PUBLISH_RECORD_PROGRESS=${completed}/${operationTotal}`);
  };
  await commitOperations(db, backupOperations, reportProgress);
  await commitOperations(db, replaceOperations, reportProgress, backupOperations.length);
  await commitOperations(db, removedOperations, reportProgress, backupOperations.length + replaceOperations.length);
  return { previousCount: currentSnapshot.size, total };
}

export function loadPublicationRecords(collectionNames, profile, directory = crawlerDir) {
  const recordsByCollection = new Map();
  for (const collectionName of collectionNames) {
    if (projetoSuspenso(collectionName)) throw new Error(`Projeto ${collectionName} suspenso; publicacao bloqueada.`);
    const jsonPath = path.join(directory, `${collectionName}${profile.jsonSuffix}`);
    if (!fs.existsSync(jsonPath)) throw new Error(`JSON não encontrado: ${jsonPath}`);
    const records = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(records)) throw new Error(`O arquivo ${collectionName}.json não contém uma lista de imóveis.`);
    const active = records.filter((record) => record && typeof record === 'object' && isDataExclusaoVazia(record) && record.ativo !== false);
    if (active.some(record => record.negociacao && record.negociacao !== profile.negociacao)) throw new Error(`Negociacao incompativel com o perfil ${profile.tipo}: ${collectionName}.`);
    if (profile.tipo === 'alugueis' && active.some(record => !String(record.linkReal || '').trim() || (record.preco !== null && !Number.isFinite(record.preco)))) throw new Error(`Dados de aluguel invalidos em ${jsonPath}.`);
    if (profile.tipo === 'alugueis' && new Set(active.map(record => String(identidadeAluguel(collectionName, record)).trim())).size !== active.length) throw new Error(`Alugueis duplicados em ${jsonPath}.`);
    recordsByCollection.set(collectionName, active.filter(record => String(record.linkReal || '').trim()).map(record => profile.tipo === 'vendas' ? projectImovelForTypesense(record, record.id, collectionName) : { ...record }));
  }
  return recordsByCollection;
}

export async function discoverCollections(profile, directory = crawlerDir) {
  if (profile.tipo === 'alugueis') {
    const { listarProjetosAlugueis } = await import('./_01extractor/crawlers/jfora/_1Jf/alugueis-model.js');
    return listarProjetosAlugueis(JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).scripts).map(project => project.collection);
  }
  return fs.readdirSync(directory).filter(arquivoPrincipalVendas)
    .map(file => path.basename(file, ".json")).filter(name => !projetoSuspenso(name)).sort();
}

export async function main(args = process.argv.slice(2)) {
  const options = publicationArguments(args);
  const profile = options.profile;
  const collectionNames = options.todos ? await discoverCollections(profile) : options.collections;
  if (!collectionNames.length) throw new Error('Selecione projetos jf..., nit... ou uba... ou use --todos.');
  if (options.todos && options.collections.length) throw new Error('Use --todos ou projetos selecionados, nao ambos.');
  const recordsByCollection = loadPublicationRecords(collectionNames, profile);
  const docs = buildPublicDocs(recordsByCollection, profile);
  const total = docs.length;
  console.log(`PUBLICACAO_TIPO=${profile.tipo} FIRESTORE=${profile.firestore} BACKUP=${profile.backup} TYPESENSE=${profile.typesense}`);
  console.log(`PUBLICACAO_PLANO=${JSON.stringify({ tipo: profile.tipo, firestore: profile.firestore, typesense: profile.typesense, projetos: [...recordsByCollection].map(([imobiliaria, records]) => ({ imobiliaria, ativos: docs.filter(doc => doc.data.imobiliariaId === imobiliaria).length, ocorrencias: records.length })), total, substituicao: options.todos ? 'integral' : 'somente projetos selecionados' })}`);
  if (options.dryRun) return;
  if (!total && !options.allowEmpty) throw new Error('Publicacao vazia bloqueada. Confira o plano e use --allow-empty para confirmar limpeza.');

  if (!getApps().length) initializeApp({ credential: cert(serviceAccountPath) });
  const db = getFirestore();
  console.log(`FIRESTORE_PUBLISH_PROGRESS=0/${collectionNames.length};Preparando;iniciando`);
  const result = await replacePublicCollection(db, recordsByCollection, profile, { replaceAll: options.todos });
  collectionNames.forEach((collectionName, index) => {
    console.log(`FIRESTORE_PUBLISH_PROGRESS=${index + 1}/${collectionNames.length};${collectionName};concluido`);
  });
  console.log(`FIRESTORE_BACKUP=${profile.backup} DOCS=${result.previousCount}`);
  console.log(`FIRESTORE_REPLACED=${profile.firestore} DOCS=${result.total}`);
  console.log(`FIRESTORE_PUBLISH_TOTAL=${result.total}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`Erro geral na publicação: ${error.message}`);
  process.exitCode = 1;
});
