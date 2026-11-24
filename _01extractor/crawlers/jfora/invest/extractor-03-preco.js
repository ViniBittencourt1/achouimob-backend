import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
// extractor-03-preco.js
function extractPrecoBase(cardNode) {
  const precoTxt = cardNode.find(".footer").text() || "";
  // Extrai o valor usando regex para capturar o padrão brasileiro (ex: 800.000,00)
  const match = precoTxt.match(/([0-9\.]+),(\d{2})/);
  if (match) {
    // Remove pontos dos milhares e converte para float
    const valor = parseFloat(match[1].replace(/\./g, "") + "." + match[2]);
    return Math.round(valor);
  }
  // Fallback: se não encontrar padrão com vírgula, tenta só números
  const numeros = precoTxt.replace(/[^0-9]/g, "");
  if (numeros.length > 2) {
    // Remove os dois últimos dígitos (centavos)
    return parseInt(numeros.slice(0, -2), 10);
  }
  return 0;
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
