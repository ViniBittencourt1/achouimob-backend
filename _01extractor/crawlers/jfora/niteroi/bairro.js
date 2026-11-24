import fs from "node:fs";
import { normalizarBairro } from "../_utils/bairroCatalogo.js";

const catalogoUrl = new URL("../../../../_03database/filtros/_jfBairros.json", import.meta.url);
const catalogo = JSON.parse(fs.readFileSync(catalogoUrl, "utf8"));

export function resolverBairroNiteroiDoLink(linkReal, cidade, entradas = catalogo) {
  if (!cidade) return "";
  const url = new URL(linkReal);
  const segmentos = url.pathname.split("/").filter(Boolean);
  if (!["imovel", "empreendimento"].includes(segmentos[0]) || !segmentos[1]) return "";
  const texto = ` ${normalizarBairro(decodeURIComponent(segmentos[1]))} `;
  const nomeCidade = normalizarBairro(cidade.replace(/-[a-z]{2}$/i, ""));
  const slugs = new Set(entradas.filter(entry => entry.cidade === cidade && entry.slug && (
    [entry.nome, entry.slug].some(valor => {
      const nome = normalizarBairro(valor);
      return nome && nome !== nomeCidade && texto.includes(` ${nome} `);
    })
  )).map(entry => entry.slug));
  return slugs.size === 1 ? slugs.values().next().value : "";
}

export function resolverBairroNiteroi(valor, cidade, entradas = catalogo) {
  const nome = normalizarBairro(valor);
  if (!nome || !cidade) return "";
  const candidatos = entradas.filter(entry => entry.cidade === cidade && entry.slug);
  const canonico = candidatos.find(entry => entry.slug === valor);
  if (canonico) return canonico.slug;
  const slugs = new Set(candidatos.filter(entry =>
    normalizarBairro(entry.nome) === nome || normalizarBairro(entry.slug) === nome
  ).map(entry => entry.slug));
  return slugs.size === 1 ? slugs.values().next().value : "";
}
