// Retorna o HTML das unidades Nogueira em Juiz de Fora
export function getNogueiraFooterHtml() {
	return `
<div class="footer--col">
	<div class="footer--col--header">Nossas unidades em Juiz de Fora</div>
	<div class="footer--col--body">
		<div class="footer--col--item">
			<i class="fe-location-map"></i>
			<div>
				<b>Centro (matriz)</b>
				<div>Rua Oscar Vidal, 496, Centro</div>
				<div class="footer--col--item--contatos">
					<a href="https://wa.me/553240095098" aria-label="link-telefone--whatsapp" target="_blank" class="icon-link telefone--item">
						<i class="ig-whatsapp"></i>
						<span>(32) 4009-5098</span>
					</a>
					<a href="tel:553298510706" aria-label="link-telefone--phone" target="_blank" class="icon-link telefone--item">
						<i class="ig-phone"></i>
						<span>(32) 9851-0706</span>
					</a>
					<a href="mailto:contato@nogueiraimoveisjf.com.br" aria-label="link-email" target="_blank" class="icon-link email--item">
						<i class="ig-email"></i>
						<span>contato@nogueiraimoveisjf.com.br</span>
					</a>
				</div>
			</div>
		</div>
		<div class="footer--col--item">
			<i class="fe-location-map"></i>
			<div>
				<b>Zona norte</b>
				<div>Rua Paulo Garcia, 200, sala 207, Benfica</div>
				<div class="footer--col--item--contatos">
					<a href="https://wa.me/553232226980" aria-label="link-telefone--whatsapp" target="_blank" class="icon-link telefone--item">
						<i class="ig-whatsapp"></i>
						<span>(32) 3222-6980</span>
					</a>
					<a href="mailto:contato@nogueiraimoveisjf.com.br" aria-label="link-email" target="_blank" class="icon-link email--item">
						<i class="ig-email"></i>
						<span>contato@nogueiraimoveisjf.com.br</span>
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
`;
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
