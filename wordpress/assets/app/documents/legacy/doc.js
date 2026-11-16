import { n as e, r as t, t as n } from "./legacy-source-_eiePVY9.js";
//#region src/wasm-direct-doc/legacy_doc_direct_bg.wasm?url
var r = new URL("legacy_doc_direct_bg.wasm", import.meta.url).href, i = new URL("legacy-doc-source-module.js", import.meta.url).href;
//#endregion
//#region src/legacy-doc.ts
function a(e = {}) {
	if (typeof e != "object" || !e || Array.isArray(e)) throw TypeError("legacy DOC source options must be an object");
	return n("doc", e, {
		wasmUrl: t(r, import.meta.url),
		moduleUrl: t(i, import.meta.url)
	});
}
var o = /* @__PURE__ */ e("docx", () => a());
//#endregion
export { a as createLegacyDoc, o as legacyDoc };
