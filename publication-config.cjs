const fs = require('node:fs');
const dotenv = require('dotenv');
const { localPath } = require('./backend-paths.cjs');

function publicationEnvironment(root, env = process.env) {
  const values = {};
  for (const file of [localPath(root, '.env')]) {
    if (fs.existsSync(file)) Object.assign(values, dotenv.parse(fs.readFileSync(file)));
  }
  return { ...values, ...Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)) };
}

function typesenseConfigurationStatus(env) {
  const configured = typeof env.TYPESENSE_API_KEY === 'string' && env.TYPESENSE_API_KEY.trim().length > 0;
  return { configured, message: configured ? 'Typesense configurado.' : 'Typesense nao configurado: defina TYPESENSE_API_KEY no ambiente ou em backend/.env. A etapa Firestore continua disponivel.' };
}

function validatePublicationConfiguration(profile, stage, dryRun, env) {
  if (!dryRun && stage !== 'firestore' && profile.tipo === 'alugueis' && !typesenseConfigurationStatus(env).configured) throw new Error(typesenseConfigurationStatus(env).message);
}

module.exports = { publicationEnvironment, typesenseConfigurationStatus, validatePublicationConfiguration };