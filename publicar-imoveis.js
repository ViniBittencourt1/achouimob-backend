import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import profiles from './publication-profiles.cjs';
import configuration from './publication-config.cjs';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const args = process.argv.slice(2);
const stages = args.filter(arg => arg.startsWith('--etapa='));
if (stages.length > 1) throw new Error('Informe somente uma etapa.');
const stage = stages[0]?.slice('--etapa='.length) || 'completo';
if (!['firestore', 'typesense', 'completo'].includes(stage)) throw new Error('Etapa invalida: use firestore, typesense ou completo.');
const publicationArgs = args.filter(arg => !arg.startsWith('--etapa='));
const options = profiles.publicationArguments(publicationArgs);
if (options.origem === 'json' && stage !== 'typesense') throw new Error('Origem JSON direto disponivel somente para a etapa Typesense.');
const publicationEnv = configuration.publicationEnvironment(root);
if (stage === 'typesense' && options.collections.length) throw new Error('O envio Typesense usa o perfil completo, nao projetos selecionados.');
if (stage !== 'firestore') {
  profiles.typesenseSource(options.profile, publicationEnv);
  try { configuration.validatePublicationConfiguration(options.profile, stage, options.dryRun, publicationEnv); }
  catch (error) { console.error(`[PUBLICACAO][CONFIGURACAO] ${error.message}`); process.exit(1); }
}
const jobs = [];
if (stage !== 'typesense') jobs.push(['publish-crawler-json.js', ...publicationArgs, ...(!options.collections.length && !options.todos ? ['--todos'] : [])]);
if (stage !== 'firestore') jobs.push(['_02utils/typesense/migrateImoveisToTypesense.cjs', `--tipo=${options.profile.tipo}`, ...(options.origem === 'json' ? ['--origem=json'] : []), ...(options.dryRun ? ['--dry-run'] : []), ...(options.allowEmpty ? ['--allow-empty'] : [])]);

for (const job of jobs) {
  console.log(`ETAPA=${job[0].includes('migrate') ? 'typesense' : 'firestore'} TIPO=${options.profile.tipo}`);
  const code = await new Promise((resolve, reject) => {
    const env = { ...publicationEnv };
    if (stage === 'completo' && job[0].includes('migrate')) env.TYPESENSE_SOURCE_COLLECTION = options.profile.firestore;
    const child = spawn(process.execPath, job, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) { process.exitCode = code || 1; break; }
}