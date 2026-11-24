const LIMITE_POR_FAIXA = 200;
const PRIMEIRO_CORTE = 50_000_000;

function centavos(value) {
  if (value === null || value === '') return null;
  if (!/^\d+(?:\.\d{3})*(?:,\d{2})?$/.test(value)) throw new Error('[Alicerce] Filtro de preco invalido; base preservada.');
  const [inteiro, decimal = '00'] = value.replace(/\./g, '').split(',');
  const numero = Number(inteiro) * 100 + Number(decimal);
  if (!Number.isSafeInteger(numero)) throw new Error('[Alicerce] Filtro de preco fora do limite; base preservada.');
  return numero;
}

function moeda(value) {
  return `${Math.floor(value / 100)},${String(value % 100).padStart(2, '0')}`;
}

export function urlFaixaAlicerce(base, minimo, maximo) {
  const url = new URL(base);
  url.searchParams.delete('page');
  for (const [key, value] of [['preco_min', minimo], ['preco_max', maximo]]) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, moeda(value));
  }
  return url.href;
}

export async function coletarFaixasAlicerce({ url, totalEsperado, contar, coletar }) {
  const base = new URL(url);
  base.searchParams.delete('page');
  const minimo = centavos(base.searchParams.get('preco_min'));
  const maximo = centavos(base.searchParams.get('preco_max'));
  if (minimo !== null && maximo !== null && minimo > maximo) throw new Error('[Alicerce] Faixa de preco invertida; base preservada.');
  const raiz = urlFaixaAlicerce(base, minimo, maximo);
  const total = await contar(raiz);
  if (!Number.isSafeInteger(total) || total < 0 || (totalEsperado !== undefined && total !== totalEsperado)) {
    throw new Error(`[Alicerce] Contagem geral alterada: ${total}/${totalEsperado}; base preservada.`);
  }
  const records = new Map();
  const adicionar = rows => {
    for (const row of rows) {
      if (!row.linkReal) throw new Error('[Alicerce] Anuncio sem link; base preservada.');
      records.set(row.linkReal, row);
    }
    if (records.size > total) throw new Error('[Alicerce] Coleta acima da contagem geral; base preservada.');
  };
  const visitar = async (min, max, quantidade, profundidade = 0) => {
    if (quantidade === 0) return;
    const destino = urlFaixaAlicerce(base, min, max);
    if (quantidade > LIMITE_POR_FAIXA) {
      const inicio = min ?? 0;
      const corte = max === null ? Math.max(PRIMEIRO_CORTE, inicio * 2) : Math.floor((inicio + max) / 2);
      if (profundidade < 40 && Number.isSafeInteger(corte + 1) && corte >= inicio && (max === null || corte < max)) {
        const esquerda = await contar(urlFaixaAlicerce(base, min, corte));
        const direita = await contar(urlFaixaAlicerce(base, corte + 1, max));
        if (![esquerda, direita].every(value => Number.isSafeInteger(value) && value >= 0)
          || esquerda + direita > quantidade) {
          throw new Error('[Alicerce] Contagem das faixas inconsistente; base preservada.');
        }
        await visitar(min, corte, esquerda, profundidade + 1);
        await visitar(corte + 1, max, direita, profundidade + 1);
        return;
      }
      console.warn(`[Alicerce] ${quantidade} anuncios concentrados na mesma faixa minima; usando paginacao completa dessa faixa.`);
    }
    console.log(`[Alicerce] Faixa ${min === null ? 'sem minimo' : moeda(min)} ate ${max === null ? 'sem teto' : moeda(max)}: ${quantidade} anuncios.`);
    const rows = await coletar(destino, quantidade);
    if (new Set(rows.map(row => row.linkReal)).size !== quantidade) {
      throw new Error('[Alicerce] Faixa incompleta ou com links repetidos; base preservada.');
    }
    adicionar(rows);
    console.log(`[Alicerce] Progresso: ${records.size}/${total} anuncios unicos.`);
  };
  await visitar(minimo, maximo, total);
  if (await contar(raiz) !== total) throw new Error('[Alicerce] Total mudou durante a coleta; base preservada.');
  if (records.size < total) {
    console.warn(`[Alicerce] Faixas cobriram ${records.size}/${total}. Conferindo a busca original para recuperar anuncios sem preco ou fora dos filtros.`);
    adicionar(await coletar(raiz, total));
  }
  if (records.size !== total) throw new Error(`[Alicerce] Coleta incompleta: ${records.size}/${total}; base preservada.`);
  return [...records.values()];
}
