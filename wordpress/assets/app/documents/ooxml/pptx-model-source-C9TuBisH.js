import { Xt as e } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { n as t } from "./session-DPXK_lpI.js";
import { t as n } from "./pptx-C1CiFW1D.js";
import { t as r } from "./model-source-Cch44xsb.js";
async function i(t, r, i) {
	let o = await a(t, r, i), s = new Proxy(o.archive, { get(e, t) {
		if (t === "extract_media" && !e.extract_media) return () => {
			throw Error("media extraction is unsupported for this source");
		};
		let n = Reflect.get(e, t);
		return typeof n == "function" ? n.bind(e) : n;
	} });
	return new n(o.closeArchive, s, o.bootstrap, o.metrics, r.signal, e(r.cjkFallback), o.parsedTextChain);
}
async function a(e, n, i) {
	let { acquirePptxSessionFromArchive: a, validatePptxModelSourceArchive: o, validatePptxModelSourceViewDefaults: s } = await import("./model-source-session-DRcqFGfM.js"), c = await r(e, "pptx", {
		...n,
		source: n.legacyPpt
	}, o);
	if (c.kind === "ooxml") return {
		...await t(c.bytes, i(), n),
		parsedTextChain: !0
	};
	try {
		s(c.opened.viewDefaults);
	} catch (e) {
		try {
			c.opened.close();
		} catch {}
		throw e;
	}
	return {
		...a({
			archive: c.opened.archive,
			sourceByteLength: c.sourceByteLength,
			closeArchive: c.opened.close
		}, n),
		parsedTextChain: !1
	};
}
export { i as openPptxSource };
