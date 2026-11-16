import { I as e, K as t, P as n } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { n as r } from "./abort-JztSoyw2.js";
import { a as i } from "./model-source-COXegBNA.js";
import { t as a } from "./in-process-pull-transport-BPJ7M0uC.js";
import { n as o, r as s, t as c } from "./document-pull-worker-hMKJ5RdB.js";
var l = [
	"open_document_cursor",
	"pull_document_chunk",
	"document_chunk_done",
	"acknowledge_document_chunk",
	"cancel_document_cursor",
	"close_document_session",
	"assert_healthy",
	"extract_image"
];
function u(e) {
	return i(e, "DOCX", l), e;
}
function d(e) {
	for (let t of Object.keys(e)) if (t !== "showTrackedChanges") throw TypeError(`unsupported DOCX model source view default: ${t}`);
	return e.showTrackedChanges === void 0 ? {} : { showTrackedChanges: e.showTrackedChanges };
}
var f = "DOCX document session was aborted";
async function p(i, a, o) {
	let c = !1, l = () => {
		c || (c = !0, i.closeArchive());
	}, u;
	try {
		if (!Number.isSafeInteger(i.sourceByteLength) || i.sourceByteLength < 0) throw RangeError("DOCX sourceByteLength must be a non-negative safe integer");
		let t = e(a);
		u = new n({
			enabled: t.debug || t.onResourceMetrics !== void 0,
			format: "docx",
			mode: "node",
			scope: "session",
			policy: t.policy,
			onMetrics: t.onResourceMetrics,
			emitToConsole: t.debug
		}), u.setSourceBytes(i.sourceByteLength), r(a.signal, f), u.checkpoint("container ready");
	} catch (e) {
		try {
			l();
		} catch {}
		let n = t(e) ?? s(e);
		throw u?.fail(n), n;
	}
	return m(i.archive, l, u, a, o);
}
async function m(e, n, r, i, l) {
	let u, d;
	try {
		u = new c(() => e);
		let t = {
			sessionId: 1,
			operationId: 1,
			generation: 1
		};
		u.open(t), d = new a((e, t) => u?.dispatch(e, t), () => void 0);
		let s, f = await l(d, t, {
			signal: i.signal,
			onUsage: (e) => {
				s = e, r.observeUsage(e);
			}
		});
		return s ??= o((t) => t(e)), r.observeUsage(s), r.checkpoint("model streamed"), await u.reset(), d.terminate(), {
			archive: e,
			result: f,
			usage: s,
			metrics: r,
			closeArchive: n
		};
	} catch (e) {
		await u?.reset().catch(() => void 0), d?.terminate();
		try {
			n();
		} catch {}
		let i = t(e) ?? s(e);
		throw r.fail(i), i;
	}
}
export { p as acquireDocxSessionFromArchive, u as validateDocxModelSourceArchive, d as validateDocxModelSourceViewDefaults };
