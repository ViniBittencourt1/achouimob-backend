import { contarMidasRio, coletarMidasRio } from "./midas.js";
import { isDeepStrictEqual } from "node:util";

const dadosComparaveis = record => Object.fromEntries(
  Object.entries(record).filter(([key]) => !["dataInclusao", "atualizadoEm"].includes(key))
);

export function projetoFaixaMidas(project, minimo, maximo) {
  if (!Number.isSafeInteger(minimo) || minimo < 0 || !Number.isSafeInteger(maximo)
    || maximo < 0 || maximo !== 0 && maximo <= minimo) {
    throw new Error(`[${project.collection}] Faixa de preco invalida; dados anteriores preservados.`);
  }
  const url = new URL(project.urlVendas);
  const params = new URLSearchParams(url.hash.slice(3));
  if (params.has("valor")) throw new Error(`[${project.collection}] Busca original ja possui faixa de preco.`);
  params.set("valor", `${minimo},${maximo}`);
  params.set("page", "1");
  url.hash = `/?${params.toString()}`;
  return { ...project, urlVendas: url.href };
}

export async function coletarFaixasMidas(browser, project, negociacao, options, {
  contar = contarMidasRio, coletar = coletarMidasRio,
} = {}) {
  if (negociacao !== "venda") throw new Error(`[${project.collection}] Faixas disponiveis apenas para venda.`);
  if (options.primeiraPagina) return coletar(browser, project, negociacao, options);
  const total = options.totalEsperado;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`[${project.collection}] Precontagem invalida.`);
  const limites = project.midas?.limitesFaixasVenda;
  if (!Array.isArray(limites) || limites.length === 0
    || limites.some((limite, index) => !Number.isSafeInteger(limite) || limite <= 0 || index > 0 && limite <= limites[index - 1])) {
    throw new Error(`[${project.collection}] Limites de faixas invalidos; dados anteriores preservados.`);
  }
  const records = new Map();
  const boundaries = [0, ...limites, 0];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const min = boundaries[index];
    const max = boundaries[index + 1];
    const faixa = projetoFaixaMidas(project, min, max);
    const quantidade = await contar(browser, faixa, negociacao);
    if (!Number.isSafeInteger(quantidade) || quantidade < 0 || quantidade > total) {
      throw new Error(`[${project.collection}] Total invalido na faixa ${min}-${max}; dados anteriores preservados.`);
    }
    console.log(`[${project.collection}] Faixa ${min}-${max || "sem teto"}: ${quantidade} imoveis.`);
    const items = await coletar(browser, faixa, negociacao, { totalEsperado: quantidade });
    if (items.length !== quantidade || new Set(items.map(item => item.linkReal)).size !== quantidade) {
      throw new Error(`[${project.collection}] Faixa incompleta ou com duplicatas; dados anteriores preservados.`);
    }
    for (const item of items) {
      if (!item.linkReal) throw new Error(`[${project.collection}] Imovel sem link; dados anteriores preservados.`);
      const previous = records.get(item.linkReal);
      if (previous) {
        if (!isDeepStrictEqual(dadosComparaveis(previous.item), dadosComparaveis(item))) {
          throw new Error(`[${project.collection}] Imovel divergente entre faixas: ${item.linkReal}; dados anteriores preservados.`);
        }
        if (item.preco !== null && (previous.index !== index - 1
          || typeof item.preco !== "number" || !Number.isFinite(item.preco)
          || Math.abs(item.preco - min) >= 1)) {
          throw new Error(`[${project.collection}] Imovel repetido fora do limite entre faixas: ${item.linkReal}; dados anteriores preservados.`);
        }
        previous.index = index;
      } else records.set(item.linkReal, { item, index });
    }
    if (records.size > total) throw new Error(`[${project.collection}] Coleta excedeu total original; dados anteriores preservados.`);
    console.log(`[${project.collection}] Faixas: ${records.size}/${total} imoveis unicos.`);
  }
  if (records.size !== total) throw new Error(`[${project.collection}] Faixas incompletas: ${records.size}/${total}; dados anteriores preservados.`);
  return [...records.values()].map(({ item }) => item);
}
