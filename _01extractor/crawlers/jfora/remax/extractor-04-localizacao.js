// extractor-04-localizacao.js
export function extractLocalizacao($card) {
    const locEl = $card.find(".listing-address").first();
    return locEl.length ? locEl.text().trim() : "";
}

export async function extractLocalizacaoDetalhe(page) {
    try {
        return await page.evaluate(() => {
            const p = document.querySelector("#listing-address p");
            return p ? p.innerText.trim() : "";
        });
    } catch (error) {
        console.error("Erro ao extrair localização da página de detalhe:", error);
        return "";
    }
}
