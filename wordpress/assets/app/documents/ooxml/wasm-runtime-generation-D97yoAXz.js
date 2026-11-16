import { B as e, H as t, V as n, Y as r, z as i } from "./bounded-raw-part-cache-B5a6cGKO.js";
function a(e) {
	return n(e) ? new i(`WASM parser trapped and was recycled: ${e instanceof Error ? e.message : String(e)}`) : null;
}
var o = class {
	realm;
	live = /* @__PURE__ */ new Set();
	constructor(e, n) {
		this.realm = new t(() => e.initSync({ module: n }), () => e.reinit({ module_or_path: n }), a), this.realm.onPoison((e) => {
			for (let t of this.live) t.poison(e);
			this.live.clear();
		});
	}
	async open(e, t) {
		for (;;) {
			this.throwIfOpenAborted(t), await this.awaitReadyOrAbort(t), this.throwIfOpenAborted(t);
			let n = this.realm.tryRunReady(() => r(e));
			if (!n.current) continue;
			let i = new c(this, n.value, n.generation);
			if (this.live.add(i), t?.signal?.aborted) throw i.close(t.disposeOnAbort), t.abortError?.() ?? new DOMException("The operation was aborted", "AbortError");
			return i;
		}
	}
	async awaitReadyOrAbort(e) {
		let t = e?.signal;
		if (!t) {
			await this.realm.ensureReady();
			return;
		}
		this.throwIfOpenAborted(e), await new Promise((n, r) => {
			let i = () => r(e?.abortError?.() ?? new DOMException("The operation was aborted", "AbortError"));
			t.addEventListener("abort", i, { once: !0 }), this.realm.ensureReady().then(n, r).finally(() => {
				t.removeEventListener("abort", i);
			});
		});
	}
	throwIfOpenAborted(e) {
		if (e?.signal?.aborted) throw e.abortError?.() ?? new DOMException("The operation was aborted", "AbortError");
	}
	async ensureReady() {
		await this.realm.ensureReady();
	}
	run(e, t) {
		let n = e.requireLive(this.realm);
		return r(() => this.realm.run(() => t(n)));
	}
	close(e, t) {
		let n = e.detachForClose();
		this.live.delete(e), n && this.realm.run(() => t(n));
	}
};
function s(e, t) {
	let n, r;
	return (i) => {
		if (!r) n = i, r = new o(e, i);
		else if (n !== i) throw Error(`${t} runtime was already initialized with another WebAssembly.Module`);
		return r;
	};
}
var c = class {
	host;
	generation;
	archive;
	failure;
	proxy;
	constructor(e, t, n) {
		this.host = e, this.generation = n, this.archive = t, this.proxy = new Proxy(t, { get: (e, t) => {
			let n = this.host.run(this, (e) => Reflect.get(e, t, e));
			return typeof n == "function" ? (...e) => this.host.run(this, (n) => {
				let r = Reflect.get(n, t, n);
				return Reflect.apply(r, n, e);
			}) : n;
		} });
	}
	run(e) {
		return this.host.run(this, e);
	}
	close(e) {
		this.host.close(this, e);
	}
	requireLive(e) {
		if (this.failure) throw this.failure;
		if (e.assertCurrent(this.generation), !this.archive) throw Error("WASM archive session belongs to a discarded runtime generation");
		return this.archive;
	}
	detachForClose() {
		let e = this.archive;
		return this.archive = void 0, this.failure ? void 0 : e;
	}
	poison(t) {
		let n = this.archive;
		this.failure = t, this.archive = void 0, e(n);
	}
};
export { s as t };
