import axios from 'axios';
import { JSDOM } from 'jsdom';

const HTTP_CONFIG = {
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  },
};

export function extractEnderecoRobustCrm(html) {
  const dom = new JSDOM(html);
  const endereco = dom.window.document.querySelector('.imovel--location--address a, .imovel--location--address');
  return endereco?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

export function appendEndereco(localizacao, endereco) {
  const localizacaoAtual = String(localizacao || '').trim();
  const enderecoAtual = String(endereco || '').trim();
  if (!enderecoAtual) return localizacaoAtual;
  if (!localizacaoAtual) return enderecoAtual;

  const normalizar = (valor) => valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return normalizar(localizacaoAtual).includes(normalizar(enderecoAtual))
    ? localizacaoAtual
    : `${localizacaoAtual} - ${enderecoAtual}`;
}

async function carregarHtmlDetalhe(linkReal) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const response = await axios.get(linkReal, HTTP_CONFIG);
      return response.data;
    } catch (error) {
      ultimoErro = error;
      if (tentativa < 3) await new Promise(resolve => setTimeout(resolve, 1000 * tentativa));
    }
  }
  throw ultimoErro;
}

export async function enrichImoveisWithInternalData(_browser, imoveis, { extractAdditionalData, exigirDetalhes = false } = {}) {
  let enderecosEncontrados = 0;
  let processados = 0;

  console.log(`[RobustCRM] Consultando enderecos de ${imoveis.length} imoveis.`);
  for (const imovel of imoveis) {
    if (!imovel.linkReal) continue;

    try {
      const html = await carregarHtmlDetalhe(imovel.linkReal);
      const endereco = extractEnderecoRobustCrm(html);
      const additionalData = extractAdditionalData?.(html, imovel);
      if (extractAdditionalData && (!additionalData || typeof additionalData !== 'object' || Array.isArray(additionalData))) {
        throw new Error('Dados complementares de detalhe invalidos.');
      }
      if (additionalData) Object.assign(imovel, additionalData);
      if (endereco) {
        imovel.localizacao = appendEndereco(imovel.localizacao, endereco);
        enderecosEncontrados++;
      }
    } catch (error) {
      if (extractAdditionalData || exigirDetalhes) {
        throw new Error(`[RobustCRM] Falha ao extrair dados complementares de ${imovel.linkReal}.`, { cause: error });
      }
      if (error?.response?.status === 404) {
        console.warn(`[RobustCRM] Detalhe indisponivel (HTTP 404): ${imovel.linkReal}. Localizacao preservada; continuando raspagem.`);
      } else {
        console.error(`[RobustCRM] Erro ao extrair endereço de ${imovel.linkReal}:`, error?.message || error);
      }
    }
    processados++;
    if (processados % 20 === 0 || processados === imoveis.length) {
      console.log(`[RobustCRM] Detalhes consultados: ${processados}/${imoveis.length}.`);
    }
  }

  console.log(`[RobustCRM] Endereços encontrados na rota interna: ${enderecosEncontrados}/${imoveis.length}.`);
  return imoveis;
}