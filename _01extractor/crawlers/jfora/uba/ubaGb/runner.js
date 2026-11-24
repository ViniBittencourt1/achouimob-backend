import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarGb } from "./extractor.js";

export function runGb(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarGb, ...options });
}
