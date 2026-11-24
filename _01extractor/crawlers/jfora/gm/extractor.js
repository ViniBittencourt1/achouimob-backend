import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';
import { lerContagemVendasDOM, parseTotalVendas, validarUrlContagemVendas } from '../_utils/vendasContagem.js';
import { projetoContagemVendas } from '../_utils/vendasContagemProjetos.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';

const CONFIG = projetoContagemVendas('jfGm');
const normalizar = value => String(value ?? '')
	.normalize('NFD')
	.replace(/[\u0300-\u036f]/g, '')
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, ' ')
	.trim();
const backendRoot = new URL('../../../../', import.meta.url);
const cidades = JSON.parse(fs.readFileSync(new URL('_03database/filtros/_brCidades.json', backendRoot), 'utf8'));
const catalogoTipos = JSON.parse(fs.readFileSync(new URL('_03database/filtros/_brTipoImovel.json', backendRoot), 'utf8'));
const tipos = Object.values(catalogoTipos.tiposPorSlug || {}).flat()
	.filter(tipo => tipo?.nome && tipo?.slug)
	.sort((a, b) => b.nome.length - a.nome.length);

function extrairCidade(localizacao, titulo, linkReal) {
	const referencia = `${localizacao} ${titulo}`;
	const texto = normalizar(referencia);
	const uf = referencia.match(/(?:\/|-)\s*([A-Z]{2})\s*$/i)?.[1]?.toUpperCase();
	const candidatos = cidades
		.filter(cidade => !uf || cidade.estado === uf)
		.filter(cidade => texto.endsWith(`${normalizar(cidade.nome)} ${normalizar(uf || cidade.estado)}`))
		.sort((a, b) => b.nome.length - a.nome.length);
	const porEndereco = candidatos[0];
	if (porEndereco) return porEndereco;

	const caminho = new URL(linkReal).pathname.toLowerCase();
	return cidades
		.filter(cidade => !uf || cidade.estado === uf)
		.sort((a, b) => b.slug.length - a.slug.length)
		.find(cidade => caminho.endsWith(cidade.slug)) || null;
}

function numero(texto) {
	const match = String(texto).trim().match(/^\d+(?:\.\d{3})*(?:,\d+)?(?=\s|$)|^\d+(?:\.\d+)?(?=\s|$)/);
	if (!match) return null;
	const valor = match[0].includes(',')
		? match[0].replace(/\./g, '').replace(',', '.')
		: match[0];
	const parsed = Number(valor);
	return Number.isFinite(parsed) ? parsed : null;
}

function resolverTipo(texto) {
	const normalized = normalizar(texto);
	return tipos.find(tipo => normalized.includes(normalizar(tipo.nome)))?.slug || texto.toUpperCase();
}

export function parseCardGm(html, { now = new Date() } = {}) {
	const dom = new JSDOM(html, { url: CONFIG.url });
	try {
		const doc = dom.window.document;
		const text = selector => doc.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
		const anchor = doc.querySelector('.c49-property-card_photo a[href]');
		if (!anchor) throw new Error('[jfGm] Card C49 sem link do imóvel.');

		const link = new URL(anchor.href);
		if (link.origin !== new URL(CONFIG.url).origin || !/^\/\d+\/imoveis\/venda-/i.test(link.pathname)) {
			throw new Error(`[jfGm] Card fora da listagem de vendas: ${link.href}`);
		}
		link.search = '';
		link.hash = '';
		const linkReal = link.href;
		const codigoBase = text('.c49-property-card_code').replace(/^C[oó]d\.\s*/i, '').trim();
		const titulo = text('.c49-property-card_title');
		const localizacao = text('.c49-property-card_address');
		if (!codigoBase || !titulo || !localizacao) {
			throw new Error(`[jfGm] Card sem código, título ou localização: ${linkReal}`);
		}

		const cidadeInfo = extrairCidade(localizacao, titulo, linkReal);
		if (!cidadeInfo) throw new Error(`[jfGm] Cidade não identificada: "${localizacao}" (${linkReal})`);
		const cidade = cidadeInfo.slug;
		const bairroBruto = localizacao.split(/[,-]|\s+-\s+/)[0].trim();
		const bairro = resolverBairroCatalogo(bairroBruto, cidade) || bairroBruto.toUpperCase();
		const tipoTexto = text('.c49-property-card_type');
		if (!tipoTexto) throw new Error(`[jfGm] Tipo do imóvel ausente: ${linkReal}`);

		const prices = [...doc.querySelectorAll('.c49-property-card_price > div')];
		const sale = prices.find(element => [...element.querySelectorAll('span')]
			.some(span => normalizar(span.textContent) === 'venda'));
		const status = normalizar([...doc.querySelectorAll('.c49-strip')].map(element => element.textContent).join(' '));
		const priceText = sale?.textContent.replace(/venda|r\$/gi, '').trim() || '';
		const preco = sale ? numero(priceText) : null;
		if (sale && preco === null) throw new Error(`[jfGm] Preço de venda inválido: "${priceText}" (${linkReal})`);
		if (!sale && !/(em avaliacao|em negociacao|reservado|sob consulta|consulte)/.test(status + ' ' + normalizar(doc.body.textContent))) {
			throw new Error(`[jfGm] Preço de venda ausente: ${linkReal}`);
		}

		const feature = icon => {
			const value = doc.querySelector(`.${icon}`)?.closest('.c49-property-number-wrap')
				?.querySelector('.c49-property-number')?.textContent || '';
			return numero(value) ?? 0;
		};
		const image = doc.querySelector('.c49-property-card_photo img');
		const timestamp = now.toISOString();

		return {
			linkReal,
			titulo,
			preco,
			tipoImovel: resolverTipo(tipoTexto),
			bairro,
			cidade,
			localizacao,
			dormitorioValor: feature('c49icon-bedroom-1'),
			banheiroValor: feature('c49icon-bathroom-1'),
			ambienteValor: 0,
			areaValor: feature('c49icon-area-1'),
			garagemValor: feature('c49icon-garage-1'),
			elevadorValor: 0,
			codigoBase,
			linkCard: linkReal,
			corretor: 'GM Imoveis JF',
			dataInclusao: extractDataInclusao(),
			dataExclusao: '',
			linkFoto: image?.getAttribute('data-src') || image?.getAttribute('src')
				? new URL(image.getAttribute('data-src') || image.getAttribute('src'), CONFIG.url).href
				: '',
			atualizadoEm: timestamp,
		};
	} finally {
		dom.window.close();
	}
}

export function readSnapshotGm() {
	const root = document.querySelector('#c49mod-properties-list');
	return {
		cards: [...(root?.querySelectorAll('.c49-property-card') || [])].map(card => card.outerHTML),
		label: document.querySelector('.c49-filter-number')?.textContent || '',
		heading: document.querySelector('.c49-filter-title')?.textContent || '',
		pages: [...document.querySelectorAll('.pagination a')].map(anchor => anchor.getAttribute('href')),
	};
}

function temProximaPagina(pages, baseUrl, pageNumber) {
	const base = new URL(baseUrl);
	const basePath = base.pathname.replace(/\/$/, '');
	const searchId = basePath.split('/').at(-1);
	const targetPath = `${basePath}/${pageNumber}`;
	return pages.some(href => {
		if (!href) return false;
		const match = href.match(/^javascript:pagination\('\d+', '(\d+)', '(\d+)', ''\);$/);
		if (match) return Number(match[1]) === pageNumber && match[2] === searchId;
		if (!URL.canParse(href, baseUrl)) return false;
		const url = new URL(href, baseUrl);
		return url.origin === base.origin && url.pathname.replace(/\/$/, '') === targetPath
			&& url.search === base.search && !url.hash;
	});
}

export async function extractLocalData(browser, linksBusca, { totalEsperado } = {}) {
	if (!Number.isSafeInteger(totalEsperado) || totalEsperado < 0) {
		throw new Error('[jfGm] Pré-contagem obrigatória para preservar a base.');
	}
	if (!Array.isArray(linksBusca) || linksBusca.length !== 1 || new URL(linksBusca[0]).href !== CONFIG.url) {
		throw new Error('[jfGm] Rota C49 de vendas ausente ou diferente da pré-contagem.');
	}

	const records = new Map();
	const page = await browser.newPage();
	try {
		for (let pageNumber = 1; ; pageNumber++) {
			const destination = new URL(CONFIG.url);
			if (pageNumber > 1) destination.pathname = `${destination.pathname.replace(/\/$/, '')}/${pageNumber}`;
			const response = await page.goto(destination.href, { waitUntil: 'domcontentloaded', timeout: 90000 });
			const status = response?.status() ?? 0;
			if (status < 200 || status >= 400) {
				throw new Error(`[jfGm] HTTP ${status} na página ${pageNumber}; base preservada.`);
			}
			validarUrlContagemVendas(CONFIG, page.url());
			await page.waitForFunction(lerContagemVendasDOM, { timeout: 30000 }, CONFIG);
			const snapshot = await page.evaluate(readSnapshotGm);
			if (snapshot.heading.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() !== 'imoveis a venda') {
				throw new Error(`[jfGm] Título da listagem não confirma vendas; base preservada.`);
			}
			const currentTotal = parseTotalVendas(snapshot.label, CONFIG);
			if (currentTotal !== totalEsperado) {
				throw new Error(`[jfGm] Total anunciado mudou de ${totalEsperado} para ${currentTotal}; base preservada.`);
			}

			const before = records.size;
			for (const html of snapshot.cards) {
				const record = parseCardGm(html);
				records.set(record.linkReal, record);
			}
			if (records.size > totalEsperado) {
				throw new Error(`[jfGm] Coleta acima da pré-contagem (${records.size}/${totalEsperado}); base preservada.`);
			}
			console.log(`[jfGm] Página ${pageNumber}: ${records.size}/${totalEsperado} imóveis únicos.`);
			if (records.size === totalEsperado) return [...records.values()];
			if (records.size === before) throw new Error(`[jfGm] Paginação sem progresso; coleta parcial preservada (${records.size}/${totalEsperado}).`);
			if (!temProximaPagina(snapshot.pages, CONFIG.url, pageNumber + 1)) {
				throw new Error(`[jfGm] Coleta incompleta: ${records.size}/${totalEsperado}; base preservada.`);
			}
		}
	} finally {
		await page.close();
	}
}
