import fs from "node:fs";
import path from "node:path";

const MIN_REFRESH_INTERVAL = 15 * 60 * 1000;

export function createFirestorePanelCache(file) {
  const pending = new Map();
  const failures = new Map();
  function read() {
    if (!fs.existsSync(file)) return {};
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || data.version !== 1 || !data.entries || typeof data.entries !== "object") {
      throw new Error("Cache do painel Firestore invalido; restaure ou remova o arquivo para recriar.");
    }
    return data.entries;
  }
  function get(key) {
    return read()[key] ?? null;
  }
  function refresh(key, load) {
    if (pending.has(key)) return pending.get(key);
    const previous = get(key);
    if (previous && Date.now() - Date.parse(previous.updatedAt) < MIN_REFRESH_INTERVAL) return Promise.resolve(previous);
    const failure = failures.get(key);
    if (failure && Date.now() - failure.at < MIN_REFRESH_INTERVAL) return Promise.reject(failure.error);
    const operation = Promise.resolve().then(load).then(value => {
      const entries = read();
      const entry = { updatedAt: new Date().toISOString(), value };
      entries[key] = entry;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, entries })}\n`, "utf8");
      fs.renameSync(temporary, file);
      failures.delete(key);
      return entry;
    }).catch(error => {
      failures.set(key, { at: Date.now(), error });
      throw error;
    }).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  return { get, refresh };
}
