import { load } from "cheerio";

export function extractPrecoKenloLocacao(html) {
  const document = load(html);
  const containers = document(".card-with-buttons__value-container, .card_split_vertically__value-container").toArray();
  for (const container of containers) {
    const label = document(container).find(".card-with-buttons__value-title, .card_split_vertically__value-title").text();
    if (!/aluguel|loca[\u00e7c][a\u00e3]o/i.test(label)) continue;
    const value = document(container).find(".card-with-buttons__value, .card_split_vertically__value").first().text();
    const match = value.match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
    return match ? Number(`${match[1].replace(/\./g, "")}.${match[2] ?? "0"}`) : null;
  }
  const legacy = document("span.h-money.location").toArray();
  const rental = legacy.find(element => /\/m[e\u00ea]s/i.test(document(element).text()));
  if (rental) {
    const match = document(rental).text().match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/);
    return match ? Number(`${match[1].replace(/\./g, "")}.${match[2] ?? "0"}`) : null;
  }
  if (legacy.length === 1 && /sob consulta/i.test(document(legacy[0]).text())) return null;
  throw new Error("Rotulo de aluguel nao encontrado no card Kenlo.");
}