import { JSDOM } from 'jsdom';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

function extrairBairro(html) {
    const dom = new JSDOM(html || '');
    const localizacao = dom.window.document.querySelector('h2.imovelcard__info__local')?.textContent || '';
    if (localizacao) {
        return localizacao.split(',')[0].trim();
    }

    const match = String(html || '').match(/<h2\b[^>]*imovelcard__info__local[^>]*>([\s\S]*?)<\/h2>/i);
    return match?.[1].replace(/<[^>]+>/g, '').split(',')[0].trim() || '';
}

export function extractBairroFromTitulo(html, cidade = '') {
    const bairroExtraido = extrairBairro(html);
    if (!bairroExtraido) return '';
    const bairroEncontrado = resolverBairroCatalogo(bairroExtraido, cidade);
    return bairroEncontrado || bairroExtraido.toUpperCase();
}
