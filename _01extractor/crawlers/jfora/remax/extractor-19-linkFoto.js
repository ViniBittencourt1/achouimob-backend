// extractor-19-linkFoto.js
export async function extractLinkFoto(page) {
    try {
        return await page.evaluate(() => {
            // Busca imagem do domínio remax.azureedge.net
            const img = document.querySelector('img[src*="remax.azureedge.net/userimages"]');
            return img ? img.src : "";
        });
    } catch (error) {
        console.error("Erro ao extrair link da foto:", error);
        return "";
    }
}
