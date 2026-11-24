// extractor-02-titulo.js
import * as cheerio from "cheerio";

export function extractTitulo(cardHtml) {
  const $ = cheerio.load(cardHtml);
  const cardNode = $('body').children().first();
  // Extrai campos necessários para montar o título
  const tipoImovel = cardNode.find('.imovel-item--tipo').text().trim() || '';
  const localizacao = cardNode.find('.imovel-item--localizacao').text().trim() || '';
  const tituloPrincipal = cardNode.find('.imovel-item--titulo').text().trim() || '';
  // Detalhes adicionais
  const banheiroValor = cardNode.find('.imovel-item--banheiro').text().trim() || '0';
  const garagemValor = cardNode.find('.imovel-item--garagem').text().trim() || '0';
  const areaValor = cardNode.find('.imovel-item--area').text().trim() || '0';
  const preco = cardNode.find('.imovel-item--preco').text().replace(/\D/g, '') || '';

  let tituloCompleto = `${tipoImovel} ${localizacao} ${tituloPrincipal}`.trim().replace(/\s\s+/g, ' ');
  const detalhes = [];
  if (banheiroValor !== '0') detalhes.push(`${banheiroValor} banheiro(s)`);
  if (garagemValor !== '0') detalhes.push(`${garagemValor} vaga(s)`);
  if (areaValor !== '0') detalhes.push(`área ${areaValor} m²`);
  if (detalhes.length > 0) {
    tituloCompleto += ', ' + detalhes.join(', ') + '.';
  }
  if (preco) {
    const precoFormatado = Number(preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    tituloCompleto += ` Valor R$ ${precoFormatado}.`;
  }
  return tituloCompleto;
}
