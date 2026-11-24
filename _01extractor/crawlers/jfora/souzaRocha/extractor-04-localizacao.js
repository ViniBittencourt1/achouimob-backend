import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeText(text = '') {
    return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extrai localização juntando bairro e cidade normalizados pelos respectivos JSONs
export function extractLocalizacao(cardHtml) {
    if (!cardHtml || typeof cardHtml !== 'string') return '';
    // --- BAIRRO ---
    let bairroBreadcrumb = '';
    const matchBairro = cardHtml.match(/<li>\s*<a [^>]*href=["'][^"']+localiza[^"']+["'][^>]*>([^<]+)<\/a>\s*<\/li>/i);
    if (matchBairro) {
        bairroBreadcrumb = matchBairro[1].trim();
    }
    let bairroSpan = '';
    const matchSpan = cardHtml.match(/<span[^>]*style\s*=\s*(["'])color:\s*#000000;\1[^>]*>([\s\S]*?)<\/span>/i);
    if (matchSpan) {
        const text = matchSpan[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const bairroMatch = text.match(/no bairro ([^,\.]+)/i) || text.match(/em ([^,]+),/i);
        if (bairroMatch) {
            bairroSpan = bairroMatch[1].trim();
        }
    }
    let bairroExtraido = '';
    if (bairroBreadcrumb && bairroSpan && bairroBreadcrumb.toLowerCase() !== bairroSpan.toLowerCase()) {
        bairroExtraido = bairroBreadcrumb + ' / ' + bairroSpan;
    } else {
        bairroExtraido = bairroBreadcrumb || bairroSpan || '';
    }
    const bairrosPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');
    let bairrosList = [];
    try {
        bairrosList = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    } catch (e) {
        bairrosList = [];
    }
    let bairroFinal = '';
    for (const bairro of bairrosList) {
        if (normalizeText(bairroExtraido) === normalizeText(bairro.nome) || normalizeText(bairroExtraido) === normalizeText(bairro.slug)) {
            bairroFinal = bairro.nome;
            break;
        }
    }
    // --- CIDADE ---
    let cidadeExtraida = '';
    const matchCidade = cardHtml.match(/<div[^>]*class\s*=\s*(["'])rh_content\1[^>]*>[\s\S]*?<span[^>]*style\s*=\s*(["'])color:\s*#000000;\2[^>]*>([\s\S]*?)<\/span>/i);
    if (matchCidade) {
        let text = matchCidade[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const cidadeMatch = text.match(/em ([^,]+),?/i);
        if (cidadeMatch) {
            cidadeExtraida = cidadeMatch[1].trim();
        }
    }
    const cidadesPath = path.resolve(__dirname, '../../../../crawler/_brCidades.json');
    let cidadesList = [];
    try {
        cidadesList = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
    } catch (e) {
        cidadesList = [];
    }
    let cidadeFinal = 'Juiz de Fora';
    for (const cidade of cidadesList) {
        if (cidadeExtraida && (normalizeText(cidadeExtraida) === normalizeText(cidade.nome) || normalizeText(cidadeExtraida) === normalizeText(cidade.slug))) {
            cidadeFinal = cidade.nome;
            break;
        }
    }
    // --- LOCALIZAÇÃO FINAL ---
    if (!bairroFinal && !cidadeFinal) return '';
    return [bairroFinal, cidadeFinal].filter(Boolean).join(', ');
}