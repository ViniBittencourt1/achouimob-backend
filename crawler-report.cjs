const fs = require("node:fs");
const path = require("node:path");

const statusLabels = {
  pending: "Nao tentado", running: "Em execucao", completed: "Concluido",
  resumed: "Ja concluido no dia", failed: "Falhou", timeout: "Sem atividade",
  unavailable: "Sem crawler/rota", interrupted: "Interrompido",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function summarize(report) {
  const counts = Object.fromEntries(Object.keys(statusLabels).map(status => [status, 0]));
  for (const project of report.projects) counts[project.status]++;
  return counts;
}

function emailReport(report) {
  return {
    ...report,
    projects: report.projects.filter(project => !project.siteUnavailable || project.publicationError),
  };
}

function reportHtml(report) {
  report = emailReport(report);
  const counts = summarize(report);
  const rows = report.projects.filter(project => project.status !== "unavailable").map(project => `<tr>
<td>${escapeHtml(project.script)}</td><td>${escapeHtml(project.city)}</td>
<td>${escapeHtml(project.kind)}</td><td>${statusLabels[project.status]}</td>
<td>${escapeHtml(project.publicationError || project.error || "")}${project.outputTail ? `<details><summary>Ultimas mensagens</summary><pre>${escapeHtml(project.outputTail)}</pre></details>` : ""}</td>
</tr>`).join("\n");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>Relatorio de raspagem ${escapeHtml(report.runDate)}</title>
<style>body{font:14px Arial;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<h1>Raspagem de imoveis</h1>
<p>Data: ${escapeHtml(report.runDate)} | Inicio: ${escapeHtml(report.startedAt)} | Fim: ${escapeHtml(report.endedAt || "Execucao em andamento; se o processo foi encerrado, este e o ultimo estado salvo.")}</p>
<p>Total: ${report.projects.length} | Concluidos: ${counts.completed} | Ja concluidos no dia: ${counts.resumed} | Falhas: ${counts.failed} | Sem atividade: ${counts.timeout} | Sem crawler/rota: ${counts.unavailable} | Interrompidos: ${counts.interrupted} | Nao tentados: ${counts.pending} | Em execucao: ${counts.running}</p>
${report.error ? `<p>${escapeHtml(report.error)}</p>` : ""}
<table><thead><tr><th>Projeto</th><th>Cidade</th><th>Negociacao</th><th>Situacao</th><th>Erro / diagnostico</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}

function saveReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  report.updatedAt = new Date().toISOString();
  for (const [file, content] of [
    [reportPath, `${JSON.stringify(report, null, 2)}\n`],
    [reportPath.replace(/\.json$/, ".html"), reportHtml(report)],
  ]) {
    fs.writeFileSync(`${file}.tmp`, content, "utf8");
    fs.renameSync(`${file}.tmp`, file);
  }
}

module.exports = { escapeHtml, summarize, reportHtml, saveReport, statusLabels, emailReport };
