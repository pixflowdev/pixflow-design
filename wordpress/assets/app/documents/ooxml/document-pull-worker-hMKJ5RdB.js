import { Co as e } from "./plot-area-frame-DNYMd9Pf.js";
import { A as t, J as n, M as r, U as i, X as a, fn as o, j as s, pn as c } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { S as l } from "./worksheet-pull-client-BudfclVl.js";
var u = "OOXML_DOCX_ILVL:";
function d(t) {
	let n = t instanceof Error ? t.message : String(t);
	if (!n.startsWith(u)) return;
	let r = n.slice(16);
	if (r === "repair-required:level-definition") return new e("invalid-numbering", "The DOCX defines a numbering level outside Word’s supported 0–8 range and requires repair.");
	if (r === "cannot-open:whitespace" || r === "cannot-open:non-decimal") return new e("invalid-numbering", `Word cannot open this DOCX numbering level (${r.slice(12)}).`);
}
function f(e) {
	try {
		return d(e) ?? e;
	} catch {
		return e;
	}
}
function p(e) {
	try {
		return e();
	} catch (e) {
		throw f(e);
	}
}
function m(e) {
	let t = e((e) => e.document_cursor_resource_usage?.());
	return t ? i(t) : void 0;
}
var h = Math.max(o, c), g = class {
	archive;
	coordinator = new r();
	host = null;
	identity = null;
	executeArchive;
	constructor(e, t = (e) => e(this.requireArchive())) {
		this.archive = e, this.executeArchive = (e) => p(() => t(e));
	}
	open(e) {
		if (this.host) throw Error("a DOCX document pull session is already active");
		this.executeArchive((t) => {
			t.open_document_cursor(e.operationId, e.generation);
		});
		let t = 0;
		this.identity = e, this.host = new s({
			...e,
			maxByteCredit: h,
			coordinator: this.coordinator,
			driver: {
				pull: (n) => {
					let r;
					try {
						r = this.executeArchive((r) => r.pull_document_chunk(t, e.operationId, e.generation, n));
					} catch (e) {
						throw a(e, n, h) || e;
					}
					let i = l(r);
					return {
						payload: i,
						byteLength: i.byteLength,
						done: this.executeArchive((e) => e.document_chunk_done()),
						transfer: [i]
					};
				},
				measureChunk: ({ payload: e }) => e.byteLength,
				acknowledge: (n) => {
					if (n !== t) throw Error("DOCX document acknowledgement sequence mismatch");
					this.executeArchive((n) => n.acknowledge_document_chunk(t, e.operationId, e.generation)), t += 1;
				},
				cancel: () => this.executeArchive((e) => e.cancel_document_cursor()),
				close: () => this.executeArchive((e) => e.close_document_session()),
				resourceUsage: () => m(this.executeArchive)
			}
		});
	}
	dispatch(e, r) {
		return !this.host || !this.identity ? (r({
			protocol: t,
			kind: "error",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			error: n(/* @__PURE__ */ Error("DOCX document pull session is not open"))
		}), Promise.resolve()) : this.host.dispatch(e, r);
	}
	async reset() {
		if (this.host) try {
			this.archive() && this.executeArchive((e) => e.close_document_session());
		} finally {
			this.host = null, this.identity = null, this.coordinator = new r();
		}
	}
	requireArchive() {
		let e = this.archive();
		if (!e) throw Error("No docx loaded");
		return e;
	}
};
export { m as n, f as r, g as t };
