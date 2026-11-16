import { I as e, K as t, P as n, U as r } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { n as i } from "./abort-JztSoyw2.js";
import { b as a } from "./worksheet-pull-client-BudfclVl.js";
import { a as o } from "./model-source-COXegBNA.js";
import { t as s } from "./host-layout-Cz_lCuTZ.js";
var c = [
	"open_sheet_cursor",
	"pull_sheet_cursor",
	"sheet_cursor_pull_finished",
	"acknowledge_sheet_cursor_terminal",
	"cancel_sheet_cursor",
	"close_sheet_cursor",
	"assert_healthy",
	"parse",
	"extract_image"
];
function l(e) {
	return o(e, "XLSX", c), e;
}
function u(e) {
	let [t] = Object.keys(e);
	if (t !== void 0) throw TypeError(`unsupported XLSX model source view default: ${t}`);
}
function d(e, t) {
	let n = e(), i = t();
	return {
		workbook: n,
		usage: i === void 0 ? void 0 : r(i)
	};
}
var f = "XLSX workbook session was aborted";
function p(r, o = {}) {
	let s;
	try {
		let t = a(o);
		if (!Number.isSafeInteger(r.sourceByteLength) || r.sourceByteLength < 0) throw RangeError("XLSX sourceByteLength must be a non-negative safe integer");
		let c = e(o);
		s = new n({
			enabled: c.debug || c.onResourceMetrics !== void 0,
			format: "xlsx",
			mode: "node",
			scope: "session",
			policy: c.policy,
			formatLimits: { xlsxWorksheetLimits: { ...t.worksheet } },
			onMetrics: c.onResourceMetrics,
			emitToConsole: c.debug
		}), s.setSourceBytes(r.sourceByteLength), i(o.signal, f);
		let l = r.archive, { workbook: u, usage: p } = d(() => JSON.parse(new TextDecoder().decode(l.parse())), () => l.resource_usage?.());
		return r.layoutMetrics && (u.layoutMetrics = { maximumDigitWidth: r.layoutMetrics.maximumDigitWidth }), s.observeUsage(p), s.checkpoint("workbook index ready"), {
			archive: l,
			workbookIndex: u,
			usage: p,
			metrics: s,
			worksheetPolicy: t,
			closeArchive: () => r.closeArchive()
		};
	} catch (e) {
		try {
			r.closeArchive();
		} catch {}
		let n = t(e) ?? e;
		throw s?.fail(n), n;
	}
}
export { p as acquireXlsxSessionFromArchive, s as configureHostLayout, l as validateXlsxModelSourceArchive, u as validateXlsxModelSourceViewDefaults };
