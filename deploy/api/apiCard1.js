// backend/api/apiCard1.js
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const jsonPath = join(__dirname, '..', 'crawler', '_cards.json'); // agora usa o mesmo arquivo gerado pelo extractorCard1

// Carrega Card1 e retorna array
export async function loadCard1() {
  try {
    let jsonData = {};
    if (fs.existsSync(jsonPath)) {
      const fileData = fs.readFileSync(jsonPath, 'utf-8');
      if (fileData.trim()) jsonData = JSON.parse(fileData);
    }

    let cards = [];
    if (Array.isArray(jsonData)) {
      cards = jsonData;           // JSON é array
    } else if (jsonData.Card1) {
      cards = jsonData.Card1;     // JSON é objeto com Card1
    }

    if (cards.length > 0)
      console.log(`✔️ Coleção 'Card1' carregado com sucesso (${cards.length} registros)`);
    else
      console.log("⚠️ Coleção 'Card1' vazia");

    return cards;
  } catch (err) {
    console.error("❌ Erro ao carregar Card1:", err.message);
    return [];
  }
}

// Função de salvamento desabilitada por política: não é permitido gravar em _cards.json
export async function saveCard1(cards) {
  console.warn('⚠️ Salvamento em _cards.json está desabilitado por política do projeto. Nenhum dado foi gravado.');
}