// extractor-02-titulo.js
export function extractTitulo($card, tipoImovel, localizacao) {
    // O título é construído a partir de outras informações, então não extrai diretamente do card inicial.
    // A lógica de construção ficará no orquestrador.
    // No entanto, na página de detalhes, ele é refinado.
    return `${tipoImovel} em ${localizacao}`.trim();
}

export async function extractTituloDetalhe(page) {
    try {
        const titulo = await page.evaluate(() => {
            const h2 = document.querySelector("#listing-title-description h2");
            return h2 ? h2.innerText.trim() : "";
        });
        return titulo;
    } catch (error) {
        console.error("Erro ao extrair título da página de detalhe:", error);
        return "";
    }
}
