import { parseImovelRealiza } from "../niteroi/nitRealiza/extractor.js";

const origem = "https://www.forteimoveisconsultoria.com.br";
const caminho = "/imoveis/todas-as-cidades/todos-os-bairros/0-quartos/0-suite-ou-mais/0-vaga/0-banheiro-ou-mais/todos-os-condominios";
const tamanhoPagina = 20;
const falhar = message => new Error(`[rioForte] ${message}; dados anteriores preservados.`);
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();

function validarProjeto(project, negociacao) {
  if (project?.collection !== "rioForte" || project.kind !== "forte" || !["venda", "locacao"].includes(negociacao)) throw falhar("Projeto ou modalidade invalida");
  const finalidade = negociacao === "venda" ? "venda" : "aluguel";
  const expected = `${origem}/${finalidade}${caminho}?valorminimo=0&valormaximo=0&pagina=1`;
  if ((negociacao === "venda" ? project.urlVendas : project.urlLocacao) !== expected) throw falhar("Rota ou filtros invalidos");
  return finalidade;
}

export function parametrosForte(project, negociacao, pagina) {
  const finalidade = validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(pagina) || pagina < 1) throw falhar("Pagina invalida");
  const campos = {
    finalidade, codigounidade: "", codigosimoveis: "", codigocidade: 0, codigoregiao: 0,
    codigosbairros: 0, endereco: 0, numeroquartos: 0, numerovagas: 0, numerobanhos: 0,
    numerosuite: 0, numerovaranda: 0, numeroelevador: 0, valorde: 0, valorate: 0,
    areade: 0, areaate: 0, extras: 0, extends: false, mobiliado: false, dce: false,
    piscina: false, sauna: false, salaofestas: false, academia: false, boxDespejo: false,
    portaria24h: false, aceitafinanciamento: false, arealazer: false, quartoqtdeexata: false,
    vagaqtdexata: false, destaque: 0, opcaoimovel: 4, retornomapa: false, retornomapaapp: false,
    numeropagina: 1, numeroregistros: tamanhoPagina, ordenacao: "valordesc", pagina, codigocondominio: "0",
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(campos)) params.set(`imovel[${key}]`, String(value));
  params.set("imovel[codigoTipo][codigo]", "");
  return params;
}

export async function buscarPaginaForte(project, negociacao, pagina, { request = fetch, aguardar = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const body = parametrosForte(project, negociacao, pagina);
  let response;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      response = await request(`${origem}/imoveis/ajax/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body, signal: AbortSignal.timeout(60000), redirect: "error",
      });
      break;
    } catch (error) {
      const code = error?.cause?.code;
      if (tentativa === 3 || !(error?.name === "TimeoutError" || ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "UND_ERR_SOCKET"].includes(code))) throw error;
      console.warn(`[rioForte] Falha de conexao na pagina ${pagina}; tentativa ${tentativa + 1}/3.`);
      await aguardar(tentativa * 3000);
    }
  }
  if (!response.ok) throw falhar(`HTTP ${response.status} na pagina ${pagina}`);
  const data = await response.json();
  if (!Number.isSafeInteger(data?.quantidade) || data.quantidade < 0 || !Array.isArray(data.lista)) throw falhar(`Resposta invalida na pagina ${pagina}`);
  const expected = Math.max(0, Math.min(tamanhoPagina, data.quantidade - (pagina - 1) * tamanhoPagina));
  if (data.lista.length !== expected) throw falhar(`Pagina ${pagina} incompleta: ${data.lista.length}/${expected}`);
  return { total: data.quantidade, items: data.lista };
}

export function mapearForte(item, project, negociacao, now = new Date()) {
  const finalidade = validarProjeto(project, negociacao);
  const codigo = texto(item?.codigo);
  const slug = texto(item?.titulo);
  const tipo = texto(item?.tipo);
  const bairro = texto(item?.bairro);
  const cidade = texto(item?.cidade);
  const estado = texto(item?.estado).toUpperCase();
  if (!/^[1-9]\d*$/.test(codigo) || !/^[a-z0-9-]+$/i.test(slug) || !tipo || !bairro || !cidade || !/^[A-Z]{2}$/.test(estado)) throw falhar(`Anuncio incompleto: ${codigo}`);
  const titulo = `${tipo} - ${bairro}, ${cidade} - ${estado}`;
  const areaNaoMetrica = texto(item.tipomedida) !== "m²";
  if (areaNaoMetrica) console.warn(`[rioForte] Unidade de area nao suportada "${texto(item.tipomedida)}" no imovel ${codigo}; area nao informada.`);
  const areas = areaNaoMetrica ? { areainterna: "", areaprincipal: "", arealote: "" } : {};
  return parseImovelRealiza({ ...item, ...areas, url_amigavel: slug, titulo }, now, {
    negociacao: finalidade, projeto: { ...project, url: project.urlVendas },
  });
}

export async function contarForte(_browser, project, negociacao) {
  return (await buscarPaginaForte(project, negociacao, 1)).total;
}

export async function coletarForte(_browser, project, negociacao, { totalEsperado, primeiraPagina = false, request = fetch, aguardar = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  validarProjeto(project, negociacao);
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem invalida");
  const pages = Math.max(1, Math.ceil(totalEsperado / tamanhoPagina));
  const result = [];
  const codigos = new Set();
  const links = new Set();
  const now = new Date();
  for (let pagina = 1; pagina <= (primeiraPagina ? 1 : pages); pagina++) {
    const data = await buscarPaginaForte(project, negociacao, pagina, { request, aguardar });
    if (data.total !== totalEsperado) throw falhar(`Total alterado: ${totalEsperado} -> ${data.total}`);
    for (const raw of data.items) {
      const item = mapearForte(raw, project, negociacao, now);
      if (codigos.has(item.codigoBase) || links.has(item.linkReal)) throw falhar(`Anuncio duplicado: ${item.codigoBase}`);
      codigos.add(item.codigoBase);
      links.add(item.linkReal);
      result.push(item);
    }
    console.log(`[rioForte] ${negociacao} pagina ${pagina}/${pages}: ${result.length}/${totalEsperado}.`);
    if (pagina < pages && !primeiraPagina) await aguardar(300);
  }
  return result;
}
