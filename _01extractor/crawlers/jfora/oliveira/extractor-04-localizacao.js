// Extrai localização do <span class="mb-sm-20">, formatando para o padrão "Santa Cruz, Juiz de Fora, Minas Gerais"
export function extractLocalizacao(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return '';
  const match = cardHtml.match(/<span[^>]*class\s*=\s*(["'])mb-sm-20\1[^>]*>([\s\S]*?)<\/span>/i);
  if (match) {
    let text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // Formata para "Santa Cruz, Juiz de Fora, Minas Gerais"
    text = text.toLowerCase().replace(/(^|, )([a-záéíóúãõâêîôûç]+)/g, (m, sep, word) => sep + word.charAt(0).toUpperCase() + word.slice(1));
    return text;
  }
  return '';
}

export function buildLocalizacaoFallback(bairro, cidade) {
  const lowerCaseWords = new Set(["a", "as", "da", "das", "de", "do", "dos", "e", "em", "no", "nos"]);
  const formatSlug = (slug) => String(slug || "").split("-").filter(Boolean)
    .map((part, index) => lowerCaseWords.has(part) && index > 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const bairroNome = formatSlug(bairro);
  const cidadeParts = String(cidade || "").split("-").filter(Boolean);
  const estado = cidadeParts.length > 1 && cidadeParts.at(-1).length === 2 ? cidadeParts.pop().toUpperCase() : "";
  const cidadeNome = formatSlug(cidadeParts.join("-"));
  return [bairroNome, cidadeNome && estado ? `${cidadeNome} - ${estado}` : cidadeNome].filter(Boolean).join(", ");
}
