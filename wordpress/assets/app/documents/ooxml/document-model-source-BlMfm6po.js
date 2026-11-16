import { $t as e, An as t, I as n, P as r, Xt as i, jn as a } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { P as o, b as s } from "./comment-overlay-controller-b3tKmzMa.js";
import { N as c, _ as l, a as u, d, f, j as p, l as m, o as h, p as g, s as _, v, y } from "./document-pull-client-_G-DIh2T.js";
import { _ as b, c as x, g as S, h as C, l as w, m as T, u as E } from "./docx-Do90Z4L7.js";
import { T as D } from "./canvas-viewer-mechanics-BsqaoYgK.js";
import { n as O } from "./renderer-module-contract-BuTx2FWJ.js";
import { n as k, o as A, r as j } from "./model-source-COXegBNA.js";
import { t as M } from "./bundled-asset-url-BMJ8vNHP.js";
function N(e) {
	let t = M(new URL("./docx-source-worker.js", import.meta.url).href, import.meta.url);
	return e.transfer.length > 0 ? {
		source: e.module,
		sourceTransfer: e.transfer,
		sourceOwnerUrl: t
	} : {
		source: e.module,
		sourceOwnerUrl: t
	};
}
function P(e, t) {
	if (t === void 0) return;
	let n = c(e), r = n.activeLayoutOptions;
	if (!r || r.showTrackedChanges === !0 === t) return;
	let i = p(r.currentDateMs, n.defaultCurrentDateMs, t);
	n.activeLayoutOptions = i, e._progressive && (e._progressive.layoutOptions = i);
}
async function F(j, M = {}, N) {
	let F = N?.signal, L = () => {
		if (F?.aborted) throw new y();
	};
	L();
	let R = i(M.cjkFallback), z = n(M), B = Date.now(), V = M.mode ?? "main", H = new r({
		enabled: !0,
		format: "docx",
		mode: V,
		policy: z.policy,
		onMetrics: z.onResourceMetrics,
		emitToConsole: z.debug
	});
	try {
		if (V === "worker" && (typeof Worker > "u" || typeof OffscreenCanvas > "u")) throw Error("mode: 'worker' requires Worker and OffscreenCanvas support");
		let n;
		if (typeof j == "string") {
			let e = await fetch(j, { signal: F });
			if (!e.ok) throw Error(`Failed to fetch: ${e.status} ${e.statusText}`);
			n = await e.arrayBuffer();
		} else n = j;
		L();
		let r = A(M.legacyDoc === void 0 ? void 0 : [M.legacyDoc], "docx", new Uint8Array(n));
		if (!r) return x.load(n, {
			...M,
			legacyDoc: void 0
		});
		let i = k(r, "docx");
		try {
			H.setSourceBytes(n.byteLength), H.checkpoint("container ready");
			let r = V === "worker" ? (await import("./render-worker-host-EgUrirnQ.js")).createRenderWorker() : new (await (import("./worker-source-D3NwPe6l.js"))).default(), k, A, j = !1, U = () => {
				j || !k || (j = !0, k.destroy());
			}, W = I(r, i, M, (e) => {
				k && P(k, e);
			}), G = V === "worker" ? O(M) : void 0, K = V === "worker" && !!M.progressiveLayout;
			try {
				A = Reflect.construct(x, [
					W,
					V,
					B,
					M.wasmUrl
				]), k = A, F?.addEventListener("abort", U, { once: !0 }), L(), k._metrics = H, k._cjkFallback = R, k._allowFootnoteContinuation = M.allowFootnoteContinuation !== !1;
				let r = c(k), D = p(M.currentDate, r.defaultCurrentDateMs, M.showTrackedChanges === !0);
				r.activeLayoutOptions = D, await k._parse(n, z.policy, V === "worker" ? !!M.useGoogleFonts : !1, M.workerTimeoutMs, (e) => H.observeUsage(e), G, K ? {
					onPartial: M.onLayoutPartial,
					onComplete: M.onLayoutComplete,
					onProgress: M.onLayoutProgress,
					layoutOptions: D,
					abort: new AbortController(),
					firstPublication: s(),
					published: !1,
					settled: !1
				} : void 0), V === "worker" && k._mode === "main" && (H.setMode("main"), console.warn(C(k._mainThreadFallbackReason))), M.math && k._mode === "worker" && !G?.math && console.warn("[ooxml] a custom math renderer cannot cross the worker boundary; equations will be skipped in mode: 'worker'. Use the math renderer from @silurus/ooxml/math."), M.threeD && k._mode === "worker" && !G?.threeD && console.warn("[ooxml] a custom 3-D chart renderer cannot cross the worker boundary; charts use their 2-D family fallback in mode: 'worker'. Use the renderer from @silurus/ooxml/three-d."), k._threeD = k._mode === "worker" ? void 0 : M.threeD, M.regionMap && k._mode === "worker" && !G?.regionMap && console.warn("[ooxml] a custom Region Map renderer cannot cross the worker boundary; geospatial charts use the unsupported-chart placeholder in mode: 'worker'. Use the renderer from @silurus/ooxml/region-map."), k._regionMap = k._mode === "worker" ? void 0 : M.regionMap, M.chartEx && k._mode === "worker" && !G?.chartEx && console.warn("[ooxml] a custom ChartEx renderer cannot cross the worker boundary; ChartEx charts use the unsupported-chart placeholder in mode: 'worker'. Use the renderer from @silurus/ooxml/chart-ex."), k._chartEx = k._mode === "worker" ? void 0 : M.chartEx, M.tiff && k._mode === "worker" && !G?.tiff && console.warn("[ooxml] a custom TIFF codec cannot cross the worker boundary; recognized TIFF images will use an unavailable-image placeholder in mode: 'worker'. Use the codec from @silurus/ooxml/tiff to display them."), k._tiff = k._mode === "worker" ? void 0 : M.tiff;
				let O, j;
				if (k._mode === "main" && k._document?.embeddedFonts?.length) {
					let e = k, t = await T(k._document, (t) => e.getFontBytes(t));
					if (F?.aborted) throw o(t.faces), new y();
					S(k, t.diagnostics), k._embeddedFontFaces = t.faces, O = t.metrics, j = t.routes;
				}
				let P = k._mode === "main" && k._document ? await b(g(k._document, {
					useGoogleFonts: M.useGoogleFonts,
					cjkFallback: R
				}).filter((e) => e.presenceOnly || !j?.some((t) => t.requestedFamily.toLowerCase() === e.family.toLowerCase() && t.weight === (e.weight ?? 400) && t.style === (e.style ?? "normal")))) : {
					faces: [],
					routes: {}
				};
				if (F?.aborted) throw e(P.faces), new y();
				k._officeFontFaces = P.faces;
				let I = [];
				if (k._mode === "main" && M.useGoogleFonts && k._document) {
					let e = f(k._document, R, P);
					I = e.installedSubstituteFamilies;
					let n = await t(e.names, l);
					if (F?.aborted) throw a(n), new y();
					k._googleFontFaces = n;
				}
				let q;
				if (k._mode === "main" && M.math && k._document && h(k._document) && (q = await _(k._document, M.math)), L(), k._mode === "main" && k._document && k._source) {
					let t = k, n = c(k), r = {
						allowFootnoteContinuation: k._allowFootnoteContinuation,
						fontMetrics: O,
						useGoogleFonts: !!M.useGoogleFonts,
						cjkFallback: R,
						embeddedRoutes: j,
						officeRoutes: Object.values(P.routes),
						googleFaces: k._googleFontFaces,
						installedSubstituteFamilies: I,
						installedFamilies: "installed" in P ? P.installed : void 0,
						mathResources: q?.records,
						mathDrawables: q?.drawables
					}, i = await d(k._source, k._document, {
						useGoogleFonts: !!M.useGoogleFonts,
						cjkFallback: R
					});
					if (F?.aborted) throw e(i.faces), new y();
					k._officeFontFaces = [...k._officeFontFaces, ...i.faces], n.services = m(k._source, {
						...r,
						nativeRouteMetrics: i.nativeRouteMetrics
					});
					let a = n.services, o = u(k._source, a, n.defaultCurrentDateMs), l = k._source.fatalParse === null, f = n.activeLayoutOptions;
					if (!f) throw Error("Active layout view was not recorded at load");
					let h = { onProgress: M.onLayoutProgress ? (e) => t._layoutObservers.notify("onLayoutProgress", M.onLayoutProgress, { committedUnits: e }) : void 0 };
					if (l && M.progressiveLayout) {
						let e = o.layoutVariants, t = k, n = new AbortController();
						t._layoutAbort = n;
						let r = s(), i = null, c = !0;
						t._layoutCompletion = E(k._source.bodyLayoutInput, a, f, {
							scheduler: {
								...h,
								signal: n.signal
							},
							onPreview: (n) => {
								if (!c) return;
								let a = i === null, o = t._replaceMainLayoutPublication(e, f, i, n.layout);
								if (o === null) {
									c = !1;
									return;
								}
								if (i = o, a) t._layoutLifecycle.begin(), w(t, {
									pageCount: n.layout.pages.length,
									exact: n.exact,
									complete: !1
								}), r.resolve();
								else {
									if (!t._isLayoutViewActive(f)) return;
									w(t, {
										pageCount: n.layout.pages.length,
										exact: n.exact,
										complete: !1
									}), t._layoutObservers.notify("onLayoutPartial", M.onLayoutPartial, {
										availableUnits: n.layout.pages.length,
										exact: n.exact
									});
								}
							}
						}).then((n) => {
							c && t._replaceMainLayoutPublication(e, f, i, n) === null && (c = !1), t._layoutLifecycle.succeed(), w(t, {
								pageCount: t.pageCount,
								exact: !0,
								complete: !0
							}), t._layoutObservers.notify("onLayoutComplete", M.onLayoutComplete), r.resolve();
						}).catch((e) => {
							if (i === null) {
								r.reject(e);
								return;
							}
							if (e instanceof y) {
								t._layoutLifecycle.succeed();
								return;
							}
							let n = t._layoutLifecycle.fail(e);
							w(t, {
								pageCount: t.pageCount,
								exact: !1,
								complete: !1,
								error: n
							}), t._layoutObservers.notify("onLayoutComplete", M.onLayoutComplete, n);
						}), await r.promise;
					} else if (l && (M.sliceLayout !== !1 || M.onLayoutProgress)) for (;;) {
						L();
						let e = N?.requestedView(), t = e === void 0 ? f : p(M.currentDate, n.defaultCurrentDateMs, e);
						n.activeLayoutOptions = t;
						let r = new AbortController(), i = !1, s = N?.subscribeViewChange(() => {
							let e = N.requestedView();
							i || e === void 0 || e === !0 == (t.showTrackedChanges === !0) || (i = !0, r.abort());
						});
						k._layoutAbort = r;
						try {
							let e = await v(k._source.bodyLayoutInput, a, t, {
								...h,
								signal: r.signal
							});
							if (L(), i) continue;
							o.layoutVariants.prime(t, e);
							break;
						} catch (e) {
							if (e instanceof y && i && !F?.aborted) continue;
							throw e;
						} finally {
							s?.(), k._layoutAbort = null;
						}
					}
					else o.layoutVariants.layoutFor(f);
				}
				return L(), await k._resourceUsage(M.workerTimeoutMs ?? 1e3).then((e) => H.observeUsage(e), () => void 0), H.checkpoint("model and layout ready"), L(), H.succeed({ pages: k.pageCount }), i.release(), A;
			} catch (e) {
				throw D(r, k ? U : void 0), e;
			} finally {
				F?.removeEventListener("abort", U);
			}
		} finally {
			i.release();
		}
	} catch (e) {
		throw H.fail(e), e;
	}
}
function I(e, t, n, r) {
	let i = /* @__PURE__ */ new Map();
	return j(e, {
		discriminator: "type",
		load: t,
		parseMessage: (e) => ({
			...e,
			...N(t),
			...n.showTrackedChanges === void 0 ? {} : { showTrackedChanges: n.showTrackedChanges }
		}),
		member: (e, t) => {
			if (t === "addEventListener") return (t, a, o) => {
				if (t !== "message") return e.addEventListener(t, a, o);
				let s = (e) => {
					let t = e.data;
					n.showTrackedChanges === void 0 && (t.type === "documentSessionOpened" || t.type === "mainThreadVerticalFallback") && r(t.viewDefaults?.showTrackedChanges), (t.type === "parsedMeta" || t.type === "layoutPartial") && r(t.showTrackedChanges), typeof a == "function" ? a(e) : a.handleEvent(e);
				};
				i.set(a, s), e.addEventListener("message", s, o);
			};
			if (t === "removeEventListener") return (t, n, r) => e.removeEventListener(t, t === "message" ? i.get(n) ?? n : n, r);
		}
	});
}
export { F as loadDocxModelSource };
