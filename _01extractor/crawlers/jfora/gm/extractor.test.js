import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { extractLocalData, parseCardGm, readSnapshotGm } from './extractor.js';
import { lerContagemVendasDOM, validarUrlContagemVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

const project = projetoContagemVendas('jfGm');
const card = (id = 1) => `<article class="card c49-property-card">
  <h2 class="c49-property-card_title">Apartamento à venda em Santa Terezinha</h2>
  <span class="c49-property-card_type">Apartamento</span>
  <span class="c49-property-card_code">Cód. AP00${id}</span>
  <div class="c49-property-card_address">Santa Terezinha, Juiz de Fora - MG</div>
  <div class="c49-property-card_photo"><a href="/${id}/imoveis/venda-apartamento-santa-terezinha-juiz-de-fora-mg">
    <img src="/foto.jpg"></a></div>
  <div class="c49-property-card_price"><div><span>R$</span> 230.000,00 <span>Venda</span></div></div>
  <div class="c49-property-number-wrap"><span class="c49icon-area-1"></span><div class="c49-property-number">59.00 m²</div></div>
  <div class="c49-property-number-wrap"><span class="c49icon-bedroom-1"></span><div class="c49-property-number">2 quartos</div></div>
  <div class="c49-property-number-wrap"><span class="c49icon-bathroom-1"></span><div class="c49-property-number">1 banh.</div></div>
  <div class="c49-property-number-wrap"><span class="c49icon-garage-1"></span><div class="c49-property-number">1 vaga</div></div>
</article>`;

function withDocument(html, callback) {
	const dom = new JSDOM(html, { url: project.url });
	const previous = globalThis.document;
	globalThis.document = dom.window.document;
	try { return callback(); }
	finally {
		if (previous === undefined) delete globalThis.document;
		else globalThis.document = previous;
		dom.window.close();
	}
}

function listing(cards, total, pages = []) {
	return `<span class="c49-filter-number">${total}</span>
		<h1 class="c49-filter-title">Imóveis à venda</h1>
		<section id="c49mod-properties-list">${cards.join('')}</section>
		<div class="pagination">${pages.map(href => `<a href="${href}">próxima</a>`).join('')}</div>`;
}

function fakeBrowser(snapshots, statuses = []) {
	let current;
	let closed = false;
	let calls = 0;
	const visits = [];
	const page = {
		goto: async url => {
			current = url;
			visits.push(url);
			const status = statuses[visits.length - 1] ?? 200;
			return { status: () => status };
		},
		url: () => current,
		waitForFunction: async (callback, _options, config) => {
			const html = snapshots[calls] ?? '';
			assert.ok(withDocument(html, () => callback(config)), 'listagem C49 de vendas não foi confirmada');
		},
		evaluate: async callback => {
			const result = withDocument(snapshots[calls], callback);
			calls++;
			return result;
		},
		close: async () => { closed = true; },
	};
	return { browser: { newPage: async () => page }, visits, closed: () => closed };
}

test('jfGm usa a rota C49 válida de vendas e rejeita a rota antiga Kenlo', () => {
	assert.equal(project.kind, 'c49');
	assert.equal(project.url, 'https://www.gmimoveisjf.com.br/imobiliaria/venda/imoveis/1/1?tipo=1&ordem=recentes');
	validarUrlContagemVendas(project, project.url);
	validarUrlContagemVendas(project, `${project.url.replace('?tipo=1&ordem=recentes', '')}/2?tipo=1&ordem=recentes`);
	assert.throws(() => validarUrlContagemVendas(project, 'https://www.gmimoveisjf.com.br/imoveis/a-venda'), /exclusiva/);
	assert.equal(withDocument(listing([], 29), () => lerContagemVendasDOM(project).label), '29');
	assert.equal(withDocument('<h1>404 - Página não encontrada</h1>', () => lerContagemVendasDOM(project)), false);
});

test('parser C49 mapeia os campos do card para o catálogo de JF', () => {
	const record = parseCardGm(card(), { now: new Date('2026-01-02T03:04:05.000Z') });
	assert.equal(record.linkReal, 'https://www.gmimoveisjf.com.br/1/imoveis/venda-apartamento-santa-terezinha-juiz-de-fora-mg');
	assert.equal(record.codigoBase, 'AP001');
	assert.equal(record.preco, 230000);
	assert.equal(record.tipoImovel, 'apartamento');
	assert.equal(record.cidade, 'juiz-de-fora-mg');
	assert.equal(record.bairro, 'santa-terezinha');
	assert.equal(record.areaValor, 59);
	assert.equal(record.dormitorioValor, 2);
	assert.equal(record.banheiroValor, 1);
	assert.equal(record.garagemValor, 1);
	assert.equal(record.linkFoto, 'https://www.gmimoveisjf.com.br/foto.jpg');
	assert.equal(record.atualizadoEm, '2026-01-02T03:04:05.000Z');
	assert.throws(() => parseCardGm(card().replace('venda-apartamento-', 'locacao-apartamento-')), /fora da listagem de vendas/);
});

test('parser obtém cidade pelo título quando o endereço do card contém apenas o bairro', () => {
	const html = card()
		.replace('Apartamento à venda em Santa Terezinha', 'Fazenda à venda, 50000 m² - Centro - Torreões (Juiz de Fora)/MG')
		.replace('class="c49-property-card_type">Apartamento', 'class="c49-property-card_type">Fazenda')
		.replace('Santa Terezinha, Juiz de Fora - MG', 'Centro');
	const record = parseCardGm(html);
	assert.equal(record.cidade, 'juiz-de-fora-mg');
	assert.equal(record.bairro, 'centro');
});

test('leitor de listagem pega cards e link da paginação C49', () => {
	const nextPage = "javascript:pagination('29', '2', '1', '');";
	const snapshot = withDocument(listing([card()], 2, [nextPage]), readSnapshotGm);
	assert.equal(snapshot.cards.length, 1);
	assert.equal(snapshot.label, '2');
	assert.equal(snapshot.heading, 'Imóveis à venda');
	assert.deepEqual(snapshot.pages, [nextPage]);
});

test('extração C49 percorre páginas e exige completar a pré-contagem', async () => {
	const nextPage = "javascript:pagination('2', '2', '1', '');";
	const state = fakeBrowser([
		listing([card(1)], 2, [nextPage]),
		listing([card(2)], 2),
	]);
	const records = await extractLocalData(state.browser, [project.url], { totalEsperado: 2 });
	assert.equal(records.length, 2);
	assert.deepEqual(state.visits, [
		project.url,
		`${project.url.replace('?tipo=1&ordem=recentes', '')}/2?tipo=1&ordem=recentes`,
	]);
	assert.equal(state.closed(), true);

	const incomplete = fakeBrowser([listing([card(1)], 2)]);
	await assert.rejects(extractLocalData(incomplete.browser, [project.url], { totalEsperado: 2 }), /incompleta/);
	assert.equal(incomplete.closed(), true);
});

test('erro HTTP na extração C49 é explícito e fecha a página sem persistir coleta', async () => {
	const state = fakeBrowser([], [404]);
	await assert.rejects(extractLocalData(state.browser, [project.url], { totalEsperado: 1 }), /HTTP 404/);
	assert.equal(state.closed(), true);
});
