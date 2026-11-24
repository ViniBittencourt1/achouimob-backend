import { enrichImoveisWithInternalData as enrichRobustCrmAddress } from '../_utils/enrichRobustCrmAddress.js';
import { extractUniversalRentalFees } from './taxasLocacao.js';

export function enrichImoveisWithInternalData(browser, imoveis, options = {}) {
  const extractAdditionalData = options.negociacao === 'aluguel'
    ? (html, imovel) => extractUniversalRentalFees(html, imovel.preco)
    : undefined;
  return enrichRobustCrmAddress(browser, imoveis, { extractAdditionalData, exigirDetalhes: options.exigirDetalhes });
}
