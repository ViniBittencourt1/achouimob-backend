import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarCarlos } from "./extractor.js";

export function runCarlos(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarCarlos, ...options });
}
