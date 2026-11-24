import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarAloisio } from "./extractor.js";

export function runAloisio(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarAloisio, ...options });
}
