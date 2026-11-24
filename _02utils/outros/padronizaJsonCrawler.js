// utils/padronizaJsonCrawler.js
// Padroniza todos os arquivos JSON de crawler para o mesmo conjunto de colunas

const fs = require('fs');
const path = require('path');

const arquivos = [
  'backend/crawler/jfACasas.json',
  'backend/crawler/jfRemax.json',
  'backend/crawler/jfInvest.json',
  'backend/crawler/jfSouzaGomes.json',
  'backend/crawler/jfRibeiroArrabal.json',
  'backend/crawler/jfRVNegocios.json',
  'backend/crawler/jfAlmar.json',
  'backend/crawler/jfEuro.json',
  'backend/crawler/jfAna.json',
  'backend/crawler/jfAlicerce.json',
  'backend/crawler/jfUniversal.json',
  'backend/crawler/jfLocato.json',
  'backend/crawler/jfClientt.json',
  'backend/crawler/jfSelect.json',
  'backend/crawler/jfNogueira.json',
  'backend/crawler/jfNegociar.json',
  'backend/crawler/jfRedentor.json',
  'backend/crawler/jfToronto.json',
  'backend/crawler/jfBomClima.json',
  'backend/crawler/jfAcervo.json',
  'backend/crawler/jfMasson.json',
  'backend/crawler/jfEstrelaSul.json',
  'backend/crawler/jfLocal.json',
  'backend/crawler/jfLider.json',
  'backend/crawler/jfDecisao.json',
  'backend/crawler/jfSoares.json',
  'backend/crawler/jfToc2.json',
  'backend/crawler/jfJeferson.json',
  'backend/crawler/jfOliveira.json',
  'backend/crawler/jfSouzaRocha.json',
  'backend/crawler/jfBellos.json',
  'backend/crawler/jfAntonioDias.json',
  'backend/crawler/jfJfImovel.json'
];

const colunasPadrao = [
  'linkReal',
  'titulo',
  'preco',
  'localizacao',
  'tipoImovel',
  'bairro',
  'cidade',
  'dormitorioValor',
  'suiteValor',
  'banheiroValor',
  'garagemValor',
  'areaValor',
  'ambienteValor',
  'elevadorValor',
  'codigoBase',
  'linkCard',
  'corretor',
  'linkFoto',
  'dataInclusao',
  'dataExclusao',
  'atualizadoEm',
  'bairroId',
  'cidadeId',
];

for (const arquivo of arquivos) {
  const filePath = path.resolve(arquivo);
  if (!fs.existsSync(filePath)) continue;
  const arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const arrPadronizado = arr.map(obj => {
    const novo = {};
    for (const col of colunasPadrao) {
      novo[col] = obj.hasOwnProperty(col) ? obj[col] : '';
    }
    return novo;
  });
  fs.writeFileSync(filePath, JSON.stringify(arrPadronizado, null, 2));
  console.log('Padronizado:', arquivo);
}
console.log('Finalizado!');
