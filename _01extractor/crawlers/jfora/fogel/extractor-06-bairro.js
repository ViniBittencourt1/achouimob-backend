import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';


// Função para extrair o bairro do span.loc
function extrairBairro(html) {
    if (!html) return '';

    const dom = new JSDOM(html);
    const location = dom.window.document.querySelector('.search-feat-card__location');
    if (location) return location.textContent.replace(/\s+/g, ' ').trim();

    const locationSpan = dom.window.document.querySelector('span.loc');
    return locationSpan ? locationSpan.textContent.replace(/\s+/g, ' ').trim() : '';
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

function limparBairro(valor) {
    return String(valor || '')
    .replace(/^\s*[|:,-]*\s*bairro(?:\s+atual)?\s*:?\s*/i, '')
        .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s+/g, ' ')
        .trim();
}

function buscarBairro(valor, cidade = '') {
    // Caminho correto para backend/_03database/filtros/_jfBairros.json
    const bairrosPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
    const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    const bairroNormalizado = normalizarTexto(limparBairro(valor));
    const bairrosDaCidade = bairros.filter((item) => !cidade || item.cidade === cidade);

    return bairrosDaCidade.find((item) => {
        const nome = normalizarTexto(item.nome);
        const slug = normalizarTexto(item.slug);
        return bairroNormalizado === nome || bairroNormalizado === slug;
    })?.slug || '';
}

export function extractBairroFromTitulo(html, cidade = '') {
    const localizacao = extrairBairro(html);
    if (!localizacao) return '';

    const localizacaoSemCidade = limparBairro(localizacao).split(',')[0];
    const candidatos = [
        localizacaoSemCidade,
        ...localizacaoSemCidade.split(/\s*>\s*/),
    ]
        .map((candidato) => limparBairro(candidato))
        .filter(Boolean);

    for (const candidato of candidatos) {
        const bairroEncontrado = buscarBairro(candidato, cidade);
        if (bairroEncontrado) return bairroEncontrado;
    }

    return '';
}
