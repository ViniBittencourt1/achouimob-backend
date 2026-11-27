import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolverTipoCatalogo } from '../../_01extractor/crawlers/jfora/_1Jf/tipos-alugueis.js';

const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });

function calendarDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

export function dataRegistro(value) {
  if (typeof value !== 'string' || !value.trim() || value === '0') return null;
  const text = value.trim();
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})(?: \d{2}:\d{2}(?::\d{2})?)?$/.exec(text);
  if (brazilian) return calendarDate(brazilian[3], brazilian[2], brazilian[1]);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return calendarDate(iso[1], iso[2], iso[3]);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  if (!calendarDate(text.slice(0, 4), text.slice(5, 7), text.slice(8, 10))) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : localDate.format(date);
}

function identity(record, file, index) {
  if (record.linkReal) {
    try {
      const url = new URL(record.linkReal);
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      throw new Error(`${file}: linkReal invalido no registro ${index + 1}.`);
    }
  }
  const code = String(record.codigoBase ?? '').trim();
  if (code && code !== '0') return `codigo:${code}`;
  return null;
}

function resumirVendas(rows) {
  const vendas = rows.filter(row => row.negociacao === 'venda');
  const comPreco = vendas.filter(row => row.preco > 0);
  const totalVendas = comPreco.length ? comPreco.reduce((sum, row) => sum + row.preco, 0) : null;
  const comArea = comPreco.filter(row => row.area > 0);
  return {
    totalVendas,
    ticketMedio: totalVendas === null ? null : totalVendas / comPreco.length,
    valorM2: comArea.length ? comArea.reduce((sum, row) => sum + row.preco, 0) / comArea.reduce((sum, row) => sum + row.area, 0) : null,
    comPreco: comPreco.length,
    comArea: comArea.length,
    vendas: vendas.length,
  };
}

function ranquearBairros(rows, criterio, geral) {
  const groups = new Map();
  for (const row of rows) {
    const bairro = row.bairro.trim();
    const key = JSON.stringify([row.cidade, bairro]);
    if (!groups.has(key)) groups.set(key, { cidade: row.cidade, bairro, registros: [] });
    groups.get(key).registros.push(row);
  }
  return [...groups.values()].map(group => {
    const financeiro = resumirVendas(group.registros);
    const item = {
      cidade: group.cidade,
      bairro: group.bairro,
      quantidade: group.registros.length,
      totalVendas: financeiro.totalVendas,
      ticketMedio: financeiro.ticketMedio,
      valorM2: financeiro.valorM2,
      comPreco: financeiro.comPreco,
    };
    const valor = item[criterio];
    const referencia = criterio === 'quantidade' ? rows.length : geral[criterio];
    const percentual = valor === null || !referencia ? null
      : criterio === 'ticketMedio' ? (valor / referencia - 1) * 100 : valor / referencia * 100;
    return { ...item, valor, percentual };
  }).sort((a, b) => {
    if (a.valor === null && b.valor !== null) return 1;
    if (b.valor === null && a.valor !== null) return -1;
    return (b.valor ?? 0) - (a.valor ?? 0)
      || a.bairro.localeCompare(b.bairro, 'pt-BR') || a.cidade.localeCompare(b.cidade, 'pt-BR');
  });
}

export async function carregarDados(directory, catalogPath = new URL('../../_03database/filtros/_brTipoImovel.json', import.meta.url)) {
  const catalogoTipos = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (!catalogoTipos.tiposPorSlug || typeof catalogoTipos.tiposPorSlug !== 'object' || Array.isArray(catalogoTipos.tiposPorSlug)) {
    throw new Error('Catalogo de tipos invalido: tiposPorSlug ausente.');
  }
  const tipos = Object.entries(catalogoTipos.tiposPorSlug).map(([slug, aliases]) => {
    if (!Array.isArray(aliases)) throw new Error(`Catalogo de tipos invalido: aliases de ${slug}.`);
    const principals = aliases.filter((item, index) => Object.hasOwn(item || {}, 'principal')
      ? String(item.principal || 'sim').trim().toLowerCase() === 'sim' : index === 0);
    if (principals.length !== 1 || !String(principals[0]?.nome || '').trim()) {
      throw new Error(`Catalogo de tipos invalido: ${slug} precisa de um unico nome principal.`);
    }
    return { slug, nome: principals[0].nome.trim() };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const tiposPorValor = new Map();
  const files = (await readdir(directory)).filter(file =>
    /^(?:jf|nit|uba|rio)[a-z0-9-]+(?:RetiradosVendas|RetiradosLocacao|Locacao)?\.json$/i.test(file)
    && !/Historico/i.test(file)).sort((a, b) => Number(/Retirados/i.test(a)) - Number(/Retirados/i.test(b)) || a.localeCompare(b));
  if (!files.length) throw new Error('Nenhuma base de imoveis encontrada na pasta crawler.');
  const ativos = new Map();
  const entradas = new Map();
  const saidas = new Map();
  let semInclusao = 0;
  let semExclusao = 0;
  let semIdentidade = 0;
  for (const file of files) {
    const records = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    if (!Array.isArray(records)) throw new Error(`${file}: a base precisa ser uma lista.`);
    const history = /Retirados/i.test(file);
    const negociacao = /Locacao/i.test(file) ? 'aluguel' : 'venda';
    const imobiliaria = file.replace(/(?:RetiradosVendas|RetiradosLocacao|Locacao)?\.json$/i, '');
    for (const [index, record] of records.entries()) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`${file}: registro ${index + 1} invalido.`);
      const id = identity(record, file, index);
      if (!id) {
        semIdentidade++;
        continue;
      }
      const key = JSON.stringify([imobiliaria, negociacao, id]);
      const inclusao = dataRegistro(record.dataInclusao);
      const exclusao = dataRegistro(record.dataExclusao);
      const removed = history || record.ativo === false || (record.dataExclusao != null && !['', '0'].includes(String(record.dataExclusao).trim()));
      const tipoOriginal = String(record.tipoImovel || 'nao-informado').trim() || 'nao-informado';
      if (!tiposPorValor.has(tipoOriginal)) tiposPorValor.set(tipoOriginal, resolverTipoCatalogo(tipoOriginal, catalogoTipos) || tipoOriginal);
      const row = {
        titulo: String(record.titulo || record.codigoBase || 'Sem titulo'),
        codigo: String(record.codigoBase ?? ''),
        cidade: String(record.cidade || 'nao-informada'),
        bairro: String(record.bairro || ''),
        tipo: tiposPorValor.get(tipoOriginal),
        imobiliaria,
        negociacao,
        preco: typeof record.preco === 'number' && Number.isFinite(record.preco) ? record.preco : null,
        area: typeof record.areaValor === 'number' && Number.isFinite(record.areaValor) ? record.areaValor : null,
        linkReal: String(record.linkReal || ''),
        inclusao,
        exclusao,
        retirado: removed,
        arquivo: file,
      };
      if (!removed && !ativos.has(key)) ativos.set(key, row);
      if (inclusao) {
        const eventKey = JSON.stringify([key, inclusao]);
        if (!entradas.has(eventKey)) entradas.set(eventKey, row);
      } else semInclusao++;
      if (removed) {
        if (exclusao) {
          const eventKey = JSON.stringify([key, exclusao]);
          if (!saidas.has(eventKey)) saidas.set(eventKey, row);
        } else semExclusao++;
      }
    }
  }
  const all = [...ativos.values(), ...entradas.values(), ...saidas.values()];
  return {
    ativos: [...ativos.values()],
    entradas: [...entradas.values()],
    saidas: [...saidas.values()],
    cidades: [...new Set(all.map(row => row.cidade))].sort(),
    tipos,
    catalogoTipos,
    arquivos: files.length,
    carregadoEm: new Date().toISOString(),
    avisos: { semInclusao, semExclusao, semIdentidade },
  };
}

const dayMs = 86400000;
const isoDay = date => date.toISOString().slice(0, 10);

function mesAnterior(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return isoDay(date);
}

function resumirMovimentacao(data, rows, match, visao, inicio, fim, params) {
  const diasAtual = (Date.parse(fim) - Date.parse(inicio)) / dayMs + 1;
  const escalaInformada = params.get('escala') || 'auto';
  if (!['auto', 'dia', 'semana', 'mes', 'ano'].includes(escalaInformada)) throw new Error('Escala temporal invalida.');
  const escala = escalaInformada === 'auto'
    ? diasAtual <= 31 ? 'dia' : diasAtual <= 120 ? 'semana' : diasAtual <= 730 ? 'mes' : 'ano'
    : escalaInformada;
  const inicioComparacao = params.get('compararInicio') ?? mesAnterior(inicio);
  const fimComparacao = params.get('compararFim') ?? mesAnterior(fim);
  if (params.has('compararInicio') !== params.has('compararFim')
    || dataRegistro(inicioComparacao) !== inicioComparacao || dataRegistro(fimComparacao) !== fimComparacao
    || !/^\d{4}-\d{2}-\d{2}$/.test(inicioComparacao) || !/^\d{4}-\d{2}-\d{2}$/.test(fimComparacao)
    || inicioComparacao > fimComparacao) throw new Error('Periodo de comparacao invalido. Informe ambas as datas em ordem.');
  const field = visao === 'saidas' ? 'exclusao' : 'inclusao';
  const counts = new Map();
  function inicioGrupo(value) {
    const date = new Date(`${value}T00:00:00Z`);
    if (escala === 'semana') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    if (escala === 'mes' || escala === 'ano') date.setUTCDate(1);
    if (escala === 'ano') date.setUTCMonth(0);
    return isoDay(date);
  }
  for (const row of rows) {
    const key = inicioGrupo(row[field]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const pontos = [];
  let cursor = inicioGrupo(inicio);
  while (cursor <= fim) {
    if (pontos.length >= 1000) throw new Error('Mais de 1000 intervalos no grafico. Escolha uma escala maior ou reduza o periodo.');
    const next = new Date(`${cursor}T00:00:00Z`);
    if (escala === 'dia' || escala === 'semana') next.setUTCDate(next.getUTCDate() + (escala === 'dia' ? 1 : 7));
    if (escala === 'mes') next.setUTCMonth(next.getUTCMonth() + 1);
    if (escala === 'ano') next.setUTCFullYear(next.getUTCFullYear() + 1);
    const quantidade = counts.get(cursor) || 0;
    const anterior = pontos.at(-1)?.quantidade;
    pontos.push({
      inicio: cursor < inicio ? inicio : cursor,
      fim: isoDay(new Date(Math.min(Date.parse(fim), next.getTime() - dayMs))),
      quantidade,
      variacaoPercentual: anterior > 0 ? (quantidade / anterior - 1) * 100 : null,
    });
    cursor = isoDay(next);
  }
  const totalAnterior = data[visao].filter(row => match(row) && row[field]
    && row[field] >= inicioComparacao && row[field] <= fimComparacao).length;
  return {
    escala,
    pontos,
    comparacao: {
      inicioAtual: inicio, fimAtual: fim, inicioAnterior: inicioComparacao, fimAnterior: fimComparacao,
      totalAtual: rows.length, totalAnterior, diferenca: rows.length - totalAnterior,
      variacaoPercentual: totalAnterior > 0 ? (rows.length / totalAnterior - 1) * 100 : null,
      diasAtual, diasAnterior: (Date.parse(fimComparacao) - Date.parse(inicioComparacao)) / dayMs + 1,
      sobreposicao: inicio <= fimComparacao && fim >= inicioComparacao,
    },
  };
}

export function consultarDados(data, params, agora = new Date()) {
  const cidade = params.get('cidade') || '';
  const tipoInformado = params.get('tipo') || '';
  const tipo = tipoInformado ? resolverTipoCatalogo(tipoInformado, data.catalogoTipos) : '';
  if (tipoInformado && !data.tipos.some(item => item.slug === tipo)) {
    throw new Error('Tipo de imovel invalido: selecione um tipo principal do catalogo.');
  }
  const negociacao = params.get('negociacao') || 'venda';
  const visao = params.get('visao') || 'entradas';
  const criterioRanking = params.get('ranking') || 'quantidade';
  const temBairro = params.has('bairro') || params.has('bairroCidade');
  if (temBairro && (!params.has('bairro') || !params.get('bairroCidade'))) {
    throw new Error('Filtro de bairro invalido: informe bairro e cidade.');
  }
  const inicio = params.get('inicio') || '';
  const fim = params.get('fim') || '';
  const pagina = Number(params.get('pagina') || 1);
  if (!['venda', 'aluguel', 'todos'].includes(negociacao) || !['ativos', 'entradas', 'saidas'].includes(visao)
    || !['quantidade', 'totalVendas', 'ticketMedio'].includes(criterioRanking)
    || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) || dataRegistro(inicio) !== inicio
    || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || dataRegistro(fim) !== fim || inicio > fim
    || !Number.isSafeInteger(pagina) || pagina < 1) throw new Error('Filtros invalidos. Confira negociacao, visao, datas, pagina e criterio do ranking.');
  const match = row => (!cidade || row.cidade === cidade) && (!tipo || row.tipo === tipo)
    && (negociacao === 'todos' || row.negociacao === negociacao);
  const inPeriod = date => date && date >= inicio && date <= fim;
  const ativos = data.ativos.filter(match);
  const entradas = data.entradas.filter(row => match(row) && inPeriod(row.inclusao));
  const saidas = data.saidas.filter(row => match(row) && inPeriod(row.exclusao));
  const rows = { ativos, entradas, saidas }[visao];
  const temporal = visao === 'ativos' || temBairro ? null : resumirMovimentacao(data, rows, match, visao, inicio, fim, params);
  const financeiro = resumirVendas(rows);
  const rankingBairros = temBairro ? [] : ranquearBairros(rows, criterioRanking, financeiro);
  const exibidos = temBairro ? rows.filter(row => row.cidade === params.get('bairroCidade')
    && row.bairro.trim() === params.get('bairro')
    && (criterioRanking === 'quantidade' || (row.negociacao === 'venda' && row.preco > 0))) : rows;
  const valorM2Bairro = temBairro ? resumirVendas(exibidos).valorM2 : null;
  const hoje = localDate.format(agora);
  const dateField = visao === 'saidas' ? 'exclusao' : 'inclusao';
  exibidos.sort((a, b) => (b[dateField] || '').localeCompare(a[dateField] || '') || a.titulo.localeCompare(b.titulo));
  const paginas = Math.max(1, Math.ceil(exibidos.length / 50));
  const currentPage = Math.min(pagina, paginas);
  return {
    cidades: data.cidades,
    tipos: data.tipos,
    tipoSelecionado: tipo,
    arquivos: data.arquivos,
    carregadoEm: data.carregadoEm,
    avisos: data.avisos,
    totais: { ativos: ativos.length, entradas: entradas.length, saidas: saidas.length },
    financeiro,
    temporal,
    criterioRanking,
    rankingBairros,
    valorM2Bairro,
    registros: exibidos.slice((currentPage - 1) * 50, currentPage * 50).map(row => {
      const fimPermanencia = row.retirado ? row.exclusao : hoje;
      const dias = row.inclusao && fimPermanencia
        ? (Date.parse(fimPermanencia) - Date.parse(row.inclusao)) / 86400000 : null;
      const valorM2 = row.negociacao === 'venda' && row.preco > 0 && row.area > 0 ? row.preco / row.area : null;
      const variacaoM2Bairro = valorM2 !== null && valorM2Bairro !== null
        ? (valorM2 / valorM2Bairro - 1) * 100 : null;
      return { ...row, permanenciaDias: dias !== null && dias >= 0 ? dias : null, valorM2, variacaoM2Bairro };
    }),
    referenciaPermanencia: hoje,
    pagina: currentPage,
    paginas,
    total: exibidos.length,
  };
}
