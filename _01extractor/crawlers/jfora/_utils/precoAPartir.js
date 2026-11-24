const LIMITE_PRECO = 10_000_000;
const A_PARTIR = /a\s+partir\s*(?:de|:)?\s*:?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?![\d/:])/gi;

function textoDaFonte(fonte) {
  if (typeof fonte === 'string') return fonte.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ');
  if (fonte && typeof fonte.text === 'function') return fonte.text();
  return '';
}

function precoValido(preco) {
  const valor = typeof preco === 'number' ? preco : Number(preco);
  return Number.isFinite(valor) && valor > 0 && valor <= LIMITE_PRECO;
}

// Preco zerado ou acima de 10 milhoes: usa o valor logo apos "a partir (de)" no texto do card.
export function aplicarPrecoAPartir(preco, fonte, negociacao) {
  if (precoValido(preco)) return preco;
  const texto = textoDaFonte(fonte).replace(/\s+/g, ' ');
  for (const match of texto.matchAll(A_PARTIR)) {
    const contexto = texto.slice(Math.max(0, match.index - 40), match.index).toLowerCase();
    const venda = contexto.lastIndexOf('venda');
    const locacao = Math.max(contexto.lastIndexOf('loca'), contexto.lastIndexOf('alug'));
    if (negociacao === 'locacao' ? venda > locacao : locacao > venda) continue;
    const valor = Number(`${match[1].replace(/\./g, '')}.${match[2] ?? '0'}`);
    if (valor > 0) return valor;
  }
  return preco;
}
