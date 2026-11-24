import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Sincroniza uma lista de banheiros de 0 a 30 para o Firestore na coleção '_brBanheiro'
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
async function syncBanheiros() {
	const snapshot = await db.collection('__imoveisPublicos').get();
	const banheirosSet = new Set();
	snapshot.docs.forEach(doc => {
		const n = Number(doc.data().banheiroValor);
		if (!isNaN(n) && n > 0) banheirosSet.add(n);
	});
	const banheiros = Array.from(banheirosSet).sort((a, b) => a - b);
	for (const banheiro of banheiros) {
		await db.collection('_banheirosUnicos').doc(String(banheiro)).set({
			valor: banheiro
		}, { merge: true });
		console.log(`Banheiro sincronizado: ${banheiro}`);
	}
	console.log('Sincronização de _banheirosUnicos concluída!');
}

syncBanheiros().catch(err => {
	console.error('Erro ao sincronizar _banheirosUnicos:', err);
	process.exit(1);
});
