// backend/src/crawlers/jfora/invest/parser.js

export function consolidateData(imoveisRaspados, existingDataMap) {
  const dataConsolidada = new Map(existingDataMap);
  const dataAtual = new Date().toISOString().split("T")[0];

  const linksRaspadosSet = new Set();
  imoveisRaspados.forEach(novoImovel => {
    linksRaspadosSet.add(novoImovel.linkReal);
    const imovelExistente = dataConsolidada.get(novoImovel.linkReal);

    if (imovelExistente) {

      // ===============================================================
      // 🔥 INÍCIO DA ALTERAÇÃO SOLICITADA — COMPARAR TÍTULO
      // ===============================================================

      const raspadoSemLinkCard = { ...novoImovel };
      delete raspadoSemLinkCard.linkCard;

      // se título for igual → preserva o título existente
      // se for diferente → usa o título novo
      let tituloFinal = imovelExistente.titulo;

      if (
        raspadoSemLinkCard.titulo &&
        raspadoSemLinkCard.titulo.trim() !== imovelExistente.titulo?.trim()
      ) {
        tituloFinal = raspadoSemLinkCard.titulo;
      }

      // aplica merge manual
      const imovelAtualizado = {
        ...imovelExistente,
        ...raspadoSemLinkCard,
        titulo: tituloFinal,     // aplica regra
        dataExclusao: "",        // reativa
      };

      dataConsolidada.set(novoImovel.linkReal, imovelAtualizado);

      // ===============================================================
      // 🔥 FIM DA ALTERAÇÃO SOLICITADA
      // ===============================================================

    } else {
      // imóvel novo
      dataConsolidada.set(novoImovel.linkReal, {
        ...novoImovel,
        dataInclusao: dataAtual,
        dataExclusao: "",
      });
    }
  });

  // Soft delete
  dataConsolidada.forEach((imovel, linkReal) => {
    if (!linksRaspadosSet.has(linkReal) && !imovel.dataExclusao) {
      imovel.dataExclusao = dataAtual;
    }
  });

  return dataConsolidada;
}


// Filtra imóveis que precisam visita
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

  console.log(`   ➡️ ${imoveisParaVisitar.length} imóveis selecionados para visita.`);
  return imoveisParaVisitar;
}