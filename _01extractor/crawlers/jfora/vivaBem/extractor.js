import { extractCidadeFromCardHtml } from './extractor-07-cidade.js';
import { extractLinkReal } from './extractor-01-linkReal.js';
import { extractTitulo } from './extractor-02-titulo.js';
import { extractPreco } from './extractor-03-preco.js';
import { extractLocalizacao } from './extractor-04-localizacao.js';
import { extractTipoImovel } from './extractor-05-tipoImovel.js';
import { extractBairro } from './extractor-06-bairrojs.js';
import { extractCidadeFromTituloEm } from './extractor-07-cidade.js';
import { extractDormitorioValor } from './extractor-08-dormitorioValor.js';
import { extractBanheiroValor } from './extractor-09-banheiroValor.js';
import { extractAmbienteValor } from './extractor-10-ambienteValor.js';
import { extractAreaValor } from './extractor-11-areaValor.js';
import { extractGaragemValor } from './extractor-12-garagemValor.js';
import { extractElevadorValor } from './extractor-13-elevadorValor.js';
import { extractCodigoBase } from './extractor-14-codigoBase.js';
import { extractLinkCard } from './extractor-15-linkCard.js';
import { extractCorretor } from './extractor-16-corretor.js';
import { extractDataInclusao } from './extractor-17-dataInclusao.js';
import { extractDataExclusao } from './extractor-18-dataExclusao.js';
import { extractLinkFoto } from './extractor-19-linkFoto.js';
import { extractAtualizadoEm } from './extractor-20-atualizadoEm.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluateWithRetry(page, pageFn, label, ...args) {
	const tentativas = 3;
	for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
		try {
			return await page.evaluate(pageFn, ...args);
		} catch (err) {
			const msg = String(err?.message || err);
			const isTransient =
				msg.includes('detached Frame') ||
				msg.includes('Execution context was destroyed') ||
				msg.includes('Cannot find context with specified id');

			if (!isTransient || tentativa === tentativas) {
				throw err;
			}

			console.warn(`[Retry] ${label} falhou (tentativa ${tentativa}/${tentativas}): ${msg}`);
			await sleep(700 * tentativa);
		}
	}
}

export async function extractLocalData(browser, linksBusca) {
	let allImoveis = [];
	let totalCards = 0;
	const cardsPorPagina = 12;

	for (const [idx, link] of linksBusca.entries()) {
		console.log(`\n[${idx + 1}/${linksBusca.length}] Acessando: ${link}`);
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
		await page.setViewport({ width: 1280, height: 800 });
		try {
			console.log(`[${idx + 1}] Iniciando navegaÃ§Ã£o com timeout de 180s...`);
			const response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 180000 });
			if (!response) {
				console.warn(`[${idx + 1}] âš ï¸ Resposta nula recebida`);
			} else {
				console.log(`[${idx + 1}] Status HTTP: ${response.status()}`);
				if (response.status() === 403) {
					console.error(`[${idx + 1}] âŒ Bloqueado com status 403. Salvando debug...`);
					await page.screenshot({ path: `vivabem-403-debug.png`, fullPage: true });
					continue;
				}
			}
		} catch (err) {
			console.warn(`[${idx + 1}] âš ï¸ Erro na navegaÃ§Ã£o: ${err.message}`);
			await page.screenshot({ path: `vivabem-error-debug.png`, fullPage: true });
			try {
				await page.close();
			} catch (e) {}
			continue;
		}
		await sleep(3000);
		console.log(`[${idx + 1}] NavegaÃ§Ã£o concluÃ­da para: ${link}`);
		let totalImoveisDisponiveis = 0;
		try {
			totalImoveisDisponiveis = await evaluateWithRetry(page, () => {
				const totalEl = document.querySelector('h1');
				const totalTxt = totalEl?.textContent?.replace(/\D/g, '') || '';
				return Number(totalTxt || 0);
			}, 'Ler total de imÃ³veis');
		} catch (err) {
			console.warn(`[${idx + 1}] âš ï¸ Falha ao ler total de imÃ³veis. Usando fallback: ${err.message}`);
		}
		const paginasTotais = Math.ceil(totalImoveisDisponiveis / cardsPorPagina);
		const cliquesNecessarios = Math.max(paginasTotais - 1, 0);
		console.log(`[${idx + 1}] Total de imÃ³veis no site: ${totalImoveisDisponiveis}`);
		console.log(`[${idx + 1}] Cliques de paginaÃ§Ã£o calculados: ${cliquesNecessarios}`);
		// Clicar LGPD se aparecer
		try {
			await page.waitForSelector('lgpd-close', { timeout: 5000 });
			await evaluateWithRetry(page, () => {
				const btn = document.querySelector('lgpd-close');
				if (btn && /prosseguir|ok/i.test(btn.textContent)) btn.click();
			}, 'Fechar LGPD');
			await sleep(500);
		} catch (e) {}
		console.log(`[${idx + 1}] Iniciando loop de paginaÃ§Ã£o...`);
		let paginacaoClicks = 0;
		let semCrescimentoConsecutivo = 0;
		let semBotaoConsecutivo = 0;
		const cardsHtml = new Map();
		const limiteMaximoCliques = Math.max(cliquesNecessarios + 30, 60);

		const coletarSnapshot = async (rotulo) => {
			let cardsEncontrados = [];
			try {
				cardsEncontrados = await evaluateWithRetry(page, () => {
					const escapar = (valor = '') =>
						String(valor)
							.replace(/&/g, '&amp;')
							.replace(/</g, '&lt;')
							.replace(/>/g, '&gt;')
							.replace(/"/g, '&quot;');

					const links = Array.from(document.querySelectorAll('a.card-with-buttons.borderHover[href*="/imovel/"]'));
					return links.map((link) => {
						const href = link.getAttribute('href') || '';
						const key = href.split('?')[0] || href;
						const codigo = link.querySelector('p.card-with-buttons__code')?.textContent?.trim() || '';
						const titulo = link.querySelector('p.card-with-buttons__title')?.textContent?.trim() || '';
						const heading = link.querySelector('h2.card-with-buttons__heading')?.textContent?.trim() || '';
						const preco = link.querySelector('p.card-with-buttons__value')?.textContent?.trim() || '';
						const itens = Array.from(link.querySelectorAll('ul li'))
							.map((li) => li.textContent?.trim())
							.filter(Boolean)
							.map((item) => `<li>${escapar(item)}</li>`)
							.join('');

						const img = link.querySelector('img.cards_digital_carousel-image');
						const src = img?.getAttribute('src') || '';
						const fallback = img?.getAttribute('data-fallback') || '';

						const htmlCompacto = `
							<a class="card-with-buttons borderHover" href="${escapar(href)}">
								<p class="card-with-buttons__code">${escapar(codigo)}</p>
								<p class="card-with-buttons__title">${escapar(titulo)}</p>
								<h2 class="card-with-buttons__heading">${escapar(heading)}</h2>
								<ul>${itens}</ul>
								<p class="card-with-buttons__value">${escapar(preco)}</p>
								<img class="cards_digital_carousel-image" src="${escapar(src)}" data-fallback="${escapar(fallback)}">
							</a>
						`;

						return { key, html: htmlCompacto };
					});
				}, `Coletar snapshot (${rotulo})`);
			} catch (err) {
				console.warn(`[${idx + 1}] âš ï¸ Snapshot falhou (${rotulo}). Continuando: ${err.message}`);
				return;
			}
			for (const card of cardsEncontrados) {
				if (!card?.key || !card?.html) continue;
				cardsHtml.set(card.key, card.html);
			}
			console.log(`[${idx + 1}] ${rotulo}: ${cardsEncontrados.length} cards no snapshot, ${cardsHtml.size} acumulados`);
		};

		await coletarSnapshot('Snapshot inicial');
		while (true) {
			if (totalImoveisDisponiveis > 0 && cardsHtml.size >= totalImoveisDisponiveis) {
				console.log(`[${idx + 1}] Total esperado atingido (${cardsHtml.size}/${totalImoveisDisponiveis}).`);
				break;
			}
			if (paginacaoClicks >= limiteMaximoCliques) {
				console.log(`[${idx + 1}] Limite de seguranÃ§a de cliques atingido (${limiteMaximoCliques}).`);
				break;
			}
			if (semCrescimentoConsecutivo >= 3) {
				console.log(`[${idx + 1}] Sem crescimento em 3 tentativas consecutivas. Encerrando paginaÃ§Ã£o.`);
				break;
			}
			if (semBotaoConsecutivo >= 6) {
				console.log(`[${idx + 1}] BotÃ£o "Ver mais" indisponÃ­vel por 6 tentativas. Encerrando paginaÃ§Ã£o.`);
				break;
			}

			const tamanhoAntes = cardsHtml.size;
			const clicouVerMais = await evaluateWithRetry(page, () => {
				// O botao "Ver mais" pode ser <a> ou <button> (o site ja trocou a tag antes).
				const botoes = Array.from(document.querySelectorAll('a.btn-next, button.btn-next'));
				const btnVerMais = botoes.find((btn) => {
					const texto = (btn.textContent || '').trim().toLowerCase();
					const acao = btn.getAttribute('data-action');
					return /ver\s+mais/.test(texto) && !acao && !btn.disabled;
				});

				if (!btnVerMais) return false;
				btnVerMais.scrollIntoView({ behavior: 'instant', block: 'center' });
				btnVerMais.click();
				return true;
			}, 'Clique no botÃ£o Ver mais');

			if (!clicouVerMais) {
				semBotaoConsecutivo++;
				console.log(
					`[${idx + 1}] BotÃ£o "Ver mais" nÃ£o encontrado/ativo (tentativa ${semBotaoConsecutivo}/6). Aguardando...`
				);
				await sleep(2500);
				await evaluateWithRetry(page, () => window.scrollTo(0, document.body.scrollHeight), 'Scroll para reexibir botÃ£o');
				await coletarSnapshot(`Snapshot sem botÃ£o #${semBotaoConsecutivo}`);
				continue;
			}

			semBotaoConsecutivo = 0;

			paginacaoClicks++;
			console.log(`[${idx + 1}] Clique de paginaÃ§Ã£o #${paginacaoClicks}`);
			await sleep(3500);
			await coletarSnapshot(`Snapshot apÃ³s clique #${paginacaoClicks}`);

			if (cardsHtml.size > tamanhoAntes) {
				semCrescimentoConsecutivo = 0;
			} else {
				semCrescimentoConsecutivo++;
				console.log(
					`[${idx + 1}] Nenhum novo card apÃ³s o clique #${paginacaoClicks} (sem crescimento: ${semCrescimentoConsecutivo}/3).`
				);
			}
		}
		console.log(`[${idx + 1}] Fim do loop de paginaÃ§Ã£o. Iniciando busca dos cards...`);
		const cards = Array.from(cardsHtml.values());
		console.log(`[${idx + 1}] Cards encontrados no HTML acumulado: ${cards.length}`);
		if (cards.length === 0) {
			await page.close();
			continue;
		}
		for (const card of cards) {
			const html = card;
			const titulo = await extractTitulo(html);
			const linkReal = await extractLinkReal(html);
			const cidade = extractCidadeFromCardHtml(html, linkReal);
			const bairro = await extractBairro(html, cidade);
			const localizacao = extractLocalizacao(html);
			const imovel = {
				linkReal,
				titulo,
				preco: await extractPreco(html),
				tipoImovel: await extractTipoImovel(html),
				bairro,
				cidade,
				localizacao,
				dormitorioValor: await extractDormitorioValor(html),
				banheiroValor: await extractBanheiroValor(html),
				ambienteValor: await extractAmbienteValor(html),
				areaValor: await extractAreaValor(html),
				garagemValor: await extractGaragemValor(html),
				elevadorValor: await extractElevadorValor(html),
				codigoBase: await extractCodigoBase(html),
				linkCard: await extractLinkCard(html),
				corretor: await extractCorretor(html),
				dataInclusao: await extractDataInclusao(html),
				dataExclusao: await extractDataExclusao(html),
				linkFoto: await extractLinkFoto(html),
				atualizadoEm: await extractAtualizadoEm(html)
			};
			allImoveis.push(imovel);
			totalCards++;
		}
		console.log(`[${idx + 1}] Total acumulado de cards: ${totalCards}`);
		await page.close();
	}
	console.log(`\n[FINAL] Total de cards raspados: ${allImoveis.length}`);
	return allImoveis;
}
