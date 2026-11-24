// extractor-14-codigoBase.js
export function extractCodigoBase(linkReal ) {
  const codigoBaseMatch = linkReal.match(/cod-(\d+)/);
  return codigoBaseMatch ? codigoBaseMatch[1] : "";
}
