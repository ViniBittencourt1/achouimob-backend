import { collectJfPadraoGcs } from '../_utils/jfPadraoGcs.js';
import { runJfSalesGcs } from '../universal/gcsVendas.js';
import { runJfRentGcs } from '../universal/gcsLocacao.js';

const PROJECT = 'jfAlmar';
export async function collectAlmarGcs({ catalogos, negociacao }) {
  return collectJfPadraoGcs({ projeto: PROJECT, catalogos, negociacao });
}

export function runAlmarGcs({ negociacao, collect, ...options }) {
  if (!['venda', 'aluguel'].includes(negociacao)) throw new Error('Negociacao Almar invalida.');
  const collector = collect ?? (args => collectAlmarGcs({ ...args, negociacao }));
  const run = negociacao === 'venda' ? runJfSalesGcs : runJfRentGcs;
  return run({ ...options, project: PROJECT, collect: collector });
}
