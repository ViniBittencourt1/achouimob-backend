const endpoint = 'https://www.remax.com.br/search/listing-search/docs/search';

export function createRemaxSearchBatches(requestSearch, { cityId = 6579324, provinceId, transactionType } = {}) {
  if ((cityId !== null && (!Number.isSafeInteger(cityId) || cityId < 1))
    || (provinceId !== undefined && (!Number.isSafeInteger(provinceId) || provinceId < 1))
    || (cityId === null && provinceId === undefined)
    || (transactionType !== undefined && ![260, 261].includes(transactionType))) throw new Error('Filtros RE/MAX invalidos.');
  const keys = new Set();
  const pages = new Map();
  let total;
  let filter;
  let pending = Promise.resolve();
  function read(body) {
    const currentFilter = String(body.filter || '').trim();
    const cityPattern = cityId === null ? null : new RegExp(`content/CityID\\s+eq\\s+${cityId}\\b`);
    const provincePattern = provinceId === undefined ? null : new RegExp(`content/ProvinceID\\s+eq\\s+${provinceId}\\b`);
    const transactionPattern = new RegExp(`content/TransactionTypeUID\\s+eq\\s+${transactionType ?? '(?:260|261)'}\\b`);
    if (/\bor\b/i.test(currentFilter) || cityPattern && !cityPattern.test(currentFilter)
      || provincePattern && !provincePattern.test(currentFilter)
      || cityId === null && /content\/CityID\s+eq\b/i.test(currentFilter)
      || !transactionPattern.test(currentFilter)) throw new Error('Busca RE/MAX sem filtros de localidade e negociacao.');
    const top = Number(body.top);
    const skip = Number(body.skip || 0);
    if (!Number.isSafeInteger(top) || top < 1 || !Number.isSafeInteger(skip) || skip < 0 || skip % top) throw new Error('Pagina RE/MAX invalida.');
    const number = skip / top;
    if (filter !== undefined && filter !== currentFilter) throw new Error('Filtros RE/MAX mudaram durante a coleta; base preservada.');
    if (pages.has(number)) return pages.get(number);
    if (number !== pages.size) throw new Error('Pagina RE/MAX fora de sequencia; base preservada.');
    filter = currentFilter;
    return fetchPage(body, number);
  }
  async function fetchPage(body, number) {
    const excluded = Array.from(keys).map(key => key.replace(/'/g, "''")).join('|');
    const payload = { ...body, skip: 0, filter: excluded ? `${filter} and not search.in(content/ListingKey, '${excluded}', '|')` : filter };
    const response = await requestSearch(payload);
    const count = Number(response['@odata.count']);
    if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(response.value)) throw new Error('Resposta de busca RE/MAX invalida.');
    if (total === undefined) total = count;
    if (count !== total - keys.size) throw new Error(`Total RE/MAX mudou durante os lotes: esperado ${total - keys.size}, recebido ${count}; base preservada.`);
    if (!response.value.length && keys.size < total) throw new Error('Lote RE/MAX vazio antes do total; base preservada.');
    const batch = new Set();
    for (const record of response.value) {
      const key = record.content?.ListingKey;
      if (typeof key !== 'string' || !key || key.includes('|') || keys.has(key) || batch.has(key)) throw new Error('Chave RE/MAX ausente ou repetida; base preservada.');
      batch.add(key);
    }
    if (keys.size + batch.size > total) throw new Error('Lote RE/MAX excede total; base preservada.');
    for (const key of batch) keys.add(key);
    const result = { ...response, '@odata.count': total };
    pages.set(number, result);
    return result;
  }
  return body => {
    const result = pending.then(() => read(body));
    pending = result.catch(() => {});
    return result;
  };
}

export async function installRemaxSearchBatches(page, { cityId = 6579324, transactionType } = {}) {
  const session = await page.createCDPSession();
  let failure;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const read = createRemaxSearchBatches(async body => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`HTTP ${response.status} na API RE/MAX; base preservada.`);
    return response.json();
  }, { cityId, transactionType });
  const handler = async event => {
    try {
      let body;
      try { body = JSON.parse(event.request.postData || ''); } catch {}
      const cityPattern = new RegExp(`content/CityID\\s+eq\\s+${cityId}\\b`);
      const transactionPattern = new RegExp(`content/TransactionTypeUID\\s+eq\\s+${transactionType ?? '(?:260|261)'}\\b`);
      if (event.request.method !== 'POST' || !body?.count || !cityPattern.test(body.filter || '') || !transactionPattern.test(body.filter || '')) {
        await session.send('Fetch.continueRequest', { requestId: event.requestId });
        return;
      }
      const json = await read(body);
      await session.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }], body: Buffer.from(JSON.stringify(json)).toString('base64') });
      resolveReady(json['@odata.count']);
    } catch (error) {
      failure = error;
      rejectReady(error);
      await session.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 502, body: Buffer.from(JSON.stringify({ error: error.message })).toString('base64') }).catch(() => {});
    }
  };
  session.on('Fetch.requestPaused', handler);
  await session.send('Fetch.enable', { patterns: [{ urlPattern: endpoint, requestStage: 'Request' }] });
  return {
    assertHealthy() { if (failure) throw failure; },
    async waitUntilReady() {
      let timer;
      try { return await Promise.race([ready, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('API RE/MAX filtrada nao carregou.')), 60000); })]); }
      finally { clearTimeout(timer); }
    },
    async close() { session.off('Fetch.requestPaused', handler); await session.detach(); },
  };
}