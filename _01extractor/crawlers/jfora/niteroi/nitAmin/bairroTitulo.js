import fs from "node:fs";
import { normalizarBairro } from "../../_utils/bairroCatalogo.js";

const catalogoUrl = new URL("../../../../../_03database/filtros/_jfBairros.json", import.meta.url);

export function extrairCandidatoBairroDoTitulo(titulo) {
  return String(titulo || "").split(/\bem\s+/i).slice(1).join(" em ").split(",")[0].trim();
}

export function resolverBairroDoTitulo(titulo, cidade, catalogo) {
  const candidato = normalizarBairro(extrairCandidatoBairroDoTitulo(titulo));
  if (!candidato || !cidade) return "";
  const entradas = catalogo ?? JSON.parse(fs.readFileSync(catalogoUrl, "utf8"));
  const matches = [];
  for (const entry of entradas) {
    if (entry.cidade !== cidade || !entry.slug) continue;
    for (const value of [entry.nome, entry.slug]) {
      const nome = normalizarBairro(value);
      if (!nome || !` ${candidato} `.includes(` ${nome} `)) continue;
      matches.push({ nome, slug: entry.slug });
    }
  }
  const especificos = matches.filter(match => !matches.some(other =>
    other.nome !== match.nome && ` ${other.nome} `.includes(` ${match.nome} `)
  ));
  const slugs = new Set(especificos.map(match => match.slug));
  return slugs.size === 1 ? slugs.values().next().value : "";
}
