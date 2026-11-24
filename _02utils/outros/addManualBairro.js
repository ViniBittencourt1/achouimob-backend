import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../backend-paths.cjs';
// utils/addManualBairro.js
// Endpoint e função utilitária para adicionar bairros manuais ao Firebase, JSON e Sheets

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { uploadBairrosSheetsFirebase } from './uploadBairrosSheetsFirebase.js';

// Caminho do JSON de bairros
const bairrosPath = path.resolve(ISOLATED_BACKEND_ROOT, 'crawler', '_jfBairros.json');

// Inicializa o Firebase se necessário
if (!admin.apps.length) {
  const serviceAccountPath = path.resolve(ISOLATED_BACKEND_ROOT, 'credentials', 'firebase-key.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

/**
 * Adiciona um bairro manualmente ao Firebase, JSON e Sheets
 * @param {Object} bairro { nome: string, cidade: string }
 */
export async function addManualBairro(bairro) {
  if (!bairro.nome || !bairro.cidade) throw new Error('Bairro precisa de nome e cidade');
  // 1. Atualiza/inclui no JSON
  let bairros = [];
  if (fs.existsSync(bairrosPath)) {
    bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
  }
  // Verifica duplicidade
  const exists = bairros.some(b => b.nome.toLowerCase() === bairro.nome.toLowerCase() && b.cidade.toLowerCase() === bairro.cidade.toLowerCase());
  if (!exists) {
    bairros.push(bairro);
    fs.writeFileSync(bairrosPath, JSON.stringify(bairros, null, 2));
  }
  // 2. Atualiza/inclui no Firebase
  const docId = `${bairro.nome.replace(/\s+/g, '_').toLowerCase()}_${bairro.cidade.replace(/\s+/g, '_').toLowerCase()}`;
  await db.collection('jfBairros').doc(docId).set(bairro, { merge: true });
  // 3. Exporta para Sheets
  await uploadBairrosSheetsFirebase();
  return bairro;
}

// Exemplo de uso CLI
// Checagem para execução direta em ES module
const isDirect = process.argv[1] && (process.argv[1].endsWith('addManualBairro.js') || process.argv[1].endsWith('addManualBairro.mjs'));
if (isDirect) {
  const [,, nome, cidade] = process.argv;
  if (!nome || !cidade) {
    console.log('Uso: node utils/addManualBairro.js "Nome do Bairro" "Cidade"');
    process.exit(1);
  }
  addManualBairro({ nome, cidade })
    .then(() => console.log('Bairro adicionado com sucesso!'))
    .catch(err => console.error('Erro:', err.message));
}
