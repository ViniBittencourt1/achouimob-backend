import { JSDOM } from "jsdom";

export function extractLinkFoto(cardHtml) {
  const dom = new JSDOM(cardHtml);
  const img = dom.window.document.querySelector("img[src], img[data-src], img[data-lazy-src]");
  return String(img?.getAttribute("src") || img?.getAttribute("data-src") || img?.getAttribute("data-lazy-src") || "").trim();
}
