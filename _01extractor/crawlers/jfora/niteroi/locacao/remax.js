import { contarLocacaoRemaxFiltrada } from "../../_utils/locacaoContagem.js";
import { extractNiteroiRemax, validarBuscaLocacaoRemax } from "../nitRemax/extractor.js";
import { project as vendas } from "../nitRemax/config.js";

export async function contar(browser, project, { check = false } = {}) {
  validarBuscaLocacaoRemax(project);
  return contarLocacaoRemaxFiltrada(browser, project.url, { projeto: project.collection, salvar: !check });
}

export async function coletar(browser, project, { totalEsperado, check = false, anteriores = new Map() } = {}) {
  validarBuscaLocacaoRemax(project);
  return extractNiteroiRemax(browser, {
    totalEsperado, somentePrimeiraPagina: check, existingDataMap: anteriores,
    projeto: { ...vendas, ...project, transactionType: 260 },
  });
}
