
// Retorna a data de atualização do registro
// Deve ser gravada ao final do processo de raspagem e salvamento
export function extractAtualizadoEm() {
  // Data/hora atual em São Paulo
  const date = new Date();
  // Ajusta para o fuso de São Paulo (GMT-3)
  const options = {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  // Formata para dd/MM/yyyy HH:mm:ss
  const parts = new Intl.DateTimeFormat('pt-BR', options).formatToParts(date);
  const get = (type, pad = 2) => {
    const value = parts.find(p => p.type === type)?.value;
    return value ? (type === 'year' ? value : value.padStart(pad, '0')) : '';
  };
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
