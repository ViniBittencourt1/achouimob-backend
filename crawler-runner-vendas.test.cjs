const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, execFile } = require("node:child_process");
const net = require("node:net");
const { test } = require("node:test");
const { descobrirScriptsExecucao, descobrirPendencias } = require("./crawler-runner-vendas.cjs");
const { projetoHabilitadoNaRaspagem } = require("./crawler-order.cjs");

test("cobertura informa todas as lacunas de vendas e aluguel sem chamar preparacoes vazias", () => {
  const scripts = descobrirScriptsExecucao(__dirname);
  const issues = descobrirPendencias(__dirname, scripts);
  assert.deepEqual(issues.map(issue => issue.script).sort(), [
    "kantto:locacao", "souzarocha:locacao", "nitgrupo", "nitselfspin",
    "nitamin:locacao", "nitdavi:locacao", "nitniteroi:locacao", "nitdrin:locacao",
    "riomansou:locacao",
  ].sort());
  assert.equal(scripts.length + issues.filter(issue => !scripts.includes(issue.script)).length, 247);
  assert.ok(scripts.includes("rioapsa:locacao"));
  assert.ok(!scripts.includes("rioapsa"));
  assert.ok(!issues.some(issue => issue.script === "rioapsa"));
  assert.ok(!issues.some(issue => ["rioimoveisdorio:locacao", "riomelhores:locacao", "riodna:locacao", "riomaisveloz:locacao", "rionovaepoca:locacao", "rioprivilegio:locacao"].includes(issue.script)));
  assert.ok([...scripts, ...issues.map(issue => issue.script)].every(projetoHabilitadoNaRaspagem));
  assert.ok(issues.every(issue => issue.error && issue.city && issue.kind));
});

test("executavel agrupa vendas e alugueis por imobiliaria, JF antes de Niteroi", async () => {
  const scripts = descobrirScriptsExecucao(__dirname);
  const { projetosContagemVendas } = await import("./_01extractor/crawlers/jfora/_utils/vendasContagemProjetos.js");
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  const sales = scripts.filter(name => !name.endsWith(":locacao"));
  const rentals = scripts.filter(name => name.endsWith(":locacao"));
  assert.equal(scripts.length, 239);
  assert.equal(new Set(scripts).size, 239);
  assert.equal(sales.length, 124);
  assert.equal(rentals.length, 115);
  assert.equal(sales.filter(name => name.startsWith("nit")).length, 30);
  assert.equal(sales.filter(name => !/^(?:nit|uba|rio)/.test(name)).length, 54);
  assert.equal(rentals.filter(name => name.startsWith("nit")).length, 28);
  assert.equal(rentals.filter(name => !/^(?:nit|uba|rio)/.test(name)).length, 54);
  assert.equal(sales.filter(name => name.startsWith("uba")).length, 9);
  assert.equal(rentals.filter(name => name.startsWith("uba")).length, 9);
  assert.equal(sales.filter(name => name.startsWith("rio")).length, 31);
  assert.equal(rentals.filter(name => name.startsWith("rio")).length, 24);
  const firstNiteroi = scripts.findIndex(name => name.startsWith("nit"));
  assert.ok(firstNiteroi > 0);
  assert.ok(scripts.slice(0, firstNiteroi).every(name => !name.startsWith("nit")));
  const firstUba = scripts.findIndex(name => name.startsWith("uba"));
  assert.ok(scripts.slice(firstNiteroi, firstUba).every(name => name.startsWith("nit")));
  const firstRio = scripts.findIndex(name => name.startsWith("rio"));
  assert.ok(scripts.slice(firstUba, firstRio).every(name => name.startsWith("uba")));
  assert.ok(scripts.slice(firstRio).every(name => name.startsWith("rio")));
  for (const sale of sales) {
    const rental = `${sale}:locacao`;
    if (rentals.includes(rental)) assert.equal(scripts[scripts.indexOf(sale) + 1], rental, sale);
  }
  assert.deepEqual(scripts.slice(0, 4), ["1000imoveis", "1000imoveis:locacao", "alicerce", "alicerce:locacao"]);
  const destinations = sales.map(name => pkg.scripts[name].split(/\s+/).at(-1).toLowerCase());
  for (const project of projetosContagemVendas) {
    if (!projetoHabilitadoNaRaspagem(project.collection)) continue;
    const segment = project.collection.startsWith("nit") ? `niteroi/${project.folder}`
      : project.collection.startsWith("rio") ? `rio/${project.folder}` : project.folder;
    assert.ok(destinations.includes(`_01extractor/crawlers/jfora/${segment}/index.js`.toLowerCase()), project.collection);
  }
  for (const name of ["niteroi", "site", "jfora", "alugueis", "niteroi:vendas:validar", "typesense:sync"]) assert.ok(!scripts.includes(name));
  assert.match(pkg.scripts["build:exe"], /^pkg crawler-runner-vendas\.cjs /);
});

test("descoberta incorpora novos scripts, deduplica aliases e avisa sobre entradas obsoletas", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-vendas-test-"));
  try {
    const destination = "_01extractor/crawlers/jfora/niteroi/nitNovo/index.js";
    const file = path.join(directory, ...destination.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "");
    const scripts = {
      nitnovo: `node --expose-gc --max-old-space-size=8192 ${destination}`,
      "nitnovo:locacao": "node _01extractor/crawlers/jfora/_utils/locacaoImobBrasil.js nitNovo",
      alias: `node ${destination}`,
      niteroi: "node _01extractor/crawlers/jfora/niteroi/runAll.js",
      publicacao: "node publish-crawler-json.js",
    };
    const manifest = path.join(directory, "package.json");
    fs.writeFileSync(manifest, JSON.stringify({ scripts }));
    assert.deepEqual(descobrirScriptsExecucao(directory), ["nitnovo", "nitnovo:locacao"]);
    fs.unlinkSync(file);
    const previousWarn = console.warn;
    const warnings = [];
    console.warn = message => warnings.push(message);
    try { assert.throws(() => descobrirScriptsExecucao(directory), /Nenhum crawler de vendas existente/); }
    finally { console.warn = previousWarn; }
    assert.ok(warnings.some(message => message.includes("nitnovo")));
    fs.writeFileSync(manifest, JSON.stringify({ scripts: {} }));
    assert.throws(() => descobrirScriptsExecucao(directory), /Nenhum crawler/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("launcher substitui selecao parcial sem iniciar raspagens no modo validacao", () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, "crawler-runner-vendas.cjs")], {
    cwd: os.tmpdir(),
    env: { ...process.env, RASPAGEM_IMOVEIS_BACKEND: __dirname, SCRAPE_SCRIPTS: "remax", CRAWLER_LAUNCHER_VALIDATE_ONLY: "true" },
    encoding: "utf8",
  });
  assert.match(output, /Crawlers de vendas e alugueis JF, Niteroi, Uba e Rio: 239/);
  assert.match(output, /rioapsa:locacao/);
  assert.match(output, /ubajxavier, ubajxavier:locacao, ubagb, ubagb:locacao/);
  assert.doesNotMatch(output, /acervo|souzagomes|multimoveis/i);
  assert.match(output, /nitremax/);
  assert.match(output, /nitrealiza/);
  assert.match(output, /1000imoveis/);
  assert.match(output, /1000imoveis, 1000imoveis:locacao, alicerce, alicerce:locacao/);
  assert.doesNotMatch(output, /Iniciando execu/);
});

test("launcher de alugueis exclui projetos desativados sem iniciar raspagens", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-alugueis-test-"));
  try {
    for (const name of ["crawler-runner-alugueis.cjs", "crawler-order.cjs", "backend-paths.cjs", ".achouimob-backend-isolado"]) {
      fs.copyFileSync(path.join(__dirname, name), path.join(directory, name));
    }
    fs.writeFileSync(path.join(directory, "render-daily.js"), "");
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ scripts: {
      "acervo:locacao": "node acervo.js",
      "souzagomes:locacao": "node souzagomes.js",
      "multimoveis:locacao": "node multimoveis.js",
      "admyhouse:locacao": "node admyhouse.js",
    } }));
    const launchers = [[process.execPath, [path.join(directory, "crawler-runner-alugueis.cjs")]]];
    if (process.env.CRAWLER_TEST_RENTAL_EXECUTABLE) {
      const executable = path.join(directory, "alugueis.exe");
      fs.copyFileSync(path.resolve(process.env.CRAWLER_TEST_RENTAL_EXECUTABLE), executable);
      launchers.push([executable, []]);
    }
    for (const [command, args] of launchers) {
      const output = execFileSync(command, args, {
        cwd: directory,
        env: { ...process.env, RASPAGEM_IMOVEIS_BACKEND: directory, CRAWLER_LAUNCHER_VALIDATE_ONLY: "true" },
        encoding: "utf8", timeout: 30000,
      });
      assert.match(output, /Crawlers de aluguéis: 1/);
      assert.doesNotMatch(output, /Iniciando execu/);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("executavel compilado descobre projetos e chama executor diario externo", {
  skip: !process.env.CRAWLER_TEST_EXECUTABLE,
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-exe-test-"));
  const backendDir = path.join(directory, "backend");
  try {
    const destination = "_01extractor/crawlers/jfora/niteroi/nitTeste/index.js";
    const file = path.join(backendDir, ...destination.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'if (process.pkg || typeof global.gc !== "function") process.exitCode = 9; console.log("CRAWLER_NODE_REAL: " + typeof global.gc);');
    fs.writeFileSync(path.join(backendDir, "package.json"), JSON.stringify({ scripts: { nitteste: `node --expose-gc --max-old-space-size=256 ${destination}` } }));
    for (const name of ["crawler-execution.cjs", "node-runtime.cjs", "backend-paths.cjs", ".achouimob-backend-isolado"]) {
      fs.copyFileSync(path.join(__dirname, name), path.join(backendDir, name));
    }
    const executable = path.join(backendDir, "crawler.exe");
    fs.copyFileSync(path.resolve(process.env.CRAWLER_TEST_EXECUTABLE), executable);
    fs.writeFileSync(path.join(backendDir, "render-daily.js"), `
console.log("EXECUTOR_TESTE: " + process.env.SCRAPE_SCRIPTS);
const { executeScript } = require("./crawler-execution.cjs");
executeScript("nitteste", require("./package.json").scripts.nitteste, { cwd: __dirname })
  .then(result => { if (result.status !== "completed") { console.error(result.error, result.outputTail); process.exitCode = 1; } })
  .catch(error => { console.error(error); process.exitCode = 1; });`);
    const output = execFileSync(executable, [], {
      cwd: os.tmpdir(),
      env: {
        ...process.env, RASPAGEM_IMOVEIS_BACKEND: backendDir,
        CRAWLER_LAUNCHER_VALIDATE_ONLY: "false", SCRAPE_SCRIPTS: "remax",
        EMAIL_USER: "", EMAIL_PASSWORD: "",
      },
      encoding: "utf8", timeout: 30000,
    });
    assert.match(output, /Crawlers de vendas e alugueis JF, Niteroi, Uba e Rio: 1/);
    assert.match(output, /EXECUTOR_TESTE: nitteste/);
    assert.match(output, /CRAWLER_NODE_REAL: function/);
    assert.match(output, /SUCESSO/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("executavel compilado envia falhas detalhadas e anexos pelo email", {
  skip: !process.env.CRAWLER_TEST_EXECUTABLE,
}, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-email-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const backendDir = path.join(directory, "backend");
  fs.mkdirSync(backendDir);
  fs.copyFileSync(path.join(__dirname, ".achouimob-backend-isolado"), path.join(backendDir, ".achouimob-backend-isolado"));
  const executable = path.join(backendDir, "crawler.exe");
  fs.copyFileSync(path.resolve(process.env.CRAWLER_TEST_EXECUTABLE), executable);
  fs.mkdirSync(path.join(backendDir, "_01extractor", "crawlers", "jfora", "uba", "ubaGb"), { recursive: true });
  fs.writeFileSync(path.join(backendDir, "_01extractor", "crawlers", "jfora", "uba", "ubaGb", "index.js"), "");
  fs.writeFileSync(path.join(backendDir, "package.json"), JSON.stringify({
    scripts: {
      ubagb: "node _01extractor/crawlers/jfora/uba/ubaGb/index.js",
      "ubagb:locacao": "node _01extractor/crawlers/jfora/uba/ubaGb/locacao.js",
    },
  }));
  fs.writeFileSync(path.join(backendDir, "render-daily.js"), `
const fs = require("node:fs");
const report = { runDate:"2026-10-29", startedAt:new Date().toISOString(), endedAt:new Date().toISOString(),
projects:[{script:"ubagb",city:"Ubá",kind:"Venda",status:"failed",error:"FALHA_TESTE_EMAIL"},
{script:"ubagb:locacao",city:"Ubá",kind:"Aluguel",status:"completed"}] };
fs.writeFileSync(process.env.CRAWLER_REPORT_PATH, JSON.stringify(report));
fs.writeFileSync(process.env.CRAWLER_REPORT_PATH.replace(".json", ".html"), "<html>FALHA_TESTE_EMAIL</html>");
process.exitCode = 1;`);
  let message = "";
  const server = net.createServer(socket => {
    socket.setEncoding("utf8");
    socket.on("error", error => {
      assert.equal(error.code, "ECONNRESET");
      assert.match(message, /FALHA_TESTE_EMAIL/);
      assert.match(message, /ubagb:locacao/);
    });
    socket.write("220 localhost teste\r\n");
    let buffer = "";
    let inData = false;
    socket.on("data", data => {
      buffer += data;
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") { inData = false; socket.write("250 OK\r\n"); }
          else message += `${line}\n`;
        } else if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (line.startsWith("AUTH")) socket.write("235 OK\r\n");
        else if (line === "DATA") { inData = true; socket.write("354 Continue\r\n"); }
        else if (line === "QUIT") socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const result = await new Promise(resolve => execFile(executable, [], {
    cwd: os.tmpdir(), timeout: 30000, encoding: "utf8",
    env: {
      ...process.env, RASPAGEM_IMOVEIS_BACKEND: backendDir, CRAWLER_LAUNCHER_VALIDATE_ONLY: "false",
      EMAIL_HOST: "127.0.0.1", EMAIL_PORT: String(server.address().port), EMAIL_SECURE: "false",
      EMAIL_USER: "teste@example.invalid", EMAIL_PASSWORD: "teste", EMAIL_NOTIFY_TO: "teste@example.invalid",
    },
  }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  assert.equal(result.error?.code, 1, result.stderr);
  assert.match(result.stdout, /Email enviado/);
  assert.match(message, /FALHA_TESTE_EMAIL/);
  assert.match(message, /filename=crawler_.+\.json/);
  assert.match(message, /filename=crawler_.+\.html/);
});
