import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


// Função para extrair o bairro do span.loc
function extrairBairro(html) {
    const regex = /<span[^>]*class=["'][^"']*loc[^"']*["'][^>]*>.*?<b>([^<]+)<\/b>/is;
    const match = html.match(regex);
    if (match && match[1]) {
        return match[1].trim();
    }
    return '';
}

function normalizarTexto(valor = '') {
    return String(valor).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buscarBairro(valor, cidade = '') {
    // Caminho correto para backend/_03database/filtros/_jfBairros.json
    const bairrosPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../_03database/filtros/_jfBairros.json');
    const bairros = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
    const normalizado = normalizarTexto(valor);
    const cidadeNormalizada = normalizarTexto(cidade);
    return bairros.find((item) =>
        (!cidadeNormalizada || normalizarTexto(item.cidade) === cidadeNormalizada) &&
        (normalizarTexto(item.nome) === normalizado || normalizarTexto(item.slug) === normalizado)
    )?.slug || '';
}

function extrairBairroDoLink(linkReal = '') {
    try {
        return new URL(linkReal).pathname.match(/-(?:mg|rj|sp|es)-(.+)$/i)?.[1]?.replace(/\.html$/i, '') || '';
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
    return bairroEncontrado;
}
