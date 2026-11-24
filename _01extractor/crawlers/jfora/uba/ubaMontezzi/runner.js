import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarMontezzi } from "./extractor.js";

export function runMontezzi(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarMontezzi, ...options });
}
