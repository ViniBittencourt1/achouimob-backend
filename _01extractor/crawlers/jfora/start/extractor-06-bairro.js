import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
import { JSDOM } from 'jsdom';


// Função para extrair o bairro do span.loc
function extrairBairro(html) {
    const dom = new JSDOM(html);

    const locStartNode = dom.window.document.querySelector('.listing-title .iziopen');
    const locStart = locStartNode?.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (locStart && locStart.includes(',')) {
        return locStart.split(',')[0].trim();
    }

    const listingTitleNode = dom.window.document.querySelector('.listing-title');
    const tituloNode = dom.window.document.querySelector('h4 a, h4');
    if (listingTitleNode?.textContent?.trim()) {
        let txt = listingTitleNode.textContent.replace(/\s+/g, ' ').trim();
        txt = txt.replace(/^Ref\.?\s*:\s*\S+\s*/i, '');

        const titulo = tituloNode?.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (titulo) {
            const idxTitulo = txt.toLowerCase().indexOf(titulo.toLowerCase());
            if (idxTitulo >= 0) txt = txt.slice(idxTitulo + titulo.length).trim();
        }

        txt = txt.replace(/\+\s*Detalhes\s*$/i, '').trim();
        if (txt.includes(',')) {
            const possivelBairro = txt.split(',')[0].trim();
            if (possivelBairro) return possivelBairro;
        }
    }

    const regexStart = /<a[^>]*class=["'][^"']*iziopen[^"']*["'][^>]*>\s*([^,<]+)\s*,\s*[^<]+<\/a>/i;
    const matchStart = html.match(regexStart);
    if (matchStart && matchStart[1]) {
        return matchStart[1].trim();
    }

    const regexKantto = /<span[^>]*class=["'][^"']*neighborhood[^"']*["'][^>]*>([^<]+)<\/span>/i;
    const matchKantto = html.match(regexKantto);
    if (matchKantto && matchKantto[1]) {
        return matchKantto[1].trim();
    }

    const regexFogel = /<p[^>]*search-feat-card__location[^>]*>[^<]*([^,<]+)\s*,\s*[^<]+<\/p>/i;
    const matchFogel = html.match(regexFogel);
    if (matchFogel && matchFogel[1]) {
        return matchFogel[1].trim();
    }

    const regex = /<span[^>]*class=["'][^"']*loc[^"']*["'][^>]*>.*?<b>([^<]+)<\/b>/is;
    const match = html.match(regex);
    if (match && match[1]) {
        return match[1].trim();
    }
    return '';
}

// Função para buscar o bairro no JSON

function buscarBairro(bairro) {
    // Caminho correto para backend/_03database/filtros/_jfBairros.json
    const bairrosPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
    const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    for (const item of bairros) {
        if (bairro.toLowerCase().includes(item.nome.toLowerCase())) {
            return item.slug || item.nome; // Retorna o slug se existir, senão o nome
        }
    }
    return '';
}


export function extractBairroFromTitulo(html, cidade = '') {
    const bairroExtraido = extrairBairro(html);
    if (!bairroExtraido) return '';
    const bairroEncontrado = resolverBairroCatalogo(bairroExtraido, cidade);
    // Se não encontrar, retorna o valor extraído em letras maiúsculas
    return bairroEncontrado || bairroExtraido.toUpperCase();
}
