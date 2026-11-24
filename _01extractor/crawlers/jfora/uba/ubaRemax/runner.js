import { runCrawlerUba } from "../runner.js";
import { project } from "./config.js";
import { coletarRemaxUba } from "./extractor.js";

export function runRemax(negociacao, options = {}) {
  return runCrawlerUba(project, negociacao, { coletar: coletarRemaxUba, ...options });
}
