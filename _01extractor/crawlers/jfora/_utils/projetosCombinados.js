import { ORDEM_PROJETOS, indiceProjeto } from "../../../../crawler-order.cjs";
import { listarProjetosAlugueis } from "../_1Jf/alugueis-model.js";

export function ehScriptVenda(name, cmd) {
  return typeof cmd === "string" &&
    !name.endsWith(":locacao") &&
    !name.startsWith("locacao:") &&
    !name.startsWith("uba:") &&
    cmd.includes("_01extractor/crawlers/jfora/") &&
    !cmd.includes("/_1Jf/");
}

// Agrupa venda e aluguel da mesma imobiliaria (mesma posicao em ORDEM_PROJETOS).
// Scripts de venda fora da ordem (agregadores e utilitarios) ficam no fim, sem aluguel.
export function montarProjetosCombinados(scripts = {}) {
  const porIndice = new Map();
  const extras = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!ehScriptVenda(name, cmd)) continue;
    const indice = indiceProjeto(name);
    if (indice >= ORDEM_PROJETOS.length) {
      extras.push({ name, colecao: "", venda: name, aluguel: null });
      continue;
    }
    if (porIndice.has(indice)) throw new Error(`Projeto ${ORDEM_PROJETOS[indice]} com mais de um script de venda: ${porIndice.get(indice).venda}, ${name}.`);
    porIndice.set(indice, { name, colecao: ORDEM_PROJETOS[indice], venda: name, aluguel: null });
  }
  for (const aluguel of listarProjetosAlugueis(scripts)) {
    const indice = ORDEM_PROJETOS.indexOf(aluguel.collection);
    if (indice < 0) {
      extras.push({ name: aluguel.name, colecao: aluguel.collection, venda: null, aluguel: aluguel.name });
      continue;
    }
    const projeto = porIndice.get(indice) ?? { name: aluguel.name, colecao: aluguel.collection, venda: null, aluguel: null };
    projeto.aluguel = aluguel.name;
    porIndice.set(indice, projeto);
  }
  const ordenados = [...porIndice].sort((a, b) => a[0] - b[0]).map(([, projeto]) => projeto);
  return [...ordenados, ...extras].map(projeto => ({ ...projeto, cmd: scripts[projeto.name] }));
}

export function etapasDoProjeto(projeto) {
  return [
    projeto.venda && { tipo: "venda", script: projeto.venda },
    projeto.aluguel && { tipo: "aluguel", script: projeto.aluguel },
  ].filter(Boolean);
}

// Expande nomes de projetos em etapas venda -> aluguel; nomes desconhecidos rodam sozinhos.
export function expandirEtapas(nomes, projetos) {
  const porNome = new Map(projetos.map(projeto => [projeto.name, projeto]));
  return nomes.flatMap(nome => {
    const projeto = porNome.get(nome);
    return projeto ? etapasDoProjeto(projeto).map(etapa => ({ ...etapa, projeto: nome })) : [{ tipo: "script", script: nome, projeto: nome }];
  });
}
