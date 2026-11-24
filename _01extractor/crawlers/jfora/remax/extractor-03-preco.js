import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
// extractor-03-preco.js
function extractPrecoBase($card, negociacao) {
  const precoEl = $card.find(".card-first-price").first();
  if (!precoEl.length) return 0;

  if (negociacao === "locacao") {
    const match = precoEl.text().match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
    return match ? Number(`${match[1].replace(/\./g, "")}.${match[2] ?? "0"}`) : null;
  }

  try {
    // Remove R$, espaços, pontos e vírgulas, retorna apenas os dígitos
    let precoStr = precoEl.text().replace(/R\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(/,/g, "");
    precoStr = precoStr.replace(/\D/g, "");
    return precoStr === '' ? 0 : parseFloat(precoStr) || 0;
  } catch {
    return 0;
  }
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
