import { wo as e } from "./plot-area-frame-DNYMd9Pf.js";
import { A as t, J as n, M as r, U as i, j as a } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { S as o, b as s, c, d as l, f as u, g as d, i as f, p, u as m, y as h } from "./worksheet-pull-client-BudfclVl.js";
import { t as g } from "./grid-geometry-DpMAiSZb.js";
import { o as _, t as v } from "./xlsx-DA0uR1B1.js";
import { t as y } from "./model-source-Cch44xsb.js";
var b = 64 * 1024 * 1024, x = class {
	archive;
	acceptWorksheet;
	executeArchive;
	prepareRows;
	provisional;
	worksheetPolicy;
	coordinator = new r();
	sessions = /* @__PURE__ */ new Map();
	operationTail = Promise.resolve();
	pendingOpens = /* @__PURE__ */ new Map();
	resourceFailure;
	constructor(e, t, n = (e) => e(this.requireArchive()), r, i, a = () => h) {
		this.archive = e, this.acceptWorksheet = t, this.executeArchive = n, this.prepareRows = r, this.provisional = i, this.worksheetPolicy = a;
	}
	reserveOpen(e) {
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
	runDuringPull(t) {
		return this.sessions.size === 0 ? this.run(t) : this.coordinator.enqueue(async () => {
			if (this.resourceFailure) throw this.resourceFailure;
			try {
				return t();
			} catch (t) {
				throw t instanceof e && (this.resourceFailure ??= t), t;
			}
		});
	}
	async open(t, n, r) {
		if (this.resourceFailure) throw this.resourceFailure;
		let i = this.pendingOpens.get(r.sessionId);
		if (!i || i.identity.operationId !== r.operationId || i.identity.generation !== r.generation) throw Error("worksheet pull session open reservation is stale or missing");
		let s = this.worksheetPolicy(), h, g = new Promise((e) => {
			h = e;
		}), _ = this.operationTail.then(() => this.coordinator.enqueue(async () => {
			if (i.canceled) throw Error("worksheet pull session open was canceled");
			this.executeArchive((e) => e.open_sheet_cursor(t, n));
			let g = [], _ = {
				rows: 0,
				cells: 0,
				ownedUtf8Bytes: 0
			}, v, y = !1, x = new a({
				...r,
				maxByteCredit: b,
				coordinator: this.coordinator,
				driver: {
					pull: () => {
						let n = this.executeArchive((e) => e.pull_sheet_cursor(128)), r = this.executeArchive((e) => e.sheet_cursor_pull_finished());
						if (this.acceptWorksheet) {
							let i = f(n, r, void 0, this.prepareRows);
							try {
								if (i.kind === "preview") i.worksheet && (i.worksheet.rows = g, d(i.worksheet, s), this.provisional?.preview(t, i.worksheet));
								else if (i.kind === "rows") {
									let e = c(_, p(i.rows, s), s);
									l(e, "get-worksheet-worker", void 0, this.readResourceUsage(), s), g.push(...i.rows), _ = e;
								} else i.kind === "finished" && (v = i.worksheet);
							} catch (t) {
								throw t instanceof e && (this.resourceFailure ??= t), t;
							}
						}
						y = r;
						let i = o(n);
						return {
							payload: i,
							byteLength: i.byteLength,
							done: r,
							transfer: [i]
						};
					},
					measureChunk: ({ payload: e }) => e.byteLength,
					acknowledge: () => {
						if (!y) return;
						let n, i;
						try {
							if (this.acceptWorksheet) {
								if (!v) throw Error("worksheet terminal payload is missing");
								v.rows = v.parseError ? [] : g;
								let e = v.parseError ? {
									rows: 0,
									cells: 0,
									ownedUtf8Bytes: 0
								} : _, r = u(v, e, s), a = this.readResourceUsage();
								l(r, "get-worksheet-worker", void 0, a, s), m(r.jsonBytes, "get-worksheet-worker", void 0, a, s), d(v, s);
								let o = this.acceptWorksheet(t, v, r, a);
								typeof o == "function" ? n = o : o && ({rollback: n, commit: i} = o);
							}
							this.executeArchive((e) => e.acknowledge_sheet_cursor_terminal()), i?.();
						} catch (t) {
							throw n?.(), t instanceof e && (this.resourceFailure ??= t), t;
						}
						y = !1, this.sessions.delete(r.sessionId), this.provisional?.stop(t), h();
					},
					cancel: () => {
						try {
							this.archive() && this.executeArchive((e) => e.cancel_sheet_cursor());
						} finally {
							this.sessions.delete(r.sessionId), this.provisional?.stop(t), h();
						}
					},
					close: () => {
						try {
							this.archive() && this.executeArchive((e) => e.close_sheet_cursor());
						} finally {
							this.sessions.delete(r.sessionId), this.provisional?.stop(t), h();
						}
					},
					resourceUsage: () => this.readResourceUsage()
				}
			});
			this.sessions.set(r.sessionId, {
				host: x,
				identity: r
			}), this.pendingOpens.delete(r.sessionId);
		}));
		this.operationTail = _.then(() => g, () => void 0);
		try {
			await _;
		} catch (e) {
			throw this.pendingOpens.delete(r.sessionId), h(), e;
		}
	}
	async postOpenedSafely(e, t, n) {
		try {
			t();
		} catch (t) {
			await this.closeIdentity(e);
			try {
				n(t);
			} catch {}
		}
	}
	dispatch(e, r) {
		let i = this.sessions.get(e.sessionId);
		if (i) return i.host.dispatch(e, r);
		let a = this.pendingOpens.get(e.sessionId);
		if (a && (e.kind === "cancel" || e.kind === "close")) {
			let n = a.identity.operationId === e.operationId && a.identity.generation === e.generation;
			return n && (a.canceled = !0), r(n ? {
				protocol: t,
				kind: "accepted",
				sessionId: e.sessionId,
				operationId: e.operationId,
				generation: e.generation,
				requestId: e.requestId,
				command: e.kind
			} : {
				protocol: t,
				kind: "error",
				sessionId: e.sessionId,
				operationId: e.operationId,
				generation: e.generation,
				requestId: e.requestId,
				error: {
					message: "stale lifecycle targets another pending worksheet operation",
					errorName: "PullSessionProtocolError",
					code: "ooxml-stale-lifecycle"
				}
			}), Promise.resolve();
		}
		return e.kind === "cancel" || e.kind === "close" ? (r({
			protocol: t,
			kind: "accepted",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			command: e.kind
		}), Promise.resolve()) : (r({
			protocol: t,
			kind: "error",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			error: n(/* @__PURE__ */ Error("worksheet pull session is not open"))
		}), Promise.resolve());
	}
	async dispatchSafely(e, r) {
		try {
			await this.dispatch(e, r);
		} catch (i) {
			try {
				r({
					protocol: t,
					kind: "error",
					sessionId: e.sessionId,
					operationId: e.operationId,
					generation: e.generation,
					requestId: e.requestId,
					error: n(i)
				});
			} catch {}
		}
	}
	run(t) {
		let n = this.operationTail.then(() => this.coordinator.enqueue(async () => {
			if (this.resourceFailure) throw this.resourceFailure;
			return t();
		})).catch((t) => {
			throw t instanceof e && (this.resourceFailure ??= t), t;
		});
		return this.operationTail = n.then(() => void 0, () => void 0), n;
	}
	async reset() {
		for (let e of this.pendingOpens.values()) e.canceled = !0;
		let e = 1;
		for (let { host: n, identity: r } of [...this.sessions.values()]) await n.dispatch({
			protocol: t,
			kind: "close",
			...r,
			requestId: e++
		}, () => void 0);
		this.sessions.clear(), await this.operationTail, this.pendingOpens.clear(), this.resourceFailure = void 0;
	}
	requireArchive() {
		let e = this.archive();
		if (!e) throw Error("Workbook not loaded");
		return e;
	}
	async closeIdentity(e) {
		let n = this.sessions.get(e.sessionId);
		if (n) {
			await n.host.dispatch({
				protocol: t,
				kind: "close",
				...e,
				requestId: 1
			}, () => void 0);
			return;
		}
		let r = this.pendingOpens.get(e.sessionId);
		r && r.identity.operationId === e.operationId && r.identity.generation === e.generation && (r.canceled = !0);
	}
	readResourceUsage() {
		let e = this.executeArchive((e) => e.sheet_cursor_resource_usage?.());
		return e === void 0 ? void 0 : i(e);
	}
};
async function S(e, t, n) {
	return new C(await w(e, t, n), t.signal);
}
var C = class extends v {
	constructor(e, t) {
		super(e.closeArchive, e.archive, e.workbookIndex, e.metrics, e.usage, t, e.worksheetPolicy);
		let n = e.worksheetPolicy;
		this.pull = new x(() => e.archive, void 0, void 0, void 0, void 0, () => n);
	}
	async *worksheetRows(e) {
		for await (let t of super.worksheetRows(e)) {
			if (t.kind === "finished") {
				let e = this.workbookIndex.layoutMetrics?.maximumDigitWidth;
				e !== void 0 && g.forWorksheet(t.worksheet, e);
			}
			yield t;
		}
	}
};
async function w(e, t, n) {
	let r = s(t), i = {
		...t,
		xlsxWorksheetLimits: r.worksheet
	}, { acquireXlsxSessionFromArchive: a, configureHostLayout: o, validateXlsxModelSourceArchive: c, validateXlsxModelSourceViewDefaults: l } = await import("./model-source-session-ClNCRDOg.js"), u = await y(e, "xlsx", {
		...i,
		source: i.legacyXls
	}, c);
	if (u.kind === "ooxml") return _(u.bytes, n(), i);
	let { opened: d } = u, f;
	try {
		if (l(d.viewDefaults), f = await o(d.archive, async (e) => {
			if (!t.factory) return;
			let { measureHostLayoutFont: n } = await import("./host-layout-measure-IFLllYwV.js"), r = t.factory.createCanvas(1, 1).getContext("2d");
			return r ? n(e, r) : void 0;
		}), t.signal?.aborted) {
			let e = /* @__PURE__ */ Error("XLSX workbook session was aborted");
			throw e.name = "AbortError", e;
		}
	} catch (e) {
		try {
			d.close();
		} catch {}
		throw e;
	}
	return a({
		archive: d.archive,
		sourceByteLength: u.sourceByteLength,
		...f === void 0 ? {} : { layoutMetrics: { maximumDigitWidth: f } },
		closeArchive: d.close
	}, i);
}
export { S as openXlsxSource };
