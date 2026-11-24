import { backendRoot as ISOLATED_BACKEND_ROOT } from '../../../../backend-paths.cjs';
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { projetosNiteroiVendas } from "./projects.js";
import { projetosNiteroiImobBrasil } from "./imobBrasil/projects.js";
import { project as siciliano } from "./nitSiciliano/config.js";
import { project as gustavo } from "./nitGustavo/config.js";
import { project as drin } from "./nitDrin/config.js";
import { project as realiza } from "./nitRealiza/config.js";
import { project as remax } from "./nitRemax/config.js";

const root = path.dirname(fileURLToPath(import.meta.url));

function executarProjeto(project) {
  const entrypoint = path.join(root, project.folder, "index.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, entrypoint], {
      cwd: ISOLATED_BACKEND_ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`${project.collection} terminou com código ${code ?? "desconhecido"}.`));
    });
  });
}

async function main() {
  if (process.argv.includes("--check")) {
    [...projetosNiteroiVendas, ...projetosNiteroiImobBrasil, siciliano, gustavo, drin, realiza, remax].forEach((project, index) =>
      console.log(`${index + 1}. ${project.collection} - ${project.url}`)
    );
    return;
  }

  const failures = [];
  for (const project of [...projetosNiteroiVendas, ...projetosNiteroiImobBrasil, siciliano, gustavo, drin, realiza, remax]) {
    try {
      await executarProjeto(project);
    } catch (error) {
      failures.push(`${project.collection}: ${error.message}`);
      console.error(`[Niterói] ${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Projetos com falha:\n${failures.join("\n")}`);
  }
}

main().catch(error => {
  console.error(`[Niterói] ${error.message}`);
  process.exitCode = 1;
});
