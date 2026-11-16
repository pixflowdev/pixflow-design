import { t as e } from "./chunk-D5OxutzX.js";
import { wo as t } from "./plot-area-frame-DNYMd9Pf.js";
import { G as n, I as r, K as i, P as a, R as o, U as s, Xt as c, ft as l, lt as u } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { a as d, c as f, g as p, i as m, l as h, r as g } from "./document-pull-client-_G-DIh2T.js";
import { n as _, t as ee } from "./abort-JztSoyw2.js";
import { n as v, r as te, t as y } from "./wasm-loader-KAOyLXzf.js";
import { t as b } from "./wasm-runtime-generation-D97yoAXz.js";
import { t as x } from "./in-process-pull-transport-BPJ7M0uC.js";
import { n as S, r as ne, t as re } from "./document-pull-worker-hMKJ5RdB.js";
import { a as ie } from "./render-Bf_Gywxw.js";
var C = /* @__PURE__ */ e({
	DocxArchive: () => w,
	default: () => q,
	docx_to_markdown: () => T,
	extract_image: () => ae,
	initSync: () => se,
	parse_docx: () => E,
	reinit: () => ce
}), w = class {
	__destroy_into_raw() {
		let e = this.__wbg_ptr;
		return this.__wbg_ptr = 0, O.unregister(this), e;
	}
	free() {
		let e = this.__destroy_into_raw();
		W.__wbg_docxarchive_free(e, 0);
	}
	acknowledge_document_chunk(e, t, n) {
		let r = W.docxarchive_acknowledge_document_chunk(this.__wbg_ptr, e, t, n);
		if (r[1]) throw R(r[0]);
	}
	assert_healthy() {
		let e = W.docxarchive_assert_healthy(this.__wbg_ptr);
		if (e[1]) throw R(e[0]);
	}
	cancel_document_cursor() {
		W.docxarchive_cancel_document_cursor(this.__wbg_ptr);
	}
	close_document_session() {
		W.docxarchive_close_document_session(this.__wbg_ptr);
	}
	document_chunk_done() {
		let e = W.docxarchive_document_chunk_done(this.__wbg_ptr);
		if (e[2]) throw R(e[1]);
		return e[0] !== 0;
	}
	document_cursor_resource_usage() {
		let e = W.docxarchive_document_cursor_resource_usage(this.__wbg_ptr);
		if (e[3]) throw R(e[2]);
		let t;
		return e[0] !== 0 && (t = k(e[0], e[1]).slice(), W.__wbindgen_free(e[0], e[1] * 1, 1)), t;
	}
	extract_image(e) {
		let t = L(e, W.__wbindgen_malloc, W.__wbindgen_realloc), n = U, r = W.docxarchive_extract_image(this.__wbg_ptr, t, n);
		if (r[3]) throw R(r[2]);
		var i = k(r[0], r[1]).slice();
		return W.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	constructor(e, t, n, r) {
		let i = I(e, W.__wbindgen_malloc), a = U, o = W.docxarchive_new(i, a, !F(t), F(t) ? BigInt(0) : t, !F(n), F(n) ? BigInt(0) : n, !F(r), F(r) ? BigInt(0) : r);
		if (o[2]) throw R(o[1]);
		return this.__wbg_ptr = o[0] >>> 0, O.register(this, this.__wbg_ptr, this), this;
	}
	open_document_cursor(e, t) {
		let n = W.docxarchive_open_document_cursor(this.__wbg_ptr, e, t);
		if (n[1]) throw R(n[0]);
	}
	parse() {
		let e = W.docxarchive_parse(this.__wbg_ptr);
		if (e[3]) throw R(e[2]);
		var t = k(e[0], e[1]).slice();
		return W.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	pull_document_chunk(e, t, n, r) {
		let i = W.docxarchive_pull_document_chunk(this.__wbg_ptr, e, t, n, r);
		if (i[3]) throw R(i[2]);
		var a = k(i[0], i[1]).slice();
		return W.__wbindgen_free(i[0], i[1] * 1, 1), a;
	}
	resource_usage() {
		let e = W.docxarchive_resource_usage(this.__wbg_ptr);
		if (e[3]) throw R(e[2]);
		var t = k(e[0], e[1]).slice();
		return W.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	to_markdown() {
		let e, t;
		try {
			let i = W.docxarchive_to_markdown(this.__wbg_ptr);
			var n = i[0], r = i[1];
			if (i[3]) throw n = 0, r = 0, R(i[2]);
			return e = n, t = r, M(n, r);
		} finally {
			W.__wbindgen_free(e, t, 1);
		}
	}
};
Symbol.dispose && (w.prototype[Symbol.dispose] = w.prototype.free);
function T(e, t, n) {
	let r, i;
	try {
		let s = I(e, W.__wbindgen_malloc), c = U, l = W.docx_to_markdown(s, c, !F(t), F(t) ? BigInt(0) : t, !F(n), F(n) ? BigInt(0) : n);
		var a = l[0], o = l[1];
		if (l[3]) throw a = 0, o = 0, R(l[2]);
		return r = a, i = o, M(a, o);
	} finally {
		W.__wbindgen_free(r, i, 1);
	}
}
function ae(e, t, n, r) {
	let i = I(e, W.__wbindgen_malloc), a = U, o = L(t, W.__wbindgen_malloc, W.__wbindgen_realloc), s = U, c = W.extract_image(i, a, o, s, !F(n), F(n) ? BigInt(0) : n, !F(r), F(r) ? BigInt(0) : r);
	if (c[3]) throw R(c[2]);
	var l = k(c[0], c[1]).slice();
	return W.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function E(e, t, n) {
	let r = I(e, W.__wbindgen_malloc), i = U, a = W.parse_docx(r, i, !F(t), F(t) ? BigInt(0) : t, !F(n), F(n) ? BigInt(0) : n);
	if (a[3]) throw R(a[2]);
	var o = k(a[0], a[1]).slice();
	return W.__wbindgen_free(a[0], a[1] * 1, 1), o;
}
function D() {
	return {
		__proto__: null,
		"./docx_parser_bg.js": {
			__proto__: null,
			__wbg___wbindgen_throw_6b64449b9b9ed33c: function(e, t) {
				throw Error(M(e, t));
			},
			__wbg_error_a6fa202b58aa1cd3: function(e, t) {
				let n, r;
				try {
					n = e, r = t, console.error(M(e, t));
				} finally {
					W.__wbindgen_free(n, r, 1);
				}
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ Error();
			},
			__wbg_stack_3b0d974bbf31e44f: function(e, t) {
				let n = t.stack, r = L(n, W.__wbindgen_malloc, W.__wbindgen_realloc), i = U;
				j().setInt32(e + 4, i, !0), j().setInt32(e + 0, r, !0);
			},
			__wbindgen_cast_0000000000000001: function(e, t) {
				return M(e, t);
			},
			__wbindgen_init_externref_table: function() {
				let e = W.__wbindgen_externrefs, t = e.grow(4);
				e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, !0), e.set(t + 3, !1);
			}
		}
	};
}
var O = typeof FinalizationRegistry > "u" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((e) => W.__wbg_docxarchive_free(e >>> 0, 1));
function k(e, t) {
	return e >>>= 0, P().subarray(e / 1, e / 1 + t);
}
var A = null;
function j() {
	return (A === null || A.buffer.detached === !0 || A.buffer.detached === void 0 && A.buffer !== W.memory.buffer) && (A = new DataView(W.memory.buffer)), A;
}
function M(e, t) {
	return e >>>= 0, V(e, t);
}
var N = null;
function P() {
	return (N === null || N.byteLength === 0) && (N = new Uint8Array(W.memory.buffer)), N;
}
function F(e) {
	return e == null;
}
function I(e, t) {
	let n = t(e.length * 1, 1) >>> 0;
	return P().set(e, n / 1), U = e.length, n;
}
function L(e, t, n) {
	if (n === void 0) {
		let n = H.encode(e), r = t(n.length, 1) >>> 0;
		return P().subarray(r, r + n.length).set(n), U = n.length, r;
	}
	let r = e.length, i = t(r, 1) >>> 0, a = P(), o = 0;
	for (; o < r; o++) {
		let t = e.charCodeAt(o);
		if (t > 127) break;
		a[i + o] = t;
	}
	if (o !== r) {
		o !== 0 && (e = e.slice(o)), i = n(i, r, r = o + e.length * 3, 1) >>> 0;
		let t = P().subarray(i + o, i + r), a = H.encodeInto(e, t);
		o += a.written, i = n(i, r, o, 1) >>> 0;
	}
	return U = o, i;
}
function R(e) {
	let t = W.__wbindgen_externrefs.get(e);
	return W.__externref_table_dealloc(e), t;
}
var z = new TextDecoder("utf-8", {
	ignoreBOM: !0,
	fatal: !0
});
z.decode();
var oe = 2146435072, B = 0;
function V(e, t) {
	return B += t, B >= oe && (z = new TextDecoder("utf-8", {
		ignoreBOM: !0,
		fatal: !0
	}), z.decode(), B = t), z.decode(P().subarray(e, e + t));
}
var H = new TextEncoder();
"encodeInto" in H || (H.encodeInto = function(e, t) {
	let n = H.encode(e);
	return t.set(n), {
		read: e.length,
		written: n.length
	};
});
var U = 0, W;
function G(e, t) {
	return W = e.exports, A = null, N = null, W.__wbindgen_start(), W;
}
async function K(e, t) {
	if (typeof Response == "function" && e instanceof Response) {
		if (typeof WebAssembly.instantiateStreaming == "function") try {
			return await WebAssembly.instantiateStreaming(e, t);
		} catch (t) {
			if (e.ok && n(e.type) && e.headers.get("Content-Type") !== "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", t);
			else throw t;
		}
		let r = await e.arrayBuffer();
		return await WebAssembly.instantiate(r, t);
	} else {
		let n = await WebAssembly.instantiate(e, t);
		return n instanceof WebAssembly.Instance ? {
			instance: n,
			module: e
		} : n;
	}
	function n(e) {
		switch (e) {
			case "basic":
			case "cors":
			case "default": return !0;
		}
		return !1;
	}
}
function se(e) {
	if (W !== void 0) return W;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module: e} = e : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
	let t = D();
	return e instanceof WebAssembly.Module || (e = new WebAssembly.Module(e)), G(new WebAssembly.Instance(e, t), e);
}
async function q(e) {
	if (W !== void 0) return W;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module_or_path: e} = e : console.warn("using deprecated parameters for the initialization function; pass a single object instead"));
	let t = D();
	(typeof e == "string" || typeof Request == "function" && e instanceof Request || typeof URL == "function" && e instanceof URL) && (e = fetch(e));
	let { instance: n, module: r } = await K(await e, t);
	return G(n, r);
}
async function ce(e) {
	return W = void 0, A = null, N = null, q(e);
}
var J = "DOCX document session was aborted", le = b(C, "DOCX");
async function Y(e, t, n, s) {
	let c = r(n), l = new a({
		enabled: c.debug || c.onResourceMetrics !== void 0,
		format: "docx",
		mode: "node",
		scope: "session",
		policy: c.policy,
		onMetrics: c.onResourceMetrics,
		emitToConsole: c.debug
	});
	l.setSourceBytes(e.byteLength);
	let u, d, f;
	try {
		_(n.signal, J);
		let [r, i, a] = o(c.policy), p = w;
		u = await le(t).open(() => new p(e, r, i, a), {
			signal: n.signal,
			abortError: () => ee(J),
			disposeOnAbort: (e) => e.free()
		}), _(n.signal, J);
		let m = u.proxy;
		l.checkpoint("container ready"), d = new re(() => m);
		let h = {
			sessionId: 1,
			operationId: 1,
			generation: 1
		};
		d.open(h), f = new x((e, t) => d?.dispatch(e, t), () => void 0);
		let g, v = await s(f, h, {
			signal: n.signal,
			onUsage: (e) => {
				g = e, l.observeUsage(e);
			}
		});
		return g ??= S((e) => e(m)), l.observeUsage(g), l.checkpoint("model streamed"), await d.reset(), f.terminate(), {
			archive: m,
			result: v,
			usage: g,
			metrics: l,
			closeArchive: () => u?.close((e) => e.free())
		};
	} catch (e) {
		await d?.reset().catch(() => void 0), f?.terminate();
		try {
			u?.close((e) => e.free());
		} catch {}
		let t = i(e) ?? ne(e);
		throw l.fail(t), t;
	}
}
var X = "DOCX document session was aborted", Z = y(() => v(import.meta.url, "docx_parser_bg.wasm", "@silurus/ooxml-docx/wasm-binary"));
async function ue(e, t) {
	if (!t?.factory) throw TypeError("openDocxDocument requires a canvas factory");
	if (t.legacyDoc !== void 0) {
		let { openDocxSource: n } = await import("./docx-model-source-zYIufUjR.js");
		return n(e, t, Z);
	}
	let r = c(t.cjkFallback), i = await Y($(e), Z(), t, (e, t, n) => g(e, t, n));
	try {
		_(t.signal, X);
		let e = t.factory.createCanvas(1, 1), n = h(i.result, {
			cjkFallback: r,
			measureContext: e.getContext("2d"),
			allowFootnoteContinuation: t.allowFootnoteContinuation !== !1
		}), a = fe(t.currentDate), o = d(i.result, n, a).layoutVariants.defaultLayout, s = new Q(i.closeArchive, i.archive, i.result, n, o, t.factory, a, i.usage, i.metrics, t.signal);
		return i.metrics.observeUsage(s.resourceUsage), i.metrics.checkpoint("pagination ready"), s;
	} catch (e) {
		try {
			i.closeArchive();
		} catch {}
		let t = n(e) ?? e;
		throw i.metrics.fail(t), t;
	}
}
async function de(e, t = {}) {
	if (t.legacyDoc !== void 0) {
		let { materializeDocxSource: n } = await import("./docx-model-source-zYIufUjR.js");
		return n(e, t, Z);
	}
	return te(async () => {
		let n = await Y($(e), Z(), t, (e, t, n) => m(e, t, n)), r = !1;
		return {
			acquired: n,
			markSucceeded: () => {
				r = !0;
			},
			close: async () => {
				try {
					n.closeArchive(), r && n.metrics.succeed({ documents: 1 });
				} catch (e) {
					throw n.metrics.fail(e), e;
				}
			}
		};
	}, async ({ acquired: e, markSucceeded: t }) => {
		try {
			let n = p(e.result);
			return e.metrics.checkpoint("document materialized", e.usage), t(), n;
		} catch (t) {
			throw e.metrics.fail(t), t;
		}
	});
}
var Q = class {
	closeArchive;
	archive;
	factory;
	defaultCurrentDateMs;
	metrics;
	signal;
	pageCount;
	sizes;
	lastResourceUsage;
	state;
	renderTail = Promise.resolve();
	pagesStarted = !1;
	closed = !1;
	closePromise;
	resourceFailure = null;
	fetchImage = async (e, t) => {
		let n = this.archive.extract_image(e);
		return new Blob([n], { type: t });
	};
	constructor(e, t, n, r, i, a, o, s, c, l) {
		this.closeArchive = e, this.archive = t, this.factory = a, this.defaultCurrentDateMs = o, this.metrics = c, this.signal = l, this.state = {
			source: n,
			services: r
		}, this.pageCount = i.pages.length, this.lastResourceUsage = s, this.sizes = Object.freeze(i.pages.map((e) => Object.freeze({
			widthPt: e.geometry.widthPt,
			heightPt: e.geometry.heightPt
		})));
	}
	get resourceUsage() {
		return this.closed ? this.lastResourceUsage : this.refreshResourceUsage();
	}
	refreshResourceUsage() {
		try {
			this.lastResourceUsage = s(this.archive.resource_usage()), this.metrics.observeUsage(this.lastResourceUsage);
		} catch {}
		return this.lastResourceUsage;
	}
	pageSize(e) {
		let t = this.sizes[e];
		if (!t) throw RangeError(`DOCX page index ${e} out of range`);
		return t;
	}
	[Symbol.asyncIterator]() {
		return this.pages();
	}
	renderPage(e, r = {}) {
		return this.closed ? Promise.reject(/* @__PURE__ */ Error("DOCX document session is closed")) : this.resourceFailure ? Promise.reject(this.resourceFailure) : (this.pageSize(e), this.enqueueRender(async () => {
			_(this.signal, X);
			let t = this.requireState(), n = this.factory.createCanvas(1, 1);
			return await ie(this.factory, () => f(t.source, n, e, {
				...r,
				currentDate: this.defaultCurrentDateMs,
				defaultCurrentDateMs: this.defaultCurrentDateMs,
				layoutServices: t.services,
				fetchImage: this.fetchImage
			})), _(this.signal, X), n;
		}).catch((e) => {
			let r = n(e) ?? e;
			throw r instanceof t && (this.resourceFailure ??= r), this.metrics.fail(r), r;
		}));
	}
	async *pages(e = {}) {
		if (this.closed) throw Error("DOCX document session is closed");
		if (this.pagesStarted) throw Error("DOCX page stream is one-pass and was already consumed");
		this.pagesStarted = !0;
		let t;
		try {
			for (let t = 0; t < this.pageCount; t += 1) {
				let n = await this.renderPage(t, e), r = this.pageSize(t);
				yield {
					pageIndex: t,
					...r,
					canvas: n
				};
			}
		} catch (e) {
			throw t = n(e) ?? e, t;
		} finally {
			try {
				await this.close();
			} catch (e) {
				if (t === void 0) throw e;
			}
		}
	}
	close() {
		return this.closePromise ? this.closePromise : (this.refreshResourceUsage(), this.closed = !0, this.closePromise = this.release(), this.closePromise);
	}
	enqueueRender(e) {
		let t = this.renderTail.then(e, e);
		return this.renderTail = t.then(() => void 0, () => void 0), t;
	}
	async release() {
		await this.renderTail, l(this.fetchImage), u(this.fetchImage), this.state = null;
		try {
			this.closeArchive();
		} catch (e) {
			let t = n(e) ?? e;
			throw this.metrics.fail(t), t;
		}
		this.metrics.checkpoint("document session closed", this.lastResourceUsage), this.metrics.succeed({ pages: this.pageCount });
	}
	requireState() {
		if (!this.state) throw Error("DOCX document session is closed");
		return this.state;
	}
};
function fe(e) {
	let t = e instanceof Date ? e.getTime() : e ?? Date.now();
	if (!Number.isFinite(t)) throw RangeError("currentDate must resolve to finite epoch milliseconds");
	return t;
}
function $(e) {
	return e instanceof Uint8Array ? e : new Uint8Array(e);
}
export { Y as i, de as n, ue as r, Q as t };
