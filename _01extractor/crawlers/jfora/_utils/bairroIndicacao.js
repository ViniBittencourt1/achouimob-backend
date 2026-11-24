import fs from "node:fs";
import { load } from "cheerio";
import { normalizarBairro } from "./bairroCatalogo.js";

const bairros = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_jfBairros.json", import.meta.url), "utf8"
));
const cidades = JSON.parse(fs.readFileSync(
  new URL("../../../../_03database/filtros/_brCidades.json", import.meta.url), "utf8"
));

export function resolverBairroPorIndicacao({
  cidade, endereco = "", titulo = "", linkReal = "", origin, caminho, projeto,
}) {
  if (!cidade) return "";
  const options = bairros.filter(item => item.cidade === cidade && item.slug && item.nome);
  const address = normalizarBairro(endereco);
  const exact = new Set(options.filter(item => address && [
    normalizarBairro(item.nome), normalizarBairro(item.slug),
  ].includes(address)).map(item => item.slug));
  if (exact.size) return exact.size === 1 ? exact.values().next().value : "";

  const cityNames = new Set(cidades.filter(item => item.slug === cidade)
    .map(item => normalizarBairro(item.nome)));
  cityNames.add(normalizarBairro(cidade.replace(/-[a-z]{2}$/, "")));
  const sources = [endereco, load(String(titulo)).text()];
  if (linkReal) {
    const url = new URL(linkReal);
    if (url.origin !== origin || !new RegExp(`^/${caminho}/[^/]+/$`).test(url.pathname)) {
      throw new Error(`[${projeto}] Link invalido para conferir bairro: ${linkReal}; dados preservados.`);
    }
    sources.push(decodeURIComponent(url.pathname.split("/")[2]));
  }
  const matches = [];
  for (const source of sources) {
    const normalized = normalizarBairro(source);
    for (const item of options) {
      for (const name of new Set([normalizarBairro(item.nome), normalizarBairro(item.slug)])) {
        if (!name || cityNames.has(name)) continue;
        const pattern = new RegExp(`\\b(?:bairro(?: atual)?|no|na|nos|nas) (?:bairro )?(${name})(?= |$)`, "g");
        for (const match of normalized.matchAll(pattern)) {
          const before = normalized.slice(0, match.index);
          if (/\b(?:proximo|proxima|perto|vizinho|vizinha|acesso|vista)\b(?: \w+){0,4} $/.test(before)) continue;
          matches.push({ slug: item.slug, source: normalized, start: match.index, end: match.index + match[0].length });
        }
      }
    }
  }
  // Um nome completo, como Jardim Gloria, prevalece sobre um nome contido nele.
  const slugs = new Set(matches.filter(m => !matches.some(other =>
    other.source === m.source && other.start <= m.start && other.end > m.end
  )).map(m => m.slug));
  if (slugs.size > 1) console.warn(`[${projeto}] Bairro ambiguo em ${linkReal}: ${[...slugs].join(", ")}; campo vazio para revisao.`);
  return slugs.size === 1 ? slugs.values().next().value : "";
}
