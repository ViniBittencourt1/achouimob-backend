// extractor-14-codigoBase.js
export function extractCodigoBase(linkReal) {
  if (!linkReal) return "";
  try {
    const url = new URL(linkReal);
    const parts = url.pathname.split("/");
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}
