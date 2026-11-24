import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarArtolex } from "./extractor.js";

export function runArtolex(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarArtolex, ...options });
}
