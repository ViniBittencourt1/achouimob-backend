// backend/api/apiCard2.js
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Novo arquivo _card2.json
const jsonPath = join(__dirname, '..', 'crawler', '_card2.json');

// Salva total de documentos no JSON (imoveisDisponiveis)
export async function saveImoveisDisponiveis(cache) {
  try {
    // garante diretório
    const dir = join(__dirname, '..', 'crawler');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // calcula total de documentos
      let total = 0;
      for (const col of Object.keys(cache.collections)) {
        const colLength = cache.collections[col]?.length || 0;
        total += colLength;
      }

    // cria objeto para salvar
      const jsonData = { imoveisDisponiveis: total };

    // salva JSON
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`✔️ Total de imóveis disponíveis salvo em _card2.json: ${total}`);
  } catch (err) {
    console.error("❌ Erro ao salvar imoveisDisponiveis:", err.message);
  }
}

// Executa diretamente se rodar o arquivo sozinho
if (process.argv[1].endsWith('apiCard2.js')) {
  // Precisa de um cache de teste ou chamar do index-jf.js
  // Aqui apenas demonstra com zero para teste
  saveImoveisDisponiveis({ collections: {} });
}