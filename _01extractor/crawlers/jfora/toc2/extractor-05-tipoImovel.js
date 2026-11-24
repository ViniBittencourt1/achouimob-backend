import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');

let tiposList = [];
try {
  const data = JSON.parse(fs.readFileSync(tiposPath, 'utf8'));
  const tiposPorSlug = data?.tiposPorSlug && typeof data.tiposPorSlug === 'object' ? data.tiposPorSlug : {};
  tiposList = Object.values(tiposPorSlug)
    .flat()
    .filter((tipo) => tipo?.nome && tipo?.slug)
    .sort((a, b) => String(b.nome || '').length - String(a.nome || '').length);
} catch (e) {
  tiposList = [];
}

function normalizeText(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(html = '') {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractTituloText(cardHtml) {
  const match = String(cardHtml || '').match(/<h[23][^>]*class=["'][^"']*CardApartamentHorizontal_property_type[^"']*["'][^>]*>([\s\S]*?)<\/h[23]>/i);
  return match ? stripHtml(match[1]) : '';
}

// Busca o tipo de imóvel no título usando a lista centralizada de tipos.
export function extractTipoImovel(cardHtml, fallbackText = '') {
  const titulo = extractTituloText(cardHtml) || fallbackText;
  const tituloNormalizado = normalizeText(titulo);
  if (!tituloNormalizado || !tiposList.length) return '';

  const matches = [];
  for (const tipo of tiposList) {
    const nomeNormalizado = normalizeText(tipo.nome);
    if (!nomeNormalizado) continue;

    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(nomeNormalizado)}([^a-z0-9]|$)`, 'i');
    const match = regex.exec(tituloNormalizado);
    if (match) {
      matches.push({
        slug: tipo.slug,
        index: match.index + (match[1] ? match[1].length : 0),
        length: nomeNormalizado.length,
      });
    }
  }

  if (matches.length) {
    matches.sort((a, b) => a.index - b.index || b.length - a.length);
    return matches[0].slug;
  }

  return '';
}
