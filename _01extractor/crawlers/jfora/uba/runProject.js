import { getProjetoUba } from "./projects.js";

export async function runProjetoUba(name, negociacao = "venda", options = {}) {
  if (!["venda", "locacao"].includes(negociacao)) throw new Error(`Negociacao invalida: ${negociacao}`);
  const project = getProjetoUba(name);
  const url = negociacao === "venda" ? project.urlVendas : project.urlLocacao;
  if (!project.enabled || !url || !project.modeloSite) {
    const error = new Error(`[${project.collection}] ${negociacao}: aguardando rotas, modelo do site e habilitacao. Nenhuma coleta executada; dados existentes preservados.`);
    error.code = "UBA_PROJETO_NAO_CONFIGURADO";
    throw error;
  }
  if (project.collection === "ubaJXavier" && project.modeloSite === "symcode") {
    const { runJXavier } = await import("./ubaJXavier/runner.js");
    return runJXavier(negociacao, options);
  }
  if (project.collection === "ubaGb" && project.modeloSite === "imoview") {
    const { runGb } = await import("./ubaGb/runner.js");
    return runGb(negociacao, options);
  }
  if (project.collection === "ubaMontezzi" && project.modeloSite === "symcode-montezzi") {
    const { runMontezzi } = await import("./ubaMontezzi/runner.js");
    return runMontezzi(negociacao, options);
  }
  if (project.collection === "ubaCarlos" && project.modeloSite === "carlos-php") {
    const { runCarlos } = await import("./ubaCarlos/runner.js");
    return runCarlos(negociacao, options);
  }
  if (project.collection === "ubaNogueira" && project.modeloSite === "wordpress-jetengine") {
    const { runNogueira } = await import("./ubaNogueira/runner.js");
    return runNogueira(negociacao, options);
  }
  if (project.collection === "ubaArtolex" && project.modeloSite === "artolex-php") {
    const { runArtolex } = await import("./ubaArtolex/runner.js");
    return runArtolex(negociacao, options);
  }
  if (project.collection === "ubaCidade" && project.modeloSite === "realhomes-api") {
    const { runCidade } = await import("./ubaCidade/runner.js");
    return runCidade(negociacao, options);
  }
  if (project.collection === "ubaRemax" && project.modeloSite === "remax-api") {
    const { runRemax } = await import("./ubaRemax/runner.js");
    return runRemax(negociacao, options);
  }
  if (project.collection === "ubaAloisio" && project.modeloSite === "imobibrasil-aloisio") {
    const { runAloisio } = await import("./ubaAloisio/runner.js");
    return runAloisio(negociacao, options);
  }
  throw new Error(`[${project.collection}] Extrator ${project.modeloSite} ainda nao implementado e validado para Uba; dados existentes preservados.`);
}

export async function executarProjetoUba(name, negociacao = "venda") {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--check")) throw new Error("Opcao desconhecida; use --check para validar sem publicar.");
    await runProjetoUba(name, negociacao, { check: args.includes("--check") });
  } catch (error) {
    console.error("[Uba]", error.message);
    process.exitCode = 1;
  }
}
