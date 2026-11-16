import { t as e } from "./chunk-D5OxutzX.js";
import { Xt as t } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { t as n } from "./pptx-parsed-slides-BMGr4khe.js";
var r = /* @__PURE__ */ e({
	installImageBitmapShim: () => o,
	installOffscreenCanvasShim: () => a,
	renderSlideNode: () => c,
	withNodeCanvasRuntime: () => s
}), i = Promise.resolve();
function a(e) {
	let t = globalThis, n = t.OffscreenCanvas, r = Object.prototype.hasOwnProperty.call(globalThis, "OffscreenCanvas");
	if (n !== void 0) return () => {};
	class i {
		constructor(t, n) {
			return e.createCanvas(t, n);
		}
	}
	return t.OffscreenCanvas = i, () => {
		r ? t.OffscreenCanvas = n : delete t.OffscreenCanvas;
	};
}
function o(e) {
	let t = globalThis, n = t.createImageBitmap;
	return t.createImageBitmap = async (t, n) => {
		if (t && typeof t.getContext == "function") return t;
		let r;
		if (t instanceof Uint8Array || t instanceof ArrayBuffer) r = t;
		else if (typeof t.arrayBuffer == "function") r = await t.arrayBuffer();
		else throw Error("createImageBitmap shim: unsupported source type");
		let i = n?.resizeWidth, a = n?.resizeHeight, o = typeof i == "number" && i > 0 ? { width: i } : typeof a == "number" && a > 0 ? { height: a } : void 0, s = await e.loadImage(r, o);
		if (!o || o.width !== void 0 && s.width === o.width || o.height !== void 0 && s.height === o.height) return s;
		let c = o.width === void 0 ? typeof o.height == "number" ? o.height / s.height : 1 : o.width / s.width, l = Math.max(1, Math.round(s.width * c)), u = Math.max(1, Math.round(s.height * c)), d = e.createCanvas(l, u), f = d.getContext("2d");
		return typeof f.drawImage == "function" ? (f.drawImage(s, 0, 0, l, u), s.close?.(), d) : s;
	}, () => {
		t.createImageBitmap = n;
	};
}
function s(e, t) {
	let n = async () => {
		let n = typeof globalThis.createImageBitmap == "function" ? () => void 0 : o(e), r = a(e);
		try {
			return await t();
		} finally {
			r(), n();
		}
	}, r = i.then(n, n);
	return i = r.then(() => void 0, () => void 0), r;
}
async function c(e, r, i, a = {}) {
	let o = t(a.cjkFallback), { renderSlideWithEmbeddedFonts: c } = await import("./session-DPXK_lpI.js").then((e) => e.t), l = r.slides[i];
	if (!l) throw Error(`Slide index ${i} out of range`);
	let u = a.width ?? 960, d = a.dpr ?? 2, f = a.fetchImage ?? (async () => new Blob([])), p = async () => {
		await c(e, l, r.slideWidth, r.slideHeight, {
			width: u,
			dpr: d,
			cjkFallback: o,
			defaultTextColor: r.defaultTextColor,
			majorFont: r.majorFont,
			minorFont: r.minorFont,
			hlinkColor: r.hlinkColor ?? null,
			fetchMedia: a.fetchMedia ?? (async () => new Blob([])),
			fetchImage: f,
			skipMediaControls: !0,
			...n(l) ? { parsedTextChain: !0 } : {}
		});
	};
	await (a.factory ? s(a.factory, p) : p());
}
export { s as a, r as i, a as n, c as r, o as t };
