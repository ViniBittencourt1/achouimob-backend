// backend/src/crawlers/jfora/remax/parser.js

/**
 * Consolida os dados, aplicando a lógica de inclusão e soft-delete.
 */
export function consolidateData(imoveisRaspados, existingDataMap) {
  const dataConsolidada = new Map(existingDataMap);
  const dataAtual = new Date().toISOString().split("T")[0];

  const linksRaspadosSet = new Set();

  imoveisRaspados.forEach(novoImovel => {
    linksRaspadosSet.add(novoImovel.linkReal);
    // Remove o campo _outerHTML antes de consolidar
    const { _outerHTML, ...imovelSemOuterHTML } = novoImovel;
    const imovelExistente = dataConsolidada.get(novoImovel.linkReal);

    if (imovelExistente) {
      // ==================================================================
      //  Mesclar dados preservando linkCard e mantendo bairro/cidade
      // ==================================================================
      const raspadoSemLinkCard = { ...imovelSemOuterHTML };
      delete raspadoSemLinkCard.linkCard;

      const imovelAtualizado = {
        ...imovelExistente,
        ...raspadoSemLinkCard,
        dataExclusao: "", // garante que o imóvel seja reativado
      };
      dataConsolidada.set(novoImovel.linkReal, imovelAtualizado);

    } else {
      // Imóvel novo
      dataConsolidada.set(novoImovel.linkReal, {
        ...imovelSemOuterHTML,
        dataInclusao: dataAtual,
        dataExclusao: "",
      });
    }
  });

  // Processar Exclusões (Soft Delete)
  dataConsolidada.forEach((imovel, linkReal) => {
    if (!linksRaspadosSet.has(linkReal) && !imovel.dataExclusao) {
      imovel.dataExclusao = dataAtual;
    }
  });

  // Atualizar campo atualizadoEm para todos os imóveis
  // Import dinâmico para ES Modules
  import('./extractor-20-atualizadoEm.js').then(mod => {
    const atualizadoEm = mod.extractAtualizadoEm();
    dataConsolidada.forEach(imovel => {
      imovel.atualizadoEm = atualizadoEm;
    });
  });

  return dataConsolidada;
}

/**
 * Filtra a lista de imóveis para encontrar apenas aqueles que precisam da visita à página de detalhes.
 */
export function filterImoveisToScrapeDetails(dataMap) {
  console.log("\n🔍 Otimizando visitas: filtrando imóveis que precisam de extração de detalhes...");
  const imoveisParaVisitar = [];
  const dataAtual = new Date().toISOString().split("T")[0];

  dataMap.forEach(imovel => {
    const isNew = imovel.dataInclusao === dataAtual;
    const needsLinkCard = !imovel.linkCard || imovel.linkCard === "ERRO NA EXTRAÇÃO";
    const isActive = !imovel.dataExclusao;

    if ((isNew || needsLinkCard) && isActive) {
      imoveisParaVisitar.push(imovel);
    }
  });

  console.log(`   ➡️ ${imoveisParaVisitar.length} imóveis selecionados para visita (novos ou com dados incompletos).`);
  return imoveisParaVisitar;
}