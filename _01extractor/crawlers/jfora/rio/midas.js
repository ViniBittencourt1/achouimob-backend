import fs from "node:fs";
import { resolverBairroNiteroi, resolverBairroNiteroiDoLink } from "../niteroi/bairro.js";
import { resolverTipoPrefixoCatalogo } from "../niteroi/tipoImovel.js";

const PAGE_SIZE = 15;
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));

const normalizar = value => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const texto = value => String(value ?? "").replace(/\s+/g, " ").trim();
const falhar = (message, project) => new Error(`[${project?.collection ?? "Rio Midas"}] ${message}; dados anteriores preservados.`);

function urlConfigurada(project, negociacao) {
  if (project?.kind !== "midas" || !["venda", "locacao"].includes(negociacao)
    || project.negociacoes && !project.negociacoes.includes(negociacao)) {
    throw falhar("Projeto ou negociacao invalida", project);
  }
  const value = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  if (!value) throw falhar(`Rota ${negociacao} nao configurada`, project);
  let url;
  try { url = new URL(value); } catch { throw falhar("URL de busca invalida", project); }
  const allowedPaths = negociacao === "locacao"
    ? ["/imoveis/venda", "/imoveis/aluguel"]
    : ["/imoveis/venda"];
  if (url.protocol !== "https:" || url.username || url.password || !allowedPaths.includes(url.pathname)) {
    throw falhar(`Rota Midas invalida: ${url.href}`, project);
  }
  return url;
}

function hashParams(url, project) {
  const match = url.hash.match(/^#\/?\?(.+)$/);
  if (!match) throw falhar("Rota de busca invalida", project);
  return new URLSearchParams(match[1]);
}

export function validarUrlMidas(value, project, negociacao, pageNumber) {
  let url;
  try { url = new URL(value); } catch { throw falhar("URL de busca invalida", project); }
  const expected = urlConfigurada(project, negociacao);
  const params = hashParams(url, project);
  const expectedParams = hashParams(expected, project);
  const page = params.get("page") || "1";
  const keys = new Set([...params.keys(), ...expectedParams.keys()]);
  const filtersMatch = [...keys].filter(key => key !== "page")
    .every(key => JSON.stringify(params.getAll(key)) === JSON.stringify(expectedParams.getAll(key)));
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password
    || !filtersMatch || params.getAll("tipoNegocio").length !== 1
    || params.getAll("page").length > 1 || !/^[1-9]\d*$/.test(page)
    || pageNumber !== undefined && Number(page) !== pageNumber) {
    throw falhar(`Rota nao corresponde a ${negociacao} do ${project.displayName}: ${url.href}`, project);
  }
  return url.href;
}

export function buildUrlMidas(project, negociacao, pageNumber) {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw falhar("Pagina invalida", project);
  const url = urlConfigurada(project, negociacao);
  validarUrlMidas(url.href, project, negociacao);
  const params = hashParams(url, project);
  params.set("page", String(pageNumber));
  url.hash = `/?${params.toString()}`;
  return validarUrlMidas(url.href, project, negociacao, pageNumber);
}

export function lerSnapshotMidas() {
  const root = document.querySelector('main[ng-controller="Resultado2Controller"]');
  const scope = root && window.angular?.element(root).scope();
  if (!scope || !scope.info || !Array.isArray(scope.imoveis)) return null;
  const fields = [
    "codigo", "link_detalhe", "titulo", "cidade_nome", "estado_sigla", "localizacao",
    "tipoImovel", "bairro", "dormitorios", "banheiros", "salas", "ambientes", "elevadores",
    "garagem", "areaUtil", "areaTotal", "areaTerreno", "valorVenda", "valorAluguelAnual",
    "tipo_negocio_descricao", "imobiliaria",
  ];
  return {
    heading: document.querySelector("h1.destaque-titulo")?.textContent || "",
    label: document.querySelector("p span.bold.ng-binding")?.parentElement?.textContent || "",
    total: scope.info.total,
    de: scope.info.de,
    ate: scope.info.ate,
    currentPage: scope.currentPage,
    items: scope.imoveis.map(item => ({
      ...Object.fromEntries(fields.map(field => [field, item[field]])),
      imagem_caminho: Array.isArray(item.imagem_caminho)
        ? item.imagem_caminho.map(image => ({
          imagem_caminho: image.imagem_caminho,
          principal: image.principal,
        }))
        : [],
    })),
  };
}

function totalDoTexto(value, pattern, label, project) {
  const match = normalizar(value).match(pattern);
  const total = match ? Number(match[1].replace(/\./g, "")) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw falhar(`${label} ausente ou invalido`, project);
  return total;
}

export function validarSnapshotMidas(snapshot, project, negociacao, pageNumber, totalEsperado) {
  if (!snapshot || !Array.isArray(snapshot.items)) throw falhar("Resposta da listagem ausente", project);
  const headingPattern = negociacao === "venda"
    ? /^\s*(\d[\d.]*)\s+imove(?:l|is)\s+a\s+venda\b/i
    : /^\s*(\d[\d.]*)\s+imove(?:l|is)\s+para\s+alugar\b/i;
  const headingTotal = totalDoTexto(
    snapshot.heading, headingPattern, "Titulo da listagem", project
  );
  const labelTotal = totalDoTexto(
    snapshot.label, /^\s*encontramos\s+(\d[\d.]*)\s+resultados?\s+para\s+sua\s+busca\s*$/i,
    "Contador da listagem", project
  );
  const total = Number(snapshot.total);
  if (!Number.isSafeInteger(total) || total < 0 || total !== headingTotal || total !== labelTotal) {
    throw falhar("Titulo, contador e total da API divergem", project);
  }
  if (totalEsperado !== undefined && total !== totalEsperado) {
    throw falhar(`Total alterado: ${totalEsperado} -> ${total}`, project);
  }
  if (Number(snapshot.currentPage) !== pageNumber) throw falhar("Pagina carregada diverge da URL", project);

  const expectedStart = total === 0 ? 0 : (pageNumber - 1) * PAGE_SIZE + 1;
  const expectedEnd = Math.min(pageNumber * PAGE_SIZE, total);
  const expectedItems = total === 0 ? 0 : expectedEnd - expectedStart + 1;
  if (total > 0 && (Number(snapshot.de) !== expectedStart || Number(snapshot.ate) !== expectedEnd)) {
    throw falhar(`Faixa da pagina invalida: ${snapshot.de}-${snapshot.ate}`, project);
  }
  if (snapshot.items.length !== expectedItems) {
    throw falhar(`Pagina incompleta: ${snapshot.items.length}/${expectedItems}`, project);
  }
  for (const item of snapshot.items) {
    const label = normalizar(item.tipo_negocio_descricao);
    const validLabels = negociacao === "venda"
      ? ["venda", "venda e aluguel"]
      : ["aluguel anual", "venda e aluguel"];
    const validLabel = validLabels.includes(label);
    if (!validLabel) throw falhar(`Imovel com finalidade inesperada: "${item.tipo_negocio_descricao}"`, project);
    if (project.midas?.agencyId && String(item.imobiliaria) !== String(project.midas.agencyId)) {
      throw falhar(`Imovel de outra imobiliaria: ${item.codigo}`, project);
    }
  }
  return { total, items: snapshot.items };
}

function numero(value, field, project) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(result) || result < 0) throw falhar(`${field} invalido: ${value}`, project);
  return result;
}

function cidadeSlug(nome, estado, linkReal, project) {
  const matches = cidades.filter(item =>
    normalizar(item.nome) === normalizar(nome) && item.estado === String(estado ?? "").toUpperCase()
  );
  const slugs = new Set(matches.map(item => item.slug));
  if (slugs.size === 1) return [...slugs][0];
  console.warn(`[${project.collection}] Cidade sem correspondencia unica: "${nome} - ${estado}" (${linkReal})`);
  return texto(nome);
}

function linkCanonico(value, codigo, project, negociacao) {
  const origin = urlConfigurada(project, negociacao).origin;
  let url;
  try { url = new URL(value, origin); } catch { throw falhar("Link do imovel invalido", project); }
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.origin !== origin || url.username || url.password || parts.length !== 3 || parts[0] !== "imovel"
    || decodeURIComponent(parts[2]) !== codigo) {
    throw falhar(`Link fora da origem ou sem codigo esperado: ${url.href}`, project);
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

export function mapearMidas(item, project, negociacao, now = new Date(), { precoSobConsultaConfirmado = false } = {}) {
  if (!item || typeof item !== "object") throw falhar("Card invalido", project);
  const codigoBase = texto(item.codigo);
  if (!codigoBase) throw falhar("Card sem codigo", project);
  const linkReal = linkCanonico(item.link_detalhe, codigoBase, project, negociacao);
  const titleSource = texto(item.titulo);
  const titulo = titleSource.replace(/\s+-\s+(?:R\$\s*[\d.,]+|(?:sob\s+)?consulta|consulte)\s*$/i, "").trim();
  const localizacao = texto(item.localizacao);
  const cidadeOriginal = texto(item.cidade_nome);
  const estado = texto(item.estado_sigla).toUpperCase();
  if (!titulo || !localizacao || !cidadeOriginal || !estado) {
    throw falhar(`Card sem titulo ou localizacao: ${linkReal}`, project);
  }

  let bairroOriginal = texto(item.bairro);
  if (!bairroOriginal && project.midas?.bairroNaLocalizacao) {
    const separador = localizacao.lastIndexOf(",");
    const cidadeEstado = texto(localizacao.slice(separador + 1));
    if (separador < 0 || normalizar(cidadeEstado) !== normalizar(`${cidadeOriginal} - ${estado}`)) {
      throw falhar(`Localizacao sem cidade e estado esperados: ${linkReal}`, project);
    }
    bairroOriginal = texto(localizacao.slice(0, separador).split(" - ").at(-1));
    if (!bairroOriginal) throw falhar(`Bairro ausente na localizacao: ${linkReal}`, project);
  }

  const cidade = cidadeSlug(cidadeOriginal, estado, linkReal, project);
  const bairroCatalogo = resolverBairroNiteroi(bairroOriginal, cidade)
    || (project.collection === "rioImoveisDoRio" && !bairroOriginal
      ? resolverBairroNiteroiDoLink(linkReal, cidade)
      : "");
  if (!bairroCatalogo && bairroOriginal) {
    console.warn(`[${project.collection}] Bairro fora do catalogo: "${bairroOriginal}" (${cidade}; ${linkReal})`);
  }
  const tipoOriginal = texto(item.tipoImovel);
  const tipoImovel = resolverTipoPrefixoCatalogo(tipoOriginal);
  if (!tipoImovel) console.warn(`[${project.collection}] Tipo fora do catalogo: "${tipoOriginal}" (${linkReal})`);

  const priceField = negociacao === "venda" ? "valorVenda" : "valorAluguelAnual";
  const priceLabel = negociacao === "venda" ? "Preco de venda" : "Preco de aluguel";
  let preco = null;
  if (item[priceField] !== null && item[priceField] !== undefined && item[priceField] !== "") {
    preco = numero(item[priceField], priceLabel, project);
    if (preco === 0) {
      const semPrecoPublicado = negociacao === "venda" && project.midas?.vendaZeroSemPreco
        && !/R\$\s*[\d.,]+/i.test(titleSource);
      if (!/consulta/i.test(titleSource) && !semPrecoPublicado && !precoSobConsultaConfirmado) throw falhar(`${priceLabel} zero: ${linkReal}`, project);
      if (semPrecoPublicado) console.warn(`[${project.collection}] Preco de venda nao informado: ${linkReal}`);
      preco = null;
    }
  } else if (!/consulta/i.test(titleSource)) {
    throw falhar(`${priceLabel} ausente: ${linkReal}`, project);
  }

  const areaValor = [item.areaUtil, item.areaTotal, item.areaTerreno]
    .map(value => numero(value, "Area", project))
    .find(value => value > 0) ?? 0;
  const images = Array.isArray(item.imagem_caminho) ? item.imagem_caminho : [];
  const image = images.find(value => String(value?.principal) === "1") || images[0];
  const rawImage = texto(image?.imagem_caminho);
  const timestamp = now.toISOString();

  return {
    linkReal, titulo, preco, localizacao,
    tipoImovel: tipoImovel || tipoOriginal,
    bairro: bairroCatalogo || bairroOriginal, cidade,
    dormitorioValor: numero(item.dormitorios, "Dormitorios", project),
    banheiroValor: numero(item.banheiros, "Banheiros", project),
    ambienteValor: numero(item.salas ?? item.ambientes, "Ambientes", project),
    areaValor,
    garagemValor: numero(item.garagem, "Garagem", project),
    elevadorValor: numero(item.elevadores, "Elevadores", project),
    codigoBase, linkCard: linkReal, corretor: project.displayName,
    dataInclusao: timestamp, dataExclusao: "",
    linkFoto: rawImage ? new URL(rawImage, urlConfigurada(project, negociacao).origin).href : "",
    atualizadoEm: timestamp,
  };
}

export function validarConsultaDetalheMidas(detalhe, codigo, project, negociacao = "locacao") {
  const codigoEncontrado = texto(detalhe?.codigo);
  const precos = Array.isArray(detalhe?.precos) ? detalhe.precos : [];
  const modalidade = negociacao === "venda" ? "venda" : "aluguel";
  const valores = precos.filter(item => normalizar(item.tipo).replace(/:$/, "") === modalidade);
  if (codigoEncontrado !== codigo || !valores.length
    || valores.some(item => normalizar(item.valor) !== "sob consulta")) {
    throw falhar(`Preco de ${modalidade} sob consulta nao confirmado no detalhe: ${codigo}`, project);
  }
}

async function confirmarConsultaDetalhe(browser, item, project, negociacao) {
  const codigo = texto(item.codigo);
  const link = linkCanonico(item.link_detalhe, codigo, project, negociacao);
  const page = await browser.newPage();
  try {
    const response = await page.goto(link, { waitUntil: "networkidle2", timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw falhar(`HTTP ${status} no detalhe: ${link}`, project);
    if (linkCanonico(page.url(), codigo, project, negociacao) !== link) throw falhar(`Detalhe redirecionado: ${link}`, project);
    const detalhe = await page.evaluate(() => {
      const body = document.body?.innerText || "";
      const codigo = body.match(/C[oó]digo do Im[oó]vel\s+([^\s]+)/i)?.[1] || "";
      const precos = [...document.querySelectorAll("li")].map(li => ({
        tipo: li.querySelector(".descricao-transacao")?.textContent || "",
        valor: li.querySelector(".valor-transacao")?.textContent || "",
      })).filter(item => item.tipo && item.valor);
      for (const elemento of document.querySelectorAll("p.preco")) {
        const tipo = elemento.querySelector("span")?.textContent || "";
        const valor = [...elemento.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent).join(" ");
        if (tipo && valor.trim()) precos.push({ tipo, valor });
      }
      return { codigo, precos };
    });
    validarConsultaDetalheMidas(detalhe, codigo, project, negociacao);
    console.warn(`[${project.collection}] ${negociacao === "venda" ? "Venda" : "Aluguel"} sob consulta confirmado no detalhe: ${link}`);
  } finally {
    await page.close();
  }
}

async function aguardarResultado(page, negociacao, pageNumber) {
  await page.waitForFunction((expectedNegotiation, expectedPage) => {
    const root = document.querySelector('main[ng-controller="Resultado2Controller"]');
    const scope = root && window.angular?.element(root).scope();
    const heading = document.querySelector("h1.destaque-titulo")?.textContent || "";
    const normalized = heading.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const expectedHeading = expectedNegotiation === "venda"
      ? /imoveis a venda/.test(normalized)
      : /imoveis para alugar/.test(normalized);
    const total = Number(scope?.info?.total);
    const start = total === 0 ? 0 : (expectedPage - 1) * 15 + 1;
    const end = Math.min(expectedPage * 15, total);
    return expectedHeading && Number(scope?.currentPage) === expectedPage
      && Number.isSafeInteger(total) && total >= 0
      && (total === 0 || Number(scope?.info?.de) === start && Number(scope?.info?.ate) === end)
      && Array.isArray(scope?.imoveis) && scope.imoveis.length === (total === 0 ? 0 : end - start + 1);
  }, { timeout: 45000 }, negociacao, pageNumber);
}

async function navegarPagina(page, pageNumber) {
  await page.evaluate(targetPage => {
    const root = document.querySelector('main[ng-controller="Resultado2Controller"]');
    const scope = root && window.angular?.element(root).scope();
    if (!scope || typeof scope.atualizaUrl !== "function" || typeof scope.atualizaImoveis !== "function") {
      throw new Error("Paginacao Midas indisponivel");
    }
    scope.atualizaUrl("page", targetPage);
    scope.atualizaImoveis(false);
  }, pageNumber);
}

async function carregarPagina(browser, project, negociacao, pageNumber, totalEsperado, pageCompartilhada, reabrir = false) {
  const page = pageCompartilhada || await browser.newPage();
  try {
    if (pageCompartilhada && pageNumber > 1 && !reabrir) {
      await navegarPagina(page, pageNumber);
      await aguardarResultado(page, negociacao, pageNumber);
      validarUrlMidas(page.url(), project, negociacao, pageNumber);
      return validarSnapshotMidas(await page.evaluate(lerSnapshotMidas), project, negociacao, pageNumber, totalEsperado);
    }
    const locacaoViaControle = negociacao === "locacao" && project.midas?.locacaoViaControl;
    const projetoInicial = locacaoViaControle ? { ...project, negociacoes: ["venda", "locacao"] } : project;
    const initialUrl = buildUrlMidas(projetoInicial, locacaoViaControle ? "venda" : negociacao, locacaoViaControle ? 1 : pageNumber);
    const response = await page.goto(initialUrl, {
      waitUntil: "networkidle2", timeout: 90000,
    });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) throw falhar(`HTTP ${status} na pagina ${pageNumber}`, project);
    await page.waitForFunction(lerSnapshotMidas, { timeout: 45000 });
    if (locacaoViaControle) {
      await page.evaluate(() => {
        const root = document.querySelector('main[ng-controller="Resultado2Controller"]');
        const scope = root && window.angular?.element(root).scope();
        if (!scope || typeof scope.tipoNegocioSelecionado !== "function") {
          throw new Error("Controle de aluguel Midas nao encontrado");
        }
        scope.tipoNegocioSelecionado("AA");
      });
      await aguardarResultado(page, "locacao", 1);
      if (pageNumber > 1) {
        await navegarPagina(page, pageNumber);
      }
    }
    await aguardarResultado(page, negociacao, pageNumber);
    validarUrlMidas(page.url(), project, negociacao, pageNumber);
    return validarSnapshotMidas(await page.evaluate(lerSnapshotMidas), project, negociacao, pageNumber, totalEsperado);
  } finally {
    if (!pageCompartilhada) await page.close();
  }
}

async function carregarPaginaComTentativas(browser, project, negociacao, pageNumber, totalEsperado, abaCompartilhada) {
  const tentativas = project.midas?.tentativasTimeout ?? 1;
  if (!Number.isSafeInteger(tentativas) || tentativas < 1 || tentativas > 3) {
    throw falhar("Numero de tentativas invalido", project);
  }
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await carregarPagina(browser, project, negociacao, pageNumber, totalEsperado, abaCompartilhada?.page, tentativa > 1);
    } catch (error) {
      if (error?.name !== "TimeoutError") throw error;
      if (tentativa === tentativas) {
        throw new Error(`[${project.collection}] Tempo esgotado na pagina ${pageNumber} apos ${tentativa} tentativa(s); dados anteriores preservados.`, { cause: error });
      }
      console.warn(`[${project.collection}] Tempo esgotado na pagina ${pageNumber}; tentando novamente (${tentativa + 1}/${tentativas}).`);
      if (abaCompartilhada) {
        await abaCompartilhada.page.close();
        abaCompartilhada.page = null;
        abaCompartilhada.page = await browser.newPage();
      }
    }
  }
}

export async function contarMidasRio(browser, project, negociacao) {
  return (await carregarPaginaComTentativas(browser, project, negociacao, 1)).total;
}

export async function coletarMidasRio(browser, project, negociacao, {
  totalEsperado, primeiraPagina = false,
} = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem obrigatoria", project);
  const pages = Math.max(1, Math.ceil(totalEsperado / PAGE_SIZE));
  const records = new Map();
  const abaCompartilhada = negociacao === "venda" && project.midas?.paginacaoNaMesmaAba
    ? { page: await browser.newPage() } : null;
  try {
    for (let pageNumber = 1; pageNumber <= (primeiraPagina ? 1 : pages); pageNumber++) {
      const snapshot = await carregarPaginaComTentativas(browser, project, negociacao, pageNumber, totalEsperado, abaCompartilhada);
      for (const item of snapshot.items) {
        const valor = negociacao === "venda" ? item.valorVenda : item.valorAluguelAnual;
        const confirmarZero = negociacao === "venda" ? project.midas?.confirmarVendaZeroNoDetalhe : project.midas?.confirmarAluguelZeroNoDetalhe;
        const precisaConfirmar = confirmarZero
          && valor !== null && valor !== undefined && valor !== ""
          && numero(valor, `Preco de ${negociacao === "venda" ? "venda" : "aluguel"}`, project) === 0 && !/consulta/i.test(texto(item.titulo));
        if (precisaConfirmar) await confirmarConsultaDetalhe(browser, item, project, negociacao);
        const record = mapearMidas(item, project, negociacao, new Date(), { precoSobConsultaConfirmado: precisaConfirmar });
        if (records.has(record.linkReal)) throw falhar(`Imovel repetido: ${record.linkReal}`, project);
        records.set(record.linkReal, record);
      }
      console.log(`[${project.collection}] Pagina ${pageNumber}/${pages}: ${records.size}/${totalEsperado} imoveis unicos.`);
    }
  } finally {
    if (abaCompartilhada?.page) await abaCompartilhada.page.close();
  }
  if (!primeiraPagina && records.size !== totalEsperado) {
    throw falhar(`Coleta incompleta: ${records.size}/${totalEsperado}`, project);
  }
  return [...records.values()];
}
