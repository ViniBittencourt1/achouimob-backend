// Aplica inclusao/exclusao (soft delete) comparando os imoveis raspados com a base existente.
export function consolidateData(imoveisRaspados, existingDataMap) {
  const dataConsolidada = new Map(existingDataMap);
  const dataAtual = new Date().toISOString().split("T")[0];
  const linksRaspados = new Set();

  for (const novoImovel of imoveisRaspados) {
    linksRaspados.add(novoImovel.linkReal);
    const existente = dataConsolidada.get(novoImovel.linkReal);
    if (existente) {
      const { dataInclusao, ...atualizacao } = novoImovel;
      dataConsolidada.set(novoImovel.linkReal, { ...existente, ...atualizacao, linkCard: 0, dataExclusao: "" });
    } else {
      dataConsolidada.set(novoImovel.linkReal, { ...novoImovel, linkCard: 0, dataInclusao: dataAtual, dataExclusao: "" });
    }
  }

  for (const [linkReal, imovel] of dataConsolidada) {
    if (!linksRaspados.has(linkReal) && !imovel.dataExclusao) dataConsolidada.set(linkReal, { ...imovel, dataExclusao: dataAtual });
  }
  return dataConsolidada;
}
