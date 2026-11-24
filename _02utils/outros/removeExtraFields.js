// backend/utils/removeExtraFields.js
// Script para remover os campos 'cidadeNome' e 'bairroNome' das coleções de imóveis no Firestore
// Para rodar: node utils/removeExtraFields.js

import { getCollectionAsMap, batchUpdateFromMap } from '../../src/services/firebase.js';

const colecoesImoveis = [
  'jfACasas',
  'jfInvest',
  'jfRemax',
  'jfRibeiroArrabal',
  'jfSouzaGomes',
  'jfRVNegocios',
  'jfAlmar',
  'jfEuro',
  'jfAna',
  'jfAlicerce',
  'jfUniversal',
  'jfLocato',
  'jfClientt',
  'jfSelect',
  'jfNogueira',
  'jfNegociar',
  'jfRedentor',
  'jfToronto',
  'jfBomClima',
  'jfAcervo',
  'jfMasson',
  'jfEstrelaSul',
  'jfLocal',
  "jfLider",
    "jfDecisao",
    "jfSoares",
    "jfToc2",
    "jfJeferson",
    "jfOliveira",
    "jfSouzaRocha",
    "jfBellos",
    "jfAntonioDias",
    "jfJfImovel"
];

async function removerCampos() {
  for (const col of colecoesImoveis) {
    const mapImoveis = await getCollectionAsMap(col, 'codigoBase');
    if (!mapImoveis.size) continue;
    const mapNorm = new Map();
    for (const [key, imovel] of mapImoveis.entries()) {
      // Remove os campos extras
      const { cidadeNome, bairroNome, ...rest } = imovel;
      mapNorm.set(key, rest);
    }
    await batchUpdateFromMap(col, mapNorm);
    console.log(`✅ Campos removidos em ${col}`);
  }
}

removerCampos().then(() => {
  console.log('✅ Remoção de cidadeNome e bairroNome concluída!');
});
