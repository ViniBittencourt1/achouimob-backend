// backend/src/crawlers/jfora/fogel/parser.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cidadesPath = path.resolve(__dirname, '../../../../_03database/filtros/_brCidades.json');

const cidadeSlugByNome = new Map();
const cidadeSlugs = new Set();
const TIME_ZONE = "America/Sao_Paulo";

function dataAtualSaoPaulo() {
  return format(toZonedTime(new Date(), TIME_ZONE), "dd/MM/yyyy HH:mm:ss", { timeZone: TIME_ZONE });
}

function dataLocalISOAtual() {
  return format(toZonedTime(new Date(), TIME_ZONE), "yyyy-MM-dd", { timeZone: TIME_ZONE });
}

function normalizeCidadeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/_,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

try {
  const cidadesData = fs.readFileSync(cidadesPath, "utf8");
  const cidades = JSON.parse(cidadesData);
  for (const cidade of cidades) {
    const nomeNormalizado = normalizeCidadeText(cidade?.nome || "");
    const slug = String(cidade?.slug || "").trim();
    if (slug) cidadeSlugs.add(slug);
    if (nomeNormalizado && slug && !cidadeSlugByNome.has(nomeNormalizado)) {
      cidadeSlugByNome.set(nomeNormalizado, slug);
    }
  }
} catch (err) {
  console.error("[Fogel/parser] Falha ao carregar catálogo de cidades:", err.message || err);
}

function normalizarCidadeParaSlug(cidade) {
  const raw = String(cidade || "").trim();
  if (!raw) return raw;
  if (cidadeSlugs.has(raw)) return raw;
  const nomeNormalizado = normalizeCidadeText(raw);
  return cidadeSlugByNome.get(nomeNormalizado) || raw;
}

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
    const codigoBase = item.codigoBase || item.codigo || null;
    const tipoImovel = item.tipoImovel || null;

    // 3) Link real
    const linkReal = item.linkReal || null;

    // 4) ambienteValor ainda não extraído
    const ambienteValor = null;

    return {
      titulo: item.titulo ?? null,
      localizacao: item.localizacao ?? null,
      linkCard: item.linkCard ?? null,
      TipoNegocio,
      bairro: item.bairro ?? null,
      cidade: normalizarCidadeParaSlug(item.cidade ?? null),
      corretor: item.corretor ?? null,
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
  const dataAtual = dataLocalISOAtual();
  const dataInclusaoAtual = dataAtualSaoPaulo();

  if (existingDataMap.size === 0) {
    const mapaCompleto = new Map();
    imoveisRaspados.forEach((novoImovel) => {
      const novoRegistro = {
        ...novoImovel,
        cidade: normalizarCidadeParaSlug(novoImovel.cidade),
        dataInclusao: dataInclusaoAtual,
        dataExclusao: "",
      };
      mapaCompleto.set(novoImovel.linkReal, novoRegistro);
    });
    return mapaCompleto;
  }

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
        cidade: normalizarCidadeParaSlug(novoImovelParaMesclar.cidade ?? imovelExistente.cidade),
        dataExclusao: "", // Garante que a data de exclusão seja removida se o imóvel reapareceu
      };
      dataConsolidada.set(novoImovel.linkReal, imovelAtualizado);
    } else {
      // Novo imóvel: Define dataInclusao
      const novoRegistro = {
        ...novoImovel,
        cidade: normalizarCidadeParaSlug(novoImovel.cidade),
        dataInclusao: dataInclusaoAtual,
        dataExclusao: "",
      };
      dataConsolidada.set(novoImovel.linkReal, novoRegistro);
    }
  });

  // 2. Processar Exclusões (Soft Delete)
  dataConsolidada.forEach((imovel, linkReal) => {
    imovel.cidade = normalizarCidadeParaSlug(imovel.cidade);

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
  const dataAtual = dataLocalISOAtual();

  return Array.from(dataConsolidada.values()).filter(imovel => {
    // Filtro: Visita se for novo OU se precisar do Link Card E não estiver excluído
    const isNew = String(imovel.dataInclusao || "").startsWith(dataAtual);
    const needsLinkCard = !imovel.linkCard || imovel.linkCard === "ERRO NA EXTRAÇÃO";
    return (isNew || needsLinkCard) && !imovel.dataExclusao;
  });
}