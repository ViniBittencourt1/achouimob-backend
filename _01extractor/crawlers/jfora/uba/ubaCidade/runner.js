import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarCidade } from "./extractor.js";

export function runCidade(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarCidade, ...options });
}
