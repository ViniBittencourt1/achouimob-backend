import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';

// Preco vem da API Tecimob como texto (ex.: "R$690.000,00"); sem valor numerico retorna 0.
function extractPrecoBase(precoTexto) {
  const match = String(precoTexto ?? '').match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/);
  return match ? Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`) : 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
