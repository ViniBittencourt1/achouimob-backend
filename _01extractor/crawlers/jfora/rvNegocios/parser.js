// backend/src/crawlers/jfora/rvNegocios/parser.js

/**
 * Processa os dados brutos raspados para formatar e padronizar os campos.
 * @param {Array<object>} dadosBrutos - Lista de objetos com dados brutos.
 * @returns {Array<object>} Lista de objetos com dados padronizados.
 */
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

    if (item.codigo && item.codigo.includes("/")) {
      const partes = item.codigo.split("/");
      codigoBase = partes[0].trim();
      tipoImovel = partes[1].trim();
    }

    // 3) Link real
    const linkReal = codigoBase
      ? `https://www.rvnegociosimobiliariosjf.com.br/imovel/venda`
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
      areaValor: item.areaValor ?? null,
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
  const agoraIso = new Date().toISOString();
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
        atualizadoEm: agoraIso,
      };
      dataConsolidada.set(novoImovel.linkReal, imovelAtualizado);
    } else {
      // Novo imóvel: Define dataInclusao
      const novoRegistro = {
        ...novoImovel,
        dataInclusao: dataAtual,
        dataExclusao: "",
        atualizadoEm: agoraIso,
      };
      dataConsolidada.set(novoImovel.linkReal, novoRegistro);
    }
  });

  // Proteção: se a raspagem vier vazia, não aplica exclusão em massa.
  if (linksRaspadosSet.size === 0) {
    console.warn("[RV Negocios] Nenhum imóvel raspado nesta execução. Soft delete ignorado para evitar falso positivo em dataExclusao.");
    return dataConsolidada;
  }

  // Proteção adicional para execuções parciais: só aplica exclusão com cobertura mínima da base.
  const coberturaMinimaParaExclusao = 0.2;
  const coberturaAtual = existingDataMap.size > 0 ? linksRaspadosSet.size / existingDataMap.size : 1;
  if (existingDataMap.size > 0 && coberturaAtual < coberturaMinimaParaExclusao) {
    console.warn(`[RV Negocios] Cobertura baixa (${(coberturaAtual * 100).toFixed(1)}%). Soft delete ignorado para evitar exclusões indevidas.`);
    return dataConsolidada;
  }

  // 2. Processar Exclusões (Soft Delete)
  dataConsolidada.forEach((imovel, linkReal) => {
    // Se o imóvel não foi raspado na execução atual E ainda não tem dataExclusao
    if (!linksRaspadosSet.has(linkReal) && !imovel.dataExclusao) {
      imovel.dataExclusao = dataAtual;
      imovel.atualizadoEm = agoraIso;
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