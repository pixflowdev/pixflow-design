import { t as e } from "./slide-pull-client-3g6TxaKa.js";
import { wo as t } from "./plot-area-frame-DNYMd9Pf.js";
import { G as n, U as r, Xt as i, ft as a, lt as o, t as s, vn as c } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { n as l } from "./abort-JztSoyw2.js";
import { n as u, r as d, t as f } from "./wasm-loader-KAOyLXzf.js";
import { i as p, n as m, r as h } from "./session-DPXK_lpI.js";
import { t as g } from "./in-process-pull-transport-BPJ7M0uC.js";
import { n as _ } from "./pptx-parsed-slides-BMGr4khe.js";
var v = "PPTX presentation session was aborted", y = f(() => u(import.meta.url, "pptx_parser_bg.wasm", "@silurus/ooxml-pptx/wasm-binary"));
async function b(e, t = {}) {
	return x(e, t);
}
async function x(e, t = {}) {
	if (t.legacyPpt !== void 0) {
		let { openPptxSource: n } = await import("./pptx-model-source-C9TuBisH.js");
		return n(e, t, y);
	}
	let n = i(t.cjkFallback), r = await m(w(e), y(), t);
	return new S(r.closeArchive, r.archive, r.bootstrap, r.metrics, t.signal, n);
}
var S = class {
	closeArchive;
	archive;
	bootstrap;
	metrics;
	signal;
	cjkFallback;
	parsedTextChain;
	slideCount;
	slideWidth;
	slideHeight;
	slidePull;
	slideClient;
	transport;
	started = !1;
	closed = !1;
	closePromise;
	usage;
	consumedSlides = 0;
	resourceFailure;
	renderTail = Promise.resolve();
	fetchImage = (e, t) => this.getPartInternal(e, t, (t) => t.extract_image(e));
	fetchMedia = (e) => this.getPartInternal(e, "application/octet-stream", (t) => t.extract_media(e));
	rawParts = new s({
		maxEntries: 64,
		maxBytes: c
	});
	constructor(t, n, r, i, a, o, s = !0) {
		this.closeArchive = t, this.archive = n, this.bootstrap = r, this.metrics = i, this.signal = a, this.cjkFallback = o, this.parsedTextChain = s, this.slideCount = r.slideCount, this.slideWidth = r.slideWidth, this.slideHeight = r.slideHeight, this.slidePull = new h(() => this.archive), this.transport = new g((e, t) => this.slidePull.dispatchSafely(e, t), () => void 0), this.slideClient = new e({
			slideCount: this.slideCount,
			transport: this.transport,
			open: async (e, t) => {
				this.slidePull.reserveOpen(t), await this.slidePull.open(e, t);
			},
			onUsage: (e) => {
				this.usage = e, this.metrics.observeUsage(e);
			}
		});
	}
	materialize(e) {
		return {
			slideWidth: this.slideWidth,
			slideHeight: this.slideHeight,
			slides: e,
			defaultTextColor: this.bootstrap.defaultTextColor,
			majorFont: this.bootstrap.majorFont,
			minorFont: this.bootstrap.minorFont,
			...this.bootstrap.hlinkColor ? { hlinkColor: this.bootstrap.hlinkColor } : {},
			...this.bootstrap.folHlinkColor ? { folHlinkColor: this.bootstrap.folHlinkColor } : {}
		};
	}
	get resourceUsage() {
		return this.closed ? this.usage : this.refreshResourceUsage();
	}
	async getImage(e, t) {
		return this.assertOpen(), this.getPartInternal(e, t, (t) => t.extract_image(e)).catch((e) => this.failOperation(e));
	}
	async getMedia(e, t = "application/octet-stream") {
		return this.assertOpen(), this.getPartInternal(e, t, (t) => t.extract_media(e)).catch((e) => this.failOperation(e));
	}
	async renderSlide(e, t, n) {
		return this.assertOpen(), this.enqueueRender(async () => {
			l(this.signal, v);
			let { renderSlideNode: r } = await import("./render-Bf_Gywxw.js").then((e) => e.i);
			await r(e, {
				slideWidth: this.slideWidth,
				slideHeight: this.slideHeight,
				slides: [t],
				defaultTextColor: this.bootstrap.defaultTextColor,
				majorFont: this.bootstrap.majorFont,
				minorFont: this.bootstrap.minorFont,
				...this.bootstrap.hlinkColor ? { hlinkColor: this.bootstrap.hlinkColor } : {},
				...this.bootstrap.folHlinkColor ? { folHlinkColor: this.bootstrap.folHlinkColor } : {}
			}, 0, {
				...n,
				cjkFallback: this.cjkFallback,
				fetchImage: this.fetchImage,
				fetchMedia: this.fetchMedia
			}), l(this.signal, v);
		}).catch((e) => this.failOperation(e));
	}
	[Symbol.asyncIterator]() {
		return this.slides();
	}
	async *slides() {
		if (this.closed) throw Error("PPTX presentation session is closed");
		if (this.started) throw Error("PPTX presentation session is one-pass and was already consumed");
		this.started = !0;
		let e;
		try {
			for (let e = 0; e < this.slideCount; e += 1) {
				l(this.signal, v);
				let t = await this.slideClient.load(e);
				if (!t) throw Error(`PPTX slide ${e} was not decoded`);
				this.usage ??= await this.slidePull.run(() => p((e) => e(this.archive))), this.metrics.observeUsage(this.usage), this.consumedSlides = e + 1, this.parsedTextChain && _(t), yield t;
			}
		} catch (t) {
			throw e = n(t) ?? t, this.metrics.fail(e), e;
		} finally {
			try {
				await this.close();
			} catch (t) {
				if (e === void 0) throw t;
			}
		}
	}
	close() {
		return this.closePromise ? this.closePromise : (this.closed = !0, this.slideClient.cancelAll(), this.closePromise = this.release(), this.closePromise);
	}
	async release() {
		let e;
		await this.renderTail, a(this.fetchImage), o(this.fetchImage);
		try {
			await this.slidePull.reset();
		} catch (t) {
			e = n(t) ?? t;
		}
		this.transport.terminate(), this.rawParts.clear();
		try {
			this.closeArchive();
		} catch (t) {
			e ??= n(t) ?? t;
		}
		if (e !== void 0) throw this.metrics.fail(e), e;
		this.metrics.checkpoint("presentation session closed"), this.metrics.succeed({ slides: this.consumedSlides });
	}
	enqueueRender(e) {
		let t = this.renderTail.then(e, e);
		return this.renderTail = t.then(() => void 0, () => void 0), t;
	}
	getPartInternal(e, t, n) {
		return this.rawParts.get(e, t, () => {
			l(this.signal, v);
			let e = n(this.archive);
			return this.refreshResourceUsage(), new Blob([e], { type: t });
		});
	}
	refreshResourceUsage() {
		try {
			this.usage = r(this.archive.resource_usage()), this.metrics.observeUsage(this.usage);
		} catch {}
		return this.usage;
	}
	assertOpen() {
		if (this.closed) throw Error("PPTX presentation session is closed");
		if (this.resourceFailure) throw this.resourceFailure;
	}
	failOperation(e) {
		let r = n(e) ?? e;
		throw r instanceof t && (this.resourceFailure ??= r), this.metrics.fail(r), r;
	}
};
async function C(e, t = {}) {
	return d(() => x(e, t), async (e) => {
		let t = [];
		for await (let n of e.slides()) t.push(n);
		return e.materialize(t);
	});
}
function w(e) {
	return e instanceof Uint8Array ? e : new Uint8Array(e);
}
export { C as n, b as r, S as t };
