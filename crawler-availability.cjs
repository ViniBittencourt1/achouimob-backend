const fs = require("node:fs");
const path = require("node:path");
const { ORDEM_PROJETOS, indiceProjeto } = require("./crawler-order.cjs");
const { publicationProfile } = require("./publication-profiles.cjs");
const { localPath } = require("./backend-paths.cjs");

const statePath = localPath(__dirname, "logs", "crawler-site-availability.json");

function routeForScript(script) {
  const collection = ORDEM_PROJETOS[indiceProjeto(script)];
  if (!collection) return null;
  return { collection, tipo: /:locacao$/i.test(script) ? "alugueis" : "vendas" };
}

function loadAvailability(file = statePath) {
  let state;
  try { state = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Estado de disponibilidade invalido: ${error.message}`, { cause: error });
  }
  if (!state || typeof state !== "object" || Array.isArray(state)
    || Object.entries(state).some(([key, entry]) => !entry || !/^(?:jf|nit|uba|rio)[A-Za-z0-9]+$/.test(entry.collection)
      || !["vendas", "alugueis"].includes(entry.tipo) || key !== `${entry.collection}:${entry.tipo}` || typeof entry.unavailable !== "boolean")) {
    throw new Error("Estado de disponibilidade invalido; publicacao bloqueada.");
  }
  return state;
}

function isUnavailable(collection, tipo, state = loadAvailability()) {
  return state[`${collection}:${tipo}`]?.unavailable === true;
}

function siteIsUnavailable(result) {
  const text = `${result.error || ""}\n${result.outputTail || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const explicit = /IMOBBRASIL_UNAVAILABLE|site (?:esta )?(?:temporariamente )?(?:desativado|indisponivel|fora do ar)/i.test(text);
  if (result.status === "completed" && !explicit && !/preservad|projetos com falha/i.test(text)) return false;
  return explicit || /HTTP\s*5\d\d\b|net::ERR_(?:NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_REFUSED|CONNECTION_TIMED_OUT)|\b(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED)\b/i.test(text);
}

function filterAvailableDocuments(documents, tipo, state = loadAvailability()) {
  return documents.filter(doc => !isUnavailable((doc.data || doc).imobiliariaId, tipo, state));
}

async function removeUnavailableFromTypesense(collection, tipo, { client, env } = {}) {
  if (!/^(?:jf|nit|uba|rio)[A-Za-z0-9]+$/.test(collection)) throw new Error("Imobiliaria invalida para suspensao.");
  const profile = publicationProfile(tipo);
  if (!client) {
    const root = __dirname;
    const config = require("./publication-config.cjs");
    env = env || config.publicationEnvironment(root);
    if (!config.typesenseConfigurationStatus(env).configured) throw new Error("Typesense nao configurado; retirada pendente.");
    const Typesense = require("typesense");
    client = new Typesense.Client({
      nodes: [{ host: env.TYPESENSE_HOST || "wc9sthl3xe6ykq8ip-1.a2.typesense.net", port: Number(env.TYPESENSE_PORT || 443), protocol: env.TYPESENSE_PROTOCOL || "https" }],
      apiKey: env.TYPESENSE_API_KEY, connectionTimeoutSeconds: 10,
    });
  }
  const index = client.collections(profile.typesense);
  try {
    const result = await index.documents().delete({ filter_by: `imobiliariaId:=${collection}` });
    const confirmed = await index.documents().search({ q: "*", filter_by: `imobiliariaId:=${collection}`, per_page: 1 });
    if (confirmed.found !== 0) throw new Error("Typesense ainda contem anuncios do site indisponivel.");
    return result;
  } catch (error) {
    if (error.httpStatus === 404) return { num_deleted: 0 };
    throw error;
  }
}

async function updateAvailability(script, result, {
  file = statePath, remove = removeUnavailableFromTypesense,
} = {}) {
  const route = routeForScript(script);
  if (!route || ["pending", "running", "resumed", "unavailable", "interrupted"].includes(result.status)) return result;
  const state = loadAvailability(file);
  const key = `${route.collection}:${route.tipo}`;
  const detected = siteIsUnavailable(result);
  // Um processo que preservou a base ou nao extraiu dados nao confirma a recuperacao do site.
  const recovered = result.status === "completed" && !/preservad|nenhum.{0,30}extraid|projetos com falha/i.test(result.outputTail || "");
  const unavailable = detected || state[key]?.unavailable === true && !recovered;
  if (!detected && !state[key]?.unavailable) return result;
  state[key] = { ...route, unavailable, checkedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(`${file}.tmp`, file);
  if (unavailable) {
    try { await remove(route.collection, route.tipo); }
    catch (error) {
      return { ...result, status: "failed", siteUnavailable: true, publicationError: `Falha ao retirar anuncios do Typesense: ${error.message}` };
    }
    return { ...result, status: "failed", siteUnavailable: true, error: result.error || "Site indisponivel; anuncios suspensos ate a recuperacao." };
  }
  return { ...result, siteUnavailable: false };
}

module.exports = {
  routeForScript, loadAvailability, isUnavailable, siteIsUnavailable,
  filterAvailableDocuments, removeUnavailableFromTypesense, updateAvailability,
};
