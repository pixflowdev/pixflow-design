import { t as e } from "./chunk-D5OxutzX.js";
import { a as t, u as n } from "./slide-pull-client-3g6TxaKa.js";
import { wo as r } from "./plot-area-frame-DNYMd9Pf.js";
import { A as i, G as a, I as o, J as s, K as c, M as l, P as u, R as ee, U as d, W as f, X as p, _n as m, j as h } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { n as g, t as _ } from "./abort-JztSoyw2.js";
import { S as v } from "./worksheet-pull-client-BudfclVl.js";
import { t as y } from "./wasm-runtime-generation-D97yoAXz.js";
function b(e) {
	try {
		return d(e((e) => e.slide_cursor_resource_usage()));
	} catch (e) {
		if (String(e).includes("slide cursor usage is unavailable")) return;
		throw e;
	}
}
function x(e, t, n, r, i) {
	let a, o;
	try {
		if (i) {
			if (!r) throw Error("slide payload is missing before acknowledgement");
			let t = i(n, r, b(e));
			typeof t == "function" ? a = t : t && ({rollback: a, commit: o} = t);
		}
		e((e) => e.acknowledge_slide(t.operationId, t.generation)), o?.();
	} catch (e) {
		try {
			a?.();
		} catch {}
		throw e;
	}
}
var S = "ooxml-pull-resetting", C = "ooxml-pull-reset-failed", w = class {
	archive;
	acceptSlide;
	executeArchive;
	coordinatorGeneration = new l();
	sessions = /* @__PURE__ */ new Map();
	pendingOpens = /* @__PURE__ */ new Map();
	operationTail = Promise.resolve();
	resourceFailure;
	lifecycleState = "ready";
	resetBarrier;
	resetIdentities = /* @__PURE__ */ new Map();
	constructor(e, t, n = (e) => e(this.requireArchive())) {
		this.archive = e, this.acceptSlide = t, this.executeArchive = n;
	}
	get coordinator() {
		return this.coordinatorGeneration;
	}
	reserveOpen(e) {
		if (this.assertReady(), T(e), this.pendingOpens.has(e.sessionId) || this.sessions.has(e.sessionId)) throw Error("slide pull session id is already reserved");
		this.pendingOpens.set(e.sessionId, {
			identity: e,
			canceled: !1
		});
	}
	abandonOpen(e) {
		this.pendingOpens.delete(e);
	}
	get pendingOpenCount() {
		return this.pendingOpens.size;
	}
	async open(e, t) {
		if (this.assertReady(), this.resourceFailure) throw this.resourceFailure;
		if (!Number.isSafeInteger(e) || e < 0) throw RangeError("slide index must be a non-negative safe integer");
		let n = this.pendingOpens.get(t.sessionId);
		if (!n || !E(n.identity, t)) throw Error("slide pull session open reservation is stale or missing");
		let r, i = new Promise((e) => {
			r = e;
		}), a = this.operationTail.then(() => this.coordinator.enqueue(async () => {
			if (n.canceled) throw Error("slide pull session open was canceled");
			let i, a = !1, o = new h({
				...t,
				maxByteCredit: m,
				coordinator: this.coordinator,
				driver: {
					pull: (n) => {
						let r;
						try {
							r = this.executeArchive((r) => r.pull_slide(e, t.operationId, t.generation, n));
						} catch (e) {
							throw p(e, n, m) || (this.latchResourceFailure(e), e);
						}
						let o = v(r);
						return this.acceptSlide && (i = JSON.parse(new TextDecoder().decode(new Uint8Array(o)))), a = !0, {
							payload: o,
							byteLength: o.byteLength,
							done: !0,
							transfer: [o]
						};
					},
					measureChunk: ({ payload: e }) => e.byteLength,
					acknowledge: () => {
						if (!a) throw Error("slide unit is not awaiting acknowledgement");
						try {
							x(this.executeArchive, t, e, i, this.acceptSlide);
						} catch (e) {
							throw this.latchResourceFailure(e), e;
						}
						a = !1, i = void 0, this.sessions.delete(t.sessionId), r();
					},
					cancel: async () => {
						try {
							this.archive() && await this.executeArchive((e) => e.cancel_slide());
						} finally {
							i = void 0, a = !1, this.sessions.delete(t.sessionId), r();
						}
					},
					close: async () => {
						try {
							this.archive() && await this.executeArchive((e) => e.cancel_slide());
						} finally {
							i = void 0, a = !1, this.sessions.delete(t.sessionId), r();
						}
					},
					resourceUsage: () => {
						try {
							return this.readResourceUsage();
						} catch (e) {
							throw this.latchResourceFailure(e), e;
						}
					}
				}
			});
			this.sessions.set(t.sessionId, {
				host: o,
				identity: t
			}), this.pendingOpens.delete(t.sessionId);
		}));
		this.operationTail = a.then(() => i, () => void 0);
		try {
			await a;
		} catch (e) {
			throw this.pendingOpens.delete(t.sessionId), r(), e;
		}
	}
	async postOpenedSafely(e, t, n) {
		if (this.lifecycleState !== "ready") {
			try {
				n(this.lifecycleError());
			} catch {}
			return;
		}
		try {
			t();
		} catch (t) {
			await this.closeIdentity(e);
			try {
				n(t);
			} catch {}
		}
	}
	dispatch(e, t) {
		if (this.lifecycleState !== "ready") return t(this.responseDuringReset(e)), Promise.resolve();
		let n = this.sessions.get(e.sessionId);
		if (n) return n.host.dispatch(e, t);
		let r = this.pendingOpens.get(e.sessionId);
		if (r && (e.kind === "cancel" || e.kind === "close")) {
			let n = E(r.identity, e);
			return n && (r.canceled = !0), t(n ? {
				protocol: i,
				kind: "accepted",
				sessionId: e.sessionId,
				operationId: e.operationId,
				generation: e.generation,
				requestId: e.requestId,
				command: e.kind
			} : this.staleLifecycleResponse(e)), Promise.resolve();
		}
		return e.kind === "cancel" || e.kind === "close" ? (t({
			protocol: i,
			kind: "accepted",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			command: e.kind
		}), Promise.resolve()) : (t({
			protocol: i,
			kind: "error",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			error: s(/* @__PURE__ */ Error("slide pull session is not open"))
		}), Promise.resolve());
	}
	async dispatchSafely(e, t) {
		try {
			await this.dispatch(e, t);
		} catch (n) {
			try {
				t({
					protocol: i,
					kind: "error",
					sessionId: e.sessionId,
					operationId: e.operationId,
					generation: e.generation,
					requestId: e.requestId,
					error: s(n)
				});
			} catch {}
		}
	}
	run(e) {
		if (this.lifecycleState !== "ready") return Promise.reject(this.lifecycleError());
		let t = this.operationTail.then(() => this.coordinator.enqueue(async () => {
			if (this.resourceFailure) throw this.resourceFailure;
			return e();
		})).catch((e) => {
			throw this.latchResourceFailure(e), e;
		});
		return this.operationTail = t.then(() => void 0, () => void 0), t;
	}
	reset() {
		if (this.resetBarrier) return this.resetBarrier;
		this.lifecycleState = "resetting", this.captureResetIdentities();
		let e = this.performReset().then(() => {
			this.resetIdentities.clear(), this.lifecycleState = "ready";
		}, (e) => {
			throw this.lifecycleState = "reset-failed", e;
		}).finally(() => {
			this.resetBarrier === e && (this.resetBarrier = void 0);
		});
		return this.resetBarrier = e, e;
	}
	async performReset() {
		for (let e of this.pendingOpens.values()) e.canceled = !0;
		let e = 1;
		for (let { host: t, identity: n } of [...this.sessions.values()]) {
			let r;
			if (await t.dispatch({
				protocol: i,
				kind: "close",
				...n,
				requestId: e++
			}, (e) => {
				e.kind === "error" && (r = f(e.error));
			}), r) throw r;
		}
		this.sessions.clear(), await this.operationTail, this.pendingOpens.clear(), this.archive() && await this.executeArchive((e) => e.close_presentation_session()), this.coordinatorGeneration = new l(), this.resourceFailure = void 0;
	}
	assertReady() {
		if (this.lifecycleState !== "ready") throw this.lifecycleError();
	}
	lifecycleError() {
		let e = this.lifecycleState === "reset-failed", t = /* @__PURE__ */ Error(e ? "slide pull worker reset failed; retry reset before new work" : "slide pull worker reset is in progress");
		return t.name = "PullSessionLifecycleError", Object.assign(t, { code: e ? C : S });
	}
	captureResetIdentities() {
		for (let { identity: e } of this.sessions.values()) this.resetIdentities.set(e.sessionId, e);
		for (let { identity: e } of this.pendingOpens.values()) this.resetIdentities.set(e.sessionId, e);
	}
	responseDuringReset(e) {
		if (e.kind === "cancel" || e.kind === "close") {
			let t = this.resetIdentities.get(e.sessionId);
			return t && !E(t, e) ? this.staleLifecycleResponse(e) : {
				protocol: i,
				kind: "accepted",
				sessionId: e.sessionId,
				operationId: e.operationId,
				generation: e.generation,
				requestId: e.requestId,
				command: e.kind
			};
		}
		return {
			protocol: i,
			kind: "error",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			error: s(this.lifecycleError())
		};
	}
	requireArchive() {
		let e = this.archive();
		if (!e) throw Error("Presentation not loaded");
		return e;
	}
	async closeIdentity(e) {
		if (this.lifecycleState !== "ready") return;
		let t = this.sessions.get(e.sessionId);
		if (t) {
			await t.host.dispatch({
				protocol: i,
				kind: "close",
				...e,
				requestId: 1
			}, () => void 0);
			return;
		}
		let n = this.pendingOpens.get(e.sessionId);
		n && E(n.identity, e) && (n.canceled = !0);
	}
	readResourceUsage() {
		return b(this.executeArchive);
	}
	latchResourceFailure(e) {
		let t = e instanceof r ? e : a(e);
		t && (this.resourceFailure ??= t);
	}
	staleLifecycleResponse(e) {
		return {
			protocol: i,
			kind: "error",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			error: {
				message: "stale lifecycle targets another slide operation",
				errorName: "PullSessionProtocolError",
				code: "ooxml-stale-lifecycle"
			}
		};
	}
};
function T(e) {
	if (!Number.isSafeInteger(e.sessionId) || e.sessionId <= 0) throw RangeError("session id must be a positive safe integer");
	if (!Number.isSafeInteger(e.operationId) || e.operationId <= 0) throw RangeError("operation id must be a positive safe integer");
	if (!Number.isSafeInteger(e.generation) || e.generation <= 0) throw RangeError("generation must be a positive safe integer");
}
function E(e, t) {
	return e.sessionId === t.sessionId && e.operationId === t.operationId && e.generation === t.generation;
}
var D = /* @__PURE__ */ e({
	PptxArchive: () => O,
	default: () => Q,
	extract_font: () => te,
	extract_image: () => ne,
	extract_media: () => k,
	initSync: () => ie,
	parse_pptx: () => A,
	pptx_to_markdown: () => j,
	reinit: () => ae
}), O = class {
	__destroy_into_raw() {
		let e = this.__wbg_ptr;
		return this.__wbg_ptr = 0, N.unregister(this), e;
	}
	free() {
		let e = this.__destroy_into_raw();
		X.__wbg_pptxarchive_free(e, 0);
	}
	acknowledge_slide(e, t) {
		let n = X.pptxarchive_acknowledge_slide(this.__wbg_ptr, e, t);
		if (n[1]) throw U(n[0]);
	}
	assert_healthy() {
		let e = X.pptxarchive_assert_healthy(this.__wbg_ptr);
		if (e[1]) throw U(e[0]);
	}
	cancel_slide() {
		X.pptxarchive_cancel_slide(this.__wbg_ptr);
	}
	close_presentation_session() {
		X.pptxarchive_close_presentation_session(this.__wbg_ptr);
	}
	extract_font(e) {
		let t = H(e, X.__wbindgen_malloc, X.__wbindgen_realloc), n = Y, r = X.pptxarchive_extract_font(this.__wbg_ptr, t, n);
		if (r[3]) throw U(r[2]);
		var i = P(r[0], r[1]).slice();
		return X.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	extract_image(e) {
		let t = H(e, X.__wbindgen_malloc, X.__wbindgen_realloc), n = Y, r = X.pptxarchive_extract_image(this.__wbg_ptr, t, n);
		if (r[3]) throw U(r[2]);
		var i = P(r[0], r[1]).slice();
		return X.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	extract_media(e) {
		let t = H(e, X.__wbindgen_malloc, X.__wbindgen_realloc), n = Y, r = X.pptxarchive_extract_media(this.__wbg_ptr, t, n);
		if (r[3]) throw U(r[2]);
		var i = P(r[0], r[1]).slice();
		return X.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	constructor(e, t, n, r) {
		let i = V(e, X.__wbindgen_malloc), a = Y, o = X.pptxarchive_new(i, a, !B(t), B(t) ? BigInt(0) : t, !B(n), B(n) ? BigInt(0) : n, !B(r), B(r) ? BigInt(0) : r);
		if (o[2]) throw U(o[1]);
		return this.__wbg_ptr = o[0] >>> 0, N.register(this, this.__wbg_ptr, this), this;
	}
	parse() {
		let e = X.pptxarchive_parse(this.__wbg_ptr);
		if (e[3]) throw U(e[2]);
		var t = P(e[0], e[1]).slice();
		return X.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	presentation_bootstrap() {
		let e = X.pptxarchive_presentation_bootstrap(this.__wbg_ptr);
		if (e[3]) throw U(e[2]);
		var t = P(e[0], e[1]).slice();
		return X.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	pull_slide(e, t, n, r) {
		let i = X.pptxarchive_pull_slide(this.__wbg_ptr, e, t, n, r);
		if (i[3]) throw U(i[2]);
		var a = P(i[0], i[1]).slice();
		return X.__wbindgen_free(i[0], i[1] * 1, 1), a;
	}
	resource_usage() {
		let e = X.pptxarchive_resource_usage(this.__wbg_ptr);
		if (e[3]) throw U(e[2]);
		var t = P(e[0], e[1]).slice();
		return X.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	slide_cursor_resource_usage() {
		let e = X.pptxarchive_slide_cursor_resource_usage(this.__wbg_ptr);
		if (e[3]) throw U(e[2]);
		var t = P(e[0], e[1]).slice();
		return X.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	to_markdown() {
		let e, t;
		try {
			let i = X.pptxarchive_to_markdown(this.__wbg_ptr);
			var n = i[0], r = i[1];
			if (i[3]) throw n = 0, r = 0, U(i[2]);
			return e = n, t = r, L(n, r);
		} finally {
			X.__wbindgen_free(e, t, 1);
		}
	}
};
Symbol.dispose && (O.prototype[Symbol.dispose] = O.prototype.free);
function te(e, t, n, r) {
	let i = V(e, X.__wbindgen_malloc), a = Y, o = H(t, X.__wbindgen_malloc, X.__wbindgen_realloc), s = Y, c = X.extract_font(i, a, o, s, !B(n), B(n) ? BigInt(0) : n, !B(r), B(r) ? BigInt(0) : r);
	if (c[3]) throw U(c[2]);
	var l = P(c[0], c[1]).slice();
	return X.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function ne(e, t, n, r) {
	let i = V(e, X.__wbindgen_malloc), a = Y, o = H(t, X.__wbindgen_malloc, X.__wbindgen_realloc), s = Y, c = X.extract_image(i, a, o, s, !B(n), B(n) ? BigInt(0) : n, !B(r), B(r) ? BigInt(0) : r);
	if (c[3]) throw U(c[2]);
	var l = P(c[0], c[1]).slice();
	return X.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function k(e, t, n, r) {
	let i = V(e, X.__wbindgen_malloc), a = Y, o = H(t, X.__wbindgen_malloc, X.__wbindgen_realloc), s = Y, c = X.extract_media(i, a, o, s, !B(n), B(n) ? BigInt(0) : n, !B(r), B(r) ? BigInt(0) : r);
	if (c[3]) throw U(c[2]);
	var l = P(c[0], c[1]).slice();
	return X.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function A(e, t, n) {
	let r = V(e, X.__wbindgen_malloc), i = Y, a = X.parse_pptx(r, i, !B(t), B(t) ? BigInt(0) : t, !B(n), B(n) ? BigInt(0) : n);
	if (a[3]) throw U(a[2]);
	var o = P(a[0], a[1]).slice();
	return X.__wbindgen_free(a[0], a[1] * 1, 1), o;
}
function j(e, t, n) {
	let r, i;
	try {
		let s = V(e, X.__wbindgen_malloc), c = Y, l = X.pptx_to_markdown(s, c, !B(t), B(t) ? BigInt(0) : t, !B(n), B(n) ? BigInt(0) : n);
		var a = l[0], o = l[1];
		if (l[3]) throw a = 0, o = 0, U(l[2]);
		return r = a, i = o, L(a, o);
	} finally {
		X.__wbindgen_free(r, i, 1);
	}
}
function M() {
	return {
		__proto__: null,
		"./pptx_parser_bg.js": {
			__proto__: null,
			__wbg___wbindgen_throw_6b64449b9b9ed33c: function(e, t) {
				throw Error(L(e, t));
			},
			__wbg_error_a6fa202b58aa1cd3: function(e, t) {
				let n, r;
				try {
					n = e, r = t, console.error(L(e, t));
				} finally {
					X.__wbindgen_free(n, r, 1);
				}
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ Error();
			},
			__wbg_stack_3b0d974bbf31e44f: function(e, t) {
				let n = t.stack, r = H(n, X.__wbindgen_malloc, X.__wbindgen_realloc), i = Y;
				I().setInt32(e + 4, i, !0), I().setInt32(e + 0, r, !0);
			},
			__wbindgen_cast_0000000000000001: function(e, t) {
				return L(e, t);
			},
			__wbindgen_init_externref_table: function() {
				let e = X.__wbindgen_externrefs, t = e.grow(4);
				e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, !0), e.set(t + 3, !1);
			}
		}
	};
}
var N = typeof FinalizationRegistry > "u" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((e) => X.__wbg_pptxarchive_free(e >>> 0, 1));
function P(e, t) {
	return e >>>= 0, z().subarray(e / 1, e / 1 + t);
}
var F = null;
function I() {
	return (F === null || F.buffer.detached === !0 || F.buffer.detached === void 0 && F.buffer !== X.memory.buffer) && (F = new DataView(X.memory.buffer)), F;
}
function L(e, t) {
	return e >>>= 0, q(e, t);
}
var R = null;
function z() {
	return (R === null || R.byteLength === 0) && (R = new Uint8Array(X.memory.buffer)), R;
}
function B(e) {
	return e == null;
}
function V(e, t) {
	let n = t(e.length * 1, 1) >>> 0;
	return z().set(e, n / 1), Y = e.length, n;
}
function H(e, t, n) {
	if (n === void 0) {
		let n = J.encode(e), r = t(n.length, 1) >>> 0;
		return z().subarray(r, r + n.length).set(n), Y = n.length, r;
	}
	let r = e.length, i = t(r, 1) >>> 0, a = z(), o = 0;
	for (; o < r; o++) {
		let t = e.charCodeAt(o);
		if (t > 127) break;
		a[i + o] = t;
	}
	if (o !== r) {
		o !== 0 && (e = e.slice(o)), i = n(i, r, r = o + e.length * 3, 1) >>> 0;
		let t = z().subarray(i + o, i + r), a = J.encodeInto(e, t);
		o += a.written, i = n(i, r, o, 1) >>> 0;
	}
	return Y = o, i;
}
function U(e) {
	let t = X.__wbindgen_externrefs.get(e);
	return X.__externref_table_dealloc(e), t;
}
var W = new TextDecoder("utf-8", {
	ignoreBOM: !0,
	fatal: !0
});
W.decode();
var G = 2146435072, K = 0;
function q(e, t) {
	return K += t, K >= G && (W = new TextDecoder("utf-8", {
		ignoreBOM: !0,
		fatal: !0
	}), W.decode(), K = t), W.decode(z().subarray(e, e + t));
}
var J = new TextEncoder();
"encodeInto" in J || (J.encodeInto = function(e, t) {
	let n = J.encode(e);
	return t.set(n), {
		read: e.length,
		written: n.length
	};
});
var Y = 0, X;
function Z(e, t) {
	return X = e.exports, F = null, R = null, X.__wbindgen_start(), X;
}
async function re(e, t) {
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
function ie(e) {
	if (X !== void 0) return X;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module: e} = e : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
	let t = M();
	return e instanceof WebAssembly.Module || (e = new WebAssembly.Module(e)), Z(new WebAssembly.Instance(e, t), e);
}
async function Q(e) {
	if (X !== void 0) return X;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module_or_path: e} = e : console.warn("using deprecated parameters for the initialization function; pass a single object instead"));
	let t = M();
	(typeof e == "string" || typeof Request == "function" && e instanceof Request || typeof URL == "function" && e instanceof URL) && (e = fetch(e));
	let { instance: n, module: r } = await re(await e, t);
	return Z(n, r);
}
async function ae(e) {
	return X = void 0, F = null, R = null, Q(e);
}
var $ = "PPTX presentation session was aborted", oe = y(D, "PPTX");
async function se(e, n, r = {}) {
	let i = o(r), a = new u({
		enabled: i.debug || i.onResourceMetrics !== void 0,
		format: "pptx",
		mode: "node",
		scope: "session",
		policy: i.policy,
		onMetrics: i.onResourceMetrics,
		emitToConsole: i.debug
	});
	a.setSourceBytes(e.byteLength);
	let s;
	try {
		g(r.signal, $);
		let [o, c, l] = ee(i.policy), u = O;
		s = await oe(n).open(() => new u(e, o, c, l), {
			signal: r.signal,
			abortError: () => _($),
			disposeOnAbort: (e) => e.free()
		}), g(r.signal, $);
		let d = s.proxy, f = t(JSON.parse(new TextDecoder().decode(d.presentation_bootstrap())));
		return a.checkpoint("presentation bootstrap ready"), {
			archive: d,
			bootstrap: f,
			metrics: a,
			closeArchive: () => s?.close((e) => e.free())
		};
	} catch (e) {
		try {
			s?.close((e) => e.free());
		} catch {}
		let t = c(e) ?? e;
		throw a.fail(t), t;
	}
}
var ce = /* @__PURE__ */ e({ renderSlideWithEmbeddedFonts: () => n });
export { b as i, se as n, w as r, ce as t };
