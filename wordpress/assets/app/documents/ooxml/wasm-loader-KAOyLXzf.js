import { existsSync as e, readFileSync as t } from "node:fs";
import { fileURLToPath as n } from "node:url";
import { basename as r, dirname as i, resolve as a } from "node:path";
async function o(e, t) {
	let n = await e(), r;
	try {
		return await t(n);
	} catch (e) {
		throw r = e, e;
	} finally {
		try {
			await n.close();
		} catch (e) {
			if (r === void 0) throw e;
		}
	}
}
function s(e) {
	return new WebAssembly.Module(t(e));
}
function c(e, t = s) {
	let n = {};
	return () => n.value ??= t(e());
}
function l(t, o, s) {
	let c = i(n(t)), l = a(c, o);
	if (e(l)) return l;
	let u = a(c, r(o));
	return e(u) || !s ? u : n(import.meta.resolve(s));
}
export { l as n, o as r, c as t };
