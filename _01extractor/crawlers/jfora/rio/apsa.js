import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolverBairroNiteroi } from "../niteroi/bairro.js";
import { resolverTipoNiteroi } from "../niteroi/tipoImovel.js";

const PAGE_SIZE = 12;
const DETALHES_SIMULTANEOS = 3;
const falhar = message => new Error(`[rioApsa] ${message}; dados anteriores preservados.`);

function lerEnderecoUsuarioWindows() {
  let output;
  try {
    output = execFileSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe"),
      ["query", "HKCU\\Environment", "/v", "APSA_API_URL"],
      { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw falhar("Nao foi possivel ler APSA_API_URL do usuario Windows; configure a variavel no ambiente do processo ou do usuario");
  }
  const match = output.match(/^\s*APSA_API_URL\s+REG_SZ\s+(.+?)\s*$/im);
  if (!match) throw falhar("APSA_API_URL do usuario Windows ausente ou em formato invalido");
  return match[1];
}

export function resolverEnderecoApi({ value = process.env.APSA_API_URL, platform = process.platform, lerUsuario = lerEnderecoUsuarioWindows } = {}) {
  if (!value && platform === "win32") value = lerUsuario();
  if (!value) throw falhar("Defina APSA_API_URL com o endereco autorizado da busca de aluguel");
  let url;
  try { url = new URL(value); } catch { throw falhar("APSA_API_URL invalida"); }
  if (url.protocol !== "https:" || url.hostname !== "erp.iy2b.com" || url.username || url.password
    || !/^\/systemakers\/sli\/rest\/msiteimobbuscaimv\/post\/pesquisar\/pesqImoveis\/asp-pkasa\/[^/]+\/endpoint$/.test(url.pathname)
    || url.search || url.hash) {
    throw falhar("APSA_API_URL nao corresponde ao servico de busca da Apsa");
  }
  return url.href;
}

function enderecoApi() {
  const url = resolverEnderecoApi();
  if (!process.env.APSA_API_URL && process.platform === "win32") process.env.APSA_API_URL = url;
  return url;
}

export async function buscarPaginaApsa(page, { request = fetch } = {}) {
  if (!Number.isSafeInteger(page) || page < 1) throw falhar("Pagina invalida");
  const response = await request(enderecoApi(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipoFiltro: "L", lstAondeLocal: "5", tpObjImovel: "L",
      infoPag: { nroPagina: page, tamPagina: PAGE_SIZE, totRegistros: 0, direcao: "ASC" },
      txIdApp: "iy2b-pkasa",
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw falhar(`HTTP ${response.status} na pagina ${page}`);
  const result = await response.json();
  if (!Array.isArray(result?.mensagens)) throw falhar("Resposta sem mensagens");
  const lists = result.mensagens.filter(item => item.id === "listaGeoJsonVO");
  const totals = result.mensagens.filter(item => item.id === "totRegs");
  if (lists.length !== 1 || !Array.isArray(lists[0].lista) || totals.length > 1) {
    throw falhar(`Resposta invalida na pagina ${page}`);
  }
  let total;
  if (totals.length === 1) {
    const raw = String(totals[0].mensagem ?? "");
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw falhar("Total invalido");
    total = Number(raw);
  }
  if (page === 1 && total === undefined) throw falhar("Total ausente na primeira pagina");
  return { items: lists[0].lista, total };
}

export async function buscarBairroApsa(codigoInterno, { request = fetch } = {}) {
  const codigo = String(codigoInterno ?? "").trim();
  if (!/^\d+$/.test(codigo)) throw falhar("Codigo interno invalido para consulta de detalhes");
  const url = new URL(enderecoApi());
  url.pathname = url.pathname.replace("/pesqImoveis/", "/pesqDetalheImovel/");
  const response = await request(url.href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cdPessoaEmpOrigem: "{{EMPRESA_ORIGEM}}", cdImovel: codigo }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw falhar(`HTTP ${response.status} nos detalhes do imovel ${codigo}`);
  const result = await response.json();
  const detalhe = result?.modeloPadrao;
  const bairro = typeof detalhe?.bairro === "string" ? detalhe.bairro.trim() : "";
  if (result?.id !== "detalhe" || String(detalhe?.cdImovel) !== codigo
    || detalhe?.cidade !== "RIO DE JANEIRO" || detalhe?.uf !== "RJ"
    || detalhe?.objetivo !== "LOCACAO" || !bairro) {
    throw falhar(`Detalhes invalidos ou bairro ausente no imovel ${codigo}`);
  }
  return bairro;
}

function numero(value, field, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw falhar(`${field} ausente`);
    return 0;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (required && n === 0)) throw falhar(`${field} invalido`);
  return n;
}

export function mapearApsa(feature, now = new Date()) {
  const p = feature?.properties;
  if (!p || String(p.cdCidade) !== "7043" || p.flgAluguel !== "S" || p.tpObjImovel !== "L") {
    throw falhar("Imovel fora da cidade ou finalidade selecionada");
  }
  const codigoBase = String(p.chImovel ?? "").trim();
  const interno = String(p.cdImovel ?? "").trim();
  const tipo = String(p.noTpImovel ?? "").trim();
  const endereco = String(p.endereco ?? "").trim();
  if (!/^\d+$/.test(codigoBase) || !/^\d+$/.test(interno) || !tipo || !endereco) {
    throw falhar("Imovel sem codigo, tipo ou endereco");
  }
  const link = new URL("https://apsa.com.br/aluguel/detalhe/");
  link.searchParams.set("codImovel", interno);
  const foto = String(p.noEndFotoPrinc ?? "").trim();
  if (foto && !/^[a-zA-Z0-9_.-]+$/.test(foto)) throw falhar(`Foto invalida: ${codigoBase}`);
  const tipoImovel = resolverTipoNiteroi(tipo);
  const timestamp = now.toISOString();
  return {
    linkReal: link.href, titulo: `${tipo} para alugar - ${endereco}`,
    preco: numero(p.vlrAluguel, "Preco de aluguel", true),
    localizacao: [endereco, String(p.nrImovel ?? "").trim(), "Rio de Janeiro - RJ"].filter(Boolean).join(", "),
    tipoImovel: tipoImovel || tipo, bairro: "", cidade: "rio-de-janeiro-rj",
    dormitorioValor: numero(p.nrDorms, "Dormitorios"),
    banheiroValor: numero(p.nrBanheiros, "Banheiros"),
    ambienteValor: 0, areaValor: numero(p.vlrArea, "Area"),
    garagemValor: numero(p.nrVagas, "Vagas"), elevadorValor: 0,
    codigoBase, linkCard: link.href, corretor: "Apsa", dataInclusao: timestamp,
    dataExclusao: "", linkFoto: foto ? `https://os.iy2b.com/objectstorage/portalkasa.com.br/storage/asp-pkasa/fotos/${foto}` : "",
    atualizadoEm: timestamp,
  };
}

export async function contarApsa(_browser, _project, negociacao) {
  if (negociacao !== "locacao") throw falhar("Somente aluguel e suportado");
  return (await buscarPaginaApsa(1)).total;
}

export async function coletarApsa(_browser, _project, negociacao, { totalEsperado, primeiraPagina = false, request = fetch } = {}) {
  if (negociacao !== "locacao") throw falhar("Somente aluguel e suportado");
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw falhar("Precontagem invalida");
  const pages = Math.max(1, Math.ceil(totalEsperado / PAGE_SIZE));
  const records = [];
  const codes = new Set();
  const links = new Set();
  for (let page = 1; page <= (primeiraPagina ? 1 : pages); page++) {
    const result = await buscarPaginaApsa(page, { request });
    if (result.total !== undefined && result.total !== totalEsperado) throw falhar("Total alterado");
    const expected = Math.min(PAGE_SIZE, Math.max(0, totalEsperado - (page - 1) * PAGE_SIZE));
    if (result.items.length !== expected) throw falhar(`Pagina ${page} incompleta: ${result.items.length}/${expected}`);
    const pagina = [];
    for (const feature of result.items) {
      const item = mapearApsa(feature);
      if (codes.has(item.codigoBase) || links.has(item.linkReal)) throw falhar(`Imovel duplicado: ${item.codigoBase}`);
      codes.add(item.codigoBase);
      links.add(item.linkReal);
      pagina.push({ item, codigoInterno: String(feature.properties.cdImovel) });
    }
    for (let i = 0; i < pagina.length; i += DETALHES_SIMULTANEOS) {
      const lote = pagina.slice(i, i + DETALHES_SIMULTANEOS);
      const resultados = await Promise.allSettled(lote.map(({ codigoInterno }) => buscarBairroApsa(codigoInterno, { request })));
      const erro = resultados.find(result => result.status === "rejected");
      if (erro) throw erro.reason;
      for (let j = 0; j < lote.length; j++) {
        const bairroNome = resultados[j].value;
        const { item } = lote[j];
        const bairro = resolverBairroNiteroi(bairroNome, item.cidade);
        if (!bairro) console.warn(`[rioApsa] Bairro fora do catalogo: "${bairroNome}" (${item.cidade}; ${item.linkReal})`);
        item.bairro = bairro || bairroNome;
        item.localizacao = item.localizacao.replace(", Rio de Janeiro - RJ", `, ${bairroNome}, Rio de Janeiro - RJ`);
        records.push(item);
      }
    }
    console.log(`[rioApsa] Pagina ${page}/${pages}: ${records.length}/${totalEsperado}.`);
  }
  return records;
}
