import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';


// Extrai o preço do imóvel do cardHtml, pegando o conteúdo de <span class="hasTooltip">
function extractPrecoBase(cardHtml) {
    if (!cardHtml || typeof cardHtml !== 'string') return 0;
    // Extrai todos os <span class="hasTooltip">...</span>
    const spanRegex = /<span[^>]*class\s*=\s*(["'])hasTooltip\1[^>]*>([\s\S]*?)<\/span>/gi;
    let match;
    let foundMes = false;
    let preco = 0;
    while ((match = spanRegex.exec(cardHtml)) !== null) {
        let precoStr = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (/\/m[eê]s/i.test(precoStr)) {
            // Encontrou valor de aluguel, ignora e marca para pegar o próximo
            foundMes = true;
            continue;
        }
        // Se já encontrou /mês, pega o próximo valor
        if (foundMes || spanRegex.lastIndex === match.index + match[0].length) {
            // Extrai apenas os números
            const numeros = precoStr.match(/\d+/g);
            if (numeros && numeros.length > 0) {
                let precoFull = numeros.join('');
                if (precoFull.length > 2) {
                    preco = parseInt(precoFull.slice(0, -2), 10);
                } else {
                    preco = parseInt(precoFull, 10);
                }
                break;
            }
        }
    }
    return preco;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
