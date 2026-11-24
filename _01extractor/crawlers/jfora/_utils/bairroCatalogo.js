import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogoPath = path.resolve(__dirname, '../../../../_03database/filtros/_jfBairros.json');

let catalogo;
function catalogoLocal() {
  if (catalogo === undefined) {
    try {
      catalogo = JSON.parse(fs.readFileSync(catalogoPath, 'utf8'));
    } catch {
      catalogo = [];
    }
  }
  return catalogo;
}

export function normalizarBairro(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[-_.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolverBairroCatalogo(valor = '', cidade = '', catalogoInformado) {
  const catalogo = catalogoInformado === undefined ? catalogoLocal() : catalogoInformado;
  const texto = normalizarBairro(valor);
  if (!texto) return '';

  const textoSemDo = texto.replace(/\bdo\b/g, ' ');
  const cidadeNormalizada = normalizarBairro(cidade);

  const candidatosPorCidade = (itens) => {
    if (!cidadeNormalizada) return itens;
    return itens.filter((item) => normalizarBairro(item?.cidade) === cidadeNormalizada);
  };

  const itensPrincipais = catalogo.filter((item) => String(item?.principal ?? 'sim').trim().toLowerCase() === 'sim');
  const candidatos = candidatosPorCidade(itensPrincipais);
  const base = candidatos.length > 0 ? candidatos : itensPrincipais.length > 0 ? itensPrincipais : catalogo;

  const exatos = base.filter((item) => {
    const nome = normalizarBairro(item?.nome);
    const slug = normalizarBairro(item?.slug);
    const nomeSemDo = nome.replace(/\bdo\b/g, ' ');
    const slugSemDo = slug.replace(/\bdo\b/g, ' ');
    return texto === nome || texto === slug || textoSemDo === nomeSemDo || textoSemDo === slugSemDo || texto === nome.replace(/ de jesus$/, '') || texto === slug.replace(/ de jesus$/, '');
  });

  if (exatos.length > 0) {
    exatos.sort((a, b) => {
      const scoreA = Number(String(a?.principal ?? 'nao').trim().toLowerCase() === 'sim') * 100 + normalizarBairro(a?.nome).length;
      const scoreB = Number(String(b?.principal ?? 'nao').trim().toLowerCase() === 'sim') * 100 + normalizarBairro(b?.nome).length;
      return scoreB - scoreA;
    });
    return exatos[0]?.slug || '';
  }

  const inclusoes = base
    .filter((item) => {
      const nome = normalizarBairro(item?.nome);
      const slug = normalizarBairro(item?.slug);
      const nomeSemDo = nome.replace(/\bdo\b/g, ' ');
      const slugSemDo = slug.replace(/\bdo\b/g, ' ');
      return nome.includes(texto) || texto.includes(nome) || slug.includes(texto) || texto.includes(slug) || nomeSemDo.includes(textoSemDo) || textoSemDo.includes(nomeSemDo) || slugSemDo.includes(textoSemDo) || textoSemDo.includes(slugSemDo);
    })
    .sort((a, b) => {
      const scoreA = Number(String(a?.principal ?? 'nao').trim().toLowerCase() === 'sim') * 100 + normalizarBairro(a?.nome).length;
      const scoreB = Number(String(b?.principal ?? 'nao').trim().toLowerCase() === 'sim') * 100 + normalizarBairro(b?.nome).length;
      return scoreB - scoreA;
    });

  if (inclusoes[0]?.slug) {
    return inclusoes[0].slug;
  }

  // Quando o nome não consta entre os bairros principais, usa aliases da mesma cidade.
  const aliases = candidatosPorCidade(catalogo).filter((item) => {
    const nome = normalizarBairro(item?.nome);
    const slug = normalizarBairro(item?.slug);
    const nomeSemDo = nome.replace(/\bdo\b/g, ' ');
    const slugSemDo = slug.replace(/\bdo\b/g, ' ');
    return texto === nome || texto === slug || textoSemDo === nomeSemDo || textoSemDo === slugSemDo || nome.includes(texto) || texto.includes(nome) || slug.includes(texto) || texto.includes(slug) || nomeSemDo.includes(textoSemDo) || textoSemDo.includes(nomeSemDo) || slugSemDo.includes(textoSemDo) || textoSemDo.includes(slugSemDo);
  });

  aliases.sort((a, b) => normalizarBairro(b?.nome).length - normalizarBairro(a?.nome).length);
  return aliases[0]?.slug || '';
}