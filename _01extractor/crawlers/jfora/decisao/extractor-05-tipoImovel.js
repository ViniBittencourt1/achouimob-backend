import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Extrai o tipo de imóvel de um card HTML usando regex, o normaliza com um arquivo JSON
 * e retorna o slug correspondente.
 *
 * @param {string} cardHtml O HTML do card do imóvel como string.
 * @returns {string} O slug normalizado do tipo de imóvel ou uma string vazia se não for encontrado.
 */
export function extractTipoImovel(cardHtml) {
  // --- ETAPA 1: Extrair o texto do HTML usando Regex (lógica do seu código original) ---
  // A regex busca pelo padrão: <p class="imovelcard__info__ref">...<strong>...</strong> - TEXTO_A_SER_EXTRAÍDO</p>
  const match = cardHtml.match(/<p class="imovelcard__info__ref">.*?<strong>.*?<\/strong>\s*-\s*([^<]+)<\/p>/i);
  // `match[1]` contém o texto capturado pelo grupo `([^<]+)`.
  let tipoExtraido = match ? match[1].trim() : '';
  // Se a regex não encontrar uma correspondência, tenta extrair do linkReal
  if (!tipoExtraido) {
    const linkMatch = cardHtml.match(/href=["']([^"']+)["']/i);
    if (linkMatch && linkMatch[1]) {
      const url = linkMatch[1];
      // Extrai o tipo entre a última '/' e o primeiro '-'
      const tipoMatch = url.match(/\/([^\/\-]+)-/i);
      if (tipoMatch && tipoMatch[1]) {
        const tipoDoLink = tipoMatch[1].replace(/-/g, ' ').trim();
        // Carrega a lista de tipos do arquivo JSON.
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
        let tiposList = [];
        // Função recursiva para coletar todos os objetos com campo 'nome' em qualquer estrutura
        function collectTipos(obj) {
          let result = [];
          if (Array.isArray(obj)) {
            for (const item of obj) {
              result = result.concat(collectTipos(item));
            }
          } else if (obj && typeof obj === 'object') {
            if ('nome' in obj) result.push(obj);
            for (const key in obj) {
              result = result.concat(collectTipos(obj[key]));
            }
          }
          return result;
        }
        try {
          const jsonData = fs.readFileSync(tiposPath, 'utf8');
          const tiposJson = JSON.parse(jsonData);
          tiposList = collectTipos(tiposJson);
        } catch (e) {
          return tipoDoLink.toUpperCase();
        }
        for (const tipo of tiposList) {
          if (tipo.nome && tipoDoLink.toLowerCase().includes(tipo.nome.toLowerCase())) {
            return tipo.slug || tipoDoLink.toUpperCase();
          }
        }
        return tipoDoLink.toUpperCase();
      }
    }
    // Se não houver linkReal ou não extrair nada, retorna 'DESCONHECIDO'
    return 'DESCONHECIDO';
  }

  // --- ETAPA 2: Integrar a verificação com o arquivo JSON ---
  // Função recursiva para coletar todos os objetos com campo 'nome' em qualquer estrutura
  function collectTipos(obj) {
    let result = [];
    if (Array.isArray(obj)) {
      for (const item of obj) {
        result = result.concat(collectTipos(item));
      }
    } else if (obj && typeof obj === 'object') {
      if ('nome' in obj) result.push(obj);
      for (const key in obj) {
        result = result.concat(collectTipos(obj[key]));
      }
    }
    return result;
  }

  // Carrega a lista de tipos do arquivo JSON.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const tiposPath = path.resolve(__dirname, '../../../../_03database/filtros/_brTipoImovel.json');
  let tiposList = [];
  // Função recursiva para coletar todos os objetos com campo 'nome' em qualquer estrutura
  function collectTipos(obj) {
    let result = [];
    if (Array.isArray(obj)) {
      for (const item of obj) {
        result = result.concat(collectTipos(item));
      }
    } else if (obj && typeof obj === 'object') {
      if ('nome' in obj) result.push(obj);
      for (const key in obj) {
        result = result.concat(collectTipos(obj[key]));
      }
    }
    return result;
  }
  try {
    const jsonData = fs.readFileSync(tiposPath, 'utf8');
    const tiposJson = JSON.parse(jsonData);
    tiposList = collectTipos(tiposJson);
    if (!Array.isArray(tiposList) || tiposList.length === 0) {
      console.error('Nenhum tipo encontrado no JSON!');
      return '';
    }
  } catch (e) {
    console.error(`Erro ao carregar ou processar o arquivo _brTipoImovel.json: ${e.message}`);
    return '';
  }
  // --- ETAPA 3: Comparar e retornar o slug ---
  for (const tipo of tiposList) {
    if (tipo.nome && tipoExtraido.toLowerCase().includes(tipo.nome.toLowerCase())) {
      // Ao encontrar a primeira correspondência, retorna o slug associado.
      return tipo.slug || '';
    }
  }
  // Segunda rodada: tenta extrair do linkReal se não encontrou na primeira
  const linkMatch = cardHtml.match(/href=["']([^"']+)["']/i);
  if (linkMatch && linkMatch[1]) {
    const url = linkMatch[1];
    // Exemplo: https://www.imobiliariadecisaojf.com.br/imovel/1903317/terreno-venda-juiz-de-fora-mg-santa-cruz
    const tipoMatch = url.match(/\/([^\/\-]+)-venda/i);
    if (tipoMatch && tipoMatch[1]) {
      const tipoDoLink = tipoMatch[1].replace(/-/g, ' ').trim();
      for (const tipo of tiposList) {
        if (tipo.nome && tipoDoLink.toLowerCase().includes(tipo.nome.toLowerCase())) {
          return tipo.slug || tipoDoLink.toUpperCase();
        }
      }
      // Se não encontrar, retorna o valor extraído do link em maiúsculas
      return tipoDoLink.toUpperCase();
    }
  }
  // Se não encontrar nada, retorna o valor extraído original em maiúsculas
  return tipoExtraido.toUpperCase();
}
