import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFirestore } from "firebase-admin/firestore";
import "../../_01extractor/services/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..", "..");

function getCatalogoSlugs() {
  const cidadesPath = path.join(backendRoot, "_03database", "filtros", "_brCidades.json");
  const data = JSON.parse(fs.readFileSync(cidadesPath, "utf8"));
  return new Set(
    data
      .filter((item) => item && typeof item.slug === "string")
      .map((item) => item.slug.trim())
      .filter(Boolean)
  );
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findLatestReport(reportDir) {
  if (!fs.existsSync(reportDir)) return null;

  const reportName = fs.readdirSync(reportDir)
    .filter((name) => /^check-cidades-sem-slug-.*\.json$/i.test(name))
    .sort()
    .pop();

  if (!reportName) return null;

  const reportPath = path.join(reportDir, reportName);
  try {
    return {
      path: reportPath,
      data: JSON.parse(fs.readFileSync(reportPath, "utf8")),
    };
  } catch {
    return null;
  }
}

async function main() {
  const db = getFirestore();
  const slugsCatalogo = getCatalogoSlugs();

  console.log(`[CHECK] Total de slugs no catalogo: ${slugsCatalogo.size}`);
  console.log("[CHECK] Lendo __imoveisPublicos...");

  let snapshot;
  try {
    snapshot = await db.collection("__imoveisPublicos").get();
  } catch (err) {
    const cachedReport = findLatestReport(path.join(backendRoot, "_03database", "outros"));
    if (!cachedReport || !Array.isArray(cachedReport.data.registros)) {
      throw err;
    }

    console.warn(`[CHECK] Firestore indisponível (${err.message}). Reutilizando relatório: ${cachedReport.path}`);
    console.log(`[CHECK] Total de registros no relatório: ${cachedReport.data.totalRegistros ?? "desconhecido"}`);
    console.log(`[CHECK] Registros sem slug valido: ${cachedReport.data.totalRegistrosSemSlugValido ?? cachedReport.data.registros.length}`);
    console.log(`[CHECK] Relatorio salvo em: ${cachedReport.path}`);
    return;
  }
  console.log(`[CHECK] Total de registros em __imoveisPublicos: ${snapshot.size}`);

  const faltantes = [];
  const porCidade = new Map();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const cidade = String(data.cidade || "").trim();

    if (!cidade || !slugsCatalogo.has(cidade)) {
      const item = {
        docId: doc.id,
        cidade,
        imobiliariaId: data.imobiliariaId || "",
        titulo: data.titulo || "",
        linkReal: data.linkReal || "",
      };

      faltantes.push(item);

      const key = cidade || "(vazio)";
      porCidade.set(key, (porCidade.get(key) || 0) + 1);
    }
  }

  const resumo = Array.from(porCidade.entries())
    .map(([cidade, count]) => ({ cidade, count }))
    .sort((a, b) => b.count - a.count || a.cidade.localeCompare(b.cidade, "pt-BR"));

  const reportDir = path.join(backendRoot, "_03database", "outros");
  ensureDir(reportDir);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `check-cidades-sem-slug-${stamp}.json`);

  const report = {
    generatedAt: now.toISOString(),
    totalRegistros: snapshot.size,
    totalSlugsCatalogo: slugsCatalogo.size,
    totalRegistrosSemSlugValido: faltantes.length,
    resumoPorCidade: resumo,
    registros: faltantes,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`[CHECK] Registros sem slug valido: ${faltantes.length}`);
  if (faltantes.length > 0) {
    console.log("[CHECK] Top cidades com problema:");
    for (const item of resumo.slice(0, 20)) {
      console.log(`[CHECK] - ${item.cidade}: ${item.count}`);
    }
  }

  console.log(`[CHECK] Relatorio salvo em: ${reportPath}`);
}

main().catch((err) => {
  console.error("[CHECK] Erro ao executar verificação de cidades sem slug:", err);
  process.exit(1);
});
