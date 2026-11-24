import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Sincroniza uma lista de vagas de 0 a 30 para o Firestore na coleção '_brVaga'
import { initializeApp, cert } from 'firebase-admin/app';
const serviceAccount = JSON.parse(
	fs.readFileSync(path.join(__dirname, '../../credentials/firebase-key.json'), 'utf-8')
);
import { getFirestore } from 'firebase-admin/firestore';

// Inicializa Firebase Admin
initializeApp({
	credential: cert(serviceAccount),
});
const db = getFirestore();

// ...existing code...
async function syncVagas() {
	const snapshot = await db.collection('__imoveisPublicos').get();
	const vagasSet = new Set();
	snapshot.docs.forEach(doc => {
		const n = Number(doc.data().garagemValor);
		if (!isNaN(n) && n > 0) vagasSet.add(n);
	});
	const vagas = Array.from(vagasSet).sort((a, b) => a - b);
	for (const vaga of vagas) {
		await db.collection('_vagasUnicas').doc(String(vaga)).set({
			valor: vaga
		}, { merge: true });
		console.log(`Vaga sincronizada: ${vaga}`);
	}
	console.log('Sincronização de _vagasUnicas concluída!');
}

syncVagas().catch(err => {
	console.error('Erro ao sincronizar _vagasUnicas:', err);
	process.exit(1);
});
