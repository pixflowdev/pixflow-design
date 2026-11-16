import { G as e, K as t, Xt as n } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { a as r, g as i, i as a, j as o, l as s, r as c } from "./document-pull-client-_G-DIh2T.js";
import { r as l } from "./wasm-loader-KAOyLXzf.js";
import { r as u } from "./document-pull-worker-hMKJ5RdB.js";
import { i as d, t as f } from "./docx-DE-Di6SH.js";
import { t as p } from "./model-source-Cch44xsb.js";
var m = class extends f {
	constructor(...e) {
		super(...e);
	}
	renderPage(e, t = {}) {
		return super.renderPage(e, {
			...t,
			showTrackedChanges: !0
		});
	}
};
async function h(t, i, a) {
	let l = n(i.cjkFallback), { acquired: u, viewDefaults: d } = await v(t, i, a, c);
	try {
		if (i.signal?.aborted) {
			let e = /* @__PURE__ */ Error("DOCX document session was aborted");
			throw e.name = "AbortError", e;
		}
		let e = i.factory.createCanvas(1, 1), t = s(u.result, {
			cjkFallback: l,
			measureContext: e.getContext("2d"),
			allowFootnoteContinuation: i.allowFootnoteContinuation !== !1
		}), n = _(i.currentDate), a = r(u.result, t, n), c = d.showTrackedChanges === !0, p = c ? a.layoutVariants.layoutFor(o(n, n, !0)) : a.layoutVariants.defaultLayout, h = new (c ? m : f)(u.closeArchive, u.archive, u.result, t, p, i.factory, n, u.usage, u.metrics, i.signal);
		return u.metrics.observeUsage(h.resourceUsage), u.metrics.checkpoint("pagination ready"), h;
	} catch (t) {
		try {
			u.closeArchive();
		} catch {}
		let n = e(t) ?? t;
		throw u.metrics.fail(n), n;
	}
}
async function g(e, t, n) {
	return l(async () => {
		let { acquired: r } = await v(e, t, n, a), i = !1;
		return {
			acquired: r,
			markSucceeded: () => {
				i = !0;
			},
			close: async () => {
				try {
					r.closeArchive(), i && r.metrics.succeed({ documents: 1 });
				} catch (e) {
					throw r.metrics.fail(e), e;
				}
			}
		};
	}, async ({ acquired: e, markSucceeded: t }) => {
		try {
			let n = i(e.result);
			return e.metrics.checkpoint("document materialized", e.usage), t(), n;
		} catch (t) {
			throw e.metrics.fail(t), t;
		}
	});
}
function _(e) {
	let t = e instanceof Date ? e.getTime() : e ?? Date.now();
	if (!Number.isFinite(t)) throw RangeError("currentDate must resolve to finite epoch milliseconds");
	return t;
}
async function v(e, n, r, i) {
	let { acquireDocxSessionFromArchive: a, validateDocxModelSourceArchive: o, validateDocxModelSourceViewDefaults: s } = await import("./model-source-session-DSABX94B.js"), c = await p(e, "docx", {
		...n,
		source: n.legacyDoc
	}, o, (e) => t(e) ?? u(e));
	if (c.kind === "ooxml") return {
		acquired: await d(c.bytes, r(), n, i),
		viewDefaults: {}
	};
	let l;
	try {
		l = s(c.opened.viewDefaults);
	} catch (e) {
		try {
			c.opened.close();
		} catch {}
		throw e;
	}
	return {
		acquired: await a({
			archive: c.opened.archive,
			sourceByteLength: c.sourceByteLength,
			closeArchive: c.opened.close
		}, n, i),
		viewDefaults: l
	};
}
export { g as materializeDocxSource, h as openDocxSource };
