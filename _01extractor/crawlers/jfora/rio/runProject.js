import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { abrirBrowser } from "../../../services/puppeteerPool.js";
import { registrarTotalImoveis } from "../_utils/locacaoContagem.js";
import { sincronizarVendas } from "../_utils/vendasSincronizacao.js";
import { sincronizarLocacao } from "../_utils/locacaoSincronizacao.js";
import { getProjetoRio, RIO_SPREADSHEET_ID } from "./projects.js";
import { contarKenloRio, coletarKenloRio } from "./kenlo.js";
import { exportToSheets } from "./sheets.js";

export async function runProjetoRio(name, negociacao = "venda", {
  check = false, checkCompleto = false,
  browserFactory = abrirBrowser, contar = contarKenloRio, coletar = coletarKenloRio,
  registrar = registrarTotalImoveis, syncVendas = sincronizarVendas, syncLocacao = sincronizarLocacao,
  outputPath,
} = {}) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error("Negociacao Rio invalida.");
  const project = getProjetoRio(name);
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  const supportsNegotiation = project.negociacoes
    ? project.negociacoes.includes(negociacao)
    : Boolean(url);
  if (!project.enabled) throw new Error(`[${project.collection}] Projeto desabilitado; dados preservados.`);
  if (!["kenlo", "praedium", "cj", "midas", "apsa", "novaEpoca", "inforce", "universal", "renascenca", "privilegio", "lopes", "remax", "luciene", "netimoveis", "forte", "atlantica", "homeHub", "invexo", "jailson", "mg", "rjardim"].includes(project.kind) || !url || !supportsNegotiation) {
    throw new Error(`[${project.collection}] Coletor ou rota ${negociacao} ainda nao configurado; dados preservados.`);
  }
  if (project.kind === "forte") {
    const { contarForte, coletarForte } = await import("./forte.js");
    if (contar === contarKenloRio) contar = contarForte;
    if (coletar === coletarKenloRio) coletar = coletarForte;
  } else if (["luciene", "netimoveis"].includes(project.kind)) {
    const { contarLuciene, coletarLuciene } = await import("./luciene.js");
    if (contar === contarKenloRio) contar = contarLuciene;
    if (coletar === coletarKenloRio) coletar = coletarLuciene;
  } else if (project.kind === "remax") {
    const { contarRemaxRio, coletarRemaxRio } = await import("./remax.js");
    if (contar === contarKenloRio) contar = contarRemaxRio;
    if (coletar === coletarKenloRio) coletar = coletarRemaxRio;
  } else if (project.kind === "lopes") {
    const { contarLopes, coletarLopes } = await import("./lopes.js");
    if (contar === contarKenloRio) contar = contarLopes;
    if (coletar === coletarKenloRio) coletar = coletarLopes;
  } else if (project.kind === "privilegio") {
    const { contarPrivilegio, coletarPrivilegio } = await import("./privilegio.js");
    if (contar === contarKenloRio) contar = contarPrivilegio;
    if (coletar === coletarKenloRio) coletar = coletarPrivilegio;
  } else if (project.kind === "novaEpoca") {
    const { contarNovaEpoca, coletarNovaEpoca } = await import("./novaEpoca.js");
    if (contar === contarKenloRio) contar = contarNovaEpoca;
    if (coletar === coletarKenloRio) coletar = coletarNovaEpoca;
  } else if (project.kind === "inforce") {
    const { contarInforce, coletarInforce } = await import("./inforce.js");
    if (contar === contarKenloRio) contar = contarInforce;
    if (coletar === coletarKenloRio) coletar = coletarInforce;
  } else if (["universal", "renascenca"].includes(project.kind)) {
    const { contarUniversal, coletarUniversal } = await import("./universal.js");
    if (contar === contarKenloRio) contar = contarUniversal;
    if (coletar === coletarKenloRio) coletar = coletarUniversal;
  } else if (project.kind === "apsa") {
    const { contarApsa, coletarApsa } = await import("./apsa.js");
    if (contar === contarKenloRio) contar = contarApsa;
    if (coletar === coletarKenloRio) coletar = coletarApsa;
  } else if (project.kind === "midas") {
    const { contarMidasRio, coletarMidasRio } = await import("./midas.js");
    if (contar === contarKenloRio) contar = contarMidasRio;
    if (coletar === coletarKenloRio) {
      if (negociacao === "venda" && project.midas?.limitesFaixasVenda) {
        const { coletarFaixasMidas } = await import("./faixasMidas.js");
        coletar = coletarFaixasMidas;
      } else coletar = coletarMidasRio;
    }
  } else if (project.kind === "atlantica") {
    const { contarAtlantica, coletarAtlantica } = await import("./atlantica.js");
    if (contar === contarKenloRio) contar = contarAtlantica;
    if (coletar === coletarKenloRio) coletar = coletarAtlantica;
  } else if (project.kind === "homeHub") {
    const { contarHomeHub, coletarHomeHub } = await import("./homeHub.js");
    if (contar === contarKenloRio) contar = contarHomeHub;
    if (coletar === coletarKenloRio) coletar = coletarHomeHub;
  } else if (project.kind === "invexo") {
    const { contarInvexo, coletarInvexo } = await import("./invexo.js");
    if (contar === contarKenloRio) contar = contarInvexo;
    if (coletar === coletarKenloRio) coletar = coletarInvexo;
  } else if (project.kind === "jailson") {
    const { contarJailson, coletarJailson } = await import("./jailson.js");
    if (contar === contarKenloRio) contar = contarJailson;
    if (coletar === coletarKenloRio) coletar = coletarJailson;
  } else if (project.kind === "mg") {
    const { contarMg, coletarMg } = await import("./mg.js");
    if (contar === contarKenloRio) contar = contarMg;
    if (coletar === coletarKenloRio) coletar = coletarMg;
  } else if (project.kind === "rjardim") {
    const { contarRjardim, coletarRjardim } = await import("./rjardim.js");
    if (contar === contarKenloRio) contar = contarRjardim;
    if (coletar === coletarKenloRio) coletar = coletarRjardim;
  } else if (project.kind !== "kenlo") {
    const { contarVariante, coletarVariante } = await import("./variantes.js");
    if (contar === contarKenloRio) contar = contarVariante;
    if (coletar === coletarKenloRio) coletar = coletarVariante;
  }
  const destination = outputPath ?? fileURLToPath(new URL(`../../../../crawler/${project.collection}${negociacao === "locacao" ? "Locacao" : ""}.json`, import.meta.url));
  const previous = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination, "utf8")) : [];
  if (!Array.isArray(previous)) throw new Error(`[${project.collection}] JSON anterior invalido.`);
  const semGravacao = check || checkCompleto;
  const netimoveis = ["luciene", "netimoveis"].includes(project.kind);
  const homeHub = project.kind === "homeHub";
  const identificarPorLink = netimoveis || homeHub || project.kind === "jailson";
  const registrarDepoisDaColeta = identificarPorLink || ["forte", "mg", "rjardim"].includes(project.kind) || project.collection === "rioMetropole" && negociacao === "venda";
  const codigosTotalInstavel = homeHub ? ["HOMEHUB_TOTAL_ALTERADO"]
    : project.kind === "mg" ? ["MG_TOTAL_ALTERADO"]
    : project.kind === "rjardim" ? ["RJARDIM_TOTAL_ALTERADO"]
    : project.kind === "inforce" ? ["INFORCE_TOTAL_ALTERADO"]
    : ["universal", "renascenca"].includes(project.kind) ? ["UNIVERSAL_TOTAL_ALTERADO"]
    : project.kind === "kenlo" ? ["KENLO_TOTAL_ALTERADO", "KENLO_TOTAL_DIVERGENTE"] : [];
  const browser = ["apsa", "novaEpoca", "inforce", "universal", "renascenca", "privilegio", "lopes", "remax", "luciene", "netimoveis", "forte", "rjardim"].includes(project.kind) ? null : await browserFactory({ headlessOverride: true });
  let totalEsperado;
  let imoveis;
  try {
    const maxTentativas = codigosTotalInstavel.length ? 3 : 1;
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        console.log(`[${project.collection}] Rio - ${negociacao}. Consultando total...`);
        totalEsperado = await contar(browser, project, negociacao);
        if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) throw new Error(`[${project.collection}] Total invalido.`);
        if (!semGravacao && !registrarDepoisDaColeta) await registrar(project.collection, totalEsperado, RIO_SPREADSHEET_ID, negociacao === "venda" ? "Vendas" : "Locacao");
        imoveis = await coletar(browser, project, negociacao, { totalEsperado, primeiraPagina: check && !checkCompleto });
        if (!(check && !checkCompleto)) {
          if (project.kind === "privilegio"
            ? imoveis.length > totalEsperado || totalEsperado > 0 && imoveis.length === 0
            : imoveis.length !== totalEsperado) throw new Error(`[${project.collection}] Coleta incompleta; base preservada.`);
          const totalFinal = await contar(browser, project, negociacao);
          if (totalFinal !== totalEsperado) {
            throw Object.assign(new Error(`[${project.collection}] Total mudou: ${totalEsperado} -> ${totalFinal}; base preservada.`), {
              code: homeHub ? "HOMEHUB_TOTAL_ALTERADO" : project.kind === "mg" ? "MG_TOTAL_ALTERADO" : project.kind === "rjardim" ? "RJARDIM_TOTAL_ALTERADO" : project.kind === "inforce" ? "INFORCE_TOTAL_ALTERADO" : ["universal", "renascenca"].includes(project.kind) ? "UNIVERSAL_TOTAL_ALTERADO" : "KENLO_TOTAL_ALTERADO",
            });
          }
        }
        break;
      } catch (error) {
        if (!codigosTotalInstavel.includes(error.code) || tentativa >= maxTentativas) throw error;
        console.warn(`[${project.collection}] ${error.message} Descartando a tentativa e reiniciando a coleta completa (${tentativa + 1}/${maxTentativas}).`);
      }
    }
  } finally { if (browser) await browser.close(); }
  if (semGravacao) {
    console.log(`[${project.collection}] CHECK ${negociacao}: ${imoveis.length}/${totalEsperado}; nenhum dado salvo ou publicado.`);
    return { imoveis, totalEsperado };
  }
  const options = {
    imobiliaria: project.collection, outputPath: destination,
    totalEsperado: project.kind === "privilegio" ? imoveis.length : totalEsperado, vazioConfirmado: totalEsperado === 0,
    spreadsheetId: RIO_SPREADSHEET_ID, exportToSheets, identificarPorLink,
  };
  if (negociacao === "venda") await syncVendas({ ...options, imoveisRaspados: imoveis, consolidados: imoveis, codigoRepetidoPorLink: true });
  else await syncLocacao({ ...options, imoveis, anteriores: previous, abaRetirados: "retiradosLocacao", exportOptions: { negociacao: "aluguel" } });
  if (registrarDepoisDaColeta) await registrar(project.collection, imoveis.length, RIO_SPREADSHEET_ID, negociacao === "venda" ? "Vendas" : "Locacao");
  return { imoveis, totalEsperado };
}

export async function executarProjetoRio(name, negociacao = "venda") {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--check", "--check-completo"].includes(arg))) throw new Error("Opcao desconhecida; use --check ou --check-completo.");
    await runProjetoRio(name, negociacao, { check: args.includes("--check"), checkCompleto: args.includes("--check-completo") });
  } catch (error) {
    console.error("[Rio]", error);
    process.exitCode = 1;
  }
}
