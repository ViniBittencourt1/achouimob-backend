import * as cheerio from "cheerio";

/**
 * Extrai o HTML do painel do corretor (container .agent-3) da página de detalhes do imóvel.
 * @param {object} page - Instância da página Puppeteer já navegada para o imóvel.
 * @returns {Promise<string>} HTML do container .agent-3 ou string vazia.
 */
export async function extractLinkCardHtml(page) {
  try {
    // Espera o container do corretor aparecer
    await page.waitForSelector('.agent-3', { timeout: 10000 });
    // Extrai o HTML do painel do corretor
    const htmlPainel = await page.$eval('.agent-3', el => el.outerHTML);
    return htmlPainel;
  } catch (err) {
    return "";
  }
}

/**
 * Extrai e retorna o HTML do painel do corretor para um imóvel, navegando até a página de detalhes.
 * @param {object} browser - Instância do Puppeteer.
 * @param {object} imovel - Objeto do imóvel (deve conter linkReal).
 * @returns {Promise<string>} HTML do painel do corretor ou string vazia.
 */
export async function extractLinkCard(browser, imovel) {
  if (!imovel.linkReal) return "";
  const page = await browser.newPage();
  try {
    await page.goto(imovel.linkReal, { waitUntil: "domcontentloaded", timeout: 45000 });
    const htmlPainel = await extractLinkCardHtml(page);
    await page.close();
    return htmlPainel;
  } catch (err) {
    await page.close();
    return "";
  }
}