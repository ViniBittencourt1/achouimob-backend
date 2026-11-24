import { project as jXavier } from "./ubaJXavier/config.js";
import { project as gb } from "./ubaGb/config.js";
import { project as montezzi } from "./ubaMontezzi/config.js";
import { project as carlos } from "./ubaCarlos/config.js";
import { project as nogueira } from "./ubaNogueira/config.js";
import { project as artolex } from "./ubaArtolex/config.js";
import { project as cidade } from "./ubaCidade/config.js";
import { project as remax } from "./ubaRemax/config.js";
import { project as aloisio } from "./ubaAloisio/config.js";

export const cidadeUba = Object.freeze({ nome: "Ub\u00e1", slug: "uba", uf: "MG" });
export const projetosUba = Object.freeze([
  jXavier, gb, montezzi, carlos, nogueira, artolex, cidade, remax, aloisio,
]);

export function getProjetoUba(name) {
  const normalized = String(name ?? "").toLowerCase();
  const project = projetosUba.find(item => item.collection.toLowerCase() === normalized);
  if (!project) throw new Error(`Projeto de Uba nao encontrado: ${name}`);
  return project;
}
