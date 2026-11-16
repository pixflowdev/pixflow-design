import { t as e } from "./chunk-D5OxutzX.js";
import { G as t, I as n, K as r, P as i, R as a, U as o } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { n as s, t as c } from "./abort-JztSoyw2.js";
import { b as l, c as u, d, f, g as p, l as m, p as h, r as g, s as _, t as v, u as y, x as ee, y as b } from "./worksheet-pull-client-BudfclVl.js";
import { n as x, r as S, t as te } from "./wasm-loader-KAOyLXzf.js";
import { t as ne } from "./wasm-runtime-generation-D97yoAXz.js";
import { t as re } from "./in-process-pull-transport-BPJ7M0uC.js";
function ie(e, t) {
	return {
		workbook: e(),
		usage: o(t())
	};
}
var C = /* @__PURE__ */ e({
	XlsxArchive: () => w,
	default: () => W,
	extract_image: () => ae,
	initSync: () => ue,
	parse_xlsx: () => oe,
	reinit: () => de,
	xlsx_to_markdown: () => se
}), w = class {
	__destroy_into_raw() {
		let e = this.__wbg_ptr;
		return this.__wbg_ptr = 0, E.unregister(this), e;
	}
	free() {
		let e = this.__destroy_into_raw();
		V.__wbg_xlsxarchive_free(e, 0);
	}
	acknowledge_sheet_cursor_terminal() {
		let e = V.xlsxarchive_acknowledge_sheet_cursor_terminal(this.__wbg_ptr);
		if (e[1]) throw I(e[0]);
	}
	assert_healthy() {
		let e = V.xlsxarchive_assert_healthy(this.__wbg_ptr);
		if (e[1]) throw I(e[0]);
	}
	cancel_sheet_cursor() {
		V.xlsxarchive_cancel_sheet_cursor(this.__wbg_ptr);
	}
	close_sheet_cursor() {
		V.xlsxarchive_close_sheet_cursor(this.__wbg_ptr);
	}
	extract_image(e) {
		let t = F(e, V.__wbindgen_malloc, V.__wbindgen_realloc), n = B, r = V.xlsxarchive_extract_image(this.__wbg_ptr, t, n);
		if (r[3]) throw I(r[2]);
		var i = D(r[0], r[1]).slice();
		return V.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	constructor(e, t, n, r) {
		let i = P(e, V.__wbindgen_malloc), a = B, o = V.xlsxarchive_new(i, a, !N(t), N(t) ? BigInt(0) : t, !N(n), N(n) ? BigInt(0) : n, !N(r), N(r) ? BigInt(0) : r);
		if (o[2]) throw I(o[1]);
		return this.__wbg_ptr = o[0] >>> 0, E.register(this, this.__wbg_ptr, this), this;
	}
	open_sheet_cursor(e, t) {
		let n = F(t, V.__wbindgen_malloc, V.__wbindgen_realloc), r = B, i = V.xlsxarchive_open_sheet_cursor(this.__wbg_ptr, e, n, r);
		if (i[1]) throw I(i[0]);
	}
	parse() {
		let e = V.xlsxarchive_parse(this.__wbg_ptr);
		if (e[3]) throw I(e[2]);
		var t = D(e[0], e[1]).slice();
		return V.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	pull_sheet_cursor(e) {
		let t = V.xlsxarchive_pull_sheet_cursor(this.__wbg_ptr, e);
		if (t[3]) throw I(t[2]);
		var n = D(t[0], t[1]).slice();
		return V.__wbindgen_free(t[0], t[1] * 1, 1), n;
	}
	resource_usage() {
		let e = V.xlsxarchive_resource_usage(this.__wbg_ptr);
		if (e[3]) throw I(e[2]);
		var t = D(e[0], e[1]).slice();
		return V.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	set_worksheet_limits(e, t, n, r) {
		let i = V.xlsxarchive_set_worksheet_limits(this.__wbg_ptr, e, t, n, r);
		if (i[1]) throw I(i[0]);
	}
	sheet_cursor_pull_finished() {
		return V.xlsxarchive_sheet_cursor_pull_finished(this.__wbg_ptr) !== 0;
	}
	sheet_cursor_resource_usage() {
		let e = V.xlsxarchive_sheet_cursor_resource_usage(this.__wbg_ptr);
		if (e[3]) throw I(e[2]);
		var t = D(e[0], e[1]).slice();
		return V.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	to_markdown() {
		let e, t;
		try {
			let i = V.xlsxarchive_to_markdown(this.__wbg_ptr);
			var n = i[0], r = i[1];
			if (i[3]) throw n = 0, r = 0, I(i[2]);
			return e = n, t = r, A(n, r);
		} finally {
			V.__wbindgen_free(e, t, 1);
		}
	}
};
Symbol.dispose && (w.prototype[Symbol.dispose] = w.prototype.free);
function ae(e, t, n, r) {
	let i = P(e, V.__wbindgen_malloc), a = B, o = F(t, V.__wbindgen_malloc, V.__wbindgen_realloc), s = B, c = V.extract_image(i, a, o, s, !N(n), N(n) ? BigInt(0) : n, !N(r), N(r) ? BigInt(0) : r);
	if (c[3]) throw I(c[2]);
	var l = D(c[0], c[1]).slice();
	return V.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function oe(e, t, n) {
	let r = P(e, V.__wbindgen_malloc), i = B, a = V.parse_xlsx(r, i, !N(t), N(t) ? BigInt(0) : t, !N(n), N(n) ? BigInt(0) : n);
	if (a[3]) throw I(a[2]);
	var o = D(a[0], a[1]).slice();
	return V.__wbindgen_free(a[0], a[1] * 1, 1), o;
}
function se(e, t, n) {
	let r, i;
	try {
		let s = P(e, V.__wbindgen_malloc), c = B, l = V.xlsx_to_markdown(s, c, !N(t), N(t) ? BigInt(0) : t, !N(n), N(n) ? BigInt(0) : n);
		var a = l[0], o = l[1];
		if (l[3]) throw a = 0, o = 0, I(l[2]);
		return r = a, i = o, A(a, o);
	} finally {
		V.__wbindgen_free(r, i, 1);
	}
}
function T() {
	return {
		__proto__: null,
		"./xlsx_parser_bg.js": {
			__proto__: null,
			__wbg___wbindgen_throw_6b64449b9b9ed33c: function(e, t) {
				throw Error(A(e, t));
			},
			__wbg_error_a6fa202b58aa1cd3: function(e, t) {
				let n, r;
				try {
					n = e, r = t, console.error(A(e, t));
				} finally {
					V.__wbindgen_free(n, r, 1);
				}
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ Error();
			},
			__wbg_stack_3b0d974bbf31e44f: function(e, t) {
				let n = t.stack, r = F(n, V.__wbindgen_malloc, V.__wbindgen_realloc), i = B;
				k().setInt32(e + 4, i, !0), k().setInt32(e + 0, r, !0);
			},
			__wbindgen_cast_0000000000000001: function(e, t) {
				return A(e, t);
			},
			__wbindgen_init_externref_table: function() {
				let e = V.__wbindgen_externrefs, t = e.grow(4);
				e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, !0), e.set(t + 3, !1);
			}
		}
	};
}
var E = typeof FinalizationRegistry > "u" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((e) => V.__wbg_xlsxarchive_free(e >>> 0, 1));
function D(e, t) {
	return e >>>= 0, M().subarray(e / 1, e / 1 + t);
}
var O = null;
function k() {
	return (O === null || O.buffer.detached === !0 || O.buffer.detached === void 0 && O.buffer !== V.memory.buffer) && (O = new DataView(V.memory.buffer)), O;
}
function A(e, t) {
	return e >>>= 0, le(e, t);
}
var j = null;
function M() {
	return (j === null || j.byteLength === 0) && (j = new Uint8Array(V.memory.buffer)), j;
}
function N(e) {
	return e == null;
}
function P(e, t) {
	let n = t(e.length * 1, 1) >>> 0;
	return M().set(e, n / 1), B = e.length, n;
}
function F(e, t, n) {
	if (n === void 0) {
		let n = z.encode(e), r = t(n.length, 1) >>> 0;
		return M().subarray(r, r + n.length).set(n), B = n.length, r;
	}
	let r = e.length, i = t(r, 1) >>> 0, a = M(), o = 0;
	for (; o < r; o++) {
		let t = e.charCodeAt(o);
		if (t > 127) break;
		a[i + o] = t;
	}
	if (o !== r) {
		o !== 0 && (e = e.slice(o)), i = n(i, r, r = o + e.length * 3, 1) >>> 0;
		let t = M().subarray(i + o, i + r), a = z.encodeInto(e, t);
		o += a.written, i = n(i, r, o, 1) >>> 0;
	}
	return B = o, i;
}
function I(e) {
	let t = V.__wbindgen_externrefs.get(e);
	return V.__externref_table_dealloc(e), t;
}
var L = new TextDecoder("utf-8", {
	ignoreBOM: !0,
	fatal: !0
});
L.decode();
var ce = 2146435072, R = 0;
function le(e, t) {
	return R += t, R >= ce && (L = new TextDecoder("utf-8", {
		ignoreBOM: !0,
		fatal: !0
	}), L.decode(), R = t), L.decode(M().subarray(e, e + t));
}
var z = new TextEncoder();
"encodeInto" in z || (z.encodeInto = function(e, t) {
	let n = z.encode(e);
	return t.set(n), {
		read: e.length,
		written: n.length
	};
});
var B = 0, V;
function H(e, t) {
	return V = e.exports, O = null, j = null, V.__wbindgen_start(), V;
}
async function U(e, t) {
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
function ue(e) {
	if (V !== void 0) return V;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module: e} = e : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
	let t = T();
	return e instanceof WebAssembly.Module || (e = new WebAssembly.Module(e)), H(new WebAssembly.Instance(e, t), e);
}
async function W(e) {
	if (V !== void 0) return V;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module_or_path: e} = e : console.warn("using deprecated parameters for the initialization function; pass a single object instead"));
	let t = T();
	(typeof e == "string" || typeof Request == "function" && e instanceof Request || typeof URL == "function" && e instanceof URL) && (e = fetch(e));
	let { instance: n, module: r } = await U(await e, t);
	return H(n, r);
}
async function de(e) {
	return V = void 0, O = null, j = null, W(e);
}
var G = "XLSX workbook session was aborted", fe = ne(C, "XLSX");
async function K(e, t, o = {}) {
	let u = l(o), d = n(o), f = new i({
		enabled: d.debug || d.onResourceMetrics !== void 0,
		format: "xlsx",
		mode: "node",
		scope: "session",
		policy: d.policy,
		formatLimits: { xlsxWorksheetLimits: { ...u.worksheet } },
		onMetrics: d.onResourceMetrics,
		emitToConsole: d.debug
	});
	f.setSourceBytes(e.byteLength);
	let p;
	try {
		s(o.signal, G);
		let [n, r, i] = a(d.policy), l = w;
		p = await fe(t).open(() => new l(e, n, r, i), {
			signal: o.signal,
			abortError: () => c(G),
			disposeOnAbort: (e) => e.free()
		}), s(o.signal, G);
		let m = p.proxy, [h, g, _, v] = ee(u);
		m.set_worksheet_limits(h, g, _, v);
		let { workbook: y, usage: b } = ie(() => JSON.parse(new TextDecoder().decode(m.parse())), () => m.resource_usage());
		return f.observeUsage(b), f.checkpoint("workbook index ready"), {
			archive: m,
			workbookIndex: y,
			usage: b,
			metrics: f,
			worksheetPolicy: u,
			closeArchive: () => p?.close((e) => e.free())
		};
	} catch (e) {
		try {
			p?.close((e) => e.free());
		} catch {}
		let t = r(e) ?? e;
		throw f.fail(t), t;
	}
}
var q = te(() => x(import.meta.url, "xlsx_parser_bg.wasm", "@silurus/ooxml-xlsx/wasm-binary"));
async function J(e, t = {}) {
	let n = l(t);
	if (t = {
		...t,
		xlsxWorksheetLimits: n.worksheet
	}, t.legacyXls !== void 0) {
		let { openXlsxSource: n } = await import("./xlsx-model-source-zemVDAfl.js");
		return n(e, t, q);
	}
	let r = await K(_e(e), q(), t);
	return new Z(r.closeArchive, r.archive, r.workbookIndex, r.metrics, r.usage, t.signal, r.worksheetPolicy);
}
var Y = /* @__PURE__ */ new WeakMap();
function X(e) {
	return Y.get(e) ?? b;
}
var Z = class {
	closeArchive;
	archive;
	metrics;
	signal;
	workbookIndex;
	sheetCount;
	sheetNames;
	pull;
	transport;
	worksheetPullClient;
	active;
	closed = !1;
	closePromise;
	lastUsage;
	completedWorksheets = 0;
	rowBatches = 0;
	emittedRows = 0;
	constructor(e, t, n, r, i, a, o = b) {
		this.closeArchive = e, this.archive = t, this.metrics = r, this.signal = a, Y.set(this, o), this.workbookIndex = $(n), this.sheetNames = Object.freeze(this.workbookIndex.workbook.sheets.map((e) => e.name)), this.sheetCount = this.sheetNames.length, this.lastUsage = i, this.pull = new g(() => this.archive), this.transport = new re((e, t) => this.pull.dispatchSafely(e, t), () => void 0), this.worksheetPullClient = new v({
			transport: this.transport,
			sharedStrings: n.sharedStrings,
			open: async (e, t, n) => {
				this.pull.reserveOpen(n), await this.pull.open(e, t, n);
			},
			onUsage: (e) => {
				this.lastUsage = e, this.metrics.observeUsage(e);
			}
		});
	}
	get resourceUsage() {
		if (this.closed) return this.lastUsage;
		try {
			this.lastUsage = ge(this.archive.resource_usage());
		} catch {}
		return this.lastUsage;
	}
	async *worksheetRows(e) {
		if (this.closed) throw Error("XLSX workbook session is closed");
		if (this.active) throw Error("another XLSX worksheet row stream is already active");
		if (!Number.isSafeInteger(e) || e < 0) throw RangeError("sheetIndex must be a non-negative safe integer");
		let n = this.requireSheetName(e), r = {};
		this.active = r;
		let i;
		try {
			for await (let t of this.worksheetPullClient.stream(e, n, this.signal)) {
				if (this.closed) throw Error("XLSX workbook session is closed");
				if (t.kind !== "preview") {
					if (t.kind === "rows") {
						this.rowBatches += 1, this.emittedRows += t.rows.length, yield {
							kind: "rows",
							rows: t.rows,
							sequence: t.sequence,
							wireBytes: t.wireBytes,
							usage: t.usage
						};
						continue;
					}
					p(t.worksheet, X(this)), yield {
						kind: "finished",
						worksheet: t.worksheet,
						sequence: t.sequence,
						wireBytes: t.wireBytes,
						usage: t.usage
					};
				}
			}
			this.completedWorksheets += 1, this.metrics.checkpoint("worksheet stream complete", this.lastUsage);
		} catch (e) {
			throw i = t(e) ?? e, this.metrics.fail(i), await this.close().catch(() => void 0), i;
		} finally {
			try {
				await this.cleanupOperation(r, i === void 0 ? "closed" : "request-error");
			} catch (e) {
				if (i === void 0) {
					let n = t(e) ?? e;
					throw this.metrics.fail(n), await this.close().catch(() => void 0), n;
				}
			}
		}
	}
	close() {
		return this.closePromise ? this.closePromise : (this.closed = !0, this.closePromise = this.release(), this.closePromise);
	}
	cleanupOperation(e, n) {
		return e.cleanupPromise ||= (async () => {
			let r;
			try {
				await this.worksheetPullClient.cancelAll(n);
			} catch (e) {
				r = t(e) ?? e;
			}
			try {
				await this.pull.reset();
			} catch (e) {
				r ??= t(e) ?? e;
			}
			if (this.active === e && (this.active = void 0), r !== void 0) throw r;
		})(), e.cleanupPromise;
	}
	async release() {
		let e;
		if (this.active) try {
			await this.cleanupOperation(this.active, "closed");
		} catch (n) {
			e = t(n) ?? n;
		}
		this.transport.terminate();
		try {
			this.closeArchive();
		} catch (n) {
			e ??= t(n) ?? n;
		}
		if (e !== void 0) throw this.metrics.fail(e), e;
		this.metrics.checkpoint("workbook session closed", this.lastUsage), this.metrics.succeed({
			worksheets: this.completedWorksheets,
			"row-batches": this.rowBatches,
			rows: this.emittedRows
		});
	}
	requireSheetName(e) {
		let t = this.workbookIndex.workbook.sheets[e];
		if (!t) throw RangeError(`Sheet index ${e} out of range`);
		return t.name;
	}
};
async function pe(e, t = {}) {
	return S(() => J(e, t), async (e) => structuredClone(e.workbookIndex));
}
async function me(e, t, n = {}) {
	return S(() => J(e, n), async (e) => (await Q(e, t)).worksheet);
}
async function he(e, t = {}) {
	return S(() => J(e, t), async (e) => {
		let t = X(e), n = [], r = {
			rows: 0,
			cells: 0,
			ownedUtf8Bytes: 0,
			jsonBytes: 0
		};
		for (let i = 0; i < e.sheetCount; i += 1) {
			let a = await Q(e, i), o = _(r, a.usage, {}, t);
			m(o, "materialize-workbook", void 0, a.resourceUsage, t), r = o, n.push(a.worksheet);
		}
		return {
			workbookIndex: structuredClone(e.workbookIndex),
			worksheets: Object.freeze(n)
		};
	});
}
async function Q(e, t) {
	let n = X(e), r = [], i = {
		rows: 0,
		cells: 0,
		ownedUtf8Bytes: 0
	}, a, o, s;
	for await (let c of e.worksheetRows(t)) if (s = c.usage ?? s, c.kind === "rows") {
		let e = u(i, h(c.rows, n), n);
		d(e, "materialize-worksheet", void 0, s, n), r.push(...c.rows), i = e;
	} else {
		o = c.worksheet, p(o, n), o.rows = o.parseError ? [] : r;
		let e = f(o, o.parseError ? {
			rows: 0,
			cells: 0,
			ownedUtf8Bytes: 0
		} : i, n);
		d(e, "materialize-worksheet", void 0, s, n), y(e.jsonBytes, "materialize-worksheet", void 0, s, n), i = e, a = e;
	}
	if (!o || !a) throw Error(`XLSX worksheet ${t} did not produce a terminal model`);
	return {
		worksheet: o,
		usage: a,
		resourceUsage: s
	};
}
function $(e, t = /* @__PURE__ */ new WeakSet()) {
	if (typeof e != "object" || !e) return e;
	let n = e;
	if (t.has(n)) return e;
	t.add(n);
	for (let e of Object.values(n)) $(e, t);
	return Object.freeze(e);
}
function ge(e) {
	try {
		return o(e);
	} catch (e) {
		if (String(e).includes("worksheet cursor usage is unavailable")) return;
		throw e;
	}
}
function _e(e) {
	return e instanceof Uint8Array ? e : new Uint8Array(e);
}
export { J as a, me as i, he as n, K as o, pe as r, Z as t };
