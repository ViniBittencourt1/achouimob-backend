import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarJXavier } from "./extractor.js";

export function runJXavier(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarJXavier, ...options });
}
