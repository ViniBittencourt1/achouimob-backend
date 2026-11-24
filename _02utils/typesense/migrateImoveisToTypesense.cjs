// Script para migrar imóveis públicos do Firestore para Typesense Cloud
// Execute: node migrateImoveisToTypesense.cjs

const admin = require('firebase-admin');
const Typesense = require('typesense');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const publicationConfiguration = require('../../publication-config.cjs');
Object.assign(process.env, publicationConfiguration.publicationEnvironment(path.resolve(__dirname,'../..')));
const { publicationArguments, typesenseSource } = require('../../publication-profiles.cjs');
const publication = publicationArguments(process.argv.slice(2));
const profile = publication.profile;
const sourceCollection = typesenseSource(profile);
const origemJson = publication.origem === 'json';
const { validateSelectedProjects, mergeSelectedDocuments } = require('./selectedProjects.cjs');
const { filterAvailableDocuments, loadAvailability } = require('../../crawler-availability.cjs');
const { projetoSuspenso } = require('../../crawler-order.cjs');
const selectedProjects = process.env.TYPESENSE_SELECTED_PROJECTS ? JSON.parse(process.env.TYPESENSE_SELECTED_PROJECTS) : null;
if (selectedProjects && !origemJson) throw new Error('Selecao de projetos exige origem JSON.');
if (publication.collections.length) throw new Error('Typesense sincroniza a colecao do perfil completo; nao recebe projetos jf... .');
console.log(`PUBLICACAO_TIPO=${profile.tipo} ${origemJson ? `ORIGEM=JSON(crawler/*${profile.jsonSuffix})` : `FIRESTORE_ORIGEM=${sourceCollection}`} TYPESENSE=${profile.typesense} FILTROS=${profile.filtrosPrefix}`);
if (publication.dryRun) {
  console.log('DRY_RUN: nenhum documento lido ou enviado para os servicos de nuvem.');
  process.exit(0);
}
try { publicationConfiguration.validatePublicationConfiguration(profile,'typesense',false,process.env); }
catch (error) { console.error(`[PUBLICACAO][CONFIGURACAO] ${error.message}`); process.exit(1); }

// Carregar arquivos de filtros
const cidadesPath = path.join(__dirname, '../../_03database/filtros/_brCidades.json');
const tiposPath = path.join(__dirname, '../../_03database/filtros/_brTipoImovel.json');
const bairrosPath = path.join(__dirname, '../../_03database/filtros/_jfBairros.json');
const { projectImovelForTypesense } = require('./projectImovelForTypesense.cjs');

let cidadesData = [];
let tiposData = {};
let bairrosData = [];

function isQuotaExceededError(error) {
  const message = String(error?.message || error?.details || '');
  const code = Number(error?.code ?? error?.status ?? 0);
  return code === 8 || /quota exceeded|resource_exhausted/i.test(message);
}

try {
  cidadesData = JSON.parse(fs.readFileSync(cidadesPath, 'utf8'));
  tiposData = JSON.parse(fs.readFileSync(tiposPath, 'utf8'));
  bairrosData = JSON.parse(fs.readFileSync(bairrosPath, 'utf8'));
} catch (e) {
  console.error("Erro ao carregar arquivos JSON de filtros:", e.message);
}

/**
 * Função para formatar nomes em Capital Case (ex: SÃO MATEUS -> São Mateus)
 * Respeita preposições comuns.
 */
function formatarNome(texto) {
  if (!texto) return "";
  // Se estiver tudo em maiúsculo ou minúsculo, formatamos.
  // Se já estiver misto, assumimos que está correto no JSON.
  if (texto === texto.toUpperCase() || texto === texto.toLowerCase()) {
    return texto.toLowerCase().split(' ').map(word => {
      if (['de', 'da', 'do', 'dos', 'das', 'e'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }
  return texto;
}

/**
 * Funções de busca de nomes reais
 */
function getCidadeNome(slug) {
  if (!slug) return "";
  const cidade = cidadesData.find(c => c.slug === slug && c.principal === "sim");
  return cidade ? formatarNome(cidade.nome) : formatarNome(slug.replace(/-/g, ' '));
}

function getBairroNome(slug) {
  if (!slug) return "";
  const bairro = bairrosData.find(b => b.slug === slug && b.principal === "sim");
  return bairro ? formatarNome(bairro.nome) : formatarNome(slug.replace(/-/g, ' '));
}

function getTipoImovelNome(slug) {
  if (!slug || !tiposData.tiposFiltro) return slug;

  // Percorre as categorias: residencial, comercial, diversos
  const categorias = Object.values(tiposData.tiposFiltro);
  for (const lista of categorias) {
    if (Array.isArray(lista)) {
      const encontrado = lista.find(item => item.slug === slug);
      if (encontrado) return encontrado.nome; // Retorna "Apartamento", "Casa", etc.
    }
  }

  // Fallback caso não encontre no JSON
  return formatarNome(slug.replace(/-/g, ' '));
}

// Configure o Typesense
const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: 'wc9sthl3xe6ykq8ip-1.a2.typesense.net',
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: 'JLsCS0EwEUHcl7zCKJOg7DTmdukGf3aZ',
  connectionTimeoutSeconds: 10,
  ...(process.env.TYPESENSE_API_KEY ? { apiKey: process.env.TYPESENSE_API_KEY } : {}),
  ...(process.env.TYPESENSE_HOST ? { nodes: [{ host: process.env.TYPESENSE_HOST, port: Number(process.env.TYPESENSE_PORT || 443), protocol: process.env.TYPESENSE_PROTOCOL || 'https' }] } : {}),
});

// Configure o Firebase
const serviceAccount = require('../../credentials/firebase-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

function parseImportResponse(importResponse) {
  if (!importResponse) return [];

  // Typesense geralmente retorna NDJSON (string com uma linha por documento).
  if (typeof importResponse === 'string') {
    return importResponse
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (_err) {
          return { success: false, error: `Resposta de import inválida: ${line}` };
        }
      });
  }

  if (Array.isArray(importResponse)) {
    return importResponse;
  }

  return [importResponse];
}

async function carregarDocumentosOrigem() {
  if (origemJson) {
    // Monta os mesmos documentos que iriam para o Firestore, sem gravar nem ler o Firestore.
    const { pathToFileURL } = require('url');
    const publicador = await import(pathToFileURL(path.join(__dirname, '../../publish-crawler-json.js')).href);
    const available = await publicador.discoverCollections(profile);
    const colecoes = selectedProjects ? validateSelectedProjects(selectedProjects, available) : available;
    const docs = publicador.buildPublicDocs(publicador.loadPublicationRecords(colecoes, profile), profile);
    console.log(`Origem do Typesense: JSONs locais de ${colecoes.length} projeto(s).`);
    return docs;
  }
  const snapshot = await db.collection(sourceCollection).get();
  console.log(`Coleção de origem do Typesense: ${sourceCollection}`);
  return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }))
    .filter(doc => !projetoSuspenso(doc.data.imobiliariaId));
}

async function migrate() {
      // --- CRIAR COLEÇÕES DE FILTROS NO TYPESENSE ---
      const filtroSchemas = {
        cidade: {
          name: 'filtros_cidade',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'count', type: 'int32' }
          ]
        },
        tipo: {
          name: 'filtros_tipo',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'count', type: 'int32' }
          ]
        },
        bairro: {
          name: 'filtros_bairro',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'cidade', type: 'string', facet: true },
            { name: 'count', type: 'int32' }
          ]
        },
        quarto: {
          name: 'filtros_quarto',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'count', type: 'int32' }
          ]
        },
        banheiro: {
          name: 'filtros_banheiro',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'count', type: 'int32' }
          ]
        },
        vaga: {
          name: 'filtros_vaga',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'count', type: 'int32' }
          ]
        },
        valor: {
          name: 'filtros_valor',
          fields: [
            { name: 'nome', type: 'string' },
            { name: 'slug', type: 'string' },
            { name: 'count', type: 'int32' }
          ]
        }
      };
  try {
    console.log(origemJson ? "Iniciando leitura dos JSONs locais..." : "Iniciando busca no Firestore...");
    const documentosOrigem = await carregarDocumentosOrigem();
    const startedAt = Date.now();

    const availability = loadAvailability();
    const activeSource = documentosOrigem.filter(doc => doc.data.ativo !== false && ['', '0'].includes(String(doc.data.dataExclusao || '').trim()));
    const activeDocs = filterAvailableDocuments(activeSource, profile.tipo, availability);
    if (activeDocs.some(doc => doc.data.negociacao && doc.data.negociacao !== profile.negociacao)) throw new Error('Origem contem dados de outra negociacao. Sincronizacao bloqueada.');
    let imoveis = activeDocs.map(doc => projectImovelForTypesense({ ...doc.data, negociacao: profile.negociacao }, doc.id));
    if (!imoveis.length && !publication.allowEmpty && !activeSource.length) throw new Error('Origem vazia. Sincronizacao bloqueada antes de alterar indices; use --allow-empty para confirmar.');
    const documentosParaEnviar = imoveis;
    const documentosParaRemover = [];
    if (selectedProjects) {
      let existing = [];
      try {
        const exported = await typesenseClient.collections(profile.typesense).documents().export();
        existing = exported.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
      } catch (error) {
        if (error.httpStatus !== 404) throw error;
      }
      const selected = new Set(selectedProjects);
      const updateIds = new Set(documentosParaEnviar.map(doc => doc.id));
      if (existing.some(doc => !selected.has(doc.imobiliariaId) && updateIds.has(doc.id))) {
        throw new Error('ID compartilhado com projeto desmarcado; envio bloqueado para preservar seus dados.');
      }
      documentosParaRemover.push(...existing.filter(doc => selected.has(doc.imobiliariaId) && !updateIds.has(doc.id)).map(doc => doc.id));
      const merged = mergeSelectedDocuments(existing, documentosParaEnviar, selectedProjects);
      imoveis = filterAvailableDocuments(merged, profile.tipo, availability).filter(doc => !projetoSuspenso(doc.imobiliariaId));
      const allowedIds = new Set(imoveis.map(doc => doc.id));
      documentosParaRemover.push(...merged.filter(doc => !allowedIds.has(doc.id) && !documentosParaRemover.includes(doc.id)).map(doc => doc.id));
      console.log(`[TYPESENSE] Atualizacao seletiva: ${selectedProjects.join(', ')}. Demais documentos preservados.`);
    }
    const totalFinalEsperado = imoveis.length;

    console.log(`Total de imóveis para migrar: ${imoveis.length}`);

    // --- AGREGAR FILTROS ---
    const filtros = {
      cidade: {},
      tipo: {},
      bairro: {},
      quarto: {},
      banheiro: {},
      vaga: {},
      valor: {},
    };

    const bairrosSemCidade = new Set();
    const bairrosIncluidosUnicos = new Set();

    const totalImoveis = imoveis.length;
    const progressStep = totalImoveis > 0 ? Math.max(250, Math.floor(totalImoveis / 20)) : 250;

    imoveis.forEach((doc, index) => {
      const processados = index + 1;
      if (processados % progressStep === 0 || processados === totalImoveis) {
        const perc = ((processados / totalImoveis) * 100).toFixed(1);
        console.log(`[PROGRESSO] Preparando filtros: ${processados}/${totalImoveis} (${perc}%)`);
      }

      // Cidade
      if (doc.cidade) {
        const slug = doc.cidade;
        const nome = doc.cidadeNome || slug;
        filtros.cidade[slug] = filtros.cidade[slug] || { id: `cidade:${slug}`, nome, slug, count: 0 };
        filtros.cidade[slug].count++;
      }
      // Tipo
      if (doc.tipoImovel) {
        const slug = doc.tipoImovel;
        const nome = doc.tipoImovelNome || slug;
        filtros.tipo[slug] = filtros.tipo[slug] || { id: `tipo:${slug}`, nome, slug, count: 0 };
        filtros.tipo[slug].count++;
      }
      // Bairro (apenas principal === 'sim')
      if (doc.bairro) {
        // Busca o bairro no bairrosData considerando slug E cidade, igual ao resumo do painel
        const cidadeSlugDoc = doc.cidade ? String(doc.cidade) : '';
        const bairroInfo = bairrosData.find(b => b.slug === doc.bairro && b.cidade === cidadeSlugDoc && b.principal === 'sim');
        if (bairroInfo) {
          const slug = doc.bairro;
          const nome = doc.bairroNome || slug;
          // Sempre usar o slug da cidade, nunca vazio
          const cidadeSlug = doc.cidade ? String(doc.cidade) : '';
          if (!cidadeSlug) {
            bairrosSemCidade.add(`${nome} | slug: ${slug}`);
            return;
          }
          const bairroKey = `${slug}__${cidadeSlug}`;
          filtros.bairro[bairroKey] = filtros.bairro[bairroKey] || {
            id: `bairro:${slug}:${cidadeSlug}`,
            nome,
            slug,
            cidade: cidadeSlug,
            count: 0
          };
          filtros.bairro[bairroKey].count++;
          bairrosIncluidosUnicos.add(`${nome} | slug: ${slug} | cidade: ${cidadeSlug}`);
        }
      }
      // Quarto
      if (doc.dormitorioValor !== undefined && doc.dormitorioValor !== null) {
        const slug = String(doc.dormitorioValor);
        const nome = slug;
        filtros.quarto[slug] = filtros.quarto[slug] || { id: `quarto:${slug}`, nome, slug, count: 0 };
        filtros.quarto[slug].count++;
      }
      // Banheiro
      if (doc.banheiroValor !== undefined && doc.banheiroValor !== null) {
        const slug = String(doc.banheiroValor);
        const nome = slug;
        filtros.banheiro[slug] = filtros.banheiro[slug] || { id: `banheiro:${slug}`, nome, slug, count: 0 };
        filtros.banheiro[slug].count++;
      }
      // Vaga
      if (doc.garagemValor !== undefined && doc.garagemValor !== null) {
        const slug = String(doc.garagemValor);
        const nome = slug;
        filtros.vaga[slug] = filtros.vaga[slug] || { id: `vaga:${slug}`, nome, slug, count: 0 };
        filtros.vaga[slug].count++;
      }
      // Valor (faixa)
      if (doc.preco !== undefined && doc.preco !== null) {
        // Exemplo: faixa de valor (0-100k, 100k-200k, etc.)
        let faixa = '';
        if (doc.preco < 100000) faixa = '0-100k';
        else if (doc.preco < 200000) faixa = '100k-200k';
        else if (doc.preco < 300000) faixa = '200k-300k';
        else if (doc.preco < 400000) faixa = '300k-400k';
        else if (doc.preco < 500000) faixa = '400k-500k';
        else faixa = '500k+';
        const slug = faixa;
        const nome = faixa;
        filtros.valor[slug] = filtros.valor[slug] || { id: `valor:${slug}`, nome, slug, count: 0 };
        filtros.valor[slug].count++;
      }
    });

    if (bairrosSemCidade.size > 0) {
      console.warn(`[MIGRAÇÃO] Bairros ignorados sem cidade associada: ${bairrosSemCidade.size}`);
      for (const item of Array.from(bairrosSemCidade).slice(0, 20)) {
        console.warn(`[MIGRAÇÃO] Bairro ignorado: ${item}`);
      }
      if (bairrosSemCidade.size > 20) {
        console.warn(`[MIGRAÇÃO] ... e mais ${bairrosSemCidade.size - 20} bairro(s) sem cidade.`);
      }
    }

    if (bairrosIncluidosUnicos.size > 0) {
      console.log(`[MIGRAÇÃO] Bairros únicos incluídos para filtro: ${bairrosIncluidosUnicos.size}`);
      for (const item of Array.from(bairrosIncluidosUnicos).slice(0, 30)) {
        console.log(`[MIGRAÇÃO] Bairro mapeado: ${item}`);
      }
      if (bairrosIncluidosUnicos.size > 30) {
        console.log(`[MIGRAÇÃO] ... e mais ${bairrosIncluidosUnicos.size - 30} bairro(s) únicos.`);
      }
    }

    // --- MIGRAR FILTROS PARA TYPESENSE ---
    for (const filtroNome of Object.keys(filtros)) {
      const collectionName = `${profile.filtrosPrefix}${filtroNome}`;
      const docs = Object.values(filtros[filtroNome]);
      console.log(`[PROGRESSO] Iniciando sincronização da coleção ${collectionName} (${docs.length} registros).`);

      const schema = filtroSchemas[filtroNome] ? { ...filtroSchemas[filtroNome], name: collectionName } : null;
      if (!schema) {
        console.error(`Schema não encontrado para ${collectionName}.`);
        continue;
      }

      // Recria a coleção de filtros a cada execução para garantir base limpa.
      try {
        await typesenseClient.collections(collectionName).retrieve();
        await typesenseClient.collections(collectionName).delete();
        console.log(`Coleção ${collectionName} excluída para recriação.`);
      } catch (err) {
        if (err.httpStatus !== 404) {
          console.error(`Erro ao preparar recriação da coleção ${collectionName}:`, err);
          throw err;
        }
      }

      try {
        await typesenseClient.collections().create(schema);
        console.log(`Coleção ${collectionName} criada.`);
      } catch (err) {
        console.error(`Erro ao criar coleção ${collectionName}:`, err);
        throw err;
      }

      // Log detalhado dos bairros e suas cidades (lista resumida)
      if (filtroNome === 'bairro') {
        console.log('--- Lista de bairros a migrar (com cidade) ---');
        docs.slice(0, 30).forEach(b => {
          console.log(`Bairro: ${b.nome} | Slug: ${b.slug} | Cidade: ${b.cidade}`);
        });
        if (docs.length > 30) {
          console.log(`... e mais ${docs.length - 30} bairro(s).`);
        }
        console.log('---------------------------------------------');
      }
      if (!docs.length) continue;
      const ndjson = docs.map(doc => JSON.stringify(doc)).join('\n');
      try {
        await typesenseClient.collections(collectionName).documents().import(ndjson, { action: 'upsert' });
        console.log(`Coleção ${collectionName} migrada com ${docs.length} registros.`);
      } catch (err) {
        throw err;
      }
    }

    // --- RECRIAR COLEÇÃO DE IMÓVEIS NO TYPESENSE ---
    const imoveisSchema = {
      name: profile.typesense,
      fields: [
        { name: 'id', type: 'string' },
        { name: 'titulo', type: 'string' },
        { name: 'preco', type: 'float', facet: true },
        { name: 'precoCondominio', type: 'float', facet: true, optional: true },
        { name: 'precoIptu', type: 'float', facet: true, optional: true },
        { name: 'precoTotal', type: 'float', facet: true, optional: true },
        { name: 'precoOutros', type: 'float', facet: true, optional: true },
        { name: 'areaValor', type: 'float', facet: true },
        { name: 'codigoBase', type: 'string' },
        { name: 'garagemValor', type: 'int32', facet: true },
        { name: 'dormitorioValor', type: 'int32', facet: true },
        { name: 'linkReal', type: 'string' },
        { name: 'localizacao', type: 'string' },
        { name: 'corretor', type: 'string' },
        { name: 'linkFoto', type: 'string' },
        { name: 'imobiliariaId', type: 'string', facet: true },
        { name: 'ativo', type: 'bool', facet: true },
        { name: 'replicatedAt', type: 'string' },
        { name: 'dataInclusao', type: 'string' },
        { name: 'tipoImovel', type: 'string', facet: true },
        { name: 'bairro', type: 'string', facet: true },
        { name: 'cidade', type: 'string', facet: true },
        { name: 'tipoImovelNome', type: 'string' },
        { name: 'bairroNome', type: 'string' },
        { name: 'cidadeNome', type: 'string' },
        { name: 'elevadorValor', type: 'int32', facet: true },
        { name: 'ambienteValor', type: 'int32', facet: true },
        { name: 'linkCard', type: 'string' },
        { name: 'banheiroValor', type: 'int32', facet: true },
        { name: 'dataExclusao', type: 'string' },
        { name: 'atualizadoEm', type: 'string' },
        { name: 'duplicado_grupo', type: 'string', facet: true, optional: true },
        { name: 'negociacao', type: 'string', facet: true, optional: true },
        { name: 'precoSobConsulta', type: 'bool', facet: true, optional: true }
      ],
      default_sorting_field: 'preco'
    };

    // Excluir coleção se existir
    let colecaoExiste = false;
    try {
      await typesenseClient.collections(profile.typesense).retrieve();
      colecaoExiste = true;
    } catch (err) {
      if (err.httpStatus === 404) {
        colecaoExiste = false;
      } else {
        throw err;
      }
    }
    if (colecaoExiste && selectedProjects) {
      const currentSchema = await typesenseClient.collections(profile.typesense).retrieve();
      if (!Array.isArray(currentSchema.fields)) throw new Error('Schema Typesense invalido; campos nao foram alterados.');
      const fieldsToAdd = [];
      for (const field of imoveisSchema.fields.filter(field => ['precoCondominio', 'precoIptu', 'precoTotal', 'precoOutros'].includes(field.name))) {
        const existingField = currentSchema.fields.find(candidate => candidate.name === field.name);
        if (!existingField) {
          fieldsToAdd.push(field);
        } else if (existingField.type !== field.type || existingField.facet !== true || existingField.optional !== true) {
          throw new Error(`Campo Typesense incompativel: ${field.name}; schema preservado.`);
        }
      }
      if (fieldsToAdd.length) {
        await typesenseClient.collections(profile.typesense).update({ fields: fieldsToAdd });
        console.log(`[TYPESENSE] Campos de taxas adicionados: ${fieldsToAdd.map(field => field.name).join(', ')}.`);
      }
    }
    if (colecaoExiste && !selectedProjects) {
      try {
        await typesenseClient.collections(profile.typesense).delete();
        console.log('Coleção imoveis excluída com sucesso.');
      } catch (err) {
        throw err;
      }
    }
    // Criar coleção
    try {
      if (!colecaoExiste || !selectedProjects) {
      await typesenseClient.collections().create(imoveisSchema);
      console.log('Coleção imoveis criada com sucesso.');
      }
    } catch (err) {
      console.error('Erro ao criar coleção imoveis:', err);
      throw err;
    }

    // --- MIGRAR IMÓVEIS ---
    if (selectedProjects) imoveis = documentosParaEnviar;
    const tamanhoLote = 100;
    const totalLotes = Math.ceil(imoveis.length / tamanhoLote);

    const docsFalhos = [];

    for (let i = 0; i < imoveis.length; i += tamanhoLote) {
      const batch = imoveis.slice(i, i + 100);
      const ndjson = batch.map(doc => JSON.stringify(doc)).join('\n');
      const loteAtual = Math.floor(i / tamanhoLote) + 1;
      const enviados = Math.min(i + batch.length, imoveis.length);
      const perc = ((enviados / imoveis.length) * 100).toFixed(1);

      console.log(`[PROGRESSO] Importando lote ${loteAtual}/${totalLotes} | documentos ${enviados}/${imoveis.length} (${perc}%)`);
      try {
        const importResponse = await typesenseClient.collections(profile.typesense).documents().import(ndjson, { action: 'upsert' });
        const resultados = parseImportResponse(importResponse);
        let falhasNoLote = 0;

        resultados.forEach((resultado, index) => {
          if (resultado && resultado.success === false) {
            falhasNoLote += 1;
            const doc = batch[index];
            docsFalhos.push({
              id: doc && doc.id ? String(doc.id) : '(sem-id)',
              error: resultado.error || 'Falha sem mensagem detalhada no import',
              doc,
            });
          }
        });

        if (falhasNoLote > 0) {
          console.warn(`Batch ${loteAtual} importado com ${falhasNoLote} falha(s).`);
        } else {
          console.log(`Batch ${loteAtual} importado com sucesso.`);
        }
      } catch (err) {
        console.error(`Erro ao importar batch ${loteAtual}:`, err);
        batch.forEach(doc => {
          docsFalhos.push({
            id: doc && doc.id ? String(doc.id) : '(sem-id)',
            error: err && err.message ? err.message : 'Erro sem mensagem no import do lote',
            doc,
          });
        });
      }
    }

    if (docsFalhos.length > 0) {
      console.warn(`[MIGRACAO] Falhas detectadas no import em lote: ${docsFalhos.length}. Iniciando retry individual...`);
      const retryFalhos = [];

      for (let i = 0; i < docsFalhos.length; i += 1) {
        const item = docsFalhos[i];
        try {
          const payload = JSON.stringify(item.doc);
          const retryResponse = await typesenseClient.collections(profile.typesense).documents().import(payload, { action: 'upsert' });
          const retryResultados = parseImportResponse(retryResponse);
          const retryFalhou = retryResultados.some(r => r && r.success === false);

          if (retryFalhou) {
            const detalhe = retryResultados.find(r => r && r.success === false);
            retryFalhos.push({
              id: item.id,
              error: detalhe && detalhe.error ? detalhe.error : item.error,
            });
          }
        } catch (err) {
          retryFalhos.push({
            id: item.id,
            error: err && err.message ? err.message : item.error,
          });
        }
      }

      if (retryFalhos.length > 0) {
        console.error(`[MIGRACAO] Retry individual finalizou com ${retryFalhos.length} falha(s) persistentes.`);
        retryFalhos.slice(0, 30).forEach(f => {
          console.error(`[MIGRACAO][FALHA] id=${f.id} | erro=${f.error}`);
        });
        if (retryFalhos.length > 30) {
          console.error(`[MIGRACAO][FALHA] ... e mais ${retryFalhos.length - 30} falha(s).`);
        }
        throw new Error(`Typesense terminou com ${retryFalhos.length} documentos nao publicados.`);
      } else {
        console.log('[MIGRACAO] Retry individual concluiu sem falhas persistentes.');
      }
    }

    for (const id of documentosParaRemover) {
      await typesenseClient.collections(profile.typesense).documents(id).delete();
    }

    try {
      const stats = await typesenseClient.collections(profile.typesense).retrieve();
      const totalTypesense = Number(stats.num_documents || stats.numDocuments || 0);
      const diff = totalFinalEsperado - totalTypesense;
      console.log(`[MIGRACAO] Contagem final Typesense: ${totalTypesense}`);
      console.log(`[MIGRACAO] Contagem esperada (base final): ${totalFinalEsperado}`);
      console.log(`[MIGRACAO] Diferenca final: ${diff}`);
      if (diff !== 0) throw new Error('Contagem final do Typesense difere da origem Firestore.');
    } catch (err) {
      throw err;
    }

    const elapsedMs = Date.now() - startedAt;
    const min = Math.floor(elapsedMs / 60000);
    const sec = Math.floor((elapsedMs % 60000) / 1000);
    console.log(`Migração concluída com nomes amigáveis e formatados! Tempo total: ${min}m ${sec}s`);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      console.warn('[MIGRACAO] Quota do Firestore excedida. Migração para o Typesense adiada.');
      process.exitCode = 1;
      return;
    }
    console.error('Erro na migração:', err);
    process.exitCode = 1;
  }
}

migrate();