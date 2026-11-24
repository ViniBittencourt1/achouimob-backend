// backend/src/crawlers/jfora/decisao/parser.js

/**
 * Processa os dados brutos raspados para formatar e padronizar os campos.
 * @param {Array<object>} dadosBrutos - Lista de objetos com dados brutos.
 * @returns {Array<object>} Lista de objetos com dados padronizados.
 */
import { extractTipoImovel } from './extractor-05-tipoImovel.js';

export function processarImoveis(dadosBrutos) {
  return dadosBrutos.map((item) => {
    // 1) TipoNegocio + preco numérico
    let TipoNegocio = null;
    let preco = null;

    if (item.preco) {
      const precoLower = item.preco.toLowerCase();

      if (precoLower.includes("venda")) TipoNegocio = "Venda";
      else if (
        precoLower.includes("locação") ||
        precoLower.includes("aluguel")
      )
        TipoNegocio = "Locação";

      const matchValor = item.preco.match(/[\d\.\,]+/);
      if (matchValor) {
        preco = Number(matchValor[0].replace(/\./g, "").replace(",", "."));
      }
    }

    // 2) Código base + tipoImovel
    let codigoBase = item.codigo || null;
    let tipoImovel = null;

    // Extração do tipoImovel usando apenas extractor-05-tipoImovel.js
    tipoImovel = extractTipoImovel(item.cardHtml);

    // 3) Link real
    const linkReal = codigoBase
      ? `https://www.toc2imoveis.com.br/imoveis/venda/-/-/-/-`
      : null;

    // 4) ambienteValor ainda não extraído
    const ambienteValor = null;

    return {
      titulo: item.titulo ?? null,
      localizacao: item.localizacao ?? null,
      linkCard: item.linkCard ?? null,
      TipoNegocio,
      bairro,
      cidade,
      corretor,
      preco,
      codigoBase,
      tipoImovel,
      linkReal,
      dormitorioValor: item.dormitorioValor ?? null,
      banheiroValor: item.banheiroValor ?? null,
      garagemValor: item.garagemValor ?? null,
      elevadorValor: item.elevadorValor ?? null,
      ambienteValor,
      areaValor: (item.areaValor && item.areaValor !== '' && item.areaValor !== null && item.areaValor !== undefined) ? item.areaValor : '0',
      linkFoto: item.linkFoto ?? null,
    };
  });
}

/**
 * Aplica a lógica de inclusão/exclusão (soft delete) comparando dados raspados com o Firebase.
 * Esta é a função que estava faltando e que o index.js espera.
 * @param {Array<object>} imoveisRaspados - Lista de imóveis raspados na execução atual.
 * @param {Map<string, object>} existingDataMap - Mapa de imóveis existentes no Firebase.
 * @returns {Map<string, object>} Mapa consolidado de imóveis para atualização.
 */
export function consolidateData(imoveisRaspados, existingDataMap) {
  const dataConsolidada = new Map(existingDataMap);
  const dataAtual = new Date().toISOString().split("T")[0]; // Formato YYYY-MM-DD

  // 1. Processar Inclusões e Atualizações
  const linksRaspadosSet = new Set();
  imoveisRaspados.forEach(novoImovel => {
    linksRaspadosSet.add(novoImovel.linkReal);
    const imovelExistente = dataConsolidada.get(novoImovel.linkReal);

    if (imovelExistente) {
      // Imóvel existente: Atualiza dados básicos, garante que dataExclusao está vazia

      // Cria uma cópia do novoImovel e remove campos que não devem ser sobrescritos
      const novoImovelParaMesclar = { ...novoImovel };
      // Preserva dataInclusao e linkCard (se for o caso)
      delete novoImovelParaMesclar.dataInclusao;
      delete novoImovelParaMesclar.linkCard;

      const imovelAtualizado = {
        ...imovelExistente,
        ...novoImovelParaMesclar, // Sobrescreve dados básicos raspados (preço, título, etc.)
        dataExclusao: "", // Garante que a data de exclusão seja removida se o imóvel reapareceu
      };
      dataConsolidada.set(novoImovel.linkReal, imovelAtualizado);
    } else {
      // Novo imóvel: Define dataInclusao
      const novoRegistro = {
        ...novoImovel,
        dataInclusao: dataAtual,
        dataExclusao: "",
      };
      dataConsolidada.set(novoImovel.linkReal, novoRegistro);
    }
  });

  // 2. Processar Exclusões (Soft Delete)
  dataConsolidada.forEach((imovel, linkReal) => {
    // Se o imóvel não foi raspado na execução atual E ainda não tem dataExclusao
    if (!linksRaspadosSet.has(linkReal) && !imovel.dataExclusao) {
      imovel.dataExclusao = dataAtual;
      dataConsolidada.set(linkReal, imovel);
    }
  });

  return dataConsolidada;
}

/**
 * Filtra a lista consolidada para encontrar imóveis que precisam de extração de detalhes.
 * Esta é a função que estava faltando e que o index.js espera.
 * @param {Map<string, object>} dataConsolidada - Mapa consolidado de imóveis.
 * @returns {Array<object>} Lista de imóveis que precisam de extração de detalhes.
 */
export function filterImoveisToScrapeDetails(dataConsolidada) {
  const dataAtual = new Date().toISOString().split("T")[0];

  return Array.from(dataConsolidada.values()).filter(imovel => {
    // Filtro: Visita se for novo OU se precisar do Link Card E não estiver excluído
    const isNew = imovel.dataInclusao === dataAtual;
    const needsLinkCard = !imovel.linkCard || imovel.linkCard === "ERRO NA EXTRAÇÃO";




    return (isNew || needsLinkCard) && !imovel.dataExclusao;
  });
}