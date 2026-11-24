import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');

function normalizeText(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadBairrosList() {
  try {
    const data = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function findBairroSlug(bairroNome, bairrosList, cidade = '') {
  const bairroNormalizado = normalizeText(bairroNome);
  const cidadeSlug = String(cidade || '').trim();
  if (!bairroNormalizado) return '';

  const candidatos = cidadeSlug
    ? bairrosList.filter((item) => String(item?.cidade || '').trim() === cidadeSlug)
    : bairrosList;

  for (const item of candidatos) {
    const nomeNormalizado = normalizeText(item?.nome);
    if (nomeNormalizado && bairroNormalizado === nomeNormalizado) {
      return item.slug || item.nome;
    }
  }

  for (const item of candidatos) {
    const slugNormalizado = normalizeText(item?.slug);
    if (slugNormalizado && bairroNormalizado === slugNormalizado) {
      return item.slug || item.nome;
    }
  }

  return '';
}

// Extrai o bairro do campo localizacao de um card HTML, aplica regra e busca slug no _jfBairros.json
export function extractBairro(cardHtml, cidade = '') {
  const dom = new JSDOM(cardHtml);
  const linkTexto = String(cardHtml || '');
  const linkMatch = linkTexto.match(/\/imovel\/[^'"\s]*--([a-z0-9_-]+)--juiz-de-fora-mg--/i)
    || linkTexto.match(/\/imovel\/[^'"\s]*--([a-z0-9_-]+)--juiz-de-fora--/i);
  if (linkMatch?.[1]) {
    return linkMatch[1].replace(/_/g, '-');
  }

  const divLoc = dom.window.document.querySelector('div.imovel-item--localizacao');
  if (!divLoc) return '';
  let localizacao = divLoc.textContent.trim();
  const localizacaoNorm = localizacao.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const match = localizacaoNorm.match(/bairro\s*([^,]*)/i);
  let resultado = '';
  if (match && match[1]) {
    resultado = match[1].trim();
  } else {
    resultado = localizacao.split(',')[0].trim();
  }

  const bairrosList = loadBairrosList();
  if (!bairrosList.length) {
    return resultado.toUpperCase();
  }

  const bairroSlug = findBairroSlug(resultado, bairrosList, cidade) || findBairroSlug(resultado, bairrosList);
  if (bairroSlug) return bairroSlug;

  return resultado.toUpperCase();
}
