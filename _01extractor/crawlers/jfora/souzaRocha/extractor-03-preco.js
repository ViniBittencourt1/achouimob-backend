import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
// Extrai o preço do imóvel do cardHtml, priorizando <ins class="property-current-price">, senão busca em <p class="price">
function extractPrecoBase(cardHtml) {
    if (!cardHtml || typeof cardHtml !== 'string') return 0;
    // Extrai o valor do <ins class="property-current-price">...</ins>
    const match = cardHtml.match(/<ins[^>]*class\s*=\s*(["'])property-current-price\1[^>]*>([\s\S]*?)<\/ins>/i);
    if (match) {
        let precoStr = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const valorVenda = precoStr.match(/R\$\s*([\d.,]+)/i);
        if (valorVenda) return Number(valorVenda[1].replace(/\./g, '').replace(',', '.'));
        // Extrai apenas os números
        const numeros = precoStr.match(/\d+/g);
        if (numeros && numeros.length > 0) {
            let precoFull = numeros.join('');
            if (precoFull.length > 2) {
                return parseInt(precoFull, 10);
            } else {
                return parseInt(precoFull, 10);
            }
        }
    }
    // Se não encontrou, tenta buscar em <p class="price">
    const matchPrice = cardHtml.match(/<p[^>]*class\s*=\s*(["'])price\1[^>]*>([\s\S]*?)<\/p>/i);
    if (matchPrice) {
        let precoStr = matchPrice[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const valorVenda = precoStr.match(/R\$\s*([\d.,]+)/i);
        if (valorVenda) return Number(valorVenda[1].replace(/\./g, '').replace(',', '.'));
        const numeros = precoStr.match(/\d+/g);
        if (numeros && numeros.length > 0) {
            let precoFull = numeros.join('');
            if (precoFull.length > 2) {
                return parseInt(precoFull, 10);
            } else {
                return parseInt(precoFull, 10);
            }
        }
    }
    return 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
