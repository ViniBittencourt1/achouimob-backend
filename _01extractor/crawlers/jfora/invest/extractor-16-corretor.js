import * as cheerio from "cheerio";

/**
 * Extrai o primeiro nome do corretor do HTML do painel.
 * @param {string} htmlPainelCorretor - HTML do painel do corretor
 * @returns {string} Primeiro nome do corretor, capitalizado
 */
export function extractCorretorPrimeiroNome(htmlPainelCorretor) {
  const $ = cheerio.load(htmlPainelCorretor);
  // Busca o nome completo dentro do container .agent-details > h5 > a
  const nomeCompleto = $(".agent-details h5 a").text().trim();
  if (!nomeCompleto) return "";
  // Extrai o primeiro nome e normaliza (primeira letra maiúscula, resto minúsculo)
  const primeiroNome = nomeCompleto.split(/\s+/)[0];
  return primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
}