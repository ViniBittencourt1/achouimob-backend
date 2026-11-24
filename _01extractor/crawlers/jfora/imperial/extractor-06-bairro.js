import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


// Função para extrair o bairro do <h3 class="cor2">
function extrairBairro(html) {
    const regex = /<h3 class="cor2">\s*([^,]+),/i;
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
        const cidadeSlug = String(cidade || 'juiz-de-fora-mg').toLowerCase();
        const candidatos = [
            pathname.match(new RegExp(`${cidadeSlug}-(.+)$`, 'i'))?.[1],
            pathname.match(/-venda-([a-z0-9-]+)$/i)?.[1],
            pathname.endsWith(`-${cidadeSlug}`) ? cidadeSlug.replace(/-mg$/, '') : '',
        ].filter(Boolean);

        for (const candidato of candidatos) {
            const bairro = buscarBairro(candidato, cidade);
            if (bairro) return bairro;
        }

        return '';
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
