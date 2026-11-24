// Script para criar o schema da coleção "imoveis" no Typesense Cloud
// Execute: node createTypesenseSchema.js

import Typesense from 'typesense';

const client = new Typesense.Client({
  nodes: [
    {
      host: 'wc9sthl3xe6ykq8ip-1.a2.typesense.net', // novo cluster Typesense
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: 'JLsCS0EwEUHcl7zCKJOg7DTmdukGf3aZ',
  connectionTimeoutSeconds: 10,
});

const schema = {
  name: 'imoveis',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'titulo', type: 'string' },
    { name: 'preco', type: 'float', facet: true },
    { name: 'precoCondominio', type: 'float', facet: true, optional: true },
    { name: 'precoIptu', type: 'float', facet: true, optional: true },
    { name: 'precoTotal', type: 'float', facet: true, optional: true },
    { name: 'precoOutros', type: 'float', facet: true, optional: true },
    { name: 'localizacao', type: 'string' },
    { name: 'tipoImovel', type: 'string', facet: true },
    { name: 'bairro', type: 'string', facet: true },
    { name: 'cidade', type: 'string', facet: true },
      { name: 'dormitorioValor', type: 'int32', facet: true },
    { name: 'banheiroValor', type: 'int32', facet: true },
    { name: 'ambienteValor', type: 'int32', facet: true },
    { name: 'areaValor', type: 'float', facet: true },
    { name: 'garagemValor', type: 'int32', facet: true },
    { name: 'elevadorValor', type: 'int32', facet: true },
    { name: 'codigoBase', type: 'string' },
    { name: 'linkReal', type: 'string' },
    { name: 'linkCard', type: 'string' },
    { name: 'corretor', type: 'string' },
    { name: 'dataInclusao', type: 'string' },
    { name: 'dataExclusao', type: 'string' },
    { name: 'linkFoto', type: 'string' },
    { name: 'atualizadoEm', type: 'string' },
    { name: 'imobiliariaId', type: 'string', facet: true },
    { name: 'ativo', type: 'bool', facet: true },
    { name: 'replicatedAt', type: 'string' },
    { name: 'duplicado_grupo', type: 'string', facet: true, optional: true }
  ],
  default_sorting_field: 'preco'
};

// Função utilitária para garantir que preco seja float
function normalizePreco(doc) {
  if (doc && typeof doc.preco !== 'undefined') {
    doc.preco = Number(doc.preco) || 0;
  }
  return doc;
}

async function createCollection() {
  try {
    await client.collections().create(schema);
    console.log('Coleção "imoveis" criada com sucesso!');
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('Coleção já existe.');
    } else {
      console.error('Erro ao criar coleção:', err);
    }
  }
}

// Exemplo de uso ao indexar documentos:
// const docs = [...];
// const docsNormalizados = docs.map(normalizePreco);
// await client.collections('imoveis').documents().import(docsNormalizados);

createCollection();
