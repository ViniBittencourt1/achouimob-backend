import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function normalizeText(text = '') {
    return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Função para extrair o texto bruto do título do imóvel
export function extractBairroRaw(cardHtml, cidade = '') {
    if (!cardHtml || typeof cardHtml !== 'string') return '';
    const dom = new JSDOM(cardHtml);
    const h3 = dom.window.document.querySelector('h3 a');
    if (!h3) return '';
    let texto = h3.textContent.trim();
    const idx = texto.indexOf('–');
    if (idx > -1) {
        texto = texto.substring(0, idx).trim();
    }

    // Busca no _jfBairros.json com caminho robusto
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
    let bairrosData;
    try {
        const raw = fs.readFileSync(bairrosPath, 'utf-8');
        bairrosData = JSON.parse(raw);
    } catch (err) {
        bairrosData = [];
    }
    const textoNormalizado = normalizeText(texto);
    const cidadeNormalizada = normalizeText(cidade);
    const found = bairrosData.find((b) => {
        if (cidadeNormalizada && normalizeText(b.cidade) !== cidadeNormalizada) return false;
        return normalizeText(b.nome) === textoNormalizado || normalizeText(b.slug) === textoNormalizado;
    });
    if (found && found.slug) {
        return found.slug;
    }
    return '';
}

// Export alternativo para compatibilidade
export const extractBairro = extractBairroRaw;
