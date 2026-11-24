import fs from 'fs';
import path from 'path';
// import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Sincroniza uma lista de dormitórios de 0 a 30 para o Firestore na coleção '_brDormitorio'
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
async function syncDormitorios() {
	const snapshot = await db.collection('__imoveisPublicos').get();
	const dormitoriosSet = new Set();
	snapshot.docs.forEach(doc => {
		const n = Number(doc.data().dormitorioValor);
		if (!isNaN(n) && n > 0) dormitoriosSet.add(n);
	});
	const dormitorios = Array.from(dormitoriosSet).sort((a, b) => a - b);
	for (const dormitorio of dormitorios) {
		await db.collection('_dormitoriosUnicos').doc(String(dormitorio)).set({
			valor: dormitorio
		}, { merge: true });
		console.log(`Dormitório sincronizado: ${dormitorio}`);
	}
	console.log('Sincronização de _dormitoriosUnicos concluída!');
}

syncDormitorios().catch(err => {
	console.error('Erro ao sincronizar _dormitoriosUnicos:', err);
	process.exit(1);
});
