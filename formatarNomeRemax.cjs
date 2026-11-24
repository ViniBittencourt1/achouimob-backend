function formatarNomeRemax(value) {
  if (typeof value !== 'string') return value;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!/^re\/?max(?:\s|$)/i.test(name)) return value;
  return name.replace(/^re\/?max/i, 'Remax').split(' ').map((word, index) => {
    if (index === 0) return word;
    return word.toLocaleLowerCase('pt-BR').replace(/(^|[-'])\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR'));
  }).join(' ');
}

module.exports = { formatarNomeRemax };
