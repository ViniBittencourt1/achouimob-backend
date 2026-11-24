import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper para ler JSON
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Endpoint: tipos de imóvel
router.get("/tipos", (req, res) => {
  const tipos = readJson(path.resolve(__dirname, "../_03database/filtros/_brTipoImovel.json"));
  // Adapta para array de tipos
  let arr = [];
  for (const key in tipos.tiposPorSlug) {
    const lista = tipos.tiposPorSlug[key];
    if (key === "andar") {
      const principal = lista[0];
      arr.push({ nome: principal.nome, slug: principal.slug });
      continue;
    }
    lista.forEach(item => arr.push({ nome: item.nome, slug: item.slug }));
  }
  res.json({ tipos: arr });
});

// Endpoint: cidades
router.get("/cidades", (req, res) => {
  const cidades = readJson(path.resolve(__dirname, "../_03database/filtros/_brCidades.json"));
  res.json({ cidades });
});

// Endpoint: bairros
router.get("/bairros", (req, res) => {
  const bairros = readJson(path.resolve(__dirname, "../_03database/filtros/_jfBairros.json"));
  res.json({ bairros });
});

export default router;
