#!/usr/bin/env node

/**
 * Entrada do executável de raspagem de aluguéis.
 * A lista de scripts é obtida do package.json para incluir todos os crawlers
 * marcados com o sufixo :locacao sem duplicar a configuração do runner.
 */

const fs = require("fs");
const path = require("path");
const { projetoHabilitadoNaRaspagem } = require("./crawler-order.cjs");
const { launcherBackend } = require("./backend-paths.cjs");

const backendDir = launcherBackend({
  sourceDir: __dirname, executablePath: process.execPath,
  packaged: typeof process.pkg !== "undefined", configured: process.env.RASPAGEM_IMOVEIS_BACKEND,
});

process.chdir(backendDir);
const packagePath = path.join(backendDir, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const rentalScripts = Object.keys(packageJson.scripts || {}).filter((script) => script.endsWith(":locacao") && projetoHabilitadoNaRaspagem(script));

if (rentalScripts.length === 0) {
  throw new Error("Nenhum script de raspagem de aluguéis foi encontrado no package.json.");
}

process.env.SCRAPE_SCRIPTS = rentalScripts.join(",");
process.env.CRAWLER_RUN_LABEL = "Raspagem de Imóveis Aluguéis";

if (process.env.CRAWLER_LAUNCHER_VALIDATE_ONLY === "true") {
  console.log(`Diretório backend: ${backendDir}`);
  console.log(`Crawlers de aluguéis: ${rentalScripts.length}`);
} else {
  require("./crawler-runner.cjs");
}
