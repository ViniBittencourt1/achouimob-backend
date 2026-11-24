import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { incluirAlugueisConfigurados, projetoHabilitadoNaRaspagem, cidadeProjeto } from './crawler-order.cjs';
import { executeScript, getIdleTimeout } from './crawler-execution.cjs';
import { saveReport, summarize } from './crawler-report.cjs';
import { updateAvailability, loadAvailability, routeForScript, isUnavailable } from './crawler-availability.cjs';
import { localPath } from './backend-paths.cjs';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = path.dirname(__filename);
const configPath = path.join(backendRoot, "_01extractor", "crawlers", "jfora", "_1Jf", "site-scheduler-config.json");
const credentialsDir = path.join(backendRoot, "credentials");
const logsDir = localPath(backendRoot, "logs");
const progressPath = path.join(logsDir, "crawler-daily-progress.json");
const PROGRESS_TIMEZONE = "America/Sao_Paulo";
const MANUAL_ONLY_SCRIPTS = new Set([
  "typesense:sync",
  "cidades:check-slug",
  "bairros:check-slug",
]);

function getCurrentRunDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROGRESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function loadProgress(file = progressPath) {
  try {
    const progress = JSON.parse(fs.readFileSync(file, "utf8"));
    return progress && typeof progress === "object" ? progress : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[RENDER] Ignorando checkpoint invalido: ${error.message}`);
    }
    return {};
  }
}

function saveProgress(progress, file = progressPath) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempPath = `${file}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, file);
}

function markScriptCompleted(progress, runDate, scriptName, file = progressPath) {
  progress[runDate] ??= {};
  progress[runDate][scriptName] = new Date().toISOString();

  const retainedDates = Object.keys(progress).sort().slice(-14);
  for (const date of Object.keys(progress)) {
    if (!retainedDates.includes(date)) delete progress[date];
  }

  saveProgress(progress, file);
}

function writeServiceAccountFiles() {
  const firebaseRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!firebaseRaw) {
    throw new Error("Defina FIREBASE_SERVICE_ACCOUNT_JSON no ambiente do Render.");
  }

  let firebaseAccount;
  try {
    firebaseAccount = JSON.parse(firebaseRaw);
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON invalido: ${error.message}`);
  }

  fs.mkdirSync(credentialsDir, { recursive: true });
  fs.writeFileSync(path.join(credentialsDir, "firebase-key.json"), `${JSON.stringify(firebaseAccount)}\n`, "utf8");

  const sheetsRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || firebaseRaw;
  let sheetsAccount;
  try {
    sheetsAccount = JSON.parse(sheetsRaw);
  } catch (error) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON invalido: ${error.message}`);
  }

  fs.writeFileSync(path.join(credentialsDir, "service-account.json"), `${JSON.stringify(sheetsAccount)}\n`, "utf8");
}

function loadSelectedScripts() {
  const fromEnv = String(process.env.SCRAPE_SCRIPTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  let selectedScripts;
  if (fromEnv.length) {
    selectedScripts = fromEnv.filter((script) => !MANUAL_ONLY_SCRIPTS.has(script));
  } else {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!Array.isArray(config.selectedScripts) || config.selectedScripts.length === 0) {
      throw new Error("Nenhum projeto selecionado em site-scheduler-config.json.");
    }
    selectedScripts = config.selectedScripts.filter((script) => !MANUAL_ONLY_SCRIPTS.has(script));
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"));
  return incluirAlugueisConfigurados(selectedScripts, Object.keys(packageJson.scripts || {}));
}

function runScript(scriptName) {
  console.log(`[RENDER] Iniciando ${scriptName}...`);
  const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"));
  if (packageJson.scripts?.[scriptName]?.includes("locacaoPreparacao.js")) {
    return Promise.resolve({ status: "unavailable", error: "Rota de aluguel nao configurada; dados existentes preservados." });
  }
  return executeScript(scriptName, packageJson.scripts?.[scriptName], {
    cwd: backendRoot,
    env: { ...process.env, CRAWLER_HEADLESS: "true", NODE_OPTIONS: "--max-old-space-size=4096 --expose-gc" },
  });
}

export async function runBatch({
  scripts, unavailable = [], run = runScript, prepare = writeServiceAccountFiles,
  reportPath = localPath(backendRoot, process.env.CRAWLER_REPORT_PATH || path.join(logsDir, `crawler-report_${new Date().toISOString().replace(/[:.]/g, "-")}.json`)),
  progressFile = progressPath,
  availabilityFile, updateSite = updateAvailability,
} = {}) {
  scripts = scripts.filter(projetoHabilitadoNaRaspagem);
  unavailable = unavailable.filter(project => projetoHabilitadoNaRaspagem(project.script));
  const runDate = getCurrentRunDate();
  const progress = loadProgress(progressFile);
  const forceRerun = process.env.CRAWLER_FORCE_RERUN === "true";
  const completedScripts = new Set(Object.keys(progress[runDate] || {}));
  const unavailableByScript = new Map(unavailable.map(project => [project.script, project]));
  const availability = loadAvailability(availabilityFile);
  const siteUnavailable = script => {
    const route = routeForScript(script);
    return route ? isUnavailable(route.collection, route.tipo, availability) : false;
  };
  const report = {
    runDate, startedAt: new Date().toISOString(), endedAt: null,
    projects: scripts.map(script => ({
      script, city: cidadeProjeto(script),
      kind: script.endsWith(":locacao") ? "Aluguel" : "Venda",
      status: unavailableByScript.has(script) ? "unavailable" : !forceRerun && completedScripts.has(script) && !siteUnavailable(script) ? "resumed" : "pending",
      siteUnavailable: siteUnavailable(script),
      ...(unavailableByScript.has(script) ? { error: unavailableByScript.get(script).error } : {}),
    })),
  };
  for (const issue of unavailable) {
    if (!scripts.includes(issue.script)) report.projects.push({ ...issue, status: "unavailable" });
  }
  const persist = () => saveReport(report, reportPath);
  persist();

  console.log(`[RENDER] Rodada diaria com ${scripts.length} projetos.`);
  console.log(`[RENDER] Relatorio: ${reportPath.replace(/\.json$/, ".html")}`);
  console.log(`[RENDER] Retomada de ${runDate}: ${summarize(report).resumed} projeto(s) ja concluidos serao ignorados.`);
  try {
    getIdleTimeout();
    await prepare();
    for (const project of report.projects.filter(item => item.status === "pending")) {
      project.status = "running";
      project.startedAt = new Date().toISOString();
      persist();
      try {
        Object.assign(project, await run(project.script));
      } catch (error) {
        project.status = "failed";
        project.error = error.message;
      }
      Object.assign(project, await updateSite(project.script, project, { file: availabilityFile }));
      if (project.status === "completed") project.outputTail = "";
      project.endedAt = new Date().toISOString();
      if (project.status === "completed") {
        // Falha ao salvar checkpoint e um erro de infraestrutura, nao de raspagem.
        markScriptCompleted(progress, runDate, project.script, progressFile);
        console.log(`[RENDER] ${project.script} concluido.`);
      } else {
        console.error(`[RENDER] ${project.script}: ${project.publicationError || project.error}; continuando para o proximo projeto.`);
      }
      persist();
      if (global.gc) global.gc();
    }
  } catch (error) {
    report.error = error.message;
    console.error(`[RENDER] Falha de infraestrutura: ${error.message}`);
  } finally {
    report.endedAt = new Date().toISOString();
    persist();
  }
  const counts = summarize(report);
  const success = !report.error && report.projects.every(project => ["completed", "resumed"].includes(project.status));
  console.log(`[RENDER] Resumo: ${JSON.stringify(counts)}`);
  console.log(`[RENDER] Rodada diaria ${success ? "concluida com sucesso" : "concluida com pendencias; consulte o relatorio"}.`);
  return { success, report, reportPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const unavailable = JSON.parse(process.env.CRAWLER_UNAVAILABLE_PROJECTS || "[]");
  runBatch({ scripts: loadSelectedScripts(), unavailable }).then(result => {
    process.exitCode = result.success ? 0 : 1;
  }).catch(error => {
    console.error(`[RENDER] Rodada diaria falhou: ${error.message}`);
    process.exitCode = 1;
  });
}
