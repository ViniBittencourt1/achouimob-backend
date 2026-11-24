import { JSDOM as NativeJSDOM } from "jsdom";

const cache = new Map();
const CACHE_LIMIT = 4;

export class JSDOM {
	constructor(html, options) {
		const source = String(html ?? "");
		let document = cache.get(source);
		if (!document) {
			document = new NativeJSDOM(source, options).window.document;
		}
		cache.delete(source);
		cache.set(source, document);
		if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
		this.window = { document, close() {} };
	}
}
