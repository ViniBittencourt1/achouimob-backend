import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarNogueira } from "./extractor.js";

export function runNogueira(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarNogueira, ...options });
}
