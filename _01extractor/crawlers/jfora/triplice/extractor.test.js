import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';

const source = fs.readFileSync(new URL('./extractor.js', import.meta.url), 'utf8');

function fixture({ total = 1, cards = 1, status = 200, nextStatus, snapshotError } = {}) {
	const fields = {};
	for (const [, names] of source.matchAll(/import \{ (.+?) \} from/g)) {
		for (const name of names.split(', ')) fields[name] = () => '';
	}
	fields.extractLinkReal = () => 'https://www.tripliceimoveis.com/imovel/1';
	const extract = vm.runInNewContext(
		source.replace(/^\uFEFF?import .+;[ \t]*\r?$/gm, '').replace('export async function', 'async function') + '\nextractLocalData;',
		{ ...fields, console: { log() {}, warn() {}, error() {} }, setTimeout: callback => callback(), URL }
	);
	let closed = false;
	let navigations = 0;
	const page = {
		setUserAgent: async () => {},
		setViewport: async () => {},
		goto: async () => {
			const code = navigations++ ? nextStatus ?? status : status;
			return { status: () => code, ok: () => code >= 200 && code < 300 };
		},
		screenshot: async () => {},
		waitForSelector: async () => { throw new Error('No LGPD dialog'); },
		url: () => projetoContagemVendas('jfTriplice').url,
		close: async () => { closed = true; },
		evaluate: async callback => {
			const code = callback.toString();
			if (code.includes('const totalEl')) return total;
			if (code.includes('const escapar')) {
				if (snapshotError) throw new Error('Snapshot unavailable');
				return Array.from({ length: cards }, (_, i) => ({ key: `/imovel/${i}`, html: '<a>Card</a>' }));
			}
			if (code.includes('const botoes')) return nextStatus ? { href: '?ordenar=recentes&pagina=2' } : null;
			return undefined;
		},
	};
	return {
		run: expected => extract({ newPage: async () => page }, [page.url()], { totalEsperado: expected }),
		closed: () => closed,
	};
}

test('Triplice usa a mesma rota e ordenacao da contagem e continua headless', () => {
	const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
	assert.match(index, /linksBusca = \[projetoContagemVendas\(COLLECTION_NAME\)\.url\]/);
	assert.match(index, /extractLocalData\(browser, linksBusca, \{ totalEsperado: totalDisponivelVendas \}\)/);
	assert.match(index, /headlessOverride: true/);
	assert.equal(new URL(projetoContagemVendas('jfTriplice').url).searchParams.get('ordenar'), 'recentes');
	assert.ok(index.indexOf('imÃ³veis salvos:') > index.indexOf('await sincronizarVendas('));
});

test('retorna coleta completa e fecha a pagina', async () => {
	const current = fixture();
	assert.equal((await current.run(1)).length, 1);
	assert.equal(current.closed(), true);
});

test('aceita zero quando a contagem tambem confirma zero', async () => {
	const current = fixture({ total: 0, cards: 0 });
	assert.equal((await current.run(0)).length, 0);
	assert.equal(current.closed(), true);
});

test('coleta parcial informa os dois totais antes do salvamento', async () => {
	const current = fixture({ total: 2, cards: 1 });
	await assert.rejects(current.run(2), /esperado 2, coletado 1; base preservada/);
	assert.equal(current.closed(), true);
});

for (const status of [403, 503]) test(`HTTP ${status} aborta e fecha a pagina`, async () => {
	const current = fixture({ status });
	await assert.rejects(current.run(1), new RegExp(`HTTP ${status}`));
	assert.equal(current.closed(), true);
});

test('erro HTTP na paginacao nao retorna uma coleta parcial', async () => {
	const current = fixture({ total: 2, nextStatus: 503 });
	await assert.rejects(current.run(2), /HTTP 503 na pagina 2/);
	assert.equal(current.closed(), true);
});

test('falha no snapshot nao e tratada como fim da listagem', async () => {
	const current = fixture({ snapshotError: true });
	await assert.rejects(current.run(1), /Snapshot unavailable/);
	assert.equal(current.closed(), true);
});

for (const failure of ['coleta', 'salvamento']) test(`falha de ${failure} nao anuncia sucesso e fecha o navegador`, async () => {
	const events = [];
	const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8')
		.replace(/^\uFEFF?import .+;[ \t]*\r?$/gm, '')
		.replace("await import('./extractor-00-rotaInterna.js')", 'enrichModule')
		.replace(/main\(\)\.catch[\s\S]*$/, '');
	const main = vm.runInNewContext(index + '\nmain;', {
		console: { log: message => events.push(message), error() {} },
		ISOLATED_BACKEND_ROOT: 'fixture',
		process: { cwd: () => 'fixture' },
		fs: { existsSync: () => true },
		path: { join: (...parts) => parts.join('\\') },
		projetoContagemVendas,
		abrirBrowser: async options => {
			assert.equal(options.headlessOverride, true);
			return { close: async () => events.push('fechar') };
		},
		contarAntesDasVendas: async () => 1,
		getCollectionAsMap: async () => new Map(),
		extractLocalData: async (_browser, links, options) => {
			assert.equal(links[0], projetoContagemVendas('jfTriplice').url);
			assert.equal(options.totalEsperado, 1);
			if (failure === 'coleta') throw new Error('coleta falhou');
			return [{ linkReal: 'https://example.com/1' }];
		},
		enrichModule: { enrichImoveisWithInternalData: async () => {} },
		parser: { consolidateData: () => new Map() },
		sheetsModule: { exportToSheets: async () => {} },
		sincronizarVendas: async () => {
			events.push('salvar');
			throw new Error('salvamento falhou');
		},
		extractCard1: async () => { throw new Error('Nao deve executar'); },
	});
	await assert.rejects(main(), new RegExp(`${failure} falhou`));
	assert.ok(events.includes('fechar'));
	assert.equal(events.includes('salvar'), failure === 'salvamento');
	assert.ok(!events.some(message => /imÃ³veis salvos:|finalizado com sucesso/.test(message)));
});
