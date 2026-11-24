import { load } from "cheerio";

export function extractPrecoLocacao(cardHtml) {
  const document = load(cardHtml);
  const item = document(".imovel-item--preco--item").toArray().find(element =>
    /loca[\u00e7c][a\u00e3]o|aluguel/i.test(document(element).find("small").text())
  );
  if (!item) return null;
  const valor = document(item).find("b").first().text();
  const match = valor.match(/([\d.]+),\d{2}/);
  return match ? Number(match[1].replace(/\./g, "")) : null;
}