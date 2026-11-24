// Rota interna para visitar links dos cards e extrair campos adicionais
// Recebe um array de imóveis (com linkReal) e retorna os imóveis com campos extras preenchidos

import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';


// Rota interna não faz extração, apenas retorna os imóveis recebidos
export async function enrichImoveisWithInternalData(browser, imoveis) {
  // Todos os valores devem ser raspados pela rota externa
  return imoveis;
}
