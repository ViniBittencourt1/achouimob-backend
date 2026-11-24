function validateSelectedProjects(value, available) {
  if (!Array.isArray(value) || !value.length || value.some(name => typeof name !== 'string' || !available.includes(name))) {
    throw new Error('Selecione pelo menos um projeto JSON valido para enviar ao Typesense.');
  }
  return [...new Set(value)];
}

function mergeSelectedDocuments(existing, updates, selectedProjects) {
  const selected = new Set(selectedProjects);
  const documents = new Map(existing.filter(doc => !selected.has(doc.imobiliariaId)).map(doc => [doc.id, doc]));
  for (const doc of updates) documents.set(doc.id, doc);
  return [...documents.values()];
}

module.exports = { validateSelectedProjects, mergeSelectedDocuments };
