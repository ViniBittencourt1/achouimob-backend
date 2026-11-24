import { aplicarPrecoAPartir } from '../_utils/precoAPartir.js';
// extractor-03-preco.js

// A função de tratamento de preço agora vive aqui dentro.
function tratarPrecoEspecial(texto) {
  if (!texto) return 0;

  let original = texto.toLowerCase();
  let multiplicador = 1;

  if (original.includes("milhão") || original.includes("milhoes") || original.includes("mm")) {
    multiplicador = 1000000;
  } else if (original.includes("mil") || original.includes("k")) {
    multiplicador = 1000;
  }

  let numeroBruto = original.replace(/[^0-9,.]/g, "").replace(/\./g, "").replace(",", ".");
  let valor = parseFloat(numeroBruto);

  if (isNaN(valor)) return 0;

  return parseFloat((valor * multiplicador).toFixed(2)) || 0;
}

// A função exportada continua a mesma, mas agora usa a função local.
function extractPrecoBase(cardNode, negociacao) {
  const items = cardNode.find(".imovel-item--preco--item");
  const rentalItems = negociacao === "locacao"
    ? items.filter(index => /loca[\u00e7c][a\u00e3]o|aluguel/i.test(items.eq(index).find("small").text()))
    : null;
  if (rentalItems && !rentalItems.length) return null;
  const precoText = (rentalItems ? rentalItems.first().find("b") : cardNode.find(".imovel-item--preco--item b")).text().trim() || "";
  const precoRaw = precoText.replace("R$", "").trim();
  return tratarPrecoEspecial(precoRaw);
}

export function extractPreco(...args) {
  return aplicarPrecoAPartir(extractPrecoBase(...args), args[0], args[1]);
}
