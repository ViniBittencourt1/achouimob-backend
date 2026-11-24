import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
import { JSDOM } from 'jsdom';
import { normalizarBairro } from '../_utils/bairroCatalogo.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
const bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));

function extrairBairroDoLink(linkReal, cidade) {
  const link = String(linkReal || '').toLowerCase();
  const cidadeNoLink = normalizarBairro(cidade).replace(/ mg$/, '').replace(/ /g, '-');
  if (!link || !cidadeNoLink) return '';

  const bairroNoLink = link.match(new RegExp(`-(?:a-venda|venda-e-aluguel|para-venda-e-aluguel)-([a-z0-9-]+)-${cidadeNoLink}(?:/[^/]+)?/?$`, 'i'))?.[1];
  if (!bairroNoLink) return '';

  const bairroNormalizado = normalizarBairro(bairroNoLink);
  return bairrosList.find((bairro) =>
    normalizarBairro(bairro?.cidade) === normalizarBairro(cidade) &&
    (normalizarBairro(bairro?.nome) === bairroNormalizado || normalizarBairro(bairro?.slug) === bairroNormalizado)
  )?.slug || '';
}

// Extrai o campo bairro de um card HTML e valida com a lista de bairros
// cardHtml: string (HTML do card)
export function extractBairro(cardHtml, cidade = '', linkReal = '') {
  if (!cardHtml || typeof cardHtml !== 'string') return '';

  const bairroDoLink = extrairBairroDoLink(linkReal, cidade);
  if (bairroDoLink) return bairroDoLink;

  const dom = new JSDOM(cardHtml);
  const f = dom.window.document.querySelector('f.ng-binding.ng-scope');
  if (!f) return '';

  // Extrai o texto antes da vírgula
  const texto = f.textContent.trim();
  let bairroExtraido = texto.split(',')[0].trim();

  if (!bairroExtraido) return '';

  return resolverBairroCatalogo(bairroExtraido, cidade) || bairroExtraido.toUpperCase();
}

// Export alternativo para compatibilidade com imports antigos
export const extractBairroFromTitulo = extractBairro;
