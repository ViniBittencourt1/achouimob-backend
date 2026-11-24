// backend/scripts/syncTiposImovel.js
// Script para sincronizar tipos de imóvel do arquivo JSON para o Firestore

import fs from 'fs';
import path from 'path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializa Firebase Admin
initializeApp({
  credential: applicationDefault(),
});
const db = getFirestore();

// Caminho do arquivo JSON
const tiposPath = path.join(__dirname, '../crawler/_brTipoImovel.json');

// Lê e parseia o JSON
const tiposRaw = fs.readFileSync(tiposPath, 'utf-8');
const tipos = JSON.parse(tiposRaw);

async function syncTipos() {
  if (!Array.isArray(tipos)) {
    console.error('O arquivo _brTipoImovel.json deve ser um array de tipos!');
    process.exit(1);
  }
  for (const tipo of tipos) {
    if (!tipo || !tipo.nome) continue;
    // Usa o nome como ID do documento (normalizado)
    const docId = tipo.nome.toLowerCase().replace(/\s+/g, '_');
    await db.collection('tiposImovel').doc(docId).set({
      nome: tipo.nome,
      ...tipo
    }, { merge: true });
    console.log(`Tipo sincronizado: ${tipo.nome}`);
  }
  console.log('Sincronização de tiposImovel concluída!');
}

syncTipos().catch(err => {
  console.error('Erro ao sincronizar tiposImovel:', err);
  process.exit(1);
});
