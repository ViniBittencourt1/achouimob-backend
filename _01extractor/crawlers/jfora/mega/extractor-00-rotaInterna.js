function walkForKey(node, key) {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForKey(item, key);
      if (found !== null && found !== undefined) return found;
    }
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(node, key)) {
    return node[key];
  }

  for (const value of Object.values(node)) {
    const found = walkForKey(value, key);
    if (found !== null && found !== undefined) return found;
  }

  return null;
}

function toInt(value) {
  const n = Number(String(value ?? '').replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toPrice(value) {
  const txt = String(value ?? '');
  const match = txt.match(/(\d{1,3}(?:\.\d{3})+)(?:,\d{2})?/);
  if (!match?.[1]) return 0;
  const n = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getMetricFromMap(metrics, labels) {
  if (!metrics || typeof metrics !== 'object') return 0;
  for (const label of labels) {
    const value = toInt(metrics[label]);
    if (value > 0) return value;
  }
  return 0;
}

export async function enrichImoveisWithInternalData(browser, imoveis) {
  console.log(`[Mega][RotaInterna] Extraindo detalhes em ${imoveis.length} links...`);

  for (const imovel of imoveis) {
    if (!imovel?.linkReal) continue;

    const page = await browser.newPage();
    try {
      await page.goto(imovel.linkReal, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await new Promise((resolve) => setTimeout(resolve, 1800));

      const details = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .map((s) => s.textContent || '')
          .filter(Boolean);

        const parsed = [];
        for (const s of scripts) {
          try {
            parsed.push(JSON.parse(s));
          } catch {}
        }

        const metrics = {};
        const metricEls = Array.from(document.querySelectorAll('[data-tippy-content]'));
        for (const el of metricEls) {
          const rawLabel = String(el.getAttribute('data-tippy-content') || '').trim().toLowerCase();
          if (!rawLabel) continue;

          const match = (el.textContent || '').match(/\d+/);
          if (!match?.[0]) continue;

          if (!(rawLabel in metrics)) {
            metrics[rawLabel] = match[0];
          }
        }

        const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const venda = (body.match(/Venda\s*R\$\s*([\d\.]+,\d{2})/i) || [])[1] || '';

        return {
          parsed,
          metrics,
          body,
          venda,
        };
      });

      let banheiro = 0;
      banheiro = getMetricFromMap(details.metrics, ['banheiros', 'banheiro']);

      if (!banheiro) {
        for (const node of details.parsed) {
          const candidate = walkForKey(node, 'numberOfBathroomsTotal')
            ?? walkForKey(node, 'numberOfBathrooms')
            ?? walkForKey(node, 'bathroomsTotal')
            ?? walkForKey(node, 'bathroomTotal');
          banheiro = toInt(candidate);
          if (banheiro > 0) break;
        }
      }

      if (!banheiro) {
        const fallbackBanheiro = details.body.match(/(?:\s|^)(\d+)\s*banh(?:eiro)?/i);
        if (fallbackBanheiro?.[1]) banheiro = toInt(fallbackBanheiro[1]);
      }

      if (banheiro > 0) imovel.banheiroValor = banheiro;

      const precoVenda = toPrice(details.venda);
      if (precoVenda > 0) imovel.preco = precoVenda;
    } catch (e) {
      console.warn(`[Mega][RotaInterna] Falha em ${imovel.linkReal}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  return imoveis;
}
