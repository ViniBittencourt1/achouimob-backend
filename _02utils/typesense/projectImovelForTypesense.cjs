const fs = require('fs');
const path = require('path');
const { formatarNomeRemax } = require('../../formatarNomeRemax.cjs');

const filtrosDir = path.join(__dirname, '../../_03database/filtros');
const cidadesData = JSON.parse(fs.readFileSync(path.join(filtrosDir, '_brCidades.json'), 'utf8'));
const tiposData = JSON.parse(fs.readFileSync(path.join(filtrosDir, '_brTipoImovel.json'), 'utf8'));
const bairrosData = JSON.parse(fs.readFileSync(path.join(filtrosDir, '_jfBairros.json'), 'utf8'));

function formatarNome(texto) {
  if (!texto) return '';
  if (texto === texto.toUpperCase() || texto === texto.toLowerCase()) {
    return texto.toLowerCase().split(' ').map(word => {
      if (['de', 'da', 'do', 'dos', 'das', 'e'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }
  return texto;
}

function getCidadeNome(slug) {
  if (!slug) return '';
  const cidade = cidadesData.find(item => item.slug === slug && item.principal === 'sim');
  return cidade ? formatarNome(cidade.nome) : formatarNome(slug.replace(/-/g, ' '));
}

function getBairroNome(slug, cidade) {
  if (!slug) return '';
  const matches = bairrosData.filter(item => item.slug === slug && item.cidade === cidade);
  const bairro = matches.find(item => item.principal === 'sim') || matches[0];
  return bairro ? formatarNome(bairro.nome) : formatarNome(slug.replace(/-/g, ' '));
}

function getTipoImovelNome(slug) {
  if (!slug || !tiposData.tiposFiltro) return slug || '';
  for (const lista of Object.values(tiposData.tiposFiltro)) {
    if (!Array.isArray(lista)) continue;
    const encontrado = lista.find(item => item.slug === slug);
    if (encontrado) return encontrado.nome;
  }
  return formatarNome(slug.replace(/-/g, ' '));
}

function numberOrZero(value, parser) {
  if (value === undefined || value === null || Number.isNaN(parser(value))) return 0;
  return parser(value);
}

function integerOrZero(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(parseInt(value, 10))) return parseInt(value, 10);
  return 0;
}

function stringOrEmpty(value) {
  return value === undefined || value === null ? '' : String(value);
}

function projectImovelForTypesense(data, sourceDocId = '', fallbackImobiliariaId = '') {
  const source = data && typeof data === 'object' ? data : {};
  const tipoImovel = source.tipoImovel || '';
  const bairro = source.bairro || '';
  const cidade = source.cidade || '';
  const preco = numberOrZero(source.preco, value => parseFloat(value));
  const isRental = source.negociacao === 'locacao';
  const precoCondominio = isRental ? numberOrZero(source.precoCondominio, value => parseFloat(value)) : undefined;
  const precoIptu = isRental ? numberOrZero(source.precoIptu, value => parseFloat(value)) : undefined;
  const precoOutros = isRental ? numberOrZero(source.precoOutros, value => parseFloat(value)) : undefined;
  const rentPriceKnown = source.preco !== null && source.preco !== undefined;
  const precoTotal = !isRental
    ? undefined
    : source.precoTotal !== null && source.precoTotal !== undefined
      ? numberOrZero(source.precoTotal, value => parseFloat(value))
      : rentPriceKnown
        ? preco + precoCondominio + precoIptu + precoOutros
        : undefined;

  return {
    id: String(source.id || sourceDocId || source.linkReal || ''),
    titulo: source.titulo || '',
    preco,
    ...(isRental ? {
      precoCondominio,
      precoIptu,
      precoOutros,
      ...(precoTotal === undefined ? {} : { precoTotal }),
    } : {}),
    areaValor: numberOrZero(source.areaValor, value => parseFloat(value)),
    codigoBase: stringOrEmpty(source.codigoBase),
    garagemValor: integerOrZero(source.garagemValor),
    dormitorioValor: integerOrZero(source.dormitorioValor),
    linkReal: source.linkReal || '',
    localizacao: source.localizacao || '',
    corretor: formatarNomeRemax(source.corretor || ''),
    linkFoto: stringOrEmpty(source.linkFoto),
    imobiliariaId: source.imobiliariaId || fallbackImobiliariaId || '',
    ativo: source.ativo !== false,
    replicatedAt: stringOrEmpty(source.replicatedAt),
    dataInclusao: stringOrEmpty(source.dataInclusao),
    tipoImovel,
    bairro,
    cidade,
    tipoImovelNome: String(getTipoImovelNome(tipoImovel) || ''),
    bairroNome: String(getBairroNome(bairro, cidade) || ''),
    cidadeNome: String(getCidadeNome(cidade) || ''),
    elevadorValor: integerOrZero(source.elevadorValor),
    ambienteValor: integerOrZero(source.ambienteValor),
    linkCard: stringOrEmpty(source.linkCard),
    banheiroValor: integerOrZero(source.banheiroValor),
    dataExclusao: stringOrEmpty(source.dataExclusao),
    atualizadoEm: stringOrEmpty(source.atualizadoEm),
    duplicado_grupo: stringOrEmpty(source.duplicado_grupo),
    negociacao: stringOrEmpty(source.negociacao),
    precoSobConsulta: source.preco === null || source.precoSobConsulta === true,
  };
}

module.exports = { projectImovelForTypesense };
