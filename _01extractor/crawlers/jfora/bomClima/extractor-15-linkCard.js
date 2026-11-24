// Gera um pequeno HTML com endereço, telefone e email extraídos do footer--unidades
export function extractFooterUnidades(html) {
	let endereco = '';
	let enderecoHref = '';
	let telefone = '';
	let telefoneHref = '';
	let email = '';
	let emailHref = '';
	if (typeof window === 'undefined') {
		const { JSDOM } = require('jsdom');
		const dom = new JSDOM(html);
		const doc = dom.window.document;
		const aEndereco = doc.querySelector('.footer--unidades--endereco a');
		if (aEndereco) {
			endereco = aEndereco.querySelector('span')?.textContent.trim() || '';
			enderecoHref = aEndereco.getAttribute('href') || '';
		}
		const aTelefone = doc.querySelector('a.telefone--item');
		if (aTelefone) {
			telefone = aTelefone.querySelector('span')?.textContent.trim() || '';
			telefoneHref = aTelefone.getAttribute('href') || '';
		}
		const aEmail = doc.querySelector('a.email--item');
		if (aEmail) {
			email = aEmail.querySelector('span')?.textContent.trim() || '';
			emailHref = aEmail.getAttribute('href') || '';
		}
	} else {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const aEndereco = doc.querySelector('.footer--unidades--endereco a');
		if (aEndereco) {
			endereco = aEndereco.querySelector('span')?.textContent.trim() || '';
			enderecoHref = aEndereco.getAttribute('href') || '';
		}
		const aTelefone = doc.querySelector('a.telefone--item');
		if (aTelefone) {
			telefone = aTelefone.querySelector('span')?.textContent.trim() || '';
			telefoneHref = aTelefone.getAttribute('href') || '';
		}
		const aEmail = doc.querySelector('a.email--item');
		if (aEmail) {
			email = aEmail.querySelector('span')?.textContent.trim() || '';
			emailHref = aEmail.getAttribute('href') || '';
		}
	}
	return `
<div class="footer-mini-card">
	<div><a href="${enderecoHref}" target="_blank">${endereco}</a></div>
	<div><a href="${telefoneHref}" target="_blank">${telefone}</a></div>
	<div><a href="${emailHref}" target="_blank">${email}</a></div>
</div>`;
}

// Extrai o HTML do footer do card já carregado
import { JSDOM } from 'jsdom';
export function extractLinkCard() {
	return 0;
}
