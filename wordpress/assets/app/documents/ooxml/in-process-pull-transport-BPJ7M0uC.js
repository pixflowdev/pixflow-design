var e = class {
	dispatch;
	terminateHost;
	nextRequestId = 1;
	terminated = !1;
	constructor(e, t) {
		this.dispatch = e, this.terminateHost = t;
	}
	async request(e, t, n) {
		if (this.terminated) throw Error("pull transport terminated");
		if (n?.signal?.aborted) {
			n.onCancel?.(this.nextRequestId, "abort");
			let e = /* @__PURE__ */ Error("worker request aborted");
			throw e.name = "AbortError", e;
		}
		let r = e(this.nextRequestId++), i;
		if (await this.dispatch(r, (e) => {
			i = e;
		}), i === void 0) throw Error("in-process pull host did not respond");
		return i;
	}
	forgetOrphaned(e) {}
	terminate() {
		this.terminated || (this.terminated = !0, this.terminateHost());
	}
};
export { e as t };
