import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import { parseNiteroiCard } from "./extractor.js";
import { projetosNiteroiVendas } from "./projects.js";

export async function validateNiteroiSalesListings(fetchImpl = fetch) {
  const results = [];

  for (const project of projetosNiteroiVendas) {
    const response = await fetchImpl(project.url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
    });
    if (!response.ok) throw new Error(`[${project.collection}] HTTP ${response.status}.`);

    const finalUrl = new URL(response.url);
    if (finalUrl.hostname.replace(/^www\./, "") !== new URL(project.url).hostname.replace(/^www\./, "")) {
      throw new Error(`[${project.collection}] Redirecionamento para outro domínio.`);
    }

    const document = new JSDOM(await response.text(), { url: response.url }).window.document;
    const heading = document.querySelector("h1")?.textContent || "";
    if (!/\d[\d.]*\s*Im[oó]veis.*venda/i.test(heading)) {
      throw new Error(`[${project.collection}] Contador de vendas não identificado.`);
    }

    const cards = [
      ...document.querySelectorAll('a.card-with-buttons[href*="/imovel/"], a.card_split_vertically[href*="/imovel/"]'),
      ...document.querySelectorAll(".card.card-listing"),
    ];
    if (!cards.length) throw new Error(`[${project.collection}] Nenhum card Kenlo encontrado.`);

    const parsed = parseNiteroiCard(cards[0].outerHTML, {
      baseUrl: project.url,
      displayName: project.displayName,
    });
    for (const field of ["linkReal", "titulo", "tipoImovel", "cidade", "codigoBase", "linkFoto"]) {
      if (!parsed[field]) throw new Error(`[${project.collection}] Campo obrigatório ausente no primeiro card: ${field}.`);
    }

    results.push({ project: project.collection, status: response.status, cards: cards.length, sample: parsed.linkReal });
  }

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateNiteroiSalesListings()
    .then(results => results.forEach(({ project, status, cards, sample }) =>
      console.log(`[OK] ${project}: HTTP ${status}; ${cards} cards na primeira página; ${sample}`)
    ))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
