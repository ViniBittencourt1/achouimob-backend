const fs = require("node:fs");
const path = require("node:path");

function resolveNodeExecutable({
  env = process.env, packaged = typeof process.pkg !== "undefined",
  execPath = process.execPath, platform = process.platform,
} = {}) {
  if (!packaged && !env.CRAWLER_NODE_EXECUTABLE) return execPath;
  const configured = env.CRAWLER_NODE_EXECUTABLE;
  const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] || "";
  const candidates = configured ? [configured] : pathValue.split(platform === "win32" ? ";" : ":")
    .filter(Boolean).map(directory => path.join(directory.replace(/^"|"$/g, ""), platform === "win32" ? "node.exe" : "node"));
  for (const candidate of candidates) {
    const absolute = path.resolve(candidate);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const real = fs.realpathSync(absolute);
    const current = fs.realpathSync(execPath);
    if (packaged && (platform === "win32" ? real.toLowerCase() === current.toLowerCase() : real === current)) continue;
    return absolute;
  }
  throw new Error("Node.js instalado nao encontrado. Instale o Node.js e configure o PATH ou CRAWLER_NODE_EXECUTABLE com o caminho completo do node.exe; o launcher empacotado nao pode executar crawlers como Node.");
}

module.exports = { resolveNodeExecutable };
