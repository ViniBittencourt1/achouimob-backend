import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Carrega a lista de bairros válidos do arquivo de bairros
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
let tiposList = [];
try {
  tiposList = JSON.parse(fs.readFileSync(tiposPath, 'utf8'));
} catch (e) {
  console.error('Erro ao carregar a lista de tipos:', e.message);
  tiposList = [];
}

function normalize(str) {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractBairro(localizacaoString) {
  if (!localizacaoString || !localizacaoString.includes("Juiz de Fora")) {
    return { bairroRaw: localizacaoString || "", bairro: (localizacaoString || "").toUpperCase() };
  }

  // Extrai o valor imediatamente anterior a ", Juiz de Fora" considerando vírgula ou hífen
  const idx = localizacaoString.lastIndexOf(", Juiz de Fora");
  if (idx === -1) {
    return { bairroRaw: localizacaoString, bairro: localizacaoString.toUpperCase() };
  }
  const beforeCidade = localizacaoString.substring(0, idx).trim();
  // Divide por vírgula e hífen, mantendo apenas valores não vazios
  const partes = beforeCidade.split(/,|-/).map(p => p.trim()).filter(Boolean);
  let bairroExtraido = partes.length > 0 ? partes[partes.length - 1] : '';
  if (!bairroExtraido) {
    bairroExtraido = beforeCidade.trim();
  }

  // Busca slug no JSON de tipos
  const normalizedBairro = normalize(bairroExtraido);
  for (const tipo of tiposList) {
    if (tipo.nome && normalizedBairro === normalize(tipo.nome)) {
      return { bairroRaw: bairroExtraido, bairro: tipo.slug || bairroExtraido };
    }
  }
  // Se não encontrou, retorna o valor extraído em maiúsculas
  return { bairroRaw: bairroExtraido, bairro: bairroExtraido.toUpperCase() };
}