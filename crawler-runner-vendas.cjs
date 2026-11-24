#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { ordenarScripts, ORDEM_PROJETOS, indiceProjeto, cidadeProjeto, projetoHabilitadoNaRaspagem } = require("./crawler-order.cjs");
const { launcherBackend } = require("./backend-paths.cjs");

function descobrirPendencias(backendDir, scripts) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(backendDir, "package.json"), "utf8"));
  const issues = [];
  ORDEM_PROJETOS.forEach((project, index) => {
    if (!projetoHabilitadoNaRaspagem(project)) return;
    for (const rental of [false, true]) {
      if (project === "rioApsa" && !rental) continue;
      if (["rioDna", "rioImoveisDoRio", "rioMaisVeloz", "rioMelhores", "rioNovaEpoca", "rioPrivilegio", "rioRjc"].includes(project) && rental) continue;
      const script = scripts.find(name => indiceProjeto(name) === index && name.endsWith(":locacao") === rental);
      const name = script || `${project.startsWith("jf") ? project.slice(2).toLowerCase().replace("rvnegocios", "rv") : project.toLowerCase()}${rental ? ":locacao" : ""}`;
      if (!script || packageJson.scripts[script].includes("locacaoPreparacao.js")) {
        issues.push({
          script: name, city: cidadeProjeto(project),
          kind: rental ? "Aluguel" : "Venda",
          error: !script ? "Crawler individual nao cadastrado ou arquivo inexistente." : "Rota de aluguel nao configurada; nenhuma coleta executada e dados existentes preservados.",
        });
      }
    }
  });
  return issues;
}

function descobrirScriptsExecucao(backendDir) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(backendDir, "package.json"), "utf8"));
  const entries = Object.entries(packageJson.scripts || {}).filter(([name, command]) =>
    !name.startsWith("uba:") && typeof command === "string" &&
    /^node\s+(?:--[\w=-]+\s+)*_01extractor\/crawlers\/jfora\/(?:(?:niteroi|uba|rio)\/)?[^/\s]+\/index\.js$/.test(command.trim())
  );
  if (!entries.length) throw new Error("Nenhum crawler individual de vendas encontrado no package.json.");
  const destinations = new Set();
  const scripts = [];
  for (const [name, command] of entries) {
    if (!projetoHabilitadoNaRaspagem(name)) continue;
    const destination = command.trim().split(/\s+/).at(-1);
    if (!fs.existsSync(path.join(backendDir, ...destination.split("/")))) {
      console.warn(`[Vendas] Script sem crawler no projeto, excluido da rodada: ${name} (${destination}).`);
      continue;
    }
    if (destinations.has(destination)) continue;
    destinations.add(destination);
    scripts.push(name);
  }
  if (!scripts.length) throw new Error("Nenhum crawler de vendas existente foi encontrado.");
  const rentalScripts = Object.keys(packageJson.scripts || {}).filter(name => name.endsWith(":locacao") && projetoHabilitadoNaRaspagem(name));
  return ordenarScripts([...scripts, ...rentalScripts]);
}

function localizarBackend() {
  return launcherBackend({
    sourceDir: __dirname, executablePath: process.execPath,
    packaged: typeof process.pkg !== "undefined", configured: process.env.RASPAGEM_IMOVEIS_BACKEND,
  });
}

function main() {
  const backendDir = localizarBackend();
  const scripts = descobrirScriptsExecucao(backendDir);
  const unavailable = descobrirPendencias(backendDir, scripts);
  process.chdir(backendDir);
  process.env.SCRAPE_SCRIPTS = scripts.join(",");
  process.env.CRAWLER_UNAVAILABLE_PROJECTS = JSON.stringify(unavailable);
  process.env.CRAWLER_RUN_LABEL = "Raspagem de Imóveis - JF, Niterói, Ubá e Rio";
  console.log(`Diretorio backend: ${backendDir}`);
  console.log(`Crawlers de vendas e alugueis JF, Niteroi, Uba e Rio: ${scripts.length}`);
  console.log(`Projetos: ${scripts.join(", ")}`);
  for (const issue of unavailable) console.warn(`[Cobertura] ${issue.script}: ${issue.error}`);
  if (process.env.CRAWLER_LAUNCHER_VALIDATE_ONLY !== "true") require("./crawler-runner.cjs");
}

module.exports = { descobrirScriptsExecucao, descobrirPendencias, localizarBackend, main };
if (require.main === module) main();
