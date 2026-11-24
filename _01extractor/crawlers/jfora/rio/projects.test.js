import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { getProjetoRio, projetosRio, projetosRioHabilitados, projetosRioKenlo, RIO_SPREADSHEET_ID } from "./projects.js";

test("catalogo tem 86 projetos unicos e inclui as rotas informadas posteriormente", async () => {
  assert.equal(projetosRio.length, 86);
  assert.equal(new Set(projetosRio.map(project => project.collection.toLowerCase())).size, 86);
  assert.equal(new Set(projetosRio.map(project => project.folder.toLowerCase())).size, 86);
  assert.equal(projetosRio.filter(project => project.urlVendas !== null).length, 85);
  assert.equal(projetosRio.filter(project => project.urlLocacao !== null).length, 73);
  assert.ok(Object.isFrozen(projetosRio));
  for (const project of projetosRio) {
    assert.ok(Object.isFrozen(project));
    assert.equal(project.folder, project.collection);
    assert.ok(project.displayName);
    assert.equal(typeof project.enabled, "boolean");
    assert.equal(getProjetoRio(project.collection.toUpperCase()), project);
    const config = await import(`./${project.folder}/config.js`);
    assert.equal(config.project, project);
    for (const url of [project.urlVendas, project.urlLocacao]) {
      assert.ok(url === null || /^https?:\/\//.test(url));
    }
  }
  assert.throws(() => getProjetoRio("desconhecido"), /nao encontrado/);
  assert.throws(() => getProjetoRio(null), /nao encontrado/);
});

test("somente os projetos validados estao habilitados", () => {
  const expected = ["rioApsa", "rioAtento", "rioAtlantica", "rioAtma", "rioAvegui", "rioChaves", "rioDna", "rioEdgard", "rioForte", "rioFr", "rioHomeHub", "rioImobras", "rioImoveisDoRio", "rioInvexo", "rioJailson", "rioMg", "rioRJardim", "rioJulio", "rioLarDeCarioca", "rioLopes", "rioLuciene", "rioMaisVeloz", "rioMelhores", "rioMr", "rioMti", "rioNovaEpoca", "rioOkre", "rioOlympica", "rioPrivilegio", "rioRemax", "rioCasalta", "rioFrassetti", "rioGriffe", "rioJc", "rioMansou", "rioBaez", "rioLopa", "rioRjc", "rioRDiniz", "rioReisPrincipe", "rioRbs", "rioSampaio", "rioSergioCastro", "rioSimoes", "rioVivax", "rioWalker", "rioZelo", "rioCabral", "rioNovi", "rioRamiro", "rioRenascenca"].sort();
  assert.ok(Object.isFrozen(projetosRioHabilitados));
  assert.deepEqual(projetosRioHabilitados.map(project => project.collection).sort(), expected);
  assert.deepEqual(projetosRioHabilitados, projetosRio.filter(project => project.enabled));
  for (const project of projetosRio) {
    assert.equal(project.enabled, expected.includes(project.collection), project.collection);
  }
  for (const name of ["rioInvista", "rioCj", "rioMetropole"]) {
    assert.equal(getProjetoRio(name).enabled, false);
  }
});

test("nomes e URLs preservam a planilha, com a rota da Apsa informada posteriormente", () => {
  // SHA-256 da planilha original, antes da rota informada para Apsa.
  const links = projetosRio.filter(project => !["rioPrivilegio", "rioRemax", "rioRJardim", "rioRjc", "rioRDiniz", "rioReisPrincipe", "rioRbs", "rioSampaio", "rioSergioCastro", "rioSimoes", "rioVivax", "rioWalker", "rioZelo", "rioRamiro", "rioRenascenca"].includes(project.collection))
    .sort((a, b) => a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : 0)
    .map(({ collection, urlVendas, urlLocacao }) => [collection, urlVendas, collection === "rioApsa" ? null : urlLocacao]);
  const digest = createHash("sha256").update(JSON.stringify(links)).digest("hex");
  assert.equal(digest, "c40cae359a0354f50098ae0c6b1414a7e9c2d6898ff6f4d51a6c9d749cbee2df");
  assert.equal(getProjetoRio("rioCastelo").urlLocacao, "https://www.castelobrancoimoveis.com/loca%C3%A7%C3%A3o");
  assert.equal(getProjetoRio("rioOlympica").urlVendas, "https://www.olympica.com.br/imoveis/venda#/?tipoNegocio=VA,VL&n=1&ordem=valor-DESC&mb=s&slug=0&page=1");
  assert.equal(getProjetoRio("rioBa").urlVendas, "https://beaimoveis.com.br/busca?finalidade=Venda");
  assert.equal(getProjetoRio("rioLucrum").urlVendas, "https://lucrum.com.br/venda/*/?ordenar=valor_asc");
  assert.equal(getProjetoRio("rioMNovello").urlVendas, "https://www.mnovello.com.br/buscar?order=most_relevant&direction=desc&availability=buy&page=1");
  assert.equal(getProjetoRio("rioApsa").urlVendas, null);
  assert.equal(getProjetoRio("rioApsa").urlLocacao, "https://apsa.com.br/aluguel/resultado/");
  assert.equal(getProjetoRio("rioApsa").cidadeLocacao, "Rio de Janeiro - RJ");
  assert.equal(getProjetoRio("rioApsa").enabled, true);
  assert.equal(getProjetoRio("rioPrivilegio").urlVendas, "https://privilegioimoveis.com.br/imoveis?page=1");
  assert.equal(getProjetoRio("rioRJardim").urlVendas, "https://rjardim.com.br/imoveis/?compra=comprar&localizacao=&preco=0%2C0&preco-min=0&preco-max=");
  assert.equal(getProjetoRio("rioRJardim").urlLocacao, "https://rjardim.com.br/imoveis/?compra=alugar&localizacao=&preco=0%2C0&preco-min=0&preco-max=");
  assert.equal(getProjetoRio("rioVivax").inforce.endpoint, "https://www.vivaxprime.com.br/api/anuncios/search");
  assert.equal(getProjetoRio("rioSergioCastro").inforce.schema, "sergioCastro");
  assert.equal(getProjetoRio("rioSampaio").urlLocacao, "https://www.sampaioimoveis.com.br/aluguel/imoveis?busca=JTdCJTIyZmluYWxpZGFkZSUyMiUzQSUyMmFsdWd1ZWwlMjIlMkMlMjJwYWdlJTIyJTNBMSU3RA%3D%3D");
  assert.equal(getProjetoRio("rioZelo").urlVendas, "https://www.zeloimobiliariarj.com.br/venda/imoveis?finalidade=venda");
  assert.equal(getProjetoRio("rioCabral").universal.endpoint, "https://www.cabralemesack.com.br/imoveis/ajax/");
  assert.equal(getProjetoRio("rioNovi").universal.ordenacao, "valordesc");
  assert.equal(getProjetoRio("rioRamiro").universal.ordenacao, "valorasc");
  assert.equal(getProjetoRio("rioRenascenca").universal.endpoint, "https://admrenascenca.com.br/retornar-imoveis-disponiveis");
});

test("tipos e filtro Kenlo incluem somente os projetos identificados", () => {
  const kenlo = ["rioCasalta", "rioFrassetti", "rioGriffe", "rioMetropole", "rioInvista", "rioJc", "rioMansou"].sort();
  const midas = ["rioAtento", "rioAtma", "rioAvegui", "rioChaves", "rioDna", "rioEdgard", "rioImobras", "rioImoveisDoRio", "rioJulio", "rioLarDeCarioca", "rioMaisVeloz", "rioMelhores", "rioMr", "rioMti", "rioOkre", "rioOlympica", "rioRjc", "rioRDiniz", "rioReisPrincipe", "rioRbs", "rioSimoes", "rioWalker"];
  const overrides = { rioApsa: "apsa", rioAtlantica: "atlantica", rioCabral: "universal", rioNovi: "universal", rioRamiro: "universal", rioRenascenca: "renascenca", rioCj: "cj", rioBaez: "praedium", rioForte: "forte", rioFr: "netimoveis", rioHomeHub: "homeHub", rioInvexo: "invexo", rioJailson: "jailson", rioMg: "mg", rioRJardim: "rjardim", rioLopa: "praedium", rioLopes: "lopes", rioLuciene: "luciene", rioNovaEpoca: "novaEpoca", rioPrivilegio: "privilegio", rioRemax: "remax", rioSampaio: "inforce", rioSergioCastro: "inforce", rioVivax: "inforce", rioZelo: "inforce", ...Object.fromEntries(midas.map(name => [name, "midas"])) };
  assert.ok(Object.isFrozen(projetosRioKenlo));
  assert.deepEqual(projetosRioKenlo.map(project => project.collection).sort(), kenlo);
  for (const project of projetosRio) {
    assert.equal(project.kind, kenlo.includes(project.collection) ? "kenlo" : (overrides[project.collection] ?? null));
  }
  assert.deepEqual(getProjetoRio("rioAtento").negociacoes, ["venda", "locacao"]);
  assert.deepEqual(getProjetoRio("rioAtlantica").negociacoes, ["venda", "locacao"]);
  assert.equal(getProjetoRio("rioAtlantica").enabled, true);
  assert.ok(getProjetoRio("rioHomeHub").urlVendas);
  assert.ok(getProjetoRio("rioHomeHub").urlLocacao);
  assert.equal(getProjetoRio("rioHomeHub").enabled, true);
  assert.deepEqual(getProjetoRio("rioJailson").negociacoes, ["venda", "locacao"]);
  assert.equal(getProjetoRio("rioJailson").enabled, true);
  assert.deepEqual(getProjetoRio("rioMg").negociacoes, ["venda", "locacao"]);
  assert.equal(getProjetoRio("rioMg").enabled, true);
  assert.deepEqual(getProjetoRio("rioRJardim").negociacoes, ["venda", "locacao"]);
  assert.equal(getProjetoRio("rioRJardim").enabled, true);
  for (const name of ["rioSimoes", "rioRDiniz", "rioRbs", "rioReisPrincipe", "rioWalker"]) {
    assert.deepEqual(getProjetoRio(name).negociacoes, ["venda", "locacao"]);
    assert.equal(getProjetoRio(name).enabled, true);
  }
  for (const name of ["rioSampaio", "rioSergioCastro", "rioVivax", "rioZelo"]) {
    assert.deepEqual(getProjetoRio(name).negociacoes, ["venda", "locacao"]);
    assert.equal(getProjetoRio(name).enabled, true);
    assert.ok(getProjetoRio(name).inforce);
  }
  for (const name of ["rioCabral", "rioNovi", "rioRamiro", "rioRenascenca"]) {
    assert.deepEqual(getProjetoRio(name).negociacoes, ["venda", "locacao"]);
    assert.equal(getProjetoRio(name).enabled, true);
  }
  assert.equal(getProjetoRio("rioSimoes").midas.agencyId, "601834");
  assert.equal(getProjetoRio("rioSimoes").midas.locacaoViaControl, true);
  assert.equal(getProjetoRio("rioRDiniz").midas.agencyId, "501170");
  assert.equal(getProjetoRio("rioRDiniz").midas.locacaoViaControl, undefined);
  assert.equal(getProjetoRio("rioRDiniz").midas.confirmarVendaZeroNoDetalhe, true);
  assert.equal(getProjetoRio("rioRDiniz").midas.confirmarAluguelZeroNoDetalhe, true);
  assert.equal(getProjetoRio("rioRbs").midas.agencyId, "2138");
  assert.equal(getProjetoRio("rioRbs").midas.locacaoViaControl, true);
  assert.equal(getProjetoRio("rioRbs").midas.confirmarVendaZeroNoDetalhe, true);
  assert.equal(getProjetoRio("rioReisPrincipe").midas.agencyId, "60279");
  assert.equal(getProjetoRio("rioReisPrincipe").midas.locacaoViaControl, true);
  assert.equal(getProjetoRio("rioWalker").midas.agencyId, "2286");
  assert.equal(getProjetoRio("rioWalker").midas.locacaoViaControl, true);
  assert.deepEqual(getProjetoRio("rioAtma").negociacoes, ["venda", "locacao"]);
  assert.deepEqual(getProjetoRio("rioApsa").negociacoes, ["locacao"]);
  assert.deepEqual(getProjetoRio("rioLopes").negociacoes, ["venda", "locacao"]);
  assert.deepEqual(getProjetoRio("rioRemax").negociacoes, ["venda", "locacao"]);
  const julio = getProjetoRio("rioJulio");
  assert.deepEqual(julio.negociacoes, ["venda", "locacao"]);
  assert.equal(julio.midas.agencyId, "60321");
  assert.equal(julio.midas.locacaoViaControl, true);
  assert.equal(julio.midas.paginacaoNaMesmaAba, true);
  assert.equal(julio.midas.tentativasTimeout, 3);
  assert.equal(julio.midas.confirmarVendaZeroNoDetalhe, true);
  assert.equal(julio.midas.confirmarAluguelZeroNoDetalhe, true);
  assert.deepEqual(julio.midas.limitesFaixasVenda, [1000000, 2000000, 5000000, 10000000]);
  const maisVeloz = getProjetoRio("rioMaisVeloz");
  assert.deepEqual(maisVeloz.negociacoes, ["venda"]);
  assert.equal(maisVeloz.urlLocacao, null);
  assert.equal(maisVeloz.midas.agencyId, "1458");
  assert.deepEqual(maisVeloz.midas.limitesFaixasVenda, [1000000, 2000000, 5000000, 10000000]);
  assert.equal(maisVeloz.midas.confirmarVendaZeroNoDetalhe, true);
  assert.equal(maisVeloz.midas.bairroNaLocalizacao, true);
  assert.deepEqual(getProjetoRio("rioNovaEpoca").negociacoes, ["venda"]);
  assert.equal(getProjetoRio("rioNovaEpoca").urlLocacao, null);
  assert.deepEqual(getProjetoRio("rioPrivilegio").negociacoes, ["venda"]);
  assert.equal(getProjetoRio("rioPrivilegio").urlLocacao, null);
});

test("identificador de planilha tem padrao e aceita variavel de ambiente", () => {
  assert.equal(RIO_SPREADSHEET_ID, process.env.RIO_SHEETS_SPREADSHEET_ID || "1UJtyre91fjXCw7DUevpbxK6s_bkYshgfnad-qBt4u7Y");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { RIO_SPREADSHEET_ID } from ${JSON.stringify(new URL("./projects.js", import.meta.url).href)}; console.log(RIO_SPREADSHEET_ID);`],
  { env: { ...process.env, RIO_SHEETS_SPREADSHEET_ID: "teste-rio" }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "teste-rio");
});
