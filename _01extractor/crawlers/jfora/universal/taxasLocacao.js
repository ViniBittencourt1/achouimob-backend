import { JSDOM } from "jsdom";

function normalizeLabel(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function parseAmount(value, field, missingValue = 0) {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").trim();
  if (!raw || /^(?:-|–|—|isento|gratuito|gratis|consulte|sob consulta|nao informado)$/i.test(normalizeLabel(raw))) return missingValue;

  const normalized = raw.replace(/^R\$\s*/i, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Valor de ${field} invalido na pagina Universal: ${raw}`);
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Valor de ${field} invalido na pagina Universal: ${raw}`);
  return Math.round(amount * 100) / 100;
}

export function extractUniversalRentalFees(html, rentPrice) {
  const document = new JSDOM(html).window.document;
  const fees = { precoCondominio: 0, precoIptu: 0, precoOutros: 0 };
  const found = new Set();
  let totalAnunciado = null;

  const rows = document.querySelectorAll(".imovel--precos--table--item, .imovel--precos--table tfoot tr");
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    const label = normalizeLabel(cells[0]?.textContent).replace(/[:：]+$/, "");
    if (label === "total mensal" || label === "total") {
      if (found.has("precoTotal")) throw new Error("Campo precoTotal duplicado na pagina Universal.");
      found.add("precoTotal");
      totalAnunciado = parseAmount(cells[1]?.textContent, "precoTotal", null);
      continue;
    }

    const field = label === "condominio" ? "precoCondominio" : label === "iptu" ? "precoIptu" : null;
    if (!field) continue;
    if (found.has(field)) throw new Error(`Campo ${field} duplicado na pagina Universal.`);
    found.add(field);
    fees[field] = parseAmount(cells[1]?.textContent, field);
  }

  const aluguel = typeof rentPrice === "number" && Number.isFinite(rentPrice) && rentPrice >= 0
    ? Math.round(rentPrice * 100)
    : null;
  const custosBase = aluguel === null
    ? null
    : aluguel + Math.round(fees.precoCondominio * 100) + Math.round(fees.precoIptu * 100);
  if (totalAnunciado !== null && custosBase !== null) {
    fees.precoOutros = Math.max(0, Math.round(totalAnunciado * 100) - custosBase) / 100;
  }

  return {
    ...fees,
    precoTotal: totalAnunciado !== null
      ? totalAnunciado
      : custosBase === null
        ? null
        : (custosBase + Math.round(fees.precoOutros * 100)) / 100,
  };
}
