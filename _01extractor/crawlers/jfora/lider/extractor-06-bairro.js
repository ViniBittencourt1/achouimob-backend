import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';


// Função para extrair o bairro do <h2 class="imovelcard__info__local">
function extrairBairro(html) {
    const regex = /<h2 class="imovelcard__info__local">\s*([^,]+),/i;
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
