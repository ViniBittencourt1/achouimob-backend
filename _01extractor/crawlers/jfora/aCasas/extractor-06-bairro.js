import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLocalizacao } from './extractor-04-localizacao.js';


function normalizarParaBusca(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[.,-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Função para extrair o bairro da localização do card
function extrairBairro(html) {
    const localizacao = extractLocalizacao(html);
    if (localizacao) {
        return localizacao.split(',')[0].trim();
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
    const bairroNormalizado = normalizarParaBusca(bairro);
    for (const item of bairros) {
        if (bairroNormalizado === normalizarParaBusca(item.nome)) {
            return item.slug || item.nome; // Retorna o slug se existir, senão o nome
        }
    }
    return '';
}


export function extractBairroFromTitulo(html) {
    const bairroExtraido = extrairBairro(html);
    if (!bairroExtraido) return '';
    let bairroEncontrado = '';
    try {
        bairroEncontrado = buscarBairro(bairroExtraido);
    } catch (error) {
        // Mantém o fallback mesmo se o catálogo não estiver disponível.
    }
    // Se não encontrar, retorna o valor extraído em letras maiúsculas
    return bairroEncontrado || bairroExtraido.toUpperCase();
}
