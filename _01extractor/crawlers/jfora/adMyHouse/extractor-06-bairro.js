import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
import { JSDOM } from 'jsdom';


// Função para extrair o bairro do <h2 class="imovelcard__info__local">
function extrairBairro(html) {
    const h2 = new JSDOM(html).window.document.querySelector('h2.imovelcard__info__local');
    return h2 ? h2.textContent.trim().split(',')[0].trim() : '';
}

function normalizarTexto(valor = '') {
    return String(valor)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buscarBairro(valor, cidade = '') {
    // Caminho correto para backend/_03database/filtros/_jfBairros.json
    const bairrosPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
    const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    const normalizado = normalizarTexto(valor);
    const candidatos = bairros.filter((item) => !cidade || item.cidade === cidade);
    return candidatos.find((item) =>
        normalizarTexto(item.nome) === normalizado || normalizarTexto(item.slug) === normalizado
    )?.slug || '';
}

function extrairBairroDoLink(linkReal = '') {
    try {
        const pathname = new URL(linkReal).pathname;
        return pathname.match(/-(?:mg|rj|sp|es)-(.+)$/i)?.[1] || '';
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
    // Se não encontrar, retorna o valor extraído em letras maiúsculas
    return resolverBairroCatalogo(bairroExtraido, cidade);
}
