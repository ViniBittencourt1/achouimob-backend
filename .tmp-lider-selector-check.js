const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto("https://www.lidernegociosimob.com.br/imovel/venda", {
    waitUntil: "networkidle2",
    timeout: 90000,
  });

  await new Promise((r) => setTimeout(r, 4000));

  const counts = await page.evaluate(() => ({
    imovelcard: document.querySelectorAll(".imovelcard").length,
    imovelItemShow: document.querySelectorAll(".imovel-item.imovel-item-show").length,
    property: document.querySelectorAll("div.property.clearfix").length,
    linksImovel: document.querySelectorAll('a[href*="/imovel/"]').length,
    title: document.title,
    url: location.href,
  }));

  console.log(JSON.stringify(counts, null, 2));
  await browser.close();
})();
