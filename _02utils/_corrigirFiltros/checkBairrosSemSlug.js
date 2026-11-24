import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFirestore } from "firebase-admin/firestore";
import "../../_01extractor/services/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..", "..");

function getCatalogos() {
  const cidadesPath = path.join(backendRoot, "_03database", "filtros", "_brCidades.json");
  const bairrosPath = path.join(backendRoot, "_03database", "filtros", "_jfBairros.json");

  const cidades = JSON.parse(fs.readFileSync(cidadesPath, "utf8"));
  const bairros = JSON.parse(fs.readFileSync(bairrosPath, "utf8"));

  const citySlugSet = new Set(
    cidades
      .filter((item) => item && typeof item.slug === "string")
      .map((item) => item.slug.trim())
      .filter(Boolean)
  );

  const bairroKeySet = new Set(
    bairros
      .filter((item) => item && typeof item.slug === "string" && typeof item.cidade === "string")
      .map((item) => `${item.slug.trim()}__${item.cidade.trim()}`)
      .filter((item) => item !== "__")
  );

  return { citySlugSet, bairroKeySet };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  const db = getFirestore();
  const { citySlugSet, bairroKeySet } = getCatalogos();

  console.log(`[CHECK-BAIRROS] Total de cidades no catalogo: ${citySlugSet.size}`);
  console.log(`[CHECK-BAIRROS] Total de bairros válidos no catalogo: ${bairroKeySet.size}`);
  console.log("[CHECK-BAIRROS] Lendo __imoveisPublicos...");

  const snapshot = await db.collection("__imoveisPublicos").get();
  console.log(`[CHECK-BAIRROS] Total de registros em __imoveisPublicos: ${snapshot.size}`);

  const faltantes = [];
  const porBairro = new Map();
  let ignoradosPorCidadeInvalida = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const cidade = String(data.cidade || "").trim();
    const bairro = String(data.bairro || "").trim();

    if (!cidade || !citySlugSet.has(cidade)) {
      ignoradosPorCidadeInvalida += 1;
      continue;
    }

    const bairroKey = `${bairro}__${cidade}`;
    if (!bairro || !bairroKeySet.has(bairroKey)) {
      const item = {
        docId: doc.id,
        bairro,
        cidade,
        imobiliariaId: data.imobiliariaId || "",
        titulo: data.titulo || "",
        linkReal: data.linkReal || "",
        localizacao: data.localizacao || "",
      };

      faltantes.push(item);

      const key = `${cidade} :: ${bairro || "(vazio)"}`;
      porBairro.set(key, (porBairro.get(key) || 0) + 1);
    }
  }

  const resumo = Array.from(porBairro.entries())
    .map(([bairro, count]) => ({ bairro, count }))
    .sort((a, b) => b.count - a.count || a.bairro.localeCompare(b.bairro, "pt-BR"));

  const reportDir = path.join(backendRoot, "_03database", "outros");
  ensureDir(reportDir);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `check-bairros-sem-slug-${stamp}.json`);

  const report = {
    generatedAt: now.toISOString(),
    totalRegistros: snapshot.size,
    totalCidadesCatalogo: citySlugSet.size,
    totalBairrosCatalogo: bairroKeySet.size,
    ignoradosPorCidadeInvalida,
    totalRegistrosSemBairroValido: faltantes.length,
    resumoPorBairro: resumo,
    registros: faltantes,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`[CHECK-BAIRROS] Registros sem bairro valido: ${faltantes.length}`);
  console.log(`[CHECK-BAIRROS] Registros ignorados por cidade invalida: ${ignoradosPorCidadeInvalida}`);
  if (faltantes.length > 0) {
    console.log("[CHECK-BAIRROS] Top bairros com problema:");
    for (const item of resumo.slice(0, 20)) {
      console.log(`[CHECK-BAIRROS] - ${item.bairro}: ${item.count}`);
    }
  }

  console.log(`[CHECK-BAIRROS] Relatorio salvo em: ${reportPath}`);
}

main().catch((err) => {
  console.error("[CHECK-BAIRROS] Erro ao executar verificação de bairros sem slug:", err);
  process.exit(1);
});
