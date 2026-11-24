const { spawn } = require("node:child_process");
const { resolveNodeExecutable } = require("./node-runtime.cjs");

const OUTPUT_TAIL_LIMIT = 16000;

function getIdleTimeout(env = process.env) {
  const minutes = Number(env.CRAWLER_IDLE_TIMEOUT_MINUTES ?? 20);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("CRAWLER_IDLE_TIMEOUT_MINUTES deve ser um numero positivo.");
  }
  return minutes * 60 * 1000;
}

async function terminateTree(child) {
  if (process.platform !== "win32") {
    process.kill(-child.pid, "SIGKILL");
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    let output = "";
    killer.stdout.on("data", data => { output += data; });
    killer.stderr.on("data", data => { output += data; });
    killer.once("error", reject);
    killer.once("close", code => {
      if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
      else reject(new Error(`Nao foi possivel encerrar a arvore do PID ${child.pid}: ${output}`));
    });
  });
}

function executeScript(scriptName, command, {
  cwd, env = process.env, idleTimeoutMs = getIdleTimeout(env),
  stdout = chunk => process.stdout.write(chunk), stderr = chunk => process.stderr.write(chunk),
} = {}) {
  // Os crawlers individuais usam comandos Node simples; nao interpor npm/cmd
  // permite supervisionar e encerrar o processo e seus navegadores pelo PID.
  if (typeof command !== "string" || !/^node(?:\s+[\w./\\:=@-]+)+$/.test(command)) {
    return Promise.reject(new Error(`Comando nao suportado para ${scriptName}: ${command}`));
  }
  const args = command.trim().split(/\s+/).slice(1);
  return new Promise((resolve, reject) => {
    const child = spawn(resolveNodeExecutable({ env }), args, {
      cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      detached: process.platform !== "win32",
    });
    let outputTail = "";
    let timer;
    let timedOut = false;
    let termination;
    let terminationError;
    const resetTimer = () => {
      clearTimeout(timer);
      if (!timedOut) timer = setTimeout(() => {
        timedOut = true;
        termination = terminateTree(child).catch(error => {
          terminationError = error;
          stderr(`[RENDER] ${error.message}\n`);
          child.kill("SIGKILL");
        });
      }, idleTimeoutMs);
    };
    const onData = (data, write) => {
      outputTail = (outputTail + data.toString()).slice(-OUTPUT_TAIL_LIMIT);
      resetTimer();
      write(data);
    };
    child.stdout.on("data", data => onData(data, stdout));
    child.stderr.on("data", data => onData(data, stderr));
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", async (code, signal) => {
      clearTimeout(timer);
      if (termination) await termination;
      const error = terminationError
        ? terminationError.message
        : timedOut
          ? `Sem saida no log por ${idleTimeoutMs / 60000} minutos; processo e navegadores encerrados.`
          : code !== 0 ? `Processo terminou com codigo ${code}${signal ? `, sinal ${signal}` : ""}.` : null;
      resolve({ status: timedOut ? "timeout" : error ? "failed" : "completed", code, signal, error, outputTail });
    });
    resetTimer();
  });
}

module.exports = { executeScript, getIdleTimeout };
