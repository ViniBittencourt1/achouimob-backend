import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { etapasDoProjeto, montarProjetosCombinados } from "../_utils/projetosCombinados.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Somente imobiliarias da ordem oficial; agregadores (ex.: "niteroi") repetiriam projetos.
export function selecionarProjetos(projetos, nomes = []) {
  const elegiveis = projetos.filter(projeto => projeto.colecao);
  if (!nomes.length) return elegiveis;
  const chave = valor => String(valor).toLowerCase().replace(/:locacao$/, "");
  return nomes.map(nome => {
    const projeto = elegiveis.find(item => [item.name, item.colecao, item.venda, item.aluguel].filter(Boolean).some(valor => chave(valor) === chave(nome)));
    if (!projeto) throw new Error(`Projeto desconhecido: ${nome}`);
    return projeto;
  });
}

function rodarScript(script) {
  return new Promise(resolve => {
    const child = spawn(`npm run ${script}`, { cwd: backendRoot, shell: true, stdio: "inherit", env: process.env });
    child.on("close", code => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

export async function rodarRaspagemCompleta(nomes = [], { executar = rodarScript, scripts } = {}) {
  const pkgScripts = scripts ?? JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8")).scripts;
  const projetos = selecionarProjetos(montarProjetosCombinados(pkgScripts), nomes);
  const etapas = projetos.flatMap(projeto => etapasDoProjeto(projeto).map(etapa => ({ ...etapa, projeto: projeto.colecao })));
  console.log(`[RaspagemCompleta] ${projetos.length} projetos, ${etapas.length} etapas (vendas e depois alugueis de cada projeto).`);
  const falhas = [];
  for (const [indice, etapa] of etapas.entries()) {
    const rotulo = `${etapa.projeto} ${etapa.tipo === "venda" ? "vendas" : "alugueis"}`;
    const inicio = Date.now();
    console.log(`\n[RaspagemCompleta] (${indice + 1}/${etapas.length}) >>> ${rotulo} (npm run ${etapa.script})`);
    const code = await executar(etapa.script);
    const duracao = Math.round((Date.now() - inicio) / 1000);
    if (code === 0) console.log(`[RaspagemCompleta] <<< ${rotulo} OK (${duracao}s)`);
    else {
      falhas.push(rotulo);
      console.error(`[RaspagemCompleta] <<< ${rotulo} FALHOU (code=${code}, ${duracao}s); seguindo para a proxima etapa.`);
    }
  }
  console.log(`\n[RaspagemCompleta] Fim: ${etapas.length - falhas.length} OK, ${falhas.length} falha(s).`);
  if (falhas.length) console.error(`[RaspagemCompleta] Falharam: ${falhas.join(", ")}`);
  return { etapas, falhas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rodarRaspagemCompleta(process.argv.slice(2).filter(arg => !arg.startsWith("--")))
    .then(({ falhas }) => { process.exitCode = falhas.length ? 1 : 0; })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
