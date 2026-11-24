import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


// Função para extrair o bairro do span.loc
function extrairBairro(html) {
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

function normalizarTexto(valor = '') {
    return String(valor)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buscarBairro(bairro, cidade = '') {
    // Caminho correto para backend/_03database/filtros/_jfBairros.json
    const bairrosPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
    const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    const valorNormalizado = normalizarTexto(bairro);
    return bairros.find((item) =>
        (!cidade || item.cidade === cidade) &&
        (normalizarTexto(item.nome) === valorNormalizado || normalizarTexto(item.slug) === valorNormalizado)
    )?.slug || '';
}

function extrairBairroDoLink(linkReal = '', cidade = '') {
    try {
        const pathname = new URL(linkReal).pathname;
        const cidadeSlug = cidade || 'juiz-de-fora-mg';
        const cidadeNaUrl = cidadeSlug.replace(/-[a-z]{2}$/i, '');
        const trecho = pathname.match(new RegExp(`bairro-(.+?)-em-${cidadeNaUrl}(?:/|$)`, 'i'))?.[1] || '';
        return buscarBairro(trecho, cidade);
    } catch {
        return '';
    }
}

export function extractBairroFromTitulo(html, linkReal = '', cidade = '') {
    const bairroDoLink = extrairBairroDoLink(linkReal, cidade);
    if (bairroDoLink) return bairroDoLink;

    const bairroExtraido = extrairBairro(html);
    if (!bairroExtraido) return '';
    return buscarBairro(bairroExtraido, cidade);
}
