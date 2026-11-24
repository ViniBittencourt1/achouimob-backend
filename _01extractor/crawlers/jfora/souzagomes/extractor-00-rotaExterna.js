// extractor-00-rotaExterna.js
// Geração de links de busca por faixa de preço para Souza Gomes

const linksBusca = [];
// Exemplo de faixas de preço (ajuste conforme necessário para Souza Gomes)
// 0 a 50.000
linksBusca.push("https://souzagomes.com.br/imoveis?order=recentes&negociacao=venda&preco_min=&preco_max=50.000%2C00");
// 50.001 até 500.000: saltos de 50.000
for (let min = 50001; min <= 500000; min += 50000) {
  const max = min + 49999;
  const minStr = min.toLocaleString('pt-BR') + ',00';
  const maxStr = max.toLocaleString('pt-BR') + ',00';
  const link = `https://souzagomes.com.br/imoveis?order=recentes&negociacao=venda&preco_min=${encodeURIComponent(minStr)}&preco_max=${encodeURIComponent(maxStr)}`;
  linksBusca.push(link);
}
// 500.001 até 2.000.000: saltos de 100.000
for (let min = 500001; min <= 2000000; min += 100000) {
  const max = min + 99999;
  const minStr = min.toLocaleString('pt-BR') + ',00';
  const maxStr = max.toLocaleString('pt-BR') + ',00';
  const link = `https://souzagomes.com.br/imoveis?order=recentes&negociacao=venda&preco_min=${encodeURIComponent(minStr)}&preco_max=${encodeURIComponent(maxStr)}`;
  linksBusca.push(link);
}
// De 2.000.001 até 20.000.000: saltos de 1.000.000
for (let min = 2001000; min <= 20000000; min += 1000000) {
  const max = min + 999999;
  const minStr = min.toLocaleString('pt-BR') + ',00';
  const maxStr = max.toLocaleString('pt-BR') + ',00';
  const link = `https://souzagomes.com.br/imoveis?order=recentes&negociacao=venda&preco_min=${encodeURIComponent(minStr)}&preco_max=${encodeURIComponent(maxStr)}`;
  linksBusca.push(link);
}

export { linksBusca };
