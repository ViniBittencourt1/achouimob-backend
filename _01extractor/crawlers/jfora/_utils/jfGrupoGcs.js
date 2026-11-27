import { collectJfPadraoGcs } from './jfPadraoGcs.js';
import { runUniversalSalesGcs } from '../universal/gcsVendas.js';
import { runUniversalRentGcs } from '../universal/gcsLocacao.js';
import { runAlicerceGcs } from '../alicerce/gcs.js';
import { runAlmarGcs } from '../almar/gcs.js';
import { runJfSalesGcs } from '../universal/gcsVendas.js';
import { runJfRentGcs } from '../universal/gcsLocacao.js';

export const projetosJfGcs = Object.freeze(['jfUniversal', 'jfAlicerce', 'jfAlmar', 'jfBargon', 'jfBrasil', 'jfCasaNova']);

export function projetoJfGcs(nome) {
  const project = projetosJfGcs.find(item => item.toLowerCase() === String(nome).toLowerCase() ||
    item.slice(2).toLowerCase() === String(nome).toLowerCase());
  if (!project) throw new Error(`Projeto nao adaptado ao GCS: ${nome}.`);
  return project;
}

export async function runProjetoJfGcs({ projeto, negociacao, ...options }) {
  const project = projetoJfGcs(projeto);
  if (!['venda', 'aluguel'].includes(negociacao)) throw new Error('Negociacao invalida; use venda ou aluguel.');
  if (project === 'jfUniversal') {
    return (negociacao === 'venda' ? runUniversalSalesGcs : runUniversalRentGcs)(options);
  }
  if (project === 'jfAlicerce') return runAlicerceGcs({ ...options, negociacao });
  if (project === 'jfAlmar') return runAlmarGcs({ ...options, negociacao });
  const collect = options.collect ?? (args => collectJfPadraoGcs({ ...args, projeto: project, negociacao }));
  const run = negociacao === 'venda' ? runJfSalesGcs : runJfRentGcs;
  return run({ ...options, project, collect });
}
