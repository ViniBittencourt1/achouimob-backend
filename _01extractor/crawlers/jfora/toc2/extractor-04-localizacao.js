import { JSDOM } from 'jsdom';

// Extrai o campo localizacao de um card HTML
// cardHtml: string (HTML do card)
export function extractLocalizacao(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const nodes = dom.window.document.querySelectorAll('div.HistoryComponent_text_normal__6ot8a');
  // Pega o quinto e depois o quarto valor, se existirem
  if (nodes.length >= 5) {
    const quinto = nodes[4].textContent.trim();
    const quarto = nodes[3].textContent.trim();
    return `${quinto}, ${quarto}`;
  }
  if (nodes.length >= 4) {
    return nodes[3].textContent.trim();
  }
  return '';
}
