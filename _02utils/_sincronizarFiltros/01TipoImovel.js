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
async function syncTiposImoveis() {
	const snapshot = await db.collection('__imoveisPublicos').get();
	const tiposSet = new Set();
	snapshot.docs.forEach(doc => {
		const nome = doc.data().tipoImovel;
		if (typeof nome === 'string' && nome.trim()) tiposSet.add(nome.trim());
	});
	const tiposImovel = Array.from(tiposSet).sort();
	for (const tipo of tiposImovel) {
		await db.collection('_tiposImoveisUnicos').doc(tipo).set({
			valor: tipo
		}, { merge: true });
		console.log(`Tipo de imóvel sincronizado: ${tipo}`);
	}
	console.log('Sincronização de _tiposImoveisUnicos concluída!');
}

syncTiposImoveis().catch(err => {
	console.error('Erro ao sincronizar _tiposImoveisUnicos:', err);
	process.exit(1);
});
