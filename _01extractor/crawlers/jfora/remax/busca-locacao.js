export async function aguardarBuscaLocacaoRemax(page, searchUrl) {
  const search = new URL(searchUrl);
  const expected = { origin: search.origin, pathname: search.pathname, city: search.searchParams.get("City") };
  const wait = () => page.waitForFunction(expected => {
    const current = new URL(location.href);
    return current.origin === expected.origin && current.pathname === expected.pathname &&
      current.searchParams.get("City") === expected.city &&
      current.searchParams.get("TransactionTypeUID") === "260";
  }, { timeout: 30000 }, expected);
  try {
    await wait();
  } catch (error) {
    const current = new URL(page.url());
    if (current.origin !== expected.origin || current.pathname !== expected.pathname ||
        current.searchParams.get("City") !== expected.city ||
        current.searchParams.get("TransactionTypeUID") !== "-1") throw error;
    console.warn("[RemaxLocacao] Site removeu o filtro de aluguel; reaplicando pela aba Alugar.");
    await page.waitForSelector('[role="tab"]', { timeout: 30000 });
    const clicked = await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find(element => element.textContent.trim() === "Alugar");
      if (!tab) return false;
      tab.click();
      return true;
    });
    if (!clicked) throw new Error("Aba Alugar RE/MAX nao encontrada; base preservada.");
    await wait();
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 60000 });
    const response = await page.reload({ waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()} ao recarregar aluguel RE/MAX; base preservada.`);
    await wait();
  }
}
