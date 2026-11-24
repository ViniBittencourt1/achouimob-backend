import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';


// Função para extrair o bairro do <h2 class="imovelcard__info__local">
function extrairBairro(html) {
    if (!html) return '';

    const dom = new JSDOM(html);
    const h2 = dom.window.document.querySelector('h2.imovelcard__info__local');
    if (!h2) return '';

    const texto = h2.textContent
        .replace(/^\s*bairro\s+atual\s*:\s*/i, '')
        .split(',')[0]
        .trim();

    return texto;
}

function normalizarTexto(valor = '') {
    return String(valor).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buscarBairro(valor, cidade = '') {
    // Caminho correto para backend/_03database/filtros/_jfBairros.json
    const bairrosPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
    const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    const normalizado = normalizarTexto(valor);
    return bairros.find((item) =>
        (!cidade || item.cidade === cidade) &&
        (normalizarTexto(item.nome) === normalizado || normalizarTexto(item.slug) === normalizado)
    )?.slug || '';
}

function extrairBairroDoLink(linkReal = '') {
    try {
        return new URL(linkReal).pathname.match(/-(?:mg|rj|sp|es)-(.+)$/i)?.[1] || '';
    } catch {
        return '';
    }
}

export function extractBairroFromTitulo(html, cidade = '', linkReal = '') {
    const bairroDoLink = extrairBairroDoLink(linkReal);
    const bairroCompletoDoLink = buscarBairro(bairroDoLink, cidade);
    if (bairroCompletoDoLink) return bairroCompletoDoLink;

    for (const parteDoLink of bairroDoLink.split(/[-_]+/).filter(Boolean)) {
        const bairroIndividualDoLink = buscarBairro(parteDoLink, cidade);
        if (bairroIndividualDoLink) return bairroIndividualDoLink;
    }

    const bairroExtraido = extrairBairro(html);
    if (!bairroExtraido) return '';
    const bairroEncontrado = buscarBairro(bairroExtraido, cidade);
    return bairroEncontrado;
}
