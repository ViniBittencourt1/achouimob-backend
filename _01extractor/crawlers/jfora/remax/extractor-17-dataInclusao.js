export function extractDataInclusao(html) {
  return getDataInclusao();
}

// Retorna a data de inclusão do linkReal no banco de dados
// Pode ser chamada no momento da inserção
export function getDataInclusao() {
  // Data e hora no fuso de São Paulo, formato brasileiro
  const data = new Date();
  return data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}
