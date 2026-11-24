// backend/src/crawlers/jfora/leal/parser.js

/**
 * Processa os dados brutos raspados para formatar e padronizar os campos.
 * @param {Array<object>} dadosBrutos - Lista de objetos com dados brutos.
 * @returns {Array<object>} Lista de objetos com dados padronizados.
 */
export function processarImoveis(dadosBrutos) {
  return dadosBrutos.map((item) => {
    // 1) TipoNegocio + preco numÃ©rico
    let TipoNegocio = null;
    let preco = null;

    if (item.preco) {
      const precoLower = item.preco.toLowerCase();

      if (precoLower.includes("venda")) TipoNegocio = "Venda";
      else if (
        precoLower.includes("locaÃ§Ã£o") ||
        precoLower.includes("aluguel")
      )
        TipoNegocio = "LocaÃ§Ã£o";

      const matchValor = item.preco.match(/[\d\.\,]+/);
      if (matchValor) {
        preco = Number(matchValor[0].replace(/\./g, "").replace(",", "."));
      }
    }

    // 2) CÃ³digo base + tipoImovel
    let codigoBase = item.codigo || null;
    let tipoImovel = null;

    if (item.codigo && item.codigo.includes("/")) {
      const partes = item.codigo.split("/");
      codigoBase = partes[0].trim();
      tipoImovel = partes[1].trim();
    }

    // 3) Link real
    const linkReal = codigoBase
      ? `https://www.mouraimoveisjf.com.br/imovel/cod-${codigoBase}`
      : null;

    // 4) ambienteValor ainda nÃ£o extraÃ­do
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
 * Aplica a lÃ³gica de inclusÃ£o/exclusÃ£o (soft delete) comparando dados raspados com o Firebase.
 * Esta Ã© a funÃ§Ã£o que estava faltando e que o index.js espera.
 * @param {Array<object>} imoveisRaspados - Lista de imÃ³veis raspados na execuÃ§Ã£o atual.
 * @param {Map<string, object>} existingDataMap - Mapa de imÃ³veis existentes no Firebase.
 * @returns {Map<string, object>} Mapa consolidado de imÃ³veis para atualizaÃ§Ã£o.
 */
export function consolidateData(imoveisRaspados, existingDataMap) {
  const dataConsolidada = new Map(existingDataMap);
  const dataAtual = new Date().toISOString().split("T")[0]; // Formato YYYY-MM-DD

  const normalizarCodigoBase = (valor) => String(valor ?? "").trim().toUpperCase();
  const normalizarLink = (valor) => String(valor ?? "").trim();

  const getIdentificador = (imovel, linkFallback = "") => {
    const codigo = normalizarCodigoBase(imovel?.codigoBase);
    if (codigo) return `COD:${codigo}`;

    const link = normalizarLink(imovel?.linkReal || linkFallback);
    if (link) return `URL:${link}`;

    return "";
  };

  // Index dos registros existentes por identificador (codigoBase ou linkReal).
  const existingByIdentificador = new Map();
  dataConsolidada.forEach((imovelExistente, linkExistente) => {
    const id = getIdentificador(imovelExistente, linkExistente);
    if (id) existingByIdentificador.set(id, { key: linkExistente, imovel: imovelExistente });
  });

  // 1) InclusÃµes e atualizaÃ§Ãµes
  const identificadoresRaspados = new Set();

  imoveisRaspados.forEach((novoImovel) => {
    const idNovo = getIdentificador(novoImovel, novoImovel.linkReal);
    if (idNovo) identificadoresRaspados.add(idNovo);

    const existente = idNovo ? existingByIdentificador.get(idNovo) : undefined;

    if (existente) {
      const novoImovelParaMesclar = { ...novoImovel };
      delete novoImovelParaMesclar.dataInclusao;
      delete novoImovelParaMesclar.linkCard;

      const imovelAtualizado = {
        ...existente.imovel,
        ...novoImovelParaMesclar,
        dataExclusao: "",
      };

      // Se o link mudou, remove a chave antiga e grava na nova.
      if (existente.key !== novoImovel.linkReal) {
        dataConsolidada.delete(existente.key);
      }
      dataConsolidada.set(novoImovel.linkReal, imovelAtualizado);
    } else {
      const novoRegistro = {
        ...novoImovel,
        dataInclusao: dataAtual,
        dataExclusao: "",
      };
      dataConsolidada.set(novoImovel.linkReal, novoRegistro);
    }
  });

  // 2) Soft delete: somente para registros do banco que nao apareceram na raspagem atual.
  dataConsolidada.forEach((imovel, linkReal) => {
    const idExistente = getIdentificador(imovel, linkReal);
    if (!idExistente) return;

    if (!identificadoresRaspados.has(idExistente) && !imovel.dataExclusao) {
      imovel.dataExclusao = dataAtual;
      dataConsolidada.set(linkReal, imovel);
    }
  });

  return dataConsolidada;
}

/**
 * Filtra a lista consolidada para encontrar imÃ³veis que precisam de extraÃ§Ã£o de detalhes.
 * Esta Ã© a funÃ§Ã£o que estava faltando e que o index.js espera.
 * @param {Map<string, object>} dataConsolidada - Mapa consolidado de imÃ³veis.
 * @returns {Array<object>} Lista de imÃ³veis que precisam de extraÃ§Ã£o de detalhes.
 */
export function filterImoveisToScrapeDetails(dataConsolidada) {
  const dataAtual = new Date().toISOString().split("T")[0];

  return Array.from(dataConsolidada.values()).filter(imovel => {
    // Filtro: Visita se for novo OU se precisar do Link Card E nÃ£o estiver excluÃ­do
    const isNew = imovel.dataInclusao === dataAtual;
    const needsLinkCard = !imovel.linkCard || imovel.linkCard === "ERRO NA EXTRAÃ‡ÃƒO";


    // pode ser usada para extrair outros detalhes no futuro. Por enquanto,
    // vamos retornar apenas os novos para manter a otimizaÃ§Ã£o.


    // ou removida do index.js. Como o index.js espera, vamos manter a lÃ³gica padrÃ£o.

    return (isNew || needsLinkCard) && !imovel.dataExclusao;
  });
}
