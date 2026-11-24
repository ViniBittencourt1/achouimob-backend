import assert from "node:assert/strict";
import { test } from "node:test";
import { runProjetoRio } from "./runProject.js";
import { RIO_SPREADSHEET_ID } from "./projects.js";

function fixture({ totals = [1, 1], records = [{ linkReal: "https://example.com/imovel/1" }], error } = {}) {
  const events = [];
  const errors = Array.isArray(error) ? [...error] : [error];
  let saved;
  let registrarArgs;
  let coletarOptions;
  return {
    events, saved: () => saved, registrarArgs: () => registrarArgs, coletarOptions: () => coletarOptions,
    deps: {
      outputPath: "C:\\nao-existe-rio-tests\\rioCasalta.json",
      browserFactory: async options => {
        assert.deepEqual(options, { headlessOverride: true });
        return { close: async () => events.push("fechar") };
      },
      contar: async () => { events.push("contar"); return totals.shift(); },
      coletar: async (_browser, _project, _negociacao, options) => {
        events.push("coletar");
        coletarOptions = options;
        const nextError = errors.shift();
        if (nextError) throw nextError;
        return records;
      },
      registrar: async (...args) => { events.push("registrar"); registrarArgs = args; },
      syncVendas: async options => { events.push("vendas"); saved = options; },
      syncLocacao: async options => { events.push("locacao"); saved = options; },
    },
  };
}

test("Kenlo reinicia a coleta completa apos divergencia de total sem sincronizar a tentativa parcial", async () => {
  const mismatch = Object.assign(new Error("Coleta difere da precontagem"), { code: "KENLO_TOTAL_DIVERGENTE" });
  const fake = fixture({ totals: [1, 1, 1, 1], error: [mismatch] });
  await runProjetoRio("rioCasalta", "venda", fake.deps);
  assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", "registrar", "coletar", "contar", "fechar", "vendas"]);
  assert.equal(fake.saved().totalEsperado, 1);
});

test("Metropole suspensa nao coleta nem publica vendas ou alugueis", async () => {
  for (const negociacao of ["venda", "locacao"]) {
    const fake = fixture();
    await assert.rejects(runProjetoRio("rioMetropole", negociacao, fake.deps), /desabilitado/);
    assert.deepEqual(fake.events, []);
  }
});

for (const negociacao of ["venda", "locacao"]) {
  test(`Atlantica ${negociacao} executa coleta e sincronizacao corretas`, async () => {
    const fake = fixture();
    await runProjetoRio("rioAtlantica", negociacao, fake.deps);
    assert.deepEqual(fake.events, [
      "contar", "registrar", "coletar", "contar", "fechar",
      negociacao === "venda" ? "vendas" : "locacao",
    ]);
    assert.equal(fake.saved().imobiliaria, "rioAtlantica");
    assert.equal(fake.saved().identificarPorLink, false);
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`HomeHub ${negociacao} executa coleta e identifica anuncios por link`, async () => {
    const fake = fixture();
    await runProjetoRio("rioHomeHub", negociacao, fake.deps);
    assert.deepEqual(fake.events, [
      "contar", "coletar", "contar", "fechar",
      negociacao === "venda" ? "vendas" : "locacao", "registrar",
    ]);
    assert.equal(fake.saved().imobiliaria, "rioHomeHub");
    assert.equal(fake.saved().identificarPorLink, true);
    if (negociacao === "venda") assert.equal(fake.saved().codigoRepetidoPorLink, true);
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`Jailson ${negociacao} executa coleta por link`, async () => {
    const fake = fixture();
    await runProjetoRio("rioJailson", negociacao, fake.deps);
    assert.deepEqual(fake.events, [
      "contar", "coletar", "contar", "fechar",
      negociacao === "venda" ? "vendas" : "locacao", "registrar",
    ]);
    assert.equal(fake.saved().imobiliaria, "rioJailson");
    assert.equal(fake.saved().identificarPorLink, true);
    assert.equal(fake.registrarArgs()[3], negociacao === "venda" ? "Vendas" : "Locacao");
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`MG Imóveis ${negociacao} coleta e registra apos validacao`, async () => {
    const fake = fixture();
    await runProjetoRio("rioMg", negociacao, fake.deps);
    assert.deepEqual(fake.events, [
      "contar", "coletar", "contar", "fechar",
      negociacao === "venda" ? "vendas" : "locacao", "registrar",
    ]);
    assert.equal(fake.saved().imobiliaria, "rioMg");
    assert.equal(fake.saved().identificarPorLink, false);
    assert.equal(fake.registrarArgs()[3], negociacao === "venda" ? "Vendas" : "Locacao");
  });
}

test("MG Imóveis reinicia a coleta quando a listagem muda", async () => {
  const mismatch = Object.assign(new Error("Total mudou durante a coleta"), { code: "MG_TOTAL_ALTERADO" });
  const fake = fixture({ totals: [1, 1, 1, 1], error: [mismatch] });
  await runProjetoRio("rioMg", "venda", fake.deps);
  assert.deepEqual(fake.events, [
    "contar", "coletar", "contar", "coletar", "contar", "fechar", "vendas", "registrar",
  ]);
});

for (const negociacao of ["venda", "locacao"]) {
  test(`RJardim ${negociacao} coleta e registra apos validacao`, async () => {
    const fake = fixture();
    await runProjetoRio("rioRJardim", negociacao, fake.deps);
    assert.deepEqual(fake.events, [
      "contar", "coletar", "contar",
      negociacao === "venda" ? "vendas" : "locacao", "registrar",
    ]);
    assert.equal(fake.saved().imobiliaria, "rioRJardim");
    assert.equal(fake.saved().identificarPorLink, false);
    assert.equal(fake.registrarArgs()[3], negociacao === "venda" ? "Vendas" : "Locacao");
  });
}

test("RJardim reinicia a coleta quando o contador muda durante a paginacao", async () => {
  const mismatch = Object.assign(new Error("Total mudou na pagina 2"), { code: "RJARDIM_TOTAL_ALTERADO" });
  const fake = fixture({ totals: [1, 1, 1], error: [mismatch] });
  await runProjetoRio("rioRJardim", "venda", fake.deps);
  assert.deepEqual(fake.events, ["contar", "coletar", "contar", "coletar", "contar", "vendas", "registrar"]);
});

test("HomeHub reconta e reinicia a coleta quando o total muda durante ou depois da paginacao", async () => {
  const mismatch = Object.assign(new Error("Total alterado na pagina 41"), { code: "HOMEHUB_TOTAL_ALTERADO" });
  const fake = fixture({ totals: [3, 1, 2, 1, 1], error: [mismatch] });
  await runProjetoRio("rioHomeHub", "venda", fake.deps);
  assert.deepEqual(fake.events, [
    "contar", "coletar", "contar", "coletar", "contar",
    "contar", "coletar", "contar", "fechar", "vendas", "registrar",
  ]);
  assert.equal(fake.saved().totalEsperado, 1);
});

test("HomeHub para apos tres tentativas instaveis sem gravar nem registrar", async () => {
  const mismatch = Object.assign(new Error("Total alterado na pagina 41"), { code: "HOMEHUB_TOTAL_ALTERADO" });
  const fake = fixture({ totals: [1, 2, 3], error: [mismatch, mismatch, mismatch] });
  await assert.rejects(runProjetoRio("rioHomeHub", "venda", fake.deps), { code: "HOMEHUB_TOTAL_ALTERADO" });
  assert.deepEqual(fake.events, ["contar", "coletar", "contar", "coletar", "contar", "coletar", "fechar"]);
});

for (const negociacao of ["venda", "locacao"]) {
  test(`Forte ${negociacao} sincroniza e registra total somente apos validar`, async () => {
    const fake = fixture();
    await runProjetoRio("rioForte", negociacao, fake.deps);
    assert.deepEqual(fake.events, ["contar", "coletar", "contar", negociacao === "venda" ? "vendas" : "locacao", "registrar"]);
    assert.equal(fake.saved().imobiliaria, "rioForte");
    assert.equal(fake.saved().identificarPorLink, false);
    assert.equal(fake.registrarArgs()[3], negociacao === "venda" ? "Vendas" : "Locacao");
    for (const options of [{ error: new Error("Falha na coleta") }, { totals: [1, 2] }, { records: [] }]) {
      const failed = fixture(options);
      await assert.rejects(runProjetoRio("rioForte", negociacao, failed.deps));
      assert.equal(failed.saved(), undefined);
      assert.ok(!failed.events.includes("registrar"));
    }
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`Luciene ${negociacao} registra total validado apos sincronizar e identifica por link`, async () => {
    const fake = fixture();
    await runProjetoRio("rioLuciene", negociacao, fake.deps);
    assert.deepEqual(fake.events, ["contar", "coletar", "contar", negociacao === "venda" ? "vendas" : "locacao", "registrar"]);
    assert.equal(fake.saved().identificarPorLink, true);
    assert.equal(fake.registrarArgs()[3], negociacao === "venda" ? "Vendas" : "Locacao");
    const failed = fixture({ records: [] });
    await assert.rejects(runProjetoRio("rioLuciene", negociacao, failed.deps));
    assert.deepEqual(failed.events, ["contar", "coletar"]);
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`FR ${negociacao} sincroniza por link e registra contagem somente depois`, async () => {
    const fake = fixture();
    await runProjetoRio("rioFr", negociacao, fake.deps);
    assert.deepEqual(fake.events, ["contar", "coletar", "contar", negociacao === "venda" ? "vendas" : "locacao", "registrar"]);
    assert.equal(fake.saved().identificarPorLink, true);
    assert.equal(fake.registrarArgs()[3], negociacao === "venda" ? "Vendas" : "Locacao");
    for (const options of [{ error: new Error("Falha na coleta") }, { totals: [1, 2] }, { records: [] }]) {
      const failed = fixture(options);
      await assert.rejects(runProjetoRio("rioFr", negociacao, failed.deps));
      assert.equal(failed.saved(), undefined);
      assert.ok(!failed.events.includes("registrar"));
    }
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`${negociacao}: check e check completo nao gravam e conferem apenas quando completo`, async () => {
    for (const full of [false, true]) {
      const fake = fixture();
      await runProjetoRio("rioCasalta", negociacao, { ...fake.deps, check: true, checkCompleto: full });
      assert.deepEqual(fake.events, full ? ["contar", "coletar", "contar", "fechar"] : ["contar", "coletar", "fechar"]);
      assert.equal(fake.saved(), undefined);
      assert.equal(fake.coletarOptions().primeiraPagina, !full);
    }
  });

  test(`${negociacao}: usa exclusivamente planilha Rio e sincronizacao correta`, async () => {
    const fake = fixture();
    await runProjetoRio("rioCasalta", negociacao, fake.deps);
    assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", "fechar", negociacao === "venda" ? "vendas" : "locacao"]);
    assert.equal(fake.registrarArgs()[2], RIO_SPREADSHEET_ID);
    assert.equal(fake.saved().spreadsheetId, RIO_SPREADSHEET_ID);
    assert.equal(fake.saved().imobiliaria, "rioCasalta");
    if (negociacao === "locacao") {
      assert.equal(fake.saved().abaRetirados, "retiradosLocacao");
      assert.deepEqual(fake.saved().exportOptions, { negociacao: "aluguel" });
    }
  });

  test(`${negociacao}: falhas, total alterado e coleta incompleta nao salvam`, async () => {
    for (const options of [{ error: new Error("HTTP 503") }, { totals: [1, 2] }, { records: [] }, { totals: [-1] }]) {
      const fake = fixture(options);
      await assert.rejects(runProjetoRio("rioCasalta", negociacao, fake.deps));
      assert.equal(fake.saved(), undefined);
      assert.equal(fake.events.at(-1), "fechar");
    }
  });

  test(`${negociacao}: vazio confirmado e persistido so apos conferir total`, async () => {
    const fake = fixture({ totals: [0, 0], records: [] });
    await runProjetoRio("rioCasalta", negociacao, fake.deps);
    assert.equal(fake.saved().vazioConfirmado, true);
    assert.equal(fake.saved().totalEsperado, 0);
  });
}

test("projetos pendentes e negociacao desconhecida falham antes de abrir navegador", async () => {
  const fake = fixture();
  for (const [name, negociacao] of [["rioApsa", "venda"], ["rioInvista", "venda"], ["rioMansou", "locacao"], ["rioMaisVeloz", "locacao"], ["rioNovaEpoca", "locacao"], ["rioPrivilegio", "locacao"], ["rioCasalta", "outro"]]) {
    await assert.rejects(runProjetoRio(name, negociacao, fake.deps));
  }
  assert.deepEqual(fake.events, []);
});

test("Apsa: executa aluguel sem navegador e so sincroniza apos validacao", async () => {
  const fake = fixture();
  await runProjetoRio("rioApsa", "locacao", fake.deps);
  assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", "locacao"]);
  assert.equal(fake.saved().imobiliaria, "rioApsa");

  const check = fixture();
  await runProjetoRio("rioApsa", "locacao", { ...check.deps, checkCompleto: true });
  assert.deepEqual(check.events, ["contar", "coletar", "contar"]);
  assert.equal(check.saved(), undefined);

  for (const options of [{ error: new Error("Falha na coleta") }, { totals: [1, 2] }, { records: [] }]) {
    const failed = fixture(options);
    await assert.rejects(runProjetoRio("rioApsa", "locacao", failed.deps));
    assert.equal(failed.saved(), undefined);
  }
});

test("Nova Epoca executa somente vendas sem navegador e preserva dados em falhas", async () => {
  const fake = fixture();
  await runProjetoRio("rioNovaEpoca", "venda", fake.deps);
  assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", "vendas"]);
  assert.equal(fake.saved().imobiliaria, "rioNovaEpoca");
  const check = fixture();
  await runProjetoRio("rioNovaEpoca", "venda", { ...check.deps, checkCompleto: true });
  assert.deepEqual(check.events, ["contar", "coletar", "contar"]);
  assert.equal(check.saved(), undefined);
  for (const options of [{ error: new Error("Falha na coleta") }, { totals: [1, 2] }, { records: [] }]) {
    const failed = fixture(options);
    await assert.rejects(runProjetoRio("rioNovaEpoca", "venda", failed.deps));
    assert.equal(failed.saved(), undefined);
  }
});

for (const negociacao of ["venda", "locacao"]) {
  test(`Inforce ${negociacao} executa sem navegador e preserva a base em coleta instavel`, async () => {
    const fake = fixture();
    await runProjetoRio("rioVivax", negociacao, fake.deps);
    assert.deepEqual(fake.events, [
      "contar", "registrar", "coletar", "contar",
      negociacao === "venda" ? "vendas" : "locacao",
    ]);

    const mismatch = Object.assign(new Error("Total alterado durante a coleta"), { code: "INFORCE_TOTAL_ALTERADO" });
    const unstable = fixture({ totals: [1, 1, 1, 1], error: [mismatch] });
    await runProjetoRio("rioVivax", negociacao, unstable.deps);
    assert.deepEqual(unstable.events, [
      "contar", "registrar", "coletar", "contar",
      "registrar", "coletar", "contar",
      negociacao === "venda" ? "vendas" : "locacao",
    ]);
  });
}

for (const name of ["rioCabral", "rioNovi", "rioRamiro", "rioRenascenca"]) {
  test(`${name} valida a coleta completa sem navegador e sem gravar no check`, async () => {
    const fake = fixture();
    await runProjetoRio(name, "venda", {
      ...fake.deps,
      checkCompleto: true,
      browserFactory: async () => { throw new Error("Nao deve abrir navegador"); },
    });
    assert.deepEqual(fake.events, ["contar", "coletar", "contar"]);
    assert.equal(fake.saved(), undefined);
  });
}

test("Privilegio executa vendas sem navegador e nao sincroniza coleta incompleta", async () => {
  const fake = fixture();
  await runProjetoRio("rioPrivilegio", "venda", fake.deps);
  assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", "vendas"]);
  assert.equal(fake.saved().imobiliaria, "rioPrivilegio");
  const failed = fixture({ records: [] });
  await assert.rejects(runProjetoRio("rioPrivilegio", "venda", failed.deps));
  assert.equal(failed.saved(), undefined);
});

for (const negociacao of ["venda", "locacao"]) {
  test(`Lopes ${negociacao} executa sem navegador e preserva dados em falhas`, async () => {
    const fake = fixture();
    await runProjetoRio("rioLopes", negociacao, fake.deps);
    assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", negociacao === "venda" ? "vendas" : "locacao"]);
    assert.equal(fake.saved().imobiliaria, "rioLopes");
    for (const options of [{ error: new Error("Falha na coleta") }, { totals: [1, 2] }, { records: [] }]) {
      const failed = fixture(options);
      await assert.rejects(runProjetoRio("rioLopes", negociacao, failed.deps));
      assert.equal(failed.saved(), undefined);
    }
  });
}

for (const negociacao of ["venda", "locacao"]) {
  test(`RE/MAX ${negociacao} executa sem navegador e preserva dados em falhas`, async () => {
    const fake = fixture();
    await runProjetoRio("rioRemax", negociacao, fake.deps);
    assert.deepEqual(fake.events, ["contar", "registrar", "coletar", "contar", negociacao === "venda" ? "vendas" : "locacao"]);
    assert.equal(fake.saved().imobiliaria, "rioRemax");
    for (const options of [{ error: new Error("Falha na coleta") }, { totals: [1, 2] }, { records: [] }]) {
      const failed = fixture(options);
      await assert.rejects(runProjetoRio("rioRemax", negociacao, failed.deps));
      assert.equal(failed.saved(), undefined);
    }
  });
}
