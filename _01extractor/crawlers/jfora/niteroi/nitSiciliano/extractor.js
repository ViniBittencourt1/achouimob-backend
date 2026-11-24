import fs from "node:fs";
import { JSDOM } from "jsdom";
import { resolverBairroNiteroi } from "../bairro.js";
import { resolverTipoNiteroi, resolverTipoPrefixoCatalogo } from "../tipoImovel.js";
import { parseTotalVendas, validarUrlContagemVendas } from "../../_utils/vendasContagem.js";
import { projetoContagemVendas } from "../../_utils/vendasContagemProjetos.js";
import { project } from "./config.js";

const cidades = JSON.parse(fs.readFileSync(new URL("../../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"));
const normalizar = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function numero(value, decimalPonto = false) {
  const text = value.replace(/\s+/g, "").replace(/m²$/, "");
  const pattern = decimalPonto ? /^\d+(?:\.\d+)?$/ : /^\d+(?:\.\d{3})*(?:,\d+)?$/;
  if (!pattern.test(text)) throw new Error(`[nitSiciliano] Numero nao reconhecido: ${value}`);
  return Number(decimalPonto ? text : text.replace(/\./g, "").replace(",", "."));
}

export function parseCardSiciliano(html, now = new Date(), { negociacao = "venda", projeto = project } = {}) {
  if (!["venda", "aluguel"].includes(negociacao)) throw new Error("[nitSiciliano] Negociacao invalida.");
  const dom = new JSDOM(html, { url: projeto.url });
  try {
    const doc = dom.window.document;
    const text = selector => doc.querySelector(selector)?.textContent.trim() || "";
    const root = doc.querySelector(".LI_Imovel");
    if (!root?.querySelector(negociacao === "venda" ? ".salePurposeClass" : ".rentPurposeClass")) throw new Error(`[nitSiciliano] Card sem finalidade de ${negociacao}.`);
    const anchor = doc.querySelector("a.Title");
    if (!anchor) throw new Error("[nitSiciliano] Card sem link.");
    const link = new URL(anchor.href);
    if (link.origin !== new URL(projeto.url).origin || link.pathname === "/") throw new Error(`[nitSiciliano] Link fora da origem: ${link.href}`);
    link.hash = "";
    link.search = "";
    const linkReal = link.href;
    const titulo = anchor.textContent.trim();
    const codigoBase = text(".ImovelId .id");
    if (!titulo || !codigoBase) throw new Error(`[nitSiciliano] Titulo ou referencia ausente: ${linkReal}`);
    const price = [...doc.querySelectorAll(".ImageSide .ImovelValor")].find(element =>
      (negociacao === "venda" ? /valor de venda/i : /(?:pre[c\u00e7]o|valor) de aluguel\s*\(mensal\)/i).test(element.textContent));
    if (!price) throw new Error(`[nitSiciliano] Preco de ${negociacao} ausente: ${linkReal}`);
    const priceValue = price.querySelector(".value")?.textContent.replace("R$", "").trim();
    let preco;
    if (priceValue && /\d/.test(priceValue)) preco = numero(priceValue);
    else if (/consult|contato/i.test(price.textContent)) preco = null;
    else throw new Error(`[nitSiciliano] Preco nao reconhecido: ${linkReal}`);
    const nomeCidade = text(".Endereco .cidade");
    const estado = text(".Endereco .Estado");
    const uf = normalizar(estado) === "rio de janeiro" ? "RJ" : /^[A-Z]{2}$/.test(estado) ? estado : "";
    const slugs = new Set(cidades.filter(item => normalizar(item.nome) === normalizar(nomeCidade) &&
      (!uf || item.estado === uf)).map(item => item.slug));
    const cidade = slugs.size === 1 ? slugs.values().next().value : nomeCidade;
    if (slugs.size !== 1) console.warn(`[nitSiciliano] Cidade sem correspondencia unica: "${nomeCidade}" / ${estado} (${linkReal})`);
    const bairroExtraido = text(".Endereco .Bairro");
    const bairro = resolverBairroNiteroi(bairroExtraido, cidade);
    if (!bairro) console.warn(`[nitSiciliano] Bairro sem correspondencia unica: "${bairroExtraido}" (${cidade}; ${linkReal})`);
    const tipoExtraido = text(".SubCategoria");
    // Categorias compostas (ex.: "Flat/Loft/Estúdio") sao desempatadas pelo inicio do titulo.
    const tipoImovel = resolverTipoNiteroi(tipoExtraido) || resolverTipoPrefixoCatalogo(titulo) ||
      resolverTipoPrefixoCatalogo(tipoExtraido);
    if (!tipoImovel) console.warn(`[nitSiciliano] Tipo sem correspondencia: "${tipoExtraido}" (${linkReal})`);
    const feature = name => {
      const value = text(`.ResumoItem.${name} .val`);
      if (!value) return 0;
      const limites = value.split("~");
      if (limites.length === 1) return numero(value, true);
      if (limites.length !== 2) throw new Error(`[nitSiciliano] Faixa invalida: ${value} (${linkReal})`);
      const [min, max] = limites.map(item => numero(item, true));
      if (max < min) throw new Error(`[nitSiciliano] Faixa invertida: ${value} (${linkReal})`);
      console.warn(`[nitSiciliano] ${name} informado como faixa "${value}"; usando minimo ${min} (${linkReal})`);
      return min;
    };
    const image = doc.querySelector(".ImageSide img");
    const imageUrl = image?.getAttribute("src");
    const localizacao = [text(".Endereco .Rua"), text(".Endereco .Numero"), bairroExtraido, nomeCidade, estado]
      .filter(Boolean).join(", ");
    const timestamp = now.toISOString();
    return {
      linkReal, titulo, preco, localizacao, tipoImovel: tipoImovel || tipoExtraido,
      bairro: bairro || bairroExtraido, cidade,
      dormitorioValor: feature("BEDROOM"), banheiroValor: feature("BATHROOM"),
      ambienteValor: feature("ROOM"),
      areaValor: feature("AREA_USEFUL") || feature("AREA_TOTAL"),
      garagemValor: feature("GARAGE"),
      elevadorValor: doc.querySelector(".groupDetails .Elevador") ? 1 : 0,
      codigoBase, linkCard: linkReal, corretor: projeto.displayName,
      dataInclusao: timestamp, dataExclusao: "",
      linkFoto: imageUrl ? new URL(imageUrl, projeto.url).href : "", atualizadoEm: timestamp,
    };
  } finally { dom.window.close(); }
}

export function lerListagemSiciliano() {
  return {
    cards: [...document.querySelectorAll(".BuscaResultado .LI_Imovel")].map(item => item.outerHTML),
    label: document.querySelector("h1")?.textContent || "",
    hasMore: Boolean(document.querySelector(".BtnShowMoreImovel")),
  };
}

export async function extractSicilianoSales(browser, { totalEsperado, somentePrimeiraPagina = false,
  negociacao = "venda", projeto = project, parseTotal } = {}) {
  if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error("[nitSiciliano] Precontagem obrigatoria.");
  if (!["venda", "aluguel"].includes(negociacao)) throw new Error("[nitSiciliano] Negociacao invalida.");
  const config = negociacao === "venda" ? projetoContagemVendas(project.collection) : null;
  if (!config && typeof parseTotal !== "function") throw new Error("[nitSiciliano] Leitor de contagem obrigatorio.");
  const page = await browser.newPage();
  try {
    const response = await page.goto(projeto.url, { waitUntil: "networkidle2", timeout: 90000 });
    if (!response?.ok()) throw new Error(`[nitSiciliano] HTTP ${response?.status()}; base preservada.`);
    if (config) validarUrlContagemVendas(config, page.url());
    else if (new URL(page.url()).origin !== new URL(projeto.url).origin || new URL(page.url()).pathname !== "/imoveis/aluguel") throw new Error("[nitSiciliano] Redirecionamento fora de aluguel.");
    let before = -1;
    for (let lote = 1; ; lote++) {
      const snapshot = await page.evaluate(lerListagemSiciliano);
      if ((config ? parseTotalVendas(snapshot.label, config) : parseTotal(snapshot.label)) !== totalEsperado) throw new Error("[nitSiciliano] Contagem mudou; base preservada.");
      const records = new Map(snapshot.cards.map(html => {
        const record = parseCardSiciliano(html, new Date(), { negociacao, projeto });
        return [record.linkReal, record];
      }));
      if (records.size > totalEsperado || (totalEsperado > 0 && records.size <= before)) {
        throw new Error("[nitSiciliano] Coleta duplicada, sem progresso ou acima da contagem; base preservada.");
      }
      const percentual = totalEsperado ? records.size / totalEsperado * 100 : 100;
      console.log(`[nitSiciliano] Lote ${lote}: ${records.size}/${totalEsperado} imoveis unicos (${percentual.toFixed(1)}%).`);
      if (records.size === totalEsperado) return [...records.values()];
      if (!records.size || !snapshot.hasMore) throw new Error("[nitSiciliano] Coleta incompleta; base preservada.");
      if (somentePrimeiraPagina) return [...records.values()];
      before = records.size;
      await page.click(".BtnShowMoreImovel");
      await page.waitForFunction(count => document.querySelectorAll(".BuscaResultado .LI_Imovel").length > count,
        { timeout: 60000 }, snapshot.cards.length);
    }
  } finally { await page.close(); }
}
