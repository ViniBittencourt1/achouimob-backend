// Gera o HTML completo do footer-unidades para Negociar
export function getNegociarFooterHtml() {
	return `<div id="footer--unidades"><div class="footer--unidades--item"><div class="footer--unidades--endereco"><a href="https://www.google.com/maps/search/Rua+José+Lourenço+Kelmer,+1052,+São+Pedro,+36036-330,+Juiz+de+Fora,+MG" target="_blank" class="icon-link endereco--item"><i class="ig-map"></i><span>Rua José Lourenço Kelmer, 1052, São Pedro, 36036-330, Juiz de Fora, MG</span></a></div><div class="footer--unidades--setores"><div class="footer--unidades--setores--item"><header class="footer--unidades--setores--nome"> Locação </header><div class="footer--unidades--setores--contatos"><div><a href="https://wa.me/5532999187074" aria-label="link-telefone--whatsapp" target="_blank" class="icon-link telefone--item"><i class="ig-whatsapp"></i><span>(32) 99918-7074 <nil></nil></span></a></div><div><a href="mailto:locacao@negociarimoveisjf.com.br" aria-label="link-email" target="_blank" class="icon-link email--item"><i class="ig-email"></i><span>locacao@negociarimoveisjf.com.br</span></a></div></div></div><div class="footer--unidades--setores--item"><header class="footer--unidades--setores--nome"> Recepção </header><div class="footer--unidades--setores--contatos"><div></div><div><a href="mailto:contato@negociarimoveisjf.com.br" aria-label="link-email" target="_blank" class="icon-link email--item"><i class="ig-email"></i><span>contato@negociarimoveisjf.com.br</span></a></div></div></div><div class="footer--unidades--setores--item"><header class="footer--unidades--setores--nome"> Vendas </header><div class="footer--unidades--setores--contatos"><div><a href="tel:553232333312" aria-label="link-telefone--phone" target="_blank" class="icon-link telefone--item"><i class="ig-phone"></i><span>(32) 3233-3312 <nil></nil></span></a><a href="https://wa.me/5532999781041" aria-label="link-telefone--whatsapp" target="_blank" class="icon-link telefone--item"><i class="ig-whatsapp"></i><span>(32) 99978-1041 <nil></nil></span></a></div><div><a href="mailto:venda@negociarimoveisjf.com.br" aria-label="link-email" target="_blank" class="icon-link email--item"><i class="ig-email"></i><span>venda@negociarimoveisjf.com.br</span></a></div></div></div></div><div class="footer--unidades--redes-sociais"></div></div></div>`;
}
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
import * as cheerio from 'cheerio';
// Gera um pequeno HTML com os dados do corretor extraídos do container-corretor
export function extractLinkCard() {
	return 0;
}
