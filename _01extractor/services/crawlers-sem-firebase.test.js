import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const backendRoot = fileURLToPath(new URL("../../", import.meta.url));
const crawlerRoot = path.join(backendRoot, "_01extractor", "crawlers", "jfora");

test("todos os projetos e suas dependencias de raspagem sao independentes do Firebase", t => {
  const pending = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (["_1Jf", "_check"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) pending.push(file);
    }
  }
  collect(crawlerRoot);
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    const dependencies = [];
    traverse(parse(source, { sourceType: "unambiguous" }), {
      ImportDeclaration: node => { dependencies.push(node.node.source.value); },
      ExportNamedDeclaration: node => { if (node.node.source) dependencies.push(node.node.source.value); },
      ExportAllDeclaration: node => { dependencies.push(node.node.source.value); },
      CallExpression: node => {
        const { callee, arguments: args } = node.node;
        if ((callee.type === "Import" || callee.name === "require") && args[0]?.type === "StringLiteral") {
          dependencies.push(args[0].value);
        }
        assert.ok(!["getFirestore", "initializeApp", "batchUpdateFromMap", "backupAndReplaceCollectionFromMap"].includes(callee.name),
          `Operacao Firebase em ${path.relative(backendRoot, file)}`);
      },
    });
    for (const dependency of dependencies) {
      assert.doesNotMatch(dependency, /firebase|firestore/i, `${path.relative(backendRoot, file)} -> ${dependency}`);
      if (!dependency.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), dependency);
      const target = [resolved, `${resolved}.js`, `${resolved}.cjs`].find(candidate =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (target && /\.[cm]?js$/.test(target)) pending.push(target);
    }
  }
  assert.ok(visited.size > 1000, `Verificacao incompleta: ${visited.size} modulos`);
  t.diagnostic(`${visited.size} modulos de raspagem e dependencias verificados sem Firebase.`);
});
