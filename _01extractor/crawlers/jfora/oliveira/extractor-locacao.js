import fs from "node:fs";
import { load } from "cheerio";
import { collectCardsKenloLocacao } from "../_utils/locacaoKenloExtractor.js";
import { extractPrecoKenloLocacao } from "../_utils/locacaoKenloPreco.js";
import { resolverBairroCatalogo } from "../_utils/bairroCatalogo.js";

const cidades = JSON.parse(fs.readFileSync(new URL('../../../../_03database/filtros/_brCidades.json', import.meta.url), 'utf8'));
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const slug = value => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const URL_LOCACAO_OLIVEIRA = "https://www.joliveirajf.com.br/imoveis/para-alugar";

export function mapOliveiraLocacao(card) {
  const document = load(card.html);
  const tipo = document('p.card-with-buttons__title').first().text().trim();
  const heading = document('h2.card-with-buttons__heading').first().clone();
  heading.children().remove();
  const local = heading.text().trim();
  const parts = local.split(/\s+-\s+/);
  const cityName = parts[1] || '';
  const cidade = cidades.find(item => normalize(item.nome) === normalize(cityName))?.slug || slug(`${cityName}-${parts[2] || 'MG'}`);
  const bairro = resolverBairroCatalogo(parts[0], cidade) || slug(parts[0]);
  const values = document('ul li').toArray().map(item => document(item).text());
  const metric = pattern => {
    const match = values.map(value => value.match(pattern)).find(Boolean);
    return match ? Number(match[1].replace(',', '.')) : 0;
  };
  const agora = new Date().toISOString();
  const item = {
    linkReal: card.href, titulo: [tipo, local].filter(Boolean).join(' | '), preco: extractPrecoKenloLocacao(card.html), localizacao: local,
    tipoImovel: slug(tipo), bairro, cidade, dormitorioValor: metric(/(\d+)\s*quartos?/i), banheiroValor: metric(/(\d+)\s*banheiros?/i), ambienteValor: 0,
    areaValor: metric(/([\d.,]+)\s*m[\u00b22]/i), garagemValor: metric(/(\d+)\s*vagas?/i), elevadorValor: 0,
    codigoBase: document('p.card-with-buttons__code').first().text().trim(), linkCard: 0, corretor: 'Oliveira', dataInclusao: agora, dataExclusao: '',
    linkFoto: document('img').first().attr('src') || document('img').first().attr('data-src') || '', atualizadoEm: agora,
  };
  if (!item.codigoBase || !item.cidade || !tipo) throw new Error('Card Oliveira sem campos essenciais.');
  return item;
}

export async function extractOliveiraLocacao(browser) {
  const result = await collectCardsKenloLocacao(browser, { collection: 'jfOliveira', url: URL_LOCACAO_OLIVEIRA });
  return { imoveisRaspados: result.cards.map(mapOliveiraLocacao), semImoveisConfirmado: result.semImoveisConfirmado };
}