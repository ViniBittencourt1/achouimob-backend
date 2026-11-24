import { carregarEstadoKenloLocacao } from "../../_utils/locacaoKenloExtractor.js";
import { extractPrecoKenloLocacao } from "../../_utils/locacaoKenloPreco.js";
import { parseNiteroiCard } from "../extractor.js";
import { resolverBairroNiteroi } from "../bairro.js";

function validarUrl(project) {
  if (new URL(project.url).pathname !== "/imoveis/para-alugar") throw new Error(`[${project.collection}Locacao] A coleta Kenlo exige /imoveis/para-alugar.`);
}

export async function contar(browser, project, { check = false } = {}) {
  validarUrl(project);
  const page = await browser.newPage();
  try {
    const url = ["nitGrupo", "nitColuna"].includes(project.collection) ? urlPagina(project, 1) : project.url;
    return (await carregarEstadoKenloLocacao(page, url, { projeto: project.collection, salvar: !check })).state.total;
  } finally { await page.close(); }
}

export function mapearCardKenlo(html, project, now = new Date()) {
  const record = parseNiteroiCard(html, { baseUrl: project.url, displayName: project.displayName, projectName: project.collection, now });
  record.preco = extractPrecoKenloLocacao(html);
  const bairro = resolverBairroNiteroi(record.bairro, record.cidade);
  if (bairro) record.bairro = bairro;
  else if (record.bairro) console.warn(`[${project.collection}Locacao] Bairro sem correspondencia unica no catalogo: "${record.bairro}" (${record.cidade}; ${record.linkReal})`);
  return record;
}

function urlPagina(project, pagina, ordenar) {
  const url = new URL(project.url);
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  if (!ordenar && project.collection === "nitColuna") ordenar = "recentes";
  if (ordenar) url.searchParams.set("ordenar", ordenar);
  // No Grupo, a rota sem pagina pode servir um contador desatualizado.
  if (pagina > 1 || project.collection === "nitGrupo") url.searchParams.set("pagina", String(pagina));
  return url.href;
}

export const ORDENACOES_KENLO_LOCACAO = [null, "recentes", "menor-valor", "maior-valor"];

// "Ver mais" some ou duplica cards; a ordem padrão também oscila entre páginas,
// então outras ordenações completam a união até o total informado.
export async function coletarCardsPorPagina(browser, project, totalEsperado, { carregar = carregarEstadoKenloLocacao, ordenacoes = ORDENACOES_KENLO_LOCACAO } = {}) {
  const page = await browser.newPage();
  try {
    const cards = new Map();
    for (const ordenar of ordenacoes) {
      let tamanhoPagina = 0;
      for (let pagina = 1; cards.size < totalEsperado; pagina++) {
        if (tamanhoPagina && pagina > Math.ceil(totalEsperado / tamanhoPagina) + 1) break;
        if (pagina > 200) throw new Error(`[${project.collection}Locacao] Limite de paginas atingido; base preservada.`);
        const url = urlPagina(project, pagina, ordenar);
        const maxTentativasTotal = project.collection === "nitColuna" ? 3 : 1;
        let snapshot;
        for (let tentativa = 1; tentativa <= maxTentativasTotal; tentativa++) {
          snapshot = await carregar(page, url);
          const fimConfirmado = pagina > 1 && !snapshot.info.cards.length &&
            snapshot.state.semImoveisConfirmado && snapshot.state.total === 0;
          if (snapshot.state.total === totalEsperado || fimConfirmado) break;
          if (tentativa === maxTentativasTotal) {
            throw Object.assign(new Error(`[${project.collection}Locacao] Total mudou durante a paginacao: ${totalEsperado} -> ${snapshot.state.total}; base preservada.`), { code: "KENLO_TOTAL_ALTERADO" });
          }
          console.warn(`[${project.collection}Locacao] Pagina ${pagina} retornou total ${snapshot.state.total} (esperado ${totalEsperado}); recarregando (${tentativa + 1}/${maxTentativasTotal}).`);
        }
        const { info, state } = snapshot;
        if (pagina > 1 && !info.cards.length && state.semImoveisConfirmado && state.total === 0) {
          const inicio = await carregar(page, urlPagina(project, 1, ordenar));
          if (inicio.state.total !== totalEsperado) {
            throw Object.assign(new Error(`[${project.collection}Locacao] Total mudou na conferencia da primeira pagina: ${totalEsperado} -> ${inicio.state.total}; base preservada.`), { code: "KENLO_TOTAL_ALTERADO" });
          }
          console.log(`[${project.collection}Locacao] Fim da ordenacao confirmado na pagina ${pagina}; total inicial permanece ${totalEsperado}.`);
          break;
        }
        if (state.total !== totalEsperado) {
          throw Object.assign(new Error(`[${project.collection}Locacao] Total mudou durante a paginacao: ${totalEsperado} -> ${state.total}; base preservada.`), { code: "KENLO_TOTAL_ALTERADO" });
        }
        if (state.semImoveisConfirmado) break;
        if (!info.cards.length) break;
        if (!tamanhoPagina) tamanhoPagina = info.cards.length;
        for (const card of info.cards) cards.set(card.href, card);
        console.log(`[${project.collection}Locacao] ${ordenar ? `ordenar=${ordenar} ` : ""}Pagina ${pagina}: ${cards.size}/${totalEsperado}.`);
        if (info.cards.length < tamanhoPagina) break;
      }
      if (cards.size >= totalEsperado) break;
      console.log(`[${project.collection}Locacao] Ordenacao ${ordenar || "padrao"} incompleta (${cards.size}/${totalEsperado}); tentando outra ordenacao.`);
    }
    return Array.from(cards.values());
  } finally { await page.close(); }
}

export async function coletar(browser, project, { totalEsperado, deps = {} }) {
  validarUrl(project);
  if (!totalEsperado) return [];
  const cards = await coletarCardsPorPagina(browser, project, totalEsperado, deps);
  if (cards.length !== totalEsperado) {
    throw new Error(`[${project.collection}Locacao] Total mudou durante a coleta: ${totalEsperado} -> ${cards.length}; base preservada.`);
  }
  return cards.map(card => mapearCardKenlo(card.html, project));
}
