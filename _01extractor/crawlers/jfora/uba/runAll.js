import { pathToFileURL } from "node:url";
import { projetosUba } from "./projects.js";
import { runProjetoUba } from "./runProject.js";

export async function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== "--check")) throw new Error("Opcao de Uba desconhecida; use --check para conferir o cadastro.");
  if (args.includes("--check")) {
    for (const [index, project] of projetosUba.entries()) {
      console.log(`${index + 1}. ${project.collection} | modelo: ${project.modeloSite ?? "pendente"} | vendas: ${project.urlVendas ?? "pendente"} | aluguel: ${project.urlLocacao ?? "pendente"} | habilitado: ${project.enabled}`);
    }
    return;
  }
  const failures = [];
  for (const project of projetosUba) {
    for (const negociacao of ["venda", "locacao"]) {
      try {
        await runProjetoUba(project.collection, negociacao);
      } catch (error) {
        console.error("[Uba]", error.message);
        failures.push(error.message);
      }
    }
  }
  if (failures.length) throw new Error(`Uba: ${failures.length} etapa(s) pendente(s) ou com falha. Nenhuma pendencia representa coleta vazia.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("[Uba]", error.message); process.exitCode = 1; });
}
