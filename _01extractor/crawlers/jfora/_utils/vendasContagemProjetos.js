import { projetosLocacaoPadrao } from './locacaoPadraoProjetos.js';
import { projetosLocacaoKenlo } from './locacaoKenloProjetos.js';
import { projetosLocacaoImobBrasil } from './locacaoImobBrasilProjetos.js';
import { projetosNiteroiVendas } from '../niteroi/projects.js';
import { projetosNiteroiImobBrasil } from '../niteroi/imobBrasil/projects.js';
import { project as siciliano } from '../niteroi/nitSiciliano/config.js';
import { project as gustavo } from '../niteroi/nitGustavo/config.js';
import { project as drin } from '../niteroi/nitDrin/config.js';
import { project as realiza } from '../niteroi/nitRealiza/config.js';
import { project as remaxNiteroi } from '../niteroi/nitRemax/config.js';
import { projetosRioKenlo } from '../rio/projects.js';

const total = '(\\d+|\\d{1,3}(?:\\.\\d{3})+)';
const layouts = {
  realiza: { selector: 'h1.texto-topo-busca', pattern: `^\\s*${total}\\s+Imove(?:l|is)\\s+a\\s+venda\\b` },
  midas: { selector: 'p span.bold.ng-binding', parentText: true, pattern: `^\\s*Encontramos\\s+${total}\\s+resultados?\\s+para\\s+sua\\s+busca\\s*$` },
  c49: { selector: '.c49-filter-number', pattern: `^\\s*${total}\\s*$` },
  apresentame: { selector: 'h1', pattern: `^\\s*${total}\\s+Imoveis\\s+a\\s+venda\\s+encontrados\\s*$` },
  padrao: { selector: '#title--label', pattern: `\\(\\s*${total}\\s*\\)`, empty: 'o filtro nao retornou nenhum imovel' },
  imobbrasil: { selector: '.topsearch__total', pattern: `^\\s*${total}\\s+imove(?:l|is)\\s+encontrad` },
  imperial: { selector: '.grid-3', pattern: `^\\s*${total}\\s+imove(?:l|is)\\s+encontrad` },
  imobbrasilClassico: { selector: '.lista_imoveis_paginacao .fontepadrao_cor_grande', pattern: `^\\s*Imoveis\\s+Encontrados:\\s*${total}\\s*$` },
  kenlo: { selector: 'h1', pattern: `^\\s*(?:Exibindo\\s*)?${total}\\s*(?:Imoveis|Imovel|Loja|Apartamento|Cobertura|Casa|Sala|Terreno|Galpao)`, empty: 'nao encontramos imoveis para a sua busca' },
  acervo: { selector: 'h1[class*="Title_resultTitle__"]', pattern: `^\\s*${total}\\s+imove(?:l|is)\\s+(?:a venda|para (?:venda|comprar))(?:\\s+em\\s+.+)?\\s*$` },
  colibex: { selector: 'span.heading-color.fw600', pattern: `(?:^|\\s)${total}\\s+resultados?\\s*$` },
  soares: { selector: 'p span.bold.ng-binding', parentText: true, pattern: `^\\s*Encontramos\\s+${total}\\s+resultados?\\s+para\\s+sua\\s+busca\\s*$` },
  start: { selector: 'h4.top15.left15', pattern: `^\\s*${total}\\s+imove(?:l|is)\\s+encontrados?\\s*$` },
  toc2: { selector: 'h2[class*="Properties_qtd1__"]', pattern: `^\\s*${total}\\s+Encontrados?\\s*$` },
  invest: { selector: '#ContentPlaceHolder1_lblQuantidadeImoveisEncontrados h1', pattern: `^\\s*Vendas?\\s*-\\s*${total}\\s+Imove(?:l|is)\\s+encontrados?\\s*$` },
  mega: { selector: '.wpgb-facet[data-facet="10"][data-grid="4"] .wpgb-result-count', pattern: `^\\s*${total}\\s*$` },
  remax: { selector: 'p', pattern: `^\\s*${total}\\s+Numero\\s+total\\s+de\\s+correspondencias\\s*$` },
  predial: { selector: 'body', pattern: `(?:^|\\s)${total}\\s+im[oó]veis?\\s+encontrados?`, empty: 'nenhum imovel' },
  couto: { selector: '.pagesNav', pattern: `\\bde\\s+${total}\\s+resultados?\\s*$` },
  oliveira: { selector: 'label', pattern: `^\\s*${total}\\s+opcoes\\s+encontrado\\(s\\)\\s*$` },
  kantto: { selector: 'span[class*="list-search-header_numberOfResults"]', pattern: `^\\s*${total}\\s+resultados?\\s*$` },
  souzaRocha: { selector: '.rh_pagination__stats', pattern: `fora\\s+de\\s+${total}\\s+imoveis\\s*$` },
  lider: { selector: '.ct-lista-topo__total', pattern: `^\\s*${total}\\s+imove(?:l|is)\\s*$` },
  tecimob: { selector: 'title', pattern: `Foram encontrados ${total} imove(?:l|is)` },
};

function config(folder, collection, kind, url) {
  if (collection === 'jfFluxo') {
    const sorted = new URL(url);
    sorted.searchParams.set('ord', 'recentes');
    url = sorted.href;
  }
  // Kenlo: a coleta pagina com ordenar=recentes, e o total exibido muda conforme a ordenacao.
  if (kind === 'kenlo') {
    const sorted = new URL(url);
    sorted.searchParams.set('ordenar', 'recentes');
    url = sorted.href;
  }
  return { folder, collection, kind, url, ...layouts[kind] };
}

export const projetosContagemVendas = [
  ...projetosLocacaoPadrao.map(project => {
    const url = new URL(project.urlVenda);
    url.searchParams.set('preco_min', '');
    url.searchParams.set('preco_max', '');
    return config(project.folder, project.collection, 'padrao', url.href);
  }),
  ...projetosLocacaoKenlo.filter(project => project.collection !== 'jfGm').map(project => config(project.folder, project.collection, 'kenlo', project.url.replace('/para-alugar', '/a-venda'))),
  ...projetosLocacaoImobBrasil.filter(project => project.collection !== 'jfLider').map(project => config(project.folder, project.collection, project.collection === 'jfImperial' ? 'imperial' : 'imobbrasil', project.url.replace('/locacao', '/venda'))),
  config('1000Imoveis', 'jf1000Imoveis', 'padrao', 'https://1000imoveisjf.com.br/imoveis?negociacao=venda'),
  config('souzagomes', 'jfSouzaGomes', 'padrao', 'https://souzagomes.com.br/imoveis?negociacao=venda'),
  config('adMyHouse', 'jfAdMyHouse', 'acervo', 'https://www.admyhouse.com.br/imoveis/a-venda/brasil?order=mais_relevantes'),
  config('gm', 'jfGm', 'c49', 'https://www.gmimoveisjf.com.br/imobiliaria/venda/imoveis/1/1?tipo=1&ordem=recentes'),
  config('estrelaSul', 'jfEstrelaSul', 'kenlo', 'https://www.estrelasulimoveis.com.br/imoveis/a-venda'),
  config('acervo', 'jfAcervo', 'acervo', 'https://www.acervoimoveis.com.br/imoveis/a-venda/juiz-de-fora-mg?order=mais_relevantes'),
  config('bomClima', 'jfBomClima', 'acervo', 'https://www.bomclimaimoveisjf.com.br/imoveis/a-venda/juiz-de-fora-mg?order=mais_relevantes'),
  config('aCasas', 'jfACasas', 'colibex', 'https://acasas.com.br/pesquisa?transacao=Venda'),
  config('fogel', 'jfFogel', 'colibex', 'https://fogel.com.br/pesquisa?transacao=Venda'),
  config('soares', 'jfSoares', 'soares', 'https://www.secimoveis.com.br/imoveis/venda/#/?tipoNegocio=VA,VL&n=1&ordem=valor-ASC&mb=s&slug=0&page=1'),
  config('start', 'jfStart', 'start', 'https://www.startimoveisjf.com.br/imoveis.php?negocio=1'),
  config('toc2', 'jfToc2', 'toc2', 'https://www.toc2imoveis.com.br/imoveis/venda/-/-/-/-'),
  config('invest', 'jfInvest', 'invest', 'https://www.invest.com.br/ResultadoBusca.aspx?fin=1&tit=Imoveis-para-comprar-e-vender-em-juiz-de-foras'),
  config('mega', 'jfMega', 'mega', 'https://megacasaimoveis.com.br/imovel/?_acao=venda'),
  config('remax', 'jfRemax', 'remax', 'https://www.remax.com.br/listings?City=6579324&CityNM=6579324-Juiz+de+Fora%2C+Minas+Gerais&ListingClass=-1&TransactionTypeUID=261'),
  config('couto', 'jfCouto', 'couto', 'https://www.coutoguerraimoveis.com.br/search?acao=s1&finalidade_s=2'),
  config('oliveira', 'jfOliveira', 'oliveira', 'https://oliveiramendesimoveisjf.com.br/localizar/localizar-imovel?filter%5Bcategoria_catid%5D=-40&task=search'),
  config('kantto', 'jfKantto', 'kantto', 'https://www.kanttoimoveis.com.br/venda?transacao=%22venda%22'),
  config('souzaRocha', 'jfSouzaRocha', 'souzaRocha', 'https://souzarochaimoveis.com.br/pesquisa/?status%5B%5D=venda&view=list'),
  config('lider', 'jfLider', 'imobbrasil', 'https://www.lidernegociosimob.com.br/imovel/venda'),
  config('holder', 'jfHolder', 'tecimob', 'https://holderimob.com.br/comprar/imoveis'),
  ...projetosNiteroiVendas.map(project => config(project.folder, project.collection, project.collection === 'nitPredial' ? 'predial' : 'kenlo', project.url)),
  ...projetosRioKenlo.filter(project => project.enabled && new URL(project.urlVendas).pathname === '/imoveis/a-venda')
    .map(project => config(project.folder, project.collection, 'kenlo', project.urlVendas)),
  ...projetosNiteroiImobBrasil.map(project => config(project.folder, project.collection, project.kind, project.url)),
  config(siciliano.folder, siciliano.collection, siciliano.kind, siciliano.url),
  config(gustavo.folder, gustavo.collection, gustavo.kind, gustavo.url),
  config(drin.folder, drin.collection, drin.kind, drin.url),
  config(realiza.folder, realiza.collection, realiza.kind, realiza.url),
  config(remaxNiteroi.folder, remaxNiteroi.collection, remaxNiteroi.kind, remaxNiteroi.url),
];

export function projetoContagemVendas(name) {
  const project = projetosContagemVendas.find(item => item.collection.toLowerCase() === String(name).toLowerCase() || item.folder.toLowerCase() === String(name).toLowerCase());
  if (!project) throw new Error(`Projeto sem configuracao de contagem de vendas: ${name}`);
  return project;
}