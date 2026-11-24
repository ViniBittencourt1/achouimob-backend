import fs from "node:fs";
import path from "node:path";
import { arquivoPrincipalImoveis } from "../_utils/vendasSincronizacao.js";

export function listarPendenciasPrecoJson(backendRoot, confirmations = []) {
  const crawlerDir = path.join(backendRoot, "crawler");
  const files = fs.existsSync(crawlerDir)
    ? fs.readdirSync(crawlerDir).filter(arquivoPrincipalImoveis)
    : [];
  const confirmedPrices = new Map(
    confirmations.map((item) => [`${item?.file || ""}__${item?.linkReal || `index:${item?.index ?? ""}`}`, item?.preco])
  );
  const issues = [];

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(crawlerDir, file), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;

    data.forEach((item, index) => {
      const preco = item?.preco;
      if (typeof preco !== "number" || !Number.isFinite(preco)) return;
      const linkReal = String(item?.linkReal || "").trim();
      const confirmationKey = `${file}__${linkReal || `index:${index}`}`;
      if (confirmedPrices.get(confirmationKey) === preco) return;
      const motivo = preco === 0 ? "zero" : preco > 10000000 ? "acima-limite" : "";
      if (!motivo) return;
      issues.push({
        file,
        index,
        preco,
        motivo,
        titulo: String(item?.titulo || "").trim(),
        tipoImovel: String(item?.tipoImovel || "").trim(),
        localizacao: String(item?.localizacao || "").trim(),
        cidade: String(item?.cidade || "").trim(),
        bairro: String(item?.bairro || "").trim(),
        linkReal,
      });
    });
  }

  issues.sort((a, b) => {
    const aPriority = a.motivo === "acima-limite" ? 0 : 1;
    const bPriority = b.motivo === "acima-limite" ? 0 : 1;
    return aPriority - bPriority || b.preco - a.preco || a.file.localeCompare(b.file, "pt-BR") || a.index - b.index;
  });
  return issues;
}

export function upsertConfirmacoesPrecoJson(confirmations, issues, confirmadoEm = new Date().toISOString()) {
  if (!Array.isArray(confirmations) || !Array.isArray(issues)) {
    throw new Error("Confirmações e pendências de preço devem ser listas.");
  }

  const updated = [...confirmations];
  for (const issue of issues) {
    if (!issue?.file || (!issue?.linkReal && !Number.isInteger(issue?.index)) ||
        typeof issue.preco !== "number" || !Number.isFinite(issue.preco)) {
      throw new Error("Pendência de preço inválida para confirmação.");
    }
    const confirmation = {
      file: issue.file,
      linkReal: issue.linkReal,
      preco: issue.preco,
      confirmadoEm,
    };
    if (!issue.linkReal) confirmation.index = issue.index;
    const index = updated.findIndex((item) => item?.file === issue.file &&
      (issue.linkReal ? item?.linkReal === issue.linkReal : !item?.linkReal && item?.index === issue.index));
    if (index >= 0) updated[index] = confirmation;
    else updated.push(confirmation);
  }
  return updated;
}
