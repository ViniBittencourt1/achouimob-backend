// Orquestrador para enviar todos os filtros ao Firestore
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const scripts = [
	'01TipoImovel.js',
	'02Cidade.js',
	'03Bairro.js',
	'04Dormitorio.js',
	'05Banheiro.js',
	'06Vaga.js'
];

async function runScript(script) {
	return new Promise((resolve, reject) => {
		const scriptPath = path.join(__dirname, script);
		const proc = spawn('node', [scriptPath], { stdio: 'inherit' });
		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Script ${script} saiu com código ${code}`));
			}
		});
	});
}

(async () => {
	for (const script of scripts) {
		console.log(`Executando: ${script}`);
		try {
			await runScript(script);
		} catch (err) {
			console.error(err.message);
			process.exit(1);
		}
	}
	console.log('Todos os filtros enviados ao Firestore!');
})();
