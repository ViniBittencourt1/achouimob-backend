import { collectJfPadraoGcs } from '../_utils/jfPadraoGcs.js';
import { runJfSalesGcs } from '../universal/gcsVendas.js';
import { runJfRentGcs } from '../universal/gcsLocacao.js';

const PROJECT = 'jfAlicerce';
export async function collectAlicerceGcs({ catalogos, negociacao }) {
  return collectJfPadraoGcs({ projeto: PROJECT, catalogos, negociacao });
}

export function runAlicerceGcs({ negociacao, collect, ...options }) {
  if (!['venda', 'aluguel'].includes(negociacao)) throw new Error('Negociacao Alicerce invalida.');
  const collector = collect ?? (args => collectAlicerceGcs({ ...args, negociacao }));
  const run = negociacao === 'venda' ? runJfSalesGcs : runJfRentGcs;
  return run({ ...options, project: PROJECT, collect: collector });
}
