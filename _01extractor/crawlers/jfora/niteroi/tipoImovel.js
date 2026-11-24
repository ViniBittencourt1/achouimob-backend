import fs from "node:fs";
import { resolverTipoCatalogo } from "../_1Jf/tipos-alugueis.js";

const catalogo = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brTipoImovel.json", import.meta.url), "utf8"
));

function normalizar(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolverTipoNiteroiDoLink(linkReal, catalog = catalogo) {
  if (!linkReal) return "";
  let segmentos;
  try {
    segmentos = new URL(linkReal).pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent);
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof URIError)) throw error;
    console.warn("[resolverTipoNiteroiDoLink] Link invalido:", linkReal, error.message);
    return "";
  }
  for (const segmento of segmentos) {
    const palavras = normalizar(segmento).split(" ");
    for (let index = 0; index < palavras.length; index++) {
      const matches = [];
      for (const [slug, aliases] of Object.entries(catalog.tiposPorSlug)) {
        for (const valor of [slug, ...aliases.map(alias => alias.nome)]) {
          const nome = normalizar(valor);
          if (!nome) continue;
          const tamanho = nome.split(" ").length;
          if (palavras.slice(index, index + tamanho).join(" ") === nome) {
            matches.push({ slug, tamanho });
          }
        }
      }
      if (!matches.length) continue;
      const tamanho = Math.max(...matches.map(match => match.tamanho));
      const slugs = new Set(matches.filter(match => match.tamanho === tamanho).map(match => match.slug));
      return slugs.size === 1 ? slugs.values().next().value : "";
    }
  }
  return "";
}

// "Casa duplex" -> "casa": usa o maior prefixo do texto que existe exatamente no catalogo.
export function resolverTipoPrefixoCatalogo(value, catalog = catalogo) {
  const palavras = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  for (let tamanho = palavras.length; tamanho > 0; tamanho--) {
    const slug = resolverTipoCatalogo(palavras.slice(0, tamanho).join(" "), catalog);
    if (slug) return slug;
  }
  return "";
}

export function resolverTipoNiteroi(value, catalog = catalogo) {
  const exato = resolverTipoCatalogo(value, catalog);
  if (exato) return exato;
  const texto = normalizar(value);
  if (!texto) return "";
  const matches = [];
  for (const [slug, aliases] of Object.entries(catalog.tiposPorSlug)) {
    for (const nome of [slug, ...aliases.map(alias => alias.nome)]) {
      const normalizado = normalizar(nome);
      if (normalizado && ` ${texto} `.includes(` ${normalizado} `)) {
        matches.push({ slug, nome: normalizado });
      }
    }
  }
  const especificos = matches.filter(match => !matches.some(other =>
    other.nome !== match.nome && ` ${other.nome} `.includes(` ${match.nome} `)
  ));
  const slugs = new Set(especificos.map(match => match.slug));
  return slugs.size === 1 ? slugs.values().next().value : "";
}
