import { t as e } from "./chunk-D5OxutzX.js";
import { Co as t, Fo as n, Ia as r, So as i, wo as a } from "./plot-area-frame-DNYMd9Pf.js";
import { n as o, t as s } from "./cfb-guard-DzYlucez.js";
import { $t as c, An as l, F as u, G as d, I as f, P as p, Q as m, Qt as h, W as g, Xt as _, _t as ee, ft as v, jn as y, kn as te, lt as b, p as x, t as ne, vn as re } from "./bounded-raw-part-cache-B5a6cGKO.js";
import { A as S, C as ie, D as C, E as w, M as ae, N as oe, P as T, S as se, T as E, _ as ce, a as le, b as ue, c as de, d as fe, f as pe, g as me, h as he, i as ge, j as _e, k as ve, l as ye, m as be, n as xe, o as Se, p as Ce, r as we, t as Te, u as Ee, v as De, w as Oe, x as ke, y as Ae } from "./comment-overlay-controller-b3tKmzMa.js";
import { A as je, B as Me, C as Ne, D, E as Pe, F as Fe, I as Ie, L as O, M as Le, N as k, O as Re, P as ze, R as Be, S as Ve, T as He, V as A, _ as Ue, a as We, b as Ge, c as Ke, f as qe, h as Je, j, k as Ye, l as Xe, m as Ze, n as Qe, o as $e, p as et, s as tt, t as nt, u as rt, v as it, w as at, x as ot, y as M, z as st } from "./document-pull-client-_G-DIh2T.js";
import { f as ct, u as lt } from "./pixel-budget-DI82Hn3R.js";
import { i as ut, t as dt } from "./tiff-contract-DEd8CGuz.js";
import { D as ft, E as pt, T as mt, a as ht, b as gt, c as _t, d as vt, f as yt, i as bt, l as xt, n as St, o as Ct, p as wt, r as Tt, s as Et, t as Dt, u as Ot, v as kt, w as At, x as jt, y as Mt } from "./canvas-viewer-mechanics-BsqaoYgK.js";
import { n as Nt } from "./renderer-module-contract-BuTx2FWJ.js";
var N = (e) => (e.charCodeAt(0) << 24 >>> 0 | e.charCodeAt(1) << 16 | e.charCodeAt(2) << 8 | e.charCodeAt(3)) >>> 0, Pt = N("ttcf"), Ft = N("OTTO"), It = N("true"), Lt = N("typ1"), Rt = N("head"), zt = N("hhea"), Bt = N("OS/2"), Vt = N("cmap"), Ht = N("fvar"), P = [
	[4352, 4607],
	[11904, 12287],
	[12352, 12543],
	[12544, 12591],
	[12592, 12687],
	[12704, 12735],
	[12784, 12799],
	[13312, 19903],
	[19968, 40959],
	[40960, 42191],
	[43360, 43391],
	[44032, 55203],
	[63744, 64255],
	[131072, 205743]
];
function F(e, t, n) {
	return Number.isSafeInteger(t) && Number.isSafeInteger(n) && t >= 0 && n >= 0 && t <= e - n;
}
function Ut(e, t, n) {
	if (n < 16) return !1;
	let r = e.getUint16(t + 2);
	if (r < 16 || r > n) return !1;
	let i = e.getUint16(t + 6);
	if (i === 0 || i % 2 != 0) return !1;
	let a = i / 2, o = t + 14, s = o + a * 2 + 2, c = s + a * 2, l = c + a * 2;
	if (l + a * 2 > t + r) return !1;
	let u = -1;
	for (let t = 0; t < a; t++) {
		let n = e.getUint16(s + t * 2), r = e.getUint16(o + t * 2);
		if (n > r || n <= u) return !1;
		u = r;
	}
	for (let n = 0; n < a; n++) {
		let i = e.getUint16(s + n * 2), a = e.getUint16(o + n * 2), u = e.getInt16(c + n * 2), d = l + n * 2, f = e.getUint16(d);
		for (let [n, o] of P) {
			let s = Math.max(i, n), c = Math.min(a, o);
			if (!(s > c)) {
				if (f === 0) {
					if (s < c || s + u & 65535) return !0;
					continue;
				}
				for (let n = s; n <= c; n++) {
					let a = d + f + (n - i) * 2;
					if (a + 2 > t + r) break;
					let o = e.getUint16(a);
					if (o !== 0 && o + u & 65535) return !0;
				}
			}
		}
	}
	return !1;
}
function Wt(e, t, n, r) {
	if (n < 16) return !1;
	let i = e.getUint32(t + 4), a = e.getUint32(t + 12);
	if (i < 16 || i > n || a > (i - 16) / 12) return !1;
	let o = -1;
	for (let n = 0; n < a; n++) {
		let i = t + 16 + n * 12, a = e.getUint32(i), s = e.getUint32(i + 4), c = e.getUint32(i + 8);
		if (a > s || s > 1114111 || a <= o) return !1;
		if (o = s, a > P[P.length - 1][1]) break;
		for (let [e, t] of P) {
			let n = Math.max(a, e), i = Math.min(s, t);
			if (!(n > i)) {
				if (r) {
					if (c !== 0) return !0;
				} else if (n < i || c + (n - a) !== 0) return !0;
			}
		}
	}
	return !1;
}
function Gt(e, t) {
	if (!t || t.length < 4) return !1;
	let n = e.getUint16(t.offset + 2);
	if (4 + n * 8 > t.length) return !1;
	for (let r = 0; r < n; r++) {
		let n = t.offset + 4 + r * 8, i = e.getUint16(n), a = e.getUint16(n + 2);
		if (i !== 0 && !(i === 3 && (a === 1 || a === 10))) continue;
		let o = e.getUint32(n + 4);
		if (o > t.length - 2) continue;
		let s = t.offset + o, c = t.length - o, l = e.getUint16(s);
		if (l === 4 && Ut(e, s, c) || l === 12 && Wt(e, s, c, !1) || l === 13 && Wt(e, s, c, !0)) return !0;
	}
	return !1;
}
var Kt = 32768, qt = 4096, Jt = 8, Yt = 262144;
function Xt(e, t, n, r) {
	if (n < 16) return null;
	let i = e.getUint16(t + 2);
	if (i < 16 || i > n) return null;
	let a = e.getUint16(t + 6);
	if (a === 0 || a % 2 != 0) return null;
	let o = a / 2, s = t + 14, c = s + o * 2 + 2, l = c + o * 2, u = l + o * 2;
	if (u + o * 2 > t + i) return null;
	let d = [], f = -1, p = -1, m = (e) => {
		d.length > 0 && p + 1 === e ? (p = e, d[d.length - 1] = [f, p]) : (f = p = e, d.push([e, e]));
	}, h = -1;
	for (let n = 0; n < o; n++) {
		let a = e.getUint16(c + n * 2), o = e.getUint16(s + n * 2);
		if (a > o || a <= h) return null;
		h = o;
		let f = e.getInt16(l + n * 2), p = u + n * 2, g = e.getUint16(p);
		for (let n = a; n <= o && n < 65535; n++) if (--r.remaining < 0 || ((g === 0 ? n + f & 65535 : (() => {
			let r = p + g + (n - a) * 2;
			if (r + 2 > t + i) return 0;
			let o = e.getUint16(r);
			return o === 0 ? 0 : o + f & 65535;
		})()) !== 0 && m(n), d.length > Kt)) return null;
	}
	return d;
}
function Zt(e, t, n, r, i) {
	if (n < 16) return null;
	let a = e.getUint32(t + 4), o = e.getUint32(t + 12);
	if (a < 16 || a > n || o > (a - 16) / 12 || o > Kt) return null;
	let s = [], c = -1;
	for (let n = 0; n < o; n++) {
		if (--i.remaining < 0) return null;
		let a = t + 16 + n * 12, o = e.getUint32(a), l = e.getUint32(a + 4), u = e.getUint32(a + 8);
		if (o > l || l > 1114111 || o <= c) return null;
		if (c = l, r) u !== 0 && s.push([o, l]);
		else {
			let e = u === 0 ? o + 1 : o;
			e <= l && s.push([e, l]);
		}
	}
	return s;
}
function Qt(e, t) {
	if (!t || t.length < 4) return [];
	let n = e.getUint16(t.offset + 2);
	if (n > qt || 4 + n * 8 > t.length) return [];
	let r = /* @__PURE__ */ new Set(), i = [];
	for (let a = 0; a < n; a++) {
		let n = t.offset + 4 + a * 8, o = e.getUint16(n), s = e.getUint16(n + 2);
		if (o !== 0 && !(o === 3 && (s === 1 || s === 10))) continue;
		let c = e.getUint32(n + 4);
		if (c > t.length - 2) return [];
		let l = t.offset + c, u = t.length - c, d = e.getUint16(l);
		if (!(o === 0 && s === 5 && d === 14)) {
			if (d !== 4 && d !== 12 && d !== 13) return [];
			if (!r.has(c)) {
				if (r.add(c), r.size > Jt) return [];
				i.push({
					subtable: l,
					availableLength: u,
					format: d
				});
			}
		}
	}
	let a = { remaining: Yt }, o = null;
	for (let t of i) {
		let n = t.format === 4 ? Xt(e, t.subtable, t.availableLength, a) : Zt(e, t.subtable, t.availableLength, t.format === 13, a);
		if (!n?.length) return [];
		if (o === null) {
			o = n;
			continue;
		}
		let r = [], i = 0, s = 0;
		for (; i < o.length && s < n.length;) {
			if (--a.remaining < 0) return [];
			let e = o[i], t = n[s], c = Math.max(e[0], t[0]), l = Math.min(e[1], t[1]);
			if (c <= l) {
				let e = r.at(-1);
				if (e && e[1] + 1 === c) r[r.length - 1] = [e[0], l];
				else {
					if (r.length >= Kt) return [];
					r.push([c, l]);
				}
			}
			e[1] <= t[1] && i++, t[1] <= e[1] && s++;
		}
		if (!r.length) return [];
		o = r;
	}
	return Object.freeze((o ?? []).map((e) => Object.freeze(e)));
}
function $t(e) {
	let t = 0, n = 0;
	for (; t < e.length && n < P.length;) {
		let [r, i] = e[t], [a, o] = P[n];
		if (i < a) t++;
		else if (o < r) n++;
		else return !0;
	}
	return !1;
}
function en(e, t) {
	return tn(e, t, !0);
}
function tn(e, t, n) {
	if (t !== void 0 && (!Number.isSafeInteger(t) || t < 0) || e.byteLength < 12) return null;
	let r = new DataView(e.buffer, e.byteOffset, e.byteLength), i = 0;
	if (r.getUint32(0) === Pt) {
		if (t === void 0 || e.byteLength < 12) return null;
		let n = r.getUint32(8);
		if (t >= n || !F(e.byteLength, 12, n * 4)) return null;
		i = r.getUint32(12 + t * 4);
	} else if (t !== void 0 && t !== 0) return null;
	if (!F(e.byteLength, i, 12)) return null;
	let a = r.getUint32(i);
	if (a !== 65536 && a !== Ft && a !== It && a !== Lt) return null;
	let o = r.getUint16(i + 4);
	if (!F(e.byteLength, i + 12, o * 16)) return null;
	let s = /* @__PURE__ */ new Map();
	for (let t = 0; t < o; t++) {
		let n = i + 12 + t * 16, a = r.getUint32(n), o = r.getUint32(n + 8), c = r.getUint32(n + 12);
		if (s.has(a) || !F(e.byteLength, o, c)) return null;
		s.set(a, {
			offset: o,
			length: c
		});
	}
	if (n && s.has(Ht)) return null;
	let c = s.get(Rt), l = s.get(zt);
	if (!c || c.length < 20 || !l || l.length < 10) return null;
	let u = r.getUint16(c.offset + 18);
	if (u < 16 || u > 16384) return null;
	let d = s.get(Bt), f = d !== void 0 && d.length >= 4 ? r.getInt16(d.offset + 2) : 0, p = d !== void 0 && d.length >= 78, m = d !== void 0 && d.length >= 86 && r.getUint16(d.offset) >= 1, h = n ? Qt(r, s.get(Vt)) : void 0;
	return Object.freeze({
		unitsPerEm: u,
		...f > 0 ? { averageCharWidthRatio: f / u } : {},
		hheaAscent: r.getInt16(l.offset + 4),
		hheaDescent: r.getInt16(l.offset + 6),
		hheaLineGap: r.getInt16(l.offset + 8),
		farEastCodePage: m ? (r.getUint32(d.offset + 78) & 1966080) != 0 : null,
		hasEastAsianCmap: h ? $t(h) : Gt(r, s.get(Vt)),
		...h === void 0 ? {} : { unicodeRanges: h },
		...p ? {
			typoAscent: r.getInt16(d.offset + 68),
			typoDescent: r.getInt16(d.offset + 70),
			typoLineGap: r.getInt16(d.offset + 72),
			winAscent: r.getUint16(d.offset + 74),
			winDescent: r.getUint16(d.offset + 76),
			useTypoMetrics: (r.getUint16(d.offset + 62) & 128) != 0
		} : {}
	});
}
function nn(e, t) {
	if (e.metric.lineHeightRatio != null || !t) return e.metric;
	let n = i(e.requestedFamily, {
		weight: e.weight,
		style: e.style
	});
	if (e.source !== "substitute" && n.some((e) => e.farEastCodePage !== !1)) return e.metric;
	let r = t.ascentRatio + t.lineGapRatio, a = t.descentRatio;
	return Number.isFinite(r) && Number.isFinite(a) && r >= 0 && a >= 0 && r + a > 0 ? Object.freeze({
		...e.metric,
		requiresGlyphCoverage: !0,
		lineHeightRatio: r + a,
		designAscentRatio: r,
		designDescentRatio: a,
		lineGapRatio: t.lineGapRatio,
		...n.length > 0 && e.source === "local" ? { farEastCodePage: !1 } : {}
	}) : e.metric;
}
function rn(e) {
	if (e.metric.lineHeightRatio != null) return;
	let t = i(e.requestedFamily, {
		weight: e.weight,
		style: e.style
	});
	return e.source === "substitute" || t.every((e) => e.farEastCodePage === !1) ? t[0]?.unitsPerEm : void 0;
}
async function an(e) {
	let t = typeof document > "u" ? null : document;
	return Promise.all(e.map(async (e) => {
		let n = rn(e), r = sn(e), i = t?.body && r && n ? await Me(r, e.family, e.weight, e.style, n, t) : null;
		return {
			resourceIdentity: e.resourceIdentity,
			weight: e.weight,
			style: e.style,
			measured: i
		};
	}));
}
function on(e) {
	if (e.source !== "local" || e.weight !== 400 || e.style !== "normal") return !1;
	let t = i(e.requestedFamily);
	return !t.some((e) => e.weight >= 600 && e.style === "normal") || !t.some((e) => e.style === "italic");
}
function sn(e) {
	return e.source === "local" && e.resourceIdentity.startsWith("office-local:local(") ? e.resourceIdentity.slice(13) : void 0;
}
async function cn(e, t, r) {
	let i = typeof document > "u" ? null : document;
	if (!t) return e;
	let a = i?.body && i.fonts === t ? i.createElement("canvas").getContext("2d") : null, o = /* @__PURE__ */ new Map(), s = await Promise.all(Object.entries(e.routes).map(async ([n, s]) => {
		let c = e.faces.find((e) => e.family === s.family), l = rn(s), u = r?.find((e) => e.resourceIdentity === s.resourceIdentity && e.weight === s.weight && e.style === s.style), d = nn(s, c && l && a && i?.body ? st(c, t, a, l, i) : u?.measured ?? null), f = sn(s), p = null, m;
		if (c && f && on(s)) {
			let e = o.get(c);
			e || (e = Be(c, f, t), o.set(c, e)), m = (await e)?.family;
		}
		if (d !== s.metric) {
			if (c && f) {
				let e = o.get(c);
				e || (e = Be(c, f, t), o.set(c, e)), p = await e;
			}
			d = p ? Object.freeze({
				...d,
				glyphCoverageProbeFamily: p.family
			}) : s.metric;
		}
		return {
			key: n,
			route: {
				...s,
				metric: d,
				...m ? { coverageProbeFamily: m } : {}
			},
			probe: p
		};
	})), c = n();
	for (let e of s) c[e.key] = e.route;
	for (let t of o.values()) {
		let n = await t;
		n && e.faces.push(n);
	}
	return {
		...e,
		routes: c
	};
}
async function ln(...e) {
	return cn(await h(...e), e[1] === void 0 ? te() : e[1]);
}
var un = /* @__PURE__ */ new WeakMap();
function I(e, t = []) {
	let n = un.get(e) ?? [], r = new Map(n.map((e) => [JSON.stringify(e), e]));
	for (let e of t) r.set(JSON.stringify(e), Object.freeze({ ...e }));
	un.set(e, Object.freeze([...r.values()]));
}
function dn(e) {
	return un.get(e) ?? [];
}
var fn = "var e=(e,t)=>()=>(e&&(t=e(e=0)),t);function t(e){if(!e.startsWith(`data:`))return null;let t=e.indexOf(`,`);if(t===-1)return null;let n=atob(e.slice(t+1)),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r.buffer}var n,r,i=e((()=>{n=class e extends Error{code;details;constructor(t,n,r){super(n),this.name=`OoxmlError`,this.code=t,t===`unsupported-content`&&r&&(this.details=Object.freeze({format:r.format,reason:r.reason})),Object.setPrototypeOf(this,e.prototype)}},r=class e extends Error{code=`ooxml-resource-limit`;details;constructor(t,n){super(t),this.name=`OoxmlResourceLimitError`;let r=n.violation,i=Object.freeze({format:r.format,operation:r.operation,resource:r.resource,metric:r.metric,...r.part===void 0?{}:{part:r.part},limit:r.limit,observed:r.observed,configurable:r.configurable,usage:Object.freeze({archiveEntryCount:r.usage.archiveEntryCount,declaredInflatedBytes:r.usage.declaredInflatedBytes,...r.usage.largestInflatedEntryBytes===void 0?{}:{largestInflatedEntryBytes:r.usage.largestInflatedEntryBytes},distinctInflatedBytes:r.usage.distinctInflatedBytes,operationInflatedBytes:r.usage.operationInflatedBytes})});this.details=Object.freeze({stage:n.stage,violation:i}),Object.setPrototypeOf(this,e.prototype)}}}));function a(e){return e===`image-dimension`||e===`image-pixels`||e===`active-decoded-bytes`||e===`image-effect-count`||e===`image-effect-work`||e===`tiff-lzw-work`||e===`metafile-path-commands`||e===`metafile-record-points`||e===`metafile-record-polygons`||e===`metafile-record-rectangles`||e===`metafile-record-text-units`}function o(e){return typeof e==`number`&&Number.isSafeInteger(e)&&e>=0}function s(e){if(!(!e||typeof e!=`object`))try{let t=e,n=t.code,r=t.metric,i=t.limit,s=t.observed;return n!==`ooxml-decoded-image-limit`||!a(r)||!o(i)||!o(s)||s<=i?void 0:{metric:r,limit:i,observed:s}}catch{return}}var c,l,u,d,f,ee=e((()=>{c=1<<25,l=1<<27,c*4,l*4,u=Math.floor(c/4),d=l,d/u,f=class e extends RangeError{metric;limit;observed;code=`ooxml-decoded-image-limit`;constructor(t,n,r){super(`OOXML decoded image limit exceeded: ${t} ${r} > ${n}`),this.metric=t,this.limit=n,this.observed=r,this.name=`OoxmlDecodedImageLimitError`,Object.setPrototypeOf(this,e.prototype)}}}));function te(e){if(!(typeof e!=`object`||!e))try{let t=e,n=t.code,r=t.message;return n===`ooxml-tiff-decode`&&typeof r==`string`?{message:r}:void 0}catch{return}}var ne=e((()=>{}));function p(e){return typeof e==`number`&&Number.isSafeInteger(e)&&e>0}function re(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;return p(t.requiredBytes)&&p(t.offeredBytes)&&t.requiredBytes>t.offeredBytes}var m=class e extends RangeError{code=`ooxml-insufficient-credit`;requiredBytes;offeredBytes;constructor(t){super(`Pull unit requires ${t.requiredBytes} bytes but credit is ${t.offeredBytes}`),this.name=`PullSessionInsufficientCreditError`,this.requiredBytes=t.requiredBytes,this.offeredBytes=t.offeredBytes,Object.setPrototypeOf(this,e.prototype)}};function h(e){if(e instanceof m)return e;let t=e instanceof Error?e.message:String(e);if(!t.startsWith(`OOXML_INSUFFICIENT_CREDIT:`))return;let n;try{n=JSON.parse(t.slice(26))}catch{return}if(!n||typeof n!=`object`||Array.isArray(n))return;let r=n;if(!(r.code!==`ooxml-insufficient-credit`||!re(r)))return new m(r)}function ie(e,t,n){let r=h(e);if(!(!r||r.offeredBytes!==t||r.requiredBytes>n))return r}i(),ee(),ne();const g=`OOXML_RESOURCE_LIMIT:`;function _(e){return typeof e==`number`&&Number.isSafeInteger(e)&&e>=0}function v(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;return _(t.archiveEntryCount)&&_(t.declaredInflatedBytes)&&(t.largestInflatedEntryBytes===void 0||_(t.largestInflatedEntryBytes))&&_(t.distinctInflatedBytes)&&_(t.operationInflatedBytes)}function y(e){let t;try{t=JSON.parse(new TextDecoder().decode(e))}catch{throw TypeError(`OOXML resource usage checkpoint is not valid JSON`)}if(!v(t))throw TypeError(`OOXML resource usage checkpoint is invalid`);return t}function ae(e){return e===`docx`||e===`xlsx`||e===`pptx`}function oe(e){return e===`container`||e===`decompression`||e===`parsing`||e===`serialization`||e===`layout`||e===`rendering`||e===`worker`}function b(e,t){return typeof e==`string`&&e.length>0&&e.length<=t&&!/[\\u0000-\\u001f\\u007f]/u.test(e)}function x(e){return b(e,128)&&/^[a-z0-9][a-z0-9-]*$/u.test(e)}function se(e){return!b(e,4096)||e.startsWith(`/`)||e.startsWith(`\\\\`)||e.includes(`\\\\`)||e.includes(`?`)||e.includes(`#`)||e.includes(`://`)||/^[a-z]:/iu.test(e)?!1:e.split(`/`).every(e=>e!==``&&e!==`.`&&e!==`..`)}const S=new Map([[`archive-entry:declared-inflated-bytes`,{stage:`container`,part:`required`}],[`archive-entry:actual-inflated-bytes`,{stage:`decompression`,part:`required`}],[`archive:entry-count`,{stage:`container`,part:`forbidden`}],[`archive:central-directory-bytes`,{stage:`container`,part:`forbidden`,configurable:!1}],[`archive:distinct-inflated-bytes`,{stage:`decompression`,part:`required`}],[`xml-event:bytes`,{stage:`parsing`,part:`optional`,configurable:!1}],[`xml-context:bytes`,{stage:`parsing`,part:`optional`,configurable:!1}],[`image-effect:work`,{stage:`parsing`,part:`forbidden`,configurable:!1}],[`chartex-allocation:elements`,{stage:`parsing`,part:`forbidden`,configurable:!1}],[`chartex-allocation:bytes`,{stage:`parsing`,part:`forbidden`,configurable:!1}],[`chart-cache:points`,{stage:`parsing`,part:`forbidden`,configurable:!1}],[`numbering-marker:bytes`,{stage:`parsing`,part:`forbidden`,configurable:!1}],[`chart-style-formats:entries`,{stage:`parsing`,part:`required`,configurable:!1}],[`chart-custom-number-formats:entries`,{stage:`parsing`,part:`required`,configurable:!1}],[`chart-number-format-bytes:bytes`,{stage:`parsing`,part:`required`,configurable:!1}],[`xml-tree:depth`,{stage:`parsing`,part:`optional`,configurable:!1}],[`worksheet-row:projected-bytes`,{stage:`parsing`,part:`optional`,configurable:!1}],[`worksheet-shell:projected-bytes`,{stage:`parsing`,part:`optional`,configurable:!1}],[`theme-style-reparse:bytes`,{stage:`parsing`,part:`forbidden`,configurable:!1}],[`style-inheritance:depth`,{stage:`parsing`,part:`required`,configurable:!1}],[`complex-field:depth`,{stage:`parsing`,part:`forbidden`,configurable:!1}]]),ce=new Set([...S.keys()].map(e=>e.slice(0,e.indexOf(`:`)))),le=new Set([...S.keys()].map(e=>e.slice(e.indexOf(`:`)+1)));function ue(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;return!ae(t.format)||!b(t.operation,256)||!x(t.resource)||!x(t.metric)||!_(t.limit)||!_(t.observed)||typeof t.configurable!=`boolean`||!v(t.usage)?!1:!(`part`in t)||se(t.part)}function C(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=e;if(!oe(t.stage)||!ue(t.violation))return!1;let n=t.violation,r=S.get(`${n.resource}:${n.metric}`);return r?t.stage!==r.stage||r.configurable===!1&&n.configurable!==!1?!1:r.part===`required`?n.part!==void 0:r.part===`forbidden`?n.part===void 0:!0:!(ce.has(n.resource)&&le.has(n.metric))}function de(e){return{archiveEntryCount:e.archiveEntryCount,declaredInflatedBytes:e.declaredInflatedBytes,...e.largestInflatedEntryBytes===void 0?{}:{largestInflatedEntryBytes:e.largestInflatedEntryBytes},distinctInflatedBytes:e.distinctInflatedBytes,operationInflatedBytes:e.operationInflatedBytes}}function fe(e){if(!C(e))return;let t=e.violation,n={stage:e.stage,violation:{format:t.format,operation:t.operation,resource:t.resource,metric:t.metric,...t.part===void 0?{}:{part:t.part},limit:t.limit,observed:t.observed,configurable:t.configurable,usage:de(t.usage)}};return C(n)?n:void 0}function pe(e){let t=e.violation;return`OOXML resource limit exceeded${t.part?` for ${t.part}`:``} (${t.resource}, ${e.stage}): ${t.metric} ${t.observed} > ${t.limit}`}function w(e){let t=e instanceof Error?e.message:String(e);if(!t.startsWith(g))return;let n;try{n=JSON.parse(t.slice(21))}catch{return}if(!n||typeof n!=`object`)return;let i=n;if(!(i.code!==`ooxml-resource-limit`||!C(i.details)))return new r(pe(i.details),i.details)}function me(e){try{return e()}catch(e){throw e instanceof r||typeof e!=`string`&&!(e instanceof Error)?e:w(e)??e}}function he(e){let t=e instanceof Error?e.message:String(e);if(t.startsWith(`OOXML_NOT_OOXML:`))return new n(`not-ooxml`,`This file is not an Office Open XML document: ${t.slice(16)}`)}function T(e){if(!e||typeof e!=`object`||Array.isArray(e))return;let t=e,n=t.format,r=t.reason;if(!(!x(n)||r!==`source-subset`))return{format:n,reason:r}}function E(e){return new n(`unsupported-content`,`Input is outside the source’s supported subset.`,e)}function ge(e){let t=typeof e==`string`?e:e instanceof Error?e.message:``;if(!(!t.startsWith(`MODEL_SOURCE_UNSUPPORTED:`)||t.length>1024))try{let e=T(JSON.parse(t.slice(25)));return e?E(e):void 0}catch{return}}function _e(e){return e===`OOXML_SOURCE_UNSUPPORTED_ENCRYPTION`||e instanceof Error&&e.message===`OOXML_SOURCE_UNSUPPORTED_ENCRYPTION`?new n(`unsupported-encryption`,`The configured source cannot decrypt this input.`):ge(e)??w(e)??he(e)}function ve(e){let t=s(e);if(t){let e=new f(t.metric,t.limit,t.observed);return{message:e.message,errorName:e.name,code:e.code,decodedImage:t}}let i=te(e);if(i)return{message:i.message,errorName:`TiffDecodeError`,code:`ooxml-tiff-decode`};let a=h(e);if(a)return{message:a.message,errorName:a.name,code:a.code,insufficientCredit:{requiredBytes:a.requiredBytes,offeredBytes:a.offeredBytes}};let o=e instanceof n||e instanceof r?e:_e(e),c=o??e;if(o instanceof r||c&&typeof c==`object`&&c.code===`ooxml-resource-limit`){let e=c,t=fe(e.details);return t?{message:typeof e.message==`string`?e.message:pe(t),errorName:`OoxmlResourceLimitError`,code:`ooxml-resource-limit`,resourceLimit:t}:{message:`Invalid OOXML resource-limit error payload`,errorName:`Error`}}if(c&&typeof c==`object`&&c.code===`unsupported-content`){let e=T(c.details);return e?{message:E(e).message,code:`unsupported-content`,unsupportedContent:e}:{message:`Invalid unsupported-content error payload`,errorName:`Error`}}if(o instanceof n)return{message:typeof o.message==`string`?o.message:String(o.message),errorName:b(o.name,128)?o.name:`OoxmlError`,...x(o.code)?{code:o.code}:{}};let l=e instanceof Error?e.message:String(e);if(typeof l==`string`&&l.startsWith(g))return{message:`Invalid OOXML resource-limit payload`,errorName:`Error`};let u=e instanceof Error?e:Error(l),d=u;return{message:typeof u.message==`string`?u.message:String(u.message),errorName:b(u.name,128)?u.name:`Error`,...typeof d.code==`string`?{code:d.code}:{}}}function D(e){try{return ve(e)}catch{return{message:`Worker operation failed with an unreadable error`,errorName:`Error`}}}var ye=class{initialize;reinitialize;normalizeFailure;state=`uninitialized`;generationValue=0;readiness;poisonListeners=new Set;constructor(e,t,n){this.initialize=e,this.reinitialize=t,this.normalizeFailure=n}get generation(){return this.generationValue}get poisoned(){return this.state===`poisoned`}onPoison(e){return this.poisonListeners.add(e),()=>this.poisonListeners.delete(e)}async ensureReady(){if(this.state!==`ready`){if(!this.readiness){let e=this.state===`uninitialized`?this.initialize:this.reinitialize;this.readiness=Promise.resolve().then(e).then(()=>{this.generationValue+=1,this.state=`ready`,this.readiness=void 0},e=>{throw this.readiness=void 0,e})}await this.readiness}}run(e){try{return e()}catch(e){let t=this.normalizeFailure(e);throw t?(this.poison(t),t):e}}tryRunReady(e){if(this.state!==`ready`)return{current:!1};let t=this.generationValue,n=this.run(e);return this.state!==`ready`||t!==this.generationValue?{current:!1}:{current:!0,generation:t,value:n}}poison(e){this.state=`poisoned`,this.readiness=void 0;for(let t of this.poisonListeners)t(e)}assertCurrent(e){if(this.state!==`ready`||e!==this.generationValue)throw Error(`WASM archive session belongs to a discarded runtime generation`)}},O=class e extends Error{code=`parser-crashed`;constructor(t){super(t),this.name=`WasmTrapError`,Object.setPrototypeOf(this,e.prototype)}};function be(e){let t=globalThis.WebAssembly?.RuntimeError;return t&&e instanceof t||e instanceof RangeError?!0:e instanceof Error?e.name===`RuntimeError`||e.name===`CompileError`||e.name===`LinkError`||e.name===`InternalError`||e.name===`OOMError`:!1}function xe(e){try{if((typeof e!=`object`||!e)&&typeof e!=`function`)return;let t=Reflect.get(e,`__destroy_into_raw`);typeof t==`function`&&Reflect.apply(t,e,[])}catch{}}function Se(e,t){return e({module_or_path:t})}var Ce=class{init;options;runtime;wasmInput=null;currentArchive=null;constructor(e,t={}){this.init=e,this.options=t,this.runtime=new ye(()=>this.invokeConfigured(this.init),()=>this.invokeConfigured(this.options.reinit??this.init),we),this.runtime.onPoison(()=>this.dropPoisonedArchive())}setWasmInput(e){this.wasmInput=e,this.runtime.ensureReady().catch(()=>void 0)}setWasmUrl(e){this.setWasmInput(e)}get archive(){return this.currentArchive}setArchive(e){this.freeArchive(),this.currentArchive=e}disposeArchive(){this.freeArchive()}get poisoned(){return this.runtime.poisoned}async ensureReady(){await this.runtime.ensureReady()}run(e){return me(()=>this.runtime.run(e))}poison(){this.runtime.poison(new O(`WASM parser was recycled`))}invokeConfigured(e){return this.wasmInput===null?Promise.reject(Error(`WasmParserHost: setWasmInput was never called`)):Se(e,this.wasmInput)}freeArchive(){this.currentArchive!==null&&this.options.freeArchive&&this.options.freeArchive(this.currentArchive),this.currentArchive=null}dropPoisonedArchive(){let e=this.currentArchive;this.currentArchive=null,xe(e)}};function we(e){return be(e)?new O(`WASM parser trapped and was recycled: ${e instanceof Error?e.message:String(e)}`):null}function Te(e){return e.byteOffset===0&&e.byteLength===e.buffer.byteLength&&e.buffer instanceof ArrayBuffer?e.buffer:e.slice().buffer}Object.freeze({maxArchiveEntryBytes:134217728,maxTotalInflatedBytes:268435456,maxArchiveEntries:4096});function Ee(e){return[e.maxArchiveEntryBytes===null?0n:BigInt(e.maxArchiveEntryBytes),e.maxTotalInflatedBytes===null?0n:BigInt(e.maxTotalInflatedBytes),e.maxArchiveEntries===null?0n:BigInt(e.maxArchiveEntries)]}const k=`ooxml-pull-v1`;function A(e,t){if(!Number.isSafeInteger(e)||e<=0)throw RangeError(`${t} must be a positive safe integer`)}function De(e){if(!(typeof e==`string`&&e.length>0||typeof e==`number`&&Number.isSafeInteger(e)&&e>0))throw RangeError(`session id must be a non-empty string or positive safe integer`)}var j=class{owner;queue=Promise.resolve();leases=new Map;retainedBytes=0;retainedCount=0;maxRetainedBytes;maxRetainedCount;cleanups=new Set;pendingFatalCleanups=[];poisonRunning=!1;fatal;constructor(e){this.maxRetainedBytes=e?.maxRetainedBytes??64*1024*1024,this.maxRetainedCount=e?.maxRetainedCount??256,A(this.maxRetainedBytes,`max retained lease bytes`),A(this.maxRetainedCount,`max retained lease count`)}enqueue(e){let t=this.queue.then(e,e);return this.queue=t.then(()=>void 0,()=>void 0),t}acquire(e){return this.owner===void 0?(this.owner=e,!0):this.owner===e}release(e){this.owner===e&&(this.owner=void 0)}retainLease(e,t,n){if(!Number.isSafeInteger(n)||n<0)throw RangeError(`retained lease bytes are invalid`);let r=this.leases.get(e)??new Map;if(r.has(t))throw Error(`driver returned a duplicate lease id`);if(this.retainedCount+1>this.maxRetainedCount)throw RangeError(`retained lease count exceeds limit`);if(this.retainedBytes+n>this.maxRetainedBytes)throw RangeError(`retained lease bytes exceed limit`);r.set(t,n),this.leases.set(e,r),this.retainedCount++,this.retainedBytes+=n}releaseLease(e,t){let n=this.leases.get(e),r=n?.get(t);r!==void 0&&(n?.delete(t),n?.size===0&&this.leases.delete(e),this.retainedCount--,this.retainedBytes-=r)}registerCleanup(e){return this.fatal?(this.poisonRunning?this.pendingFatalCleanups.push(e):this.enqueue(e).catch(()=>void 0),()=>void 0):(this.cleanups.add(e),()=>this.cleanups.delete(e))}get fatalError(){return this.fatal}get registeredHostCount(){return this.cleanups.size}async poison(e){if(this.fatal??=e,this.poisonRunning)return this.fatal;this.poisonRunning=!0,this.pendingFatalCleanups.push(...this.cleanups);try{let e;for(;(e=this.pendingFatalCleanups.shift())!==void 0;)await e().catch(()=>void 0)}finally{this.poisonRunning=!1}return this.fatal}},Oe=class{options;coordinator;coordinatorOwner=Symbol(`pull-session-host`);unregisterCleanup;sequence=0;unacked;leases=new Map;activeDriverLeases=new Set;nextWireLeaseId;cancelRequested=!1;cancelComplete=!1;closeRequested=!1;closeComplete=!1;driverCancelComplete=!1;driverCloseComplete=!1;completed=!1;constructor(e){De(e.sessionId),A(e.operationId,`operation id`),A(e.generation,`generation`),A(e.maxByteCredit,`max byte credit`),e.wireLeaseIdStart!==void 0&&A(e.wireLeaseIdStart,`wire lease id start`),this.options=e,this.coordinator=e.coordinator,this.nextWireLeaseId=e.wireLeaseIdStart??1,this.unregisterCleanup=this.coordinator.registerCleanup(()=>this.forceFatalCleanup())}dispatch(e,t){return this.coordinator.enqueue(async()=>{let n=await this.execute(e);try{t(n.response,n.transfer)}catch(e){throw await this.rollbackFailedPost(n),e}})}async rollbackFailedPost(e){let t=e.response;if(t.kind===`chunk`){let n=t.leaseId===void 0?void 0:this.leases.get(t.leaseId);try{await this.options.driver.disposeInvalidChunk?.({payload:t.payload,byteLength:t.byteLength,done:t.done,leaseId:n?.driverLeaseId,retainedBytes:n?.retainedBytes,transfer:e.transfer})}catch{}}this.unacked=void 0,this.coordinator.release(this.coordinatorOwner);for(let[e,t]of[...this.leases])try{await this.options.driver.releaseLease?.(t.driverLeaseId)}catch{}finally{this.leases.delete(e),this.activeDriverLeases.delete(t.driverLeaseId),this.coordinator.releaseLease(this.coordinatorOwner,e)}if(this.cancelRequested=!0,!this.driverCancelComplete)try{await this.options.driver.cancel?.(),this.driverCancelComplete=!0}catch{}this.unregisterCleanup()}async execute(e){try{if(this.isStaleLifecycle(e)){let t=e.kind===`cancel`?`cancel`:`close`;return this.sameOperationIdentity(e)?{response:this.accepted(e,t,!0)}:{response:this.errorResponse(e,{message:`stale lifecycle targets another session or operation`,errorName:`PullSessionProtocolError`,code:`ooxml-stale-lifecycle`})}}this.validateCommandIdentity(e);let t=this.coordinator.fatalError;if(t)return e.kind===`pull`?{response:this.errorResponse(e,t)}:(e.kind===`cancel`?await this.cancel():e.kind===`close`?await this.close():e.kind===`release`&&await this.release(e.leaseId),{response:this.accepted(e,e.kind)});switch(e.kind){case`pull`:return await this.pull(e);case`ack`:return await this.ack(e.sequence),{response:this.accepted(e,`ack`)};case`release`:return await this.release(e.leaseId),{response:this.accepted(e,`release`)};case`cancel`:return await this.cancel(),{response:this.accepted(e,`cancel`)};case`close`:return await this.close(),{response:this.accepted(e,`close`)}}}catch(t){let n=D(t);return n.code===`ooxml-resource-limit`&&(n=await this.coordinator.poison(n)),{response:this.errorResponse(e,n)}}}async pull(e){if(this.closeRequested||this.cancelRequested||this.completed)throw Error(`pull session is closed`);if(this.unacked)throw Error(`previous chunk is not acknowledged`);if(!Number.isSafeInteger(e.sequence)||e.sequence<0||e.sequence!==this.sequence)throw Error(`pull command sequence mismatch`);if(this.validateHostCredit(e.byteCredit),!this.coordinator.acquire(this.coordinatorOwner))throw Error(`another operation has an unacknowledged package chunk`);let t;try{t=await this.options.driver.pull(e.byteCredit)}catch(e){throw this.coordinator.release(this.coordinatorOwner),e}let n=!1,r=!1,i,a;try{let o=this.options.driver.measureChunk(t),s=this.arrayBufferTransferBytes(t.transfer);if(o<s)throw RangeError(`measured chunk bytes are below ArrayBuffer transfer bytes`);if(a=Math.max(o,s),t.leaseId!==void 0){if(A(t.leaseId,`lease id`),t.retainedBytes===void 0)throw Error(`retained lease bytes are required`);if(this.activeDriverLeases.has(t.leaseId))throw r=!0,Error(`driver returned an active duplicate lease id`);i=this.allocateWireLeaseId(),this.coordinator.retainLease(this.coordinatorOwner,i,t.retainedBytes),this.leases.set(i,{driverLeaseId:t.leaseId,retainedBytes:t.retainedBytes}),this.activeDriverLeases.add(t.leaseId),n=!0}else if(t.retainedBytes!==void 0)throw Error(`retained lease bytes require a lease id`);if(!Number.isSafeInteger(a)||a<0)throw RangeError(`host chunk byte length must be a non-negative safe integer`);if(a>e.byteCredit)throw RangeError(`host chunk exceeds byte credit`)}catch(e){let a;try{await this.options.driver.disposeInvalidChunk?.(t)}catch(e){a=e}if(n&&i!==void 0)try{await this.release(i)}catch(e){a??=e}else if(t.leaseId!==void 0&&!r)try{await this.options.driver.releaseLease?.(t.leaseId)}catch(e){a??=e}if(r)try{await this.cancel()}catch(e){a??=e}throw this.coordinator.release(this.coordinatorOwner),a||e}return this.unacked={sequence:this.sequence,done:t.done},{response:{kind:`chunk`,protocol:k,...this.identity(),requestId:e.requestId,sequence:this.sequence,byteLength:a,done:t.done,payload:t.payload,leaseId:i,usage:this.resourceUsage()},transfer:t.transfer}}async ack(e){if(!Number.isSafeInteger(e)||e<0)throw RangeError(`invalid ack sequence`);if(e<this.sequence)return;if(!this.unacked||e!==this.sequence)throw Error(`ack sequence mismatch`);let t=this.unacked.done;await this.options.driver.acknowledge?.(e),this.unacked=void 0,this.coordinator.release(this.coordinatorOwner),this.sequence++,t&&(this.completed=!0,this.maybeUnregisterCompleted())}async release(e){A(e,`wire lease id`);let t=this.leases.get(e);t&&(await this.options.driver.releaseLease?.(t.driverLeaseId),this.leases.delete(e),this.activeDriverLeases.delete(t.driverLeaseId),this.coordinator.releaseLease(this.coordinatorOwner,e),this.maybeUnregisterCompleted())}async cancel(){if(this.cancelComplete)return;this.cancelRequested=!0,this.unacked=void 0,this.coordinator.release(this.coordinatorOwner);let e;try{await this.releaseAllLeases()}catch(t){e=t}if(!this.driverCancelComplete)try{await this.options.driver.cancel?.(),this.driverCancelComplete=!0}catch(t){e??=t}if(e)throw e;this.cancelComplete=!0,this.unregisterCleanup()}async close(){if(this.closeComplete)return;this.closeRequested=!0,this.unacked=void 0,this.coordinator.release(this.coordinatorOwner);let e;try{await this.releaseAllLeases()}catch(t){e=t}if(!this.driverCloseComplete)try{await this.options.driver.close?.(),this.driverCloseComplete=!0}catch(t){e??=t}if(e)throw e;this.closeComplete=!0,this.unregisterCleanup()}async releaseAllLeases(){let e;for(let t of[...this.leases.keys()])try{await this.release(t)}catch(t){e??=t}if(e)throw e}validateCommandIdentity(e){if(e.protocol!==`ooxml-pull-v1`||e.sessionId!==this.options.sessionId||e.operationId!==this.options.operationId||e.generation!==this.options.generation||!Number.isSafeInteger(e.requestId)||e.requestId<=0)throw Error(`stale or mismatched pull session command`)}validateHostCredit(e){if(A(e,`byte credit`),e>this.options.maxByteCredit)throw RangeError(`byte credit exceeds host maximum`)}accepted(e,t,n=!1){return{kind:`accepted`,protocol:k,...n?{sessionId:e.sessionId,operationId:e.operationId,generation:e.generation}:this.identity(),requestId:e.requestId,command:t,usage:this.resourceUsage()}}identity(){return{sessionId:this.options.sessionId,operationId:this.options.operationId,generation:this.options.generation}}isStaleLifecycle(e){return(e.kind===`cancel`||e.kind===`close`)&&e.protocol===`ooxml-pull-v1`&&Number.isSafeInteger(e.requestId)&&e.requestId>0&&Number.isSafeInteger(e.generation)&&e.generation>0&&e.generation<this.options.generation}sameOperationIdentity(e){return e.sessionId===this.options.sessionId&&e.operationId===this.options.operationId}errorResponse(e,t){return{kind:`error`,protocol:k,sessionId:e.sessionId,operationId:e.operationId,generation:e.generation,requestId:e.requestId,error:t,usage:this.errorResourceUsage()}}async forceFatalCleanup(){this.cancelRequested=!0,this.unacked=void 0,this.coordinator.release(this.coordinatorOwner);let e;for(let t of[...this.leases.keys()])try{await this.release(t)}catch(t){e??=t}if(!this.driverCancelComplete)try{await this.options.driver.cancel?.(),this.driverCancelComplete=!0}catch(t){e??=t}if(e)throw e;this.unregisterCleanup()}allocateWireLeaseId(){if(!Number.isSafeInteger(this.nextWireLeaseId)||this.nextWireLeaseId<=0)throw RangeError(`wire lease id space exhausted`);return this.nextWireLeaseId++}arrayBufferTransferBytes(e){let t=0;for(let n of e??[])if(n instanceof ArrayBuffer&&(t+=n.byteLength,!Number.isSafeInteger(t)))throw RangeError(`ArrayBuffer transfer bytes overflow`);return t}maybeUnregisterCompleted(){this.completed&&this.leases.size===0&&this.unregisterCleanup()}resourceUsage(){return this.options.driver.resourceUsage?.()}errorResourceUsage(){try{return this.resourceUsage()}catch{return}}};i();function ke(e){let t=e instanceof Error?e.message:String(e);if(!t.startsWith(`OOXML_DOCX_ILVL:`))return;let r=t.slice(16);if(r===`repair-required:level-definition`)return new n(`invalid-numbering`,`The DOCX defines a numbering level outside Word’s supported 0–8 range and requires repair.`);if(r===`cannot-open:whitespace`||r===`cannot-open:non-decimal`)return new n(`invalid-numbering`,`Word cannot open this DOCX numbering level (${r.slice(12)}).`)}function M(e){try{return ke(e)??e}catch{return e}}function Ae(e){try{return e()}catch(e){throw M(e)}}var N=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,P.unregister(this),e}free(){let e=this.__destroy_into_raw();J.__wbg_docxarchive_free(e,0)}acknowledge_document_chunk(e,t,n){let r=J.docxarchive_acknowledge_document_chunk(this.__wbg_ptr,e,t,n);if(r[1])throw U(r[0])}assert_healthy(){let e=J.docxarchive_assert_healthy(this.__wbg_ptr);if(e[1])throw U(e[0])}cancel_document_cursor(){J.docxarchive_cancel_document_cursor(this.__wbg_ptr)}close_document_session(){J.docxarchive_close_document_session(this.__wbg_ptr)}document_chunk_done(){let e=J.docxarchive_document_chunk_done(this.__wbg_ptr);if(e[2])throw U(e[1]);return e[0]!==0}document_cursor_resource_usage(){let e=J.docxarchive_document_cursor_resource_usage(this.__wbg_ptr);if(e[3])throw U(e[2]);let t;return e[0]!==0&&(t=F(e[0],e[1]).slice(),J.__wbindgen_free(e[0],e[1]*1,1)),t}extract_image(e){let t=H(e,J.__wbindgen_malloc,J.__wbindgen_realloc),n=q,r=J.docxarchive_extract_image(this.__wbg_ptr,t,n);if(r[3])throw U(r[2]);var i=F(r[0],r[1]).slice();return J.__wbindgen_free(r[0],r[1]*1,1),i}constructor(e,t,n,r){let i=Me(e,J.__wbindgen_malloc),a=q,o=J.docxarchive_new(i,a,!V(t),V(t)?BigInt(0):t,!V(n),V(n)?BigInt(0):n,!V(r),V(r)?BigInt(0):r);if(o[2])throw U(o[1]);return this.__wbg_ptr=o[0]>>>0,P.register(this,this.__wbg_ptr,this),this}open_document_cursor(e,t){let n=J.docxarchive_open_document_cursor(this.__wbg_ptr,e,t);if(n[1])throw U(n[0])}parse(){let e=J.docxarchive_parse(this.__wbg_ptr);if(e[3])throw U(e[2]);var t=F(e[0],e[1]).slice();return J.__wbindgen_free(e[0],e[1]*1,1),t}pull_document_chunk(e,t,n,r){let i=J.docxarchive_pull_document_chunk(this.__wbg_ptr,e,t,n,r);if(i[3])throw U(i[2]);var a=F(i[0],i[1]).slice();return J.__wbindgen_free(i[0],i[1]*1,1),a}resource_usage(){let e=J.docxarchive_resource_usage(this.__wbg_ptr);if(e[3])throw U(e[2]);var t=F(e[0],e[1]).slice();return J.__wbindgen_free(e[0],e[1]*1,1),t}to_markdown(){let e,t;try{let i=J.docxarchive_to_markdown(this.__wbg_ptr);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,U(i[2]);return e=n,t=r,R(n,r)}finally{J.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(N.prototype[Symbol.dispose]=N.prototype.free);function je(){return{__proto__:null,\"./docx_parser_bg.js\":{__proto__:null,__wbg___wbindgen_throw_6b64449b9b9ed33c:function(e,t){throw Error(R(e,t))},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,r;try{n=e,r=t,console.error(R(e,t))}finally{J.__wbindgen_free(n,r,1)}},__wbg_new_227d7c05414eb861:function(){return Error()},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=H(n,J.__wbindgen_malloc,J.__wbindgen_realloc),i=q;L().setInt32(e+4,i,!0),L().setInt32(e+0,r,!0)},__wbindgen_cast_0000000000000001:function(e,t){return R(e,t)},__wbindgen_init_externref_table:function(){let e=J.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}const P=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>J.__wbg_docxarchive_free(e>>>0,1));function F(e,t){return e>>>=0,B().subarray(e/1,e/1+t)}let I=null;function L(){return(I===null||I.buffer.detached===!0||I.buffer.detached===void 0&&I.buffer!==J.memory.buffer)&&(I=new DataView(J.memory.buffer)),I}function R(e,t){return e>>>=0,Ne(e,t)}let z=null;function B(){return(z===null||z.byteLength===0)&&(z=new Uint8Array(J.memory.buffer)),z}function V(e){return e==null}function Me(e,t){let n=t(e.length*1,1)>>>0;return B().set(e,n/1),q=e.length,n}function H(e,t,n){if(n===void 0){let n=K.encode(e),r=t(n.length,1)>>>0;return B().subarray(r,r+n.length).set(n),q=n.length,r}let r=e.length,i=t(r,1)>>>0,a=B(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=B().subarray(i+o,i+r),a=K.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return q=o,i}function U(e){let t=J.__wbindgen_externrefs.get(e);return J.__externref_table_dealloc(e),t}let W=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});W.decode();let G=0;function Ne(e,t){return G+=t,G>=2146435072&&(W=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),W.decode(),G=t),W.decode(B().subarray(e,e+t))}const K=new TextEncoder;`encodeInto`in K||(K.encodeInto=function(e,t){let n=K.encode(e);return t.set(n),{read:e.length,written:n.length}});let q=0,J;function Pe(e,t){return J=e.exports,I=null,z=null,J.__wbindgen_start(),J}async function Fe(e,t){if(typeof Response==`function`&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(e.ok&&n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn(\"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n\",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}else{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}async function Y(e){if(J!==void 0)return J;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`));let t=je();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:n,module:r}=await Fe(await e,t);return Pe(n,r)}async function Ie(e){return J=void 0,I=null,z=null,Y(e)}function Le(e){let t=e(e=>e.document_cursor_resource_usage?.());return t?y(t):void 0}const Re=67108864;var ze=class{archive;coordinator=new j;host=null;identity=null;executeArchive;constructor(e,t=e=>e(this.requireArchive())){this.archive=e,this.executeArchive=e=>Ae(()=>t(e))}open(e){if(this.host)throw Error(`a DOCX document pull session is already active`);this.executeArchive(t=>{t.open_document_cursor(e.operationId,e.generation)});let t=0;this.identity=e,this.host=new Oe({...e,maxByteCredit:Re,coordinator:this.coordinator,driver:{pull:n=>{let r;try{r=this.executeArchive(r=>r.pull_document_chunk(t,e.operationId,e.generation,n))}catch(e){throw ie(e,n,Re)||e}let i=Te(r);return{payload:i,byteLength:i.byteLength,done:this.executeArchive(e=>e.document_chunk_done()),transfer:[i]}},measureChunk:({payload:e})=>e.byteLength,acknowledge:n=>{if(n!==t)throw Error(`DOCX document acknowledgement sequence mismatch`);this.executeArchive(n=>n.acknowledge_document_chunk(t,e.operationId,e.generation)),t+=1},cancel:()=>this.executeArchive(e=>e.cancel_document_cursor()),close:()=>this.executeArchive(e=>e.close_document_session()),resourceUsage:()=>Le(this.executeArchive)}})}dispatch(e,t){return!this.host||!this.identity?(t({protocol:k,kind:`error`,sessionId:e.sessionId,operationId:e.operationId,generation:e.generation,requestId:e.requestId,error:D(Error(`DOCX document pull session is not open`))}),Promise.resolve()):this.host.dispatch(e,t)}async reset(){if(this.host)try{this.archive()&&this.executeArchive(e=>e.close_document_session())}finally{this.host=null,this.identity=null,this.coordinator=new j}}requireArchive(){let e=this.archive();if(!e)throw Error(`No docx loaded`);return e}};function Be(e){return!!e&&typeof e==`object`&&e.protocol===`ooxml-pull-v1`}const X=new Ce(Y,{freeArchive:e=>e.free(),reinit:Ie}),Z=new ze(()=>X.archive,e=>X.run(()=>{let t=X.archive;if(!t)throw Error(`No docx loaded`);return e(t)}));let Q=0;const $=(e,t)=>self.postMessage(e,t);self.onmessage=async e=>{let n=e.data;if(Be(n)){try{await Z.dispatch(n,$)}catch(e){$({protocol:k,kind:`error`,sessionId:n.sessionId,operationId:n.operationId,generation:n.generation,requestId:n.requestId,error:D(M(e))})}return}if(n.type===`init`){X.setWasmInput(t(n.wasmUrl)??n.wasmUrl);return}let r=n.id;try{if(await X.ensureReady(),n.type!==`parse`&&X.archive){let e=X.archive;X.run(()=>e.assert_healthy())}if(n.type===`parse`){await Z.reset();let[e,t,i]=Ee(n.resourcePolicy),a=new Uint8Array(n.data);X.run(()=>{let n=new N(a,e,t,i);X.setArchive(n)}),Q+=1;let o={sessionId:Q,operationId:Q,generation:Q};Z.open(o),$({type:`documentSessionOpened`,id:r,...o});return}let e=X.archive;if(n.type===`extractImage`){if(!e)throw Error(`No docx loaded`);let t=X.run(()=>e.extract_image(n.path).buffer),i={type:`imageExtracted`,id:r,bytes:t};self.postMessage(i,[t]);return}if(n.type===`resourceUsage`){if(!e)throw Error(`No docx loaded`);$({type:`resourceUsage`,id:r,usage:y(X.run(()=>e.resource_usage()))});return}if(n.type===`toMarkdown`){if(!e)throw Error(`No docx loaded`);$({type:`markdownRendered`,id:r,markdown:X.run(()=>e.to_markdown())});return}}catch(e){$({type:`error`,id:r,...D(M(e))})}};", pn = typeof self < "u" && self.Blob && new Blob(["URL.revokeObjectURL(import.meta.url);", fn], { type: "text/javascript;charset=utf-8" });
function mn(e) {
	let t;
	try {
		if (t = pn && (self.URL || self.webkitURL).createObjectURL(pn), !t) throw "";
		let n = new Worker(t, {
			type: "module",
			name: e?.name
		});
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(fn), {
			type: "module",
			name: e?.name
		});
	}
}
var hn = new URL("docx_parser_bg.wasm", import.meta.url).href;
function gn(e) {
	return e === "nativeRouteSentinels" ? "[ooxml] mode: 'worker' fell back to main-thread rendering because the worker cannot register the font probes that size absent-font lines." : "[ooxml] mode: 'worker' fell back to main-thread rendering because this document requires DOM OpenType vertical glyph selection.";
}
function _n(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.pages) for (let e of n.bookmarkStarts) e.name !== "" && !t.has(e.name) && t.set(e.name, n.pageIndex);
	return t;
}
var vn = new Uint32Array([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]);
function yn(e) {
	let t = new Uint32Array([
		1779033703,
		3144134277,
		1013904242,
		2773480762,
		1359893119,
		2600822924,
		528734635,
		1541459225
	]), n = new Uint32Array(64), r = Math.ceil((e.length + 9) / 64) * 64, i = e.length * 8, a = (t) => t < e.length ? e[t] : t === e.length ? 128 : t >= r - 8 ? Math.floor(i / 2 ** ((r - t - 1) * 8)) & 255 : 0, o = (e, t) => e >>> t | e << 32 - t;
	for (let e = 0; e < r; e += 64) {
		for (let t = 0; t < 16; t++) {
			let r = e + t * 4;
			n[t] = a(r) << 24 | a(r + 1) << 16 | a(r + 2) << 8 | a(r + 3);
		}
		for (let e = 16; e < 64; e++) {
			let t = n[e - 15], r = n[e - 2], i = o(t, 7) ^ o(t, 18) ^ t >>> 3, a = o(r, 17) ^ o(r, 19) ^ r >>> 10;
			n[e] = n[e - 16] + i + n[e - 7] + a >>> 0;
		}
		let [r, i, s, c, l, u, d, f] = t;
		for (let e = 0; e < 64; e++) {
			let t = o(l, 6) ^ o(l, 11) ^ o(l, 25), a = l & u ^ ~l & d, p = f + t + a + vn[e] + n[e] >>> 0, m = (o(r, 2) ^ o(r, 13) ^ o(r, 22)) + (r & i ^ r & s ^ i & s) >>> 0;
			f = d, d = u, u = l, l = c + p >>> 0, c = s, s = i, i = r, r = p + m >>> 0;
		}
		t[0] = t[0] + r >>> 0, t[1] = t[1] + i >>> 0, t[2] = t[2] + s >>> 0, t[3] = t[3] + c >>> 0, t[4] = t[4] + l >>> 0, t[5] = t[5] + u >>> 0, t[6] = t[6] + d >>> 0, t[7] = t[7] + f >>> 0;
	}
	let s = new Uint8Array(32), c = new DataView(s.buffer);
	return t.forEach((e, t) => c.setUint32(t * 4, e)), s;
}
var bn = re, xn = 64, L = 2;
async function Sn(e, t) {
	let n;
	try {
		n = globalThis.crypto?.subtle ? new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", e.slice().buffer)) : yn(e);
	} catch {
		n = yn(e);
	}
	let r = Array.from(n, (e) => e.toString(16).padStart(2, "0")).join(""), i = 2166136261;
	for (let e of t.trim().toLowerCase()) i ^= e.codePointAt(0), i = Math.imul(i, 16777619);
	return `__ooxml_docx_embedded_${r}_${(i >>> 0).toString(16)}`;
}
async function Cn(e, t) {
	let n = e.embeddedFonts;
	if (!n || n.length === 0) return {
		faces: [],
		metrics: {},
		routes: []
	};
	let r = [], i = /* @__PURE__ */ new Set();
	for (let e of n) {
		let t = wn(e.style) === "bold" ? 700 : 400, n = Tn(e.style), a = `${A(e.fontName)}:${t}:${n}`;
		i.has(a) || (i.add(a), r.push(e));
	}
	let o = [], s = 0, c = Math.min(r.length, xn), l = r.length - c;
	for (let e = 0; e < c; e += L) {
		let n = r.slice(e, Math.min(e + L, c)), i = await Promise.all(n.map(async (e) => {
			try {
				return await t(e.partPath);
			} catch (e) {
				if (e instanceof a || ct(e)) throw e;
				let t = d(e);
				if (t) throw t;
				return null;
			}
		}));
		for (let e = 0; e < n.length; e++) {
			let t = n[e], r = i[e];
			if (r) {
				if (!ae(r) || r.byteLength > bn - s) {
					l++;
					continue;
				}
				try {
					let e = t.partPath.toLowerCase().endsWith(".odttf") ? _e(r, t.fontKey ?? "") : r, n = await Sn(e, t.fontName), i = {
						family: n,
						bytes: e,
						odttf: !1,
						fontKey: "",
						weight: wn(t.style),
						style: Tn(t.style)
					}, a = null;
					try {
						let r = en(e), o = r?.farEastCodePage == null ? null : je({
							...r,
							farEastCodePage: r.farEastCodePage
						});
						(o || r?.averageCharWidthRatio != null) && (a = Object.freeze({
							family: n,
							requestedFamily: t.fontName,
							weight: i.weight === "bold" ? 700 : 400,
							style: i.style,
							sourceIdentity: `embedded:${n}`,
							synthesized: !1,
							...o ? {
								lineHeightRatio: o.lineHeightRatio,
								designAscentRatio: o.designAscentRatio,
								designDescentRatio: o.designDescentRatio
							} : {},
							...r?.averageCharWidthRatio == null ? {} : { averageCharWidthRatio: r.averageCharWidthRatio },
							unicodeRanges: r?.unicodeRanges ?? [],
							...o && r?.hasEastAsianCmap ? { eastAsianLineHeightRatio: o.lineHeightRatio } : {}
						}));
					} catch {}
					o.push({
						face: i,
						metric: a,
						route: {
							requestedFamily: t.fontName,
							resolvedFamily: i.family,
							weight: i.weight === "bold" ? 700 : 400,
							style: i.style,
							resourceIdentity: `embedded:${i.family}`
						}
					}), s += r.byteLength;
				} catch {
					continue;
				}
			}
		}
	}
	let u = Object.freeze(l > 0 ? [Object.freeze({
		code: "MISSING_RESOURCE",
		severity: "warning",
		message: `Skipped ${l} embedded font face(s) under the document font resource limits; fallback fonts are used`
	})] : []), f = o;
	if (f.length === 0) return {
		faces: [],
		metrics: {},
		routes: [],
		diagnostics: u
	};
	let p = [], m = /* @__PURE__ */ new Set();
	try {
		for (let e = 0; e < f.length; e += L) {
			let t = f.slice(e, e + L);
			for (let e of await oe(t.map((e) => e.face))) m.has(e) ? T([e]) : (m.add(e), p.push(e));
		}
	} catch (e) {
		throw T(p), e;
	}
	let h = new Set(p.map((e) => {
		let t = e.family.trim().replace(/^(['"])(.*)\1$/, "$2"), n = e.weight === "bold" ? 700 : Number(e.weight) || 400, r = e.style === "italic" ? "italic" : "normal";
		return `${A(t)}:${n}:${r}`;
	})), g = Object.create(null), _ = [];
	for (let e of f) {
		let t = A(e.face.family), n = e.face.weight === "bold" ? 700 : 400, r = e.face.style, i = `${t}:${n}:${r}`;
		if (!h.has(i) || (_.push(Object.freeze(e.route)), !e.metric)) continue;
		let a = A(e.route.requestedFamily);
		g[n === 400 && r === "normal" ? a : `${a}:${n}:${r}`] = e.metric;
	}
	return {
		faces: p,
		metrics: Object.freeze(g),
		routes: Object.freeze(_),
		diagnostics: u
	};
}
function wn(e) {
	return e === "bold" || e === "boldItalic" ? "bold" : "normal";
}
function Tn(e) {
	return e === "italic" || e === "boldItalic" ? "italic" : "normal";
}
var En = vt, Dn = 16384;
function On(e, t) {
	let n = [], r = 0, i = !1;
	for (let a of e) {
		if (a.length === 0) continue;
		if (r > 0) {
			if (r >= t) {
				i = !0;
				break;
			}
			n.push("\n"), r++;
		}
		let e = wt(a, Math.max(0, t - r));
		if (n.push(e), r += e.length, e.length < a.length) {
			i = !0;
			break;
		}
	}
	let a = n.join("");
	return {
		...a.length === 0 ? {} : { text: a },
		truncated: i
	};
}
function* R(e) {
	if (e.kind === "paragraph") {
		for (let t of e.lines) {
			let e = t.placements.flatMap((e) => e.kind === "text" && !e.optionalHyphenGlyph ? [e.text] : []).join("");
			e && (yield e);
		}
		return;
	}
	if (e.kind === "table") {
		for (let t of e.rows) for (let e of t.cells) for (let t of e.blocks) yield* R(t.layout);
		return;
	}
	if (e.kind === "note") {
		e.leading?.paragraph && (yield* R(e.leading.paragraph));
		for (let t of e.story.blocks) yield* R(t);
		e.trailing?.paragraph && (yield* R(e.trailing.paragraph));
	} else if (e.kind === "textbox") for (let t of e.story.blocks) yield* R(t);
}
function* kn(e) {
	for (let t of e.drawing.commands) (t.kind === "text" || t.kind === "watermark-text") && (yield t.text);
	for (let t of e.textBoxes) yield* R(t);
}
function An(e) {
	let t = e ?? Dn;
	if (!Number.isFinite(t) || t < 0) throw RangeError("maxTextCharacters must be a finite non-negative number.");
	return Math.min(En, Math.floor(t));
}
function jn(e) {
	return {
		story: e.story,
		storyInstance: e.storyInstance,
		path: [...e.path]
	};
}
function Mn(e) {
	return "drawing" in e ? e.drawing.inkBounds : e.placement.bounds;
}
function Nn(e) {
	let t = Mn(e), n = [
		D(e.pointToPage, t),
		D(e.pointToPage, {
			xPt: t.xPt + t.widthPt,
			yPt: t.yPt
		}),
		D(e.pointToPage, {
			xPt: t.xPt,
			yPt: t.yPt + t.heightPt
		}),
		D(e.pointToPage, {
			xPt: t.xPt + t.widthPt,
			yPt: t.yPt + t.heightPt
		})
	], r = Math.min(...n.map((e) => e.xPt)), i = Math.min(...n.map((e) => e.yPt)), a = Math.max(...n.map((e) => e.xPt)), o = Math.max(...n.map((e) => e.yPt));
	return {
		xPt: r,
		yPt: i,
		widthPt: a - r,
		heightPt: o - i
	};
}
function z(e, t) {
	return t.xPt >= e.xPt && t.xPt <= e.xPt + e.widthPt && t.yPt >= e.yPt && t.yPt <= e.yPt + e.heightPt;
}
function Pn(e, t) {
	let n = !1;
	for (let r = 0, i = t.length - 1; r < t.length; i = r++) {
		let a = t[r], o = t[i];
		a.yPt > e.yPt != o.yPt > e.yPt && e.xPt < (o.xPt - a.xPt) * (e.yPt - a.yPt) / (o.yPt - a.yPt) + a.xPt && (n = !n);
	}
	return n;
}
function Fn(e, t) {
	return z(e.inkBounds, t) ? e.clip ? e.clip.kind === "rect" ? z(e.clip.rect, t) : Pn(t, e.clip.points) : !0 : !1;
}
function In(e, t, n) {
	for (let n of e.clips) {
		let e = Pe(n.pointToPage, t);
		if (!e || !z(n.bounds, e)) return !1;
	}
	return "drawing" in e ? Fn(e.drawing, n) : z(e.placement.bounds, n);
}
function B(e, t) {
	return e.commands.find((e) => e.kind === "resource" && e.resourceKind === t);
}
function Ln(e) {
	return B(e, "chart") ? "chart" : e.commands.some((e) => e.kind === "drawingml-shape" || e.kind === "drawingml-image-fill" || e.kind === "fill-rect" || e.kind === "stroke-rect" || e.kind === "text" || e.kind === "watermark-text") ? "shape" : B(e, "image") ? "image" : null;
}
function Rn(e, t, n, r, i, a) {
	let o = "drawing" in e ? Ln(e.drawing) : e.placement.resourceKind;
	if (!o) return null;
	let s, c = !1, l, u;
	if (o === "chart") {
		let t = "drawing" in e ? B(e.drawing, "chart").resourceKey : e.placement.resourceKey, n = i.resolve(t, "chart"), r = yt(n.model, a);
		s = r.text, c = r.truncated, u = n.model.series.length;
	} else if (o === "image") {
		let t = "drawing" in e ? B(e.drawing, "image").resourceKey : e.placement.resourceKey, n = i.descriptors.find((e) => e.resourceKey === t && e.kind === "image" && "mimeType" in e);
		if (!n) throw Error(`Unknown image paint resource: ${t}`);
		l = n.mimeType;
	} else {
		let t = On(kn(e), a);
		s = t.text, c = t.truncated;
	}
	return {
		format: "docx",
		kind: "element",
		pageIndex: t,
		elementIndex: n,
		elementType: o,
		point: { ...r },
		bounds: Nn(e),
		source: jn("drawing" in e ? e.drawing.source : e.source),
		...s === void 0 ? {} : { text: s },
		...l === void 0 ? {} : { mimeType: l },
		...u === void 0 ? {} : { seriesCount: u },
		truncated: c,
		truncationReasons: c ? ["text"] : [],
		textCharacters: s?.length ?? 0,
		maxTextCharacters: a
	};
}
function zn(e, t, n, r, i = {}) {
	if (!Number.isFinite(n.xPt) || !Number.isFinite(n.yPt)) throw RangeError("DOCX hit-test point must contain finite page coordinates.");
	let a = An(i.maxTextCharacters), o = at(e, t);
	for (let e = o.length - 1; e >= 0; e--) {
		let i = o[e], s = Pe(i.pointToPage, n);
		if (!s || !In(i, n, s)) continue;
		let c = Rn(i, t, e, n, r, a);
		if (c) return c;
	}
	return null;
}
function Bn(e, t, n, r) {
	return zn(Re(e, {
		currentDate: r.currentDate,
		defaultCurrentDateMs: r.defaultCurrentDateMs,
		showTrackedChanges: r.showTrackedChanges
	}, t).layout, t, n, Fe(e), r);
}
function Vn(e, t) {
	let n = An(t), r = e.text === void 0 ? void 0 : wt(e.text, n), i = e.truncated || e.text !== void 0 && r.length < e.text.length;
	return {
		...structuredClone(e),
		...r === void 0 ? {} : { text: r },
		truncated: i,
		truncationReasons: i ? ["text"] : [],
		textCharacters: r?.length ?? 0,
		maxTextCharacters: n
	};
}
function Hn(e) {
	if (e === void 0) return;
	let t = e.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
	if (/^[+-]?\d+$/.test(t)) try {
		return BigInt(t).toString();
	} catch {
		return;
	}
}
function Un(e) {
	return Object.freeze({
		...e,
		path: Object.freeze([...e.path])
	});
}
function Wn(e) {
	return Object.freeze({
		source: Un(e.source),
		runIndex: e.boundary,
		affinity: e.boundary < e.runCount ? "following" : "preceding"
	});
}
function V(e, t) {
	let n = e.runs, r = 0;
	for (let e = 0; e < Math.min(t, n.length); e += 1) n[e]?.type !== "unavailableDrawing" && (r += 1);
	return r;
}
function Gn(e, t, n, r, i = t.boundary) {
	return Object.freeze({
		commentId: e,
		source: Un(t.source),
		startRunIndex: t.boundary,
		endRunIndex: i,
		reference: Wn(n),
		...r === void 0 ? {} : { geometryFallback: Object.freeze({
			source: Un(r.source),
			sourceRunIndex: r.boundary
		}) }
	});
}
function Kn(e, t) {
	let n = e.flatMap(({ paragraph: e, source: n }, r) => {
		let i = V(e, e.runs.length);
		return [...t.get(O(n)) ?? []].sort((e, t) => e - t).map((e) => ({
			paragraphIndex: r,
			source: n,
			boundary: e,
			runCount: i
		}));
	});
	return {
		locations: n,
		paragraphIndices: new Set(n.map(({ paragraphIndex: e }) => e))
	};
}
function qn(e, t) {
	return e.paragraphIndex - t.paragraphIndex || e.boundary - t.boundary;
}
function Jn(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + Math.floor((r - n) / 2);
		qn(e[i], t) < 0 ? n = i + 1 : r = i;
	}
	return n;
}
function Yn(e, t) {
	if (t.paragraphIndices.has(e.paragraphIndex)) return;
	let n = Jn(t.locations, e), r = t.locations[n], i = n > 0 ? t.locations[n - 1] : void 0;
	return Wn(e).affinity === "following" ? r ?? i : i ?? r;
}
function Xn(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Set();
	for (let e of t) {
		let t = Hn(e);
		t === void 0 || i.has(t) || (r.has(t) ? (r.delete(t), i.add(t)) : r.set(t, e));
	}
	let a = /* @__PURE__ */ new Map();
	for (let [t, { paragraph: n, source: r }] of e.entries()) for (let e of n.commentMarks ?? []) {
		let i = Hn(e.id);
		if (i === void 0) continue;
		let o = a.get(i) ?? {
			starts: [],
			ends: [],
			references: []
		};
		a.set(i, o);
		let s = {
			paragraphIndex: t,
			source: r,
			boundary: V(n, e.runIndex),
			runCount: V(n, n.runs.length)
		};
		e.kind === "rangeStart" ? o.starts.push(s) : e.kind === "rangeEnd" ? o.ends.push(s) : e.kind === "reference" && o.references.push(s);
	}
	let o = [], s = Kn(e, n);
	for (let [t, n] of a) {
		let i = r.get(t);
		if (i === void 0 || n.references.length !== 1) continue;
		let a = n.references[0];
		if (n.starts.length > 1 || n.ends.length > 1) continue;
		let c = n.starts.length === 1 ? n.starts[0] : void 0, l = n.ends.length === 1 ? n.ends[0] : void 0;
		if (c && l && (c.paragraphIndex < l.paragraphIndex || c.paragraphIndex === l.paragraphIndex && c.boundary <= l.boundary)) {
			let t = Yn(c.paragraphIndex === l.paragraphIndex && c.boundary === l.boundary ? c : a, s);
			for (let n = c.paragraphIndex; n <= l.paragraphIndex; n += 1) {
				let r = e[n], s = n === c.paragraphIndex ? c.boundary : 0, u = n === l.paragraphIndex ? l.boundary : V(r.paragraph, r.paragraph.runs.length);
				o.push(Gn(i, {
					paragraphIndex: n,
					source: r.source,
					boundary: s,
					runCount: V(r.paragraph, r.paragraph.runs.length)
				}, a, t, Math.max(s, u)));
			}
			continue;
		}
		let u = c && n.ends.length === 0 ? c : l && n.starts.length === 0 ? l : void 0;
		if (c && l) continue;
		let d = u ?? a, f = Yn(d, s);
		o.push(Gn(i, d, a, f));
	}
	return o;
}
function Zn(e, t, n = /* @__PURE__ */ new Map()) {
	let r = new Set(e.map(({ id: e }) => e)), i = /* @__PURE__ */ new Map();
	for (let e of t.blocks.sources) {
		let n = t.blocks.resolve(e);
		if (n.type !== "paragraph") continue;
		let r = `${e.story}\u0000${e.storyInstance}`, a = i.get(r) ?? [];
		i.has(r) || i.set(r, a), a.push({
			paragraph: n,
			source: e
		});
	}
	return [...i.values()].flatMap((e) => Xn(e, r, n));
}
function Qn(e, t, n = /* @__PURE__ */ new Map(), r = {}) {
	if ((e?.length ?? 0) === 0) return [];
	let i = Zn(e ?? [], t, n), a = r.completedSourceKeys;
	return a === void 0 ? i : i.filter((e) => {
		let t = n.get(O(e.source)) ?? /* @__PURE__ */ new Set(), r = e.startRunIndex < e.endRunIndex ? [...t].some((t) => t >= e.startRunIndex && t < e.endRunIndex) : t.has(e.reference.affinity === "following" ? e.startRunIndex : e.startRunIndex - 1), i = n.get(O(e.reference.source))?.has(e.reference.affinity === "following" ? e.reference.runIndex : e.reference.runIndex - 1) === !0;
		return r || i || a.has(O(e.source)) || a.has(O(e.reference.source));
	});
}
function H(e, t) {
	return e !== void 0 && e.story === t.story && e.storyInstance === t.storyInstance && e.path.length === t.path.length && e.path.every((e, n) => e === t.path[n]);
}
function U(e, t) {
	let n = t.filter((t) => t.sourceRunIndex !== void 0 && H(t.source, e.source)), r = n.filter((t) => t.sourceRunIndex >= e.startRunIndex && t.sourceRunIndex < e.endRunIndex);
	if (r.length > 0) return r;
	if (e.startRunIndex === e.endRunIndex && n.length > 0) {
		let t = n.reduce((t, n) => {
			let r = n.sourceRunIndex;
			return r < e.startRunIndex ? t : t === void 0 || r < t ? r : t;
		}, void 0), r = n.reduce((t, n) => {
			let r = n.sourceRunIndex;
			return r >= e.startRunIndex ? t : t === void 0 || r > t ? r : t;
		}, void 0), i = t ?? r;
		if (i !== void 0) return n.filter((e) => e.sourceRunIndex === i);
	}
	let i = t.filter((t) => t.sourceRunIndex !== void 0 && H(t.source, e.reference.source)), a = i.reduce((t, n) => {
		let r = n.sourceRunIndex;
		return r < e.reference.runIndex ? t : t === void 0 || r < t ? r : t;
	}, void 0), o = i.reduce((t, n) => {
		let r = n.sourceRunIndex;
		return r >= e.reference.runIndex ? t : t === void 0 || r > t ? r : t;
	}, void 0), s = e.reference.affinity === "following" ? a ?? o : o ?? a;
	if (s !== void 0) return i.filter((e) => e.sourceRunIndex === s);
	let c = e.geometryFallback;
	return c === void 0 ? [] : t.filter((e) => e.sourceRunIndex === c.sourceRunIndex && H(e.source, c.source));
}
function $n(e, t) {
	return t.some((t) => t.sourceRunIndex !== void 0 && H(t.source, e.source) && t.sourceRunIndex >= e.startRunIndex && t.sourceRunIndex < e.endRunIndex) ? "range" : t.some((t) => H(t.source, e.source) || H(t.source, e.reference.source)) ? "point" : "fallback";
}
function er(e) {
	let t = e.map((e) => {
		let t = e.highlightBounds;
		return {
			x: t?.x ?? e.x,
			y: t?.y ?? e.y,
			width: t?.width ?? e.w,
			height: t?.height ?? e.h,
			...e.transform ? { transform: e.transform } : {}
		};
	}).filter(({ width: e, height: t }) => e > 0 && t > 0).sort((e, t) => e.y - t.y || e.x - t.x), n = [];
	for (let e of t) {
		let t = n.at(-1);
		if (t && t.y === e.y && t.height === e.height && t.transform === e.transform) {
			let r = Math.min(t.x, e.x), i = Math.max(t.x + t.width, e.x + e.width);
			n[n.length - 1] = Object.freeze({
				...t,
				x: r,
				width: i - r
			});
		} else n.push(Object.freeze({ ...e }));
	}
	return Object.freeze(n);
}
function tr(e, t, n, r = {}) {
	let i = new Map(e.map((e) => [e.id, e])), a = e.filter((e) => e.parentId === void 0), o = new Map(a.map((e) => [e.id, e])), s = /* @__PURE__ */ new Map(), c = new Map(a.map((e) => [e.id, e.id]));
	for (let t of e) {
		if (t.parentId === void 0) continue;
		let e = new Set([t.id]), n = t;
		for (; n.parentId !== void 0;) {
			let r = i.get(n.parentId);
			if (!r || e.has(r.id)) {
				n = t;
				break;
			}
			e.add(r.id), n = r;
		}
		if (!o.has(n.id) || n === t) continue;
		c.set(t.id, n.id);
		let r = s.get(n.id) ?? [];
		s.has(n.id) || s.set(n.id, r), r.push(t);
	}
	let l = /* @__PURE__ */ new Set();
	for (let e of n) e.source && l.add(O(e.source));
	let u = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = c.get(e.commentId);
		if (t === void 0 || !(l.has(O(e.source)) || l.has(O(e.reference.source)) || e.geometryFallback !== void 0 && l.has(O(e.geometryFallback.source)))) continue;
		let r = U(e, n);
		if (r.length === 0) continue;
		let i = u.get(t) ?? [];
		u.has(t) || u.set(t, i), i.push(Object.freeze({
			anchor: e,
			kind: $n(e, r),
			rects: er(r)
		}));
	}
	return Object.freeze(a.flatMap((e) => {
		if (r.includeResolved === !1 && e.resolved === !0) return [];
		let t = u.get(e.id);
		return t?.length ? [Object.freeze({
			root: e,
			replies: Object.freeze([...s.get(e.id) ?? []]),
			anchors: Object.freeze([...t])
		})] : [];
	}));
}
function nr(e) {
	let t = Hn(e.id);
	return t === void 0 ? void 0 : `${e.kind}\u0000${t}`;
}
function W(e) {
	return Object.freeze({
		...e,
		path: Object.freeze([...e.path])
	});
}
function rr(e, t) {
	return e !== void 0 && e.story === t.story && e.storyInstance === t.storyInstance && e.path.length === t.path.length && e.path.every((e, n) => e === t.path[n]);
}
function ir(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + Math.floor((r - n) / 2);
		e[i] < t ? n = i + 1 : r = i;
	}
	return n;
}
function ar(e, t) {
	let n = Array(e.length), r;
	for (let i = e.length - 1; i >= 0; --i) {
		n[i] = r;
		let a = e[i], o = t.get(O(a.source))?.[0];
		o !== void 0 && (r = Object.freeze({
			source: W(a.source),
			sourceRunIndex: o
		}));
	}
	let i = Array(e.length), a;
	for (let n = 0; n < e.length; n += 1) {
		i[n] = a;
		let r = e[n], o = t.get(O(r.source))?.at(-1);
		o !== void 0 && (a = Object.freeze({
			source: W(r.source),
			sourceRunIndex: o
		}));
	}
	return {
		following: n,
		preceding: i
	};
}
function or(e, t, n, r, i, a) {
	let o = r[e], s = i.get(O(o.source)) ?? [], c = s[ir(s, n)], l = s[ir(s, t) - 1], u = c ?? l;
	return u === void 0 ? a.following[e] ?? a.preceding[e] : Object.freeze({
		source: W(o.source),
		sourceRunIndex: u
	});
}
function sr(e, t, n = /* @__PURE__ */ new Map()) {
	let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Set();
	e.forEach((e, t) => {
		let n = nr(e);
		n === void 0 || i.has(n) || (r.has(n) ? (r.delete(n), i.add(n)) : r.set(n, t));
	});
	let a = t.blocks.sources.flatMap((e) => {
		if (e.story !== "body") return [];
		let n = t.blocks.resolve(e);
		return n.type === "paragraph" ? [{
			source: e,
			runs: n.runs
		}] : [];
	}), o = new Map([...n].map(([e, t]) => [e, Object.freeze([...t].sort((e, t) => e - t))])), s = ar(a, o), c = [];
	for (let [e, t] of a.entries()) {
		let n = 0;
		for (; n < t.runs.length;) {
			let i = t.runs[n], l = i.revision?.kind ? nr({
				kind: i.revision.kind,
				id: i.revision.id
			}) : void 0, u = l === void 0 ? void 0 : r.get(l);
			if (u === void 0) {
				n += 1;
				continue;
			}
			let d = n;
			for (n += 1; n < t.runs.length;) {
				let e = t.runs[n].revision;
				if (!e?.kind || nr({
					kind: e.kind,
					id: e.id
				}) !== l) break;
				n += 1;
			}
			let f = n, p = o.get(O(t.source)) ?? [], m = (p[ir(p, d)] ?? f) < f ? void 0 : or(e, d, f, a, o, s);
			c.push(Object.freeze({
				revisionIndex: u,
				source: W(t.source),
				startRunIndex: d,
				endRunIndex: f,
				...m === void 0 ? {} : { geometryFallback: m }
			}));
		}
	}
	return c;
}
function cr(e, t, n = /* @__PURE__ */ new Map(), r = {}) {
	if ((e?.length ?? 0) === 0) return [];
	let i = sr(e ?? [], t, n), a = r.completedSourceKeys;
	return a === void 0 ? i : i.filter((e) => {
		let t = n.get(O(e.source));
		return t !== void 0 && [...t].some((t) => t >= e.startRunIndex && t < e.endRunIndex) || a.has(O(e.source));
	});
}
function lr(e, t) {
	let n = t.filter((t) => t.sourceRunIndex !== void 0 && rr(t.source, e.source) && t.sourceRunIndex >= e.startRunIndex && t.sourceRunIndex < e.endRunIndex);
	if (n.length > 0) return n;
	let r = e.geometryFallback;
	return r === void 0 ? [] : t.filter((e) => e.sourceRunIndex === r.sourceRunIndex && rr(e.source, r.source));
}
var ur = 12;
async function dr(e, t, n, r = {}) {
	let { onPreview: i, scheduler: a } = r;
	return Ge(ot(e, t, n, i && e.sequence.length > ur ? { onPages: (e, t) => {
		i(Object.freeze({
			layout: e,
			exact: !1,
			coveredEntries: t
		}));
	} } : void 0), a);
}
var G = /* @__PURE__ */ new WeakMap();
function K(e, t) {
	let n = Object.freeze({ ...t });
	for (let t of [...G.get(e) ?? []]) try {
		t.notify(n);
	} catch (e) {
		try {
			t.report(e);
		} catch {}
	}
}
function fr(e, t, n, r) {
	let i = G.get(e);
	i || (i = /* @__PURE__ */ new Set(), G.set(e, i));
	let a = Object.freeze({
		notify: n,
		report: r
	});
	i.add(a);
	try {
		n(Object.freeze({ ...t() }));
	} catch (e) {
		try {
			r(e);
		} catch {}
	}
	return () => {
		i?.delete(a), i?.size === 0 && G.delete(e);
	};
}
function pr(e, t) {
	if (!e) return 0;
	let n = Math.min(e.length, t.length), r = 0;
	for (; r < n && mr(e[r], t[r]);) r += 1;
	return r;
}
function mr(e, t) {
	if (e === t) return !0;
	if (typeof e != "object" || typeof t != "object" || e === null || t === null) return !1;
	if (Array.isArray(e)) {
		if (!Array.isArray(t) || e.length !== t.length) return !1;
		for (let n = 0; n < e.length; n += 1) if (!mr(e[n], t[n])) return !1;
		return !0;
	}
	if (Array.isArray(t)) return !1;
	let n = Object.keys(e);
	if (n.length !== Object.keys(t).length) return !1;
	for (let r of n) if (!Object.prototype.hasOwnProperty.call(t, r) || !mr(e[r], t[r])) return !1;
	return !0;
}
var q = /* @__PURE__ */ new WeakMap(), hr = /* @__PURE__ */ new WeakMap(), gr = Symbol("docxLayoutViewRequester");
function J(e) {
	let t = k(e), n = t.activeLayoutOptions;
	return {
		showTrackedChanges: n?.showTrackedChanges === !0,
		currentDate: n?.currentDateMs ?? t.defaultCurrentDateMs
	};
}
async function Y(e, t, n) {
	let r = k(e), i = j(t.currentDate, r.defaultCurrentDateMs, t.showTrackedChanges === !0), a = Object.freeze({
		showTrackedChanges: i.showTrackedChanges === !0,
		currentDate: i.currentDateMs
	}), o = {
		showTrackedChanges: a.showTrackedChanges,
		currentDate: a.currentDate,
		[gr]: n
	};
	await e.setLayoutView(o);
	let s = J(e);
	return s.currentDate === a.currentDate && s.showTrackedChanges === a.showTrackedChanges;
}
async function _r(e, t, n, r, i) {
	let a = !1, o = () => {
		a || (a = !0, e.destroy());
	};
	try {
		for (; !t.aborted;) {
			let a = n();
			if (a === void 0 || J(e).showTrackedChanges === a) break;
			t.addEventListener("abort", o, { once: !0 });
			try {
				await Y(e, {
					showTrackedChanges: a,
					currentDate: r()
				}, i);
			} finally {
				t.removeEventListener("abort", o);
			}
		}
	} catch (e) {
		throw o(), e;
	}
}
function vr(e, t) {
	let n = Object.freeze({ ...J(e) }), r = (hr.get(e) ?? 0) + 1;
	hr.set(e, r);
	let i = Object.freeze({
		view: n,
		generation: r,
		requester: t
	});
	for (let t of [...q.get(e) ?? []]) try {
		t.notify(i);
	} catch (e) {
		try {
			t.report(e);
		} catch {}
	}
}
function yr(e, t, n) {
	let r = q.get(e);
	r || (r = /* @__PURE__ */ new Set(), q.set(e, r));
	let i = Object.freeze({
		notify: t,
		report: n
	});
	return r.add(i), () => {
		r?.delete(i), r?.size === 0 && q.delete(e);
	};
}
var br = Symbol("docxViewerLoadSignal");
function xr(e, t) {
	return e !== null && e.currentDateMs === t.currentDateMs && e.showTrackedChanges === !0 == (t.showTrackedChanges === !0);
}
var Sr = Object.freeze([]), Cr = Object.freeze([]), wr = Object.freeze({
	comments: Object.freeze([]),
	revisions: Object.freeze([])
});
function X(e, t) {
	return Ie({
		comments: e,
		revisions: t
	}, "DOCX review metadata");
}
var Z = class e {
	get diagnostics() {
		return Ie([
			...this._mode === "worker" ? this._meta?.diagnostics ?? [] : this._getLayout()?.diagnostics ?? [],
			...this._meta?.resourceDiagnostics ?? [],
			...dn(this)
		], "DOCX diagnostics");
	}
	_metrics = null;
	_cjkFallback = "jp";
	_allowFootnoteContinuation = !1;
	_document = null;
	_source = null;
	_meta = null;
	_review = wr;
	_layoutLifecycle = new se();
	_layoutObservers = new ke();
	_layoutCompletion = null;
	_layoutAbort = null;
	_bookmarkPages = null;
	_commentAnchorRanges = null;
	_revisionAnchorRanges = null;
	_reviewProjectionIndex = null;
	_parseRequestId = null;
	_progressive = null;
	_parseWatchdog;
	_parseWatchdogMs;
	_layoutViewGeneration = 0;
	_mode = "main";
	_threeD;
	_regionMap;
	_chartEx;
	_tiff;
	_worker;
	_bridge;
	_rawParts = new ne({
		maxEntries: 64,
		maxBytes: re
	});
	_embeddedFontFaces = [];
	_officeFontFaces = [];
	_mainThreadFallbackReason = "vertical";
	_nativeRouteFaces = [];
	_nativeRouteFacesReleased = !1;
	_googleFontFaces = [];
	_fetchImage = (e, t) => this.getImage(e, t);
	constructor(e, t, n, r) {
		this._worker = e, this._mode = t, Le(this, n), this._bridge = new pt(this._worker, {
			correlate: (e) => "protocol" in e && e.protocol === "ooxml-pull-v1" ? e.requestId : "id" in e ? e.id : void 0,
			onUnsolicited: (e) => this._onWorkerLayoutPush(e),
			toError: (e) => {
				if (!("protocol" in e || e.type !== "error")) return Object.assign(g(e), {
					...e.reason === void 0 ? {} : { reason: e.reason },
					...e.outgoingColumnIndex === void 0 ? {} : { outgoingColumnIndex: e.outgoingColumnIndex },
					...e.outgoingColumnCount === void 0 ? {} : { outgoingColumnCount: e.outgoingColumnCount },
					...e.incomingColumnCount === void 0 ? {} : { incomingColumnCount: e.incomingColumnCount }
				});
			}
		});
		let i = new URL(r ?? hn, location.href).href;
		this._bridge.post({
			type: "init",
			wasmUrl: i
		});
	}
	static async load(t, n = {}) {
		let r = n[br], i = r?.signal, a = () => {
			if (i?.aborted) throw new M();
		};
		if (a(), n.legacyDoc !== void 0) {
			let { loadDocxModelSource: e } = await import("./document-model-source-BlMfm6po.js"), a = await e(t, n, r);
			if (i?.aborted) throw a.destroy(), new M();
			return a;
		}
		let u = _(n.cjkFallback), d = f(n), m = Date.now(), h = n.mode ?? "main", g = new p({
			enabled: !0,
			format: "docx",
			mode: h,
			policy: d.policy,
			onMetrics: d.onResourceMetrics,
			emitToConsole: d.debug
		});
		try {
			if (h === "worker" && (typeof Worker > "u" || typeof OffscreenCanvas > "u")) throw Error("mode: 'worker' requires Worker and OffscreenCanvas support");
			let f;
			if (typeof t == "string") {
				let e = await fetch(t, { signal: i });
				if (!e.ok) throw Error(`Failed to fetch: ${e.status} ${e.statusText}`);
				f = await e.arrayBuffer();
			} else f = t;
			a(), f = o(await s(f, n.password)), a(), g.setSourceBytes(f.byteLength), g.checkpoint("container ready");
			let p = h === "worker" ? (await import("./render-worker-host-EgUrirnQ.js")).createRenderWorker() : new mn(), _ = h === "worker" ? Nt(n) : void 0, ee = h === "worker" && !!n.progressiveLayout, v, b = !1, x = () => {
				b || !v || (b = !0, v.destroy());
			};
			try {
				v = new e(p, h, m, n.wasmUrl), i?.addEventListener("abort", x, { once: !0 }), a(), v._metrics = g, v._cjkFallback = u, v._allowFootnoteContinuation = n.allowFootnoteContinuation !== !1;
				let t = k(v), o = j(n.currentDate, t.defaultCurrentDateMs, n.showTrackedChanges === !0);
				t.activeLayoutOptions = o, await v._parse(f, d.policy, h === "worker" ? !!n.useGoogleFonts : !1, n.workerTimeoutMs, (e) => g.observeUsage(e), _, ee ? {
					onPartial: n.onLayoutPartial,
					onComplete: n.onLayoutComplete,
					onProgress: n.onLayoutProgress,
					layoutOptions: o,
					abort: new AbortController(),
					firstPublication: ue(),
					published: !1,
					settled: !1
				} : void 0), a(), h === "worker" && v._mode === "main" && (g.setMode("main"), console.warn(gn(v._mainThreadFallbackReason))), n.math && v._mode === "worker" && !_?.math && console.warn("[ooxml] a custom math renderer cannot cross the worker boundary; equations will be skipped in mode: 'worker'. Use the math renderer from @silurus/ooxml/math."), n.threeD && v._mode === "worker" && !_?.threeD && console.warn("[ooxml] a custom 3-D chart renderer cannot cross the worker boundary; charts use their 2-D family fallback in mode: 'worker'. Use the renderer from @silurus/ooxml/three-d."), v._threeD = v._mode === "worker" ? void 0 : n.threeD, n.regionMap && v._mode === "worker" && !_?.regionMap && console.warn("[ooxml] a custom Region Map renderer cannot cross the worker boundary; geospatial charts use the unsupported-chart placeholder in mode: 'worker'. Use the renderer from @silurus/ooxml/region-map."), v._regionMap = v._mode === "worker" ? void 0 : n.regionMap, n.chartEx && v._mode === "worker" && !_?.chartEx && console.warn("[ooxml] a custom ChartEx renderer cannot cross the worker boundary; ChartEx charts use the unsupported-chart placeholder in mode: 'worker'. Use the renderer from @silurus/ooxml/chart-ex."), v._chartEx = v._mode === "worker" ? void 0 : n.chartEx, n.tiff && v._mode === "worker" && !_?.tiff && console.warn("[ooxml] a custom TIFF codec cannot cross the worker boundary; recognized TIFF images will use an unavailable-image placeholder in mode: 'worker'. Use the codec from @silurus/ooxml/tiff to display them."), v._tiff = v._mode === "worker" ? void 0 : n.tiff;
				let s, b, ne = v, re = v._mode === "main" && v._document && v._source ? Je(rt(v._source, v._document, {
					useGoogleFonts: !!n.useGoogleFonts,
					cjkFallback: u
				}), !0).then((e) => ne._nativeRouteFacesReleased ? (c(e.faces), null) : (ne._nativeRouteFaces.push(...e.faces), e), () => null) : null;
				if (v._mode === "main" && v._document?.embeddedFonts?.length) {
					let e = v, t = await Cn(v._document, (t) => e.getFontBytes(t));
					if (i?.aborted) throw T(t.faces), new M();
					I(v, t.diagnostics), v._embeddedFontFaces = t.faces, s = t.metrics, b = t.routes;
				}
				let S = v._mode === "main" && v._document ? await ln(et(v._document, {
					useGoogleFonts: n.useGoogleFonts,
					cjkFallback: u
				}).filter((e) => e.presenceOnly || !b?.some((t) => t.requestedFamily.toLowerCase() === e.family.toLowerCase() && t.weight === (e.weight ?? 400) && t.style === (e.style ?? "normal")))) : {
					faces: [],
					routes: {}
				};
				if (i?.aborted) throw c(S.faces), new M();
				v._officeFontFaces = S.faces;
				let ie = [];
				if (v._mode === "main" && n.useGoogleFonts && v._document) {
					let e = qe(v._document, u, S);
					ie = e.installedSubstituteFamilies;
					let t = await l(e.names, Ue);
					if (i?.aborted) throw y(t), new M();
					v._googleFontFaces = t;
				}
				let C;
				if (v._mode === "main" && n.math && v._document && $e(v._document) && (C = await tt(v._document, n.math)), a(), v._mode === "main" && v._document && v._source) {
					let e = v, t = k(v), o = {
						allowFootnoteContinuation: v._allowFootnoteContinuation,
						fontMetrics: s,
						useGoogleFonts: !!n.useGoogleFonts,
						cjkFallback: u,
						embeddedRoutes: b,
						officeRoutes: Object.values(S.routes),
						googleFaces: v._googleFontFaces,
						installedSubstituteFamilies: ie,
						installedFamilies: "installed" in S ? S.installed : void 0,
						mathResources: C?.records,
						mathDrawables: C?.drawables
					}, c = await re;
					a(), t.services = Xe(v._source, {
						...o,
						nativeRouteMetrics: c && c.faces.length > 0 ? Ze(c.lines, te()) : void 0
					});
					let l = t.services, d = We(v._source, l, t.defaultCurrentDateMs), f = v._source.fatalParse === null, p = t.activeLayoutOptions;
					if (!p) throw Error("Active layout view was not recorded at load");
					let m = { onProgress: n.onLayoutProgress ? (t) => e._layoutObservers.notify("onLayoutProgress", n.onLayoutProgress, { committedUnits: t }) : void 0 };
					if (f && n.progressiveLayout) {
						let e = d.layoutVariants, t = v, r = new AbortController();
						t._layoutAbort = r;
						let i = ue(), a = null, o = !0;
						t._layoutCompletion = dr(v._source.bodyLayoutInput, l, p, {
							scheduler: {
								...m,
								signal: r.signal
							},
							onPreview: (r) => {
								if (!o) return;
								let s = a === null, c = pr(a?.pages, r.layout.pages), l = t._replaceMainLayoutPublication(e, p, a, r.layout);
								if (l === null) {
									o = !1;
									return;
								}
								if (a = l, s) t._layoutLifecycle.begin(), K(t, {
									pageCount: r.layout.pages.length,
									exact: r.exact,
									complete: !1
								}), i.resolve();
								else {
									if (!t._isLayoutViewActive(p)) return;
									K(t, {
										pageCount: r.layout.pages.length,
										exact: r.exact,
										complete: !1,
										unchangedPages: c
									}), t._layoutObservers.notify("onLayoutPartial", n.onLayoutPartial, {
										availableUnits: r.layout.pages.length,
										exact: r.exact
									});
								}
							}
						}).then((r) => {
							let s;
							o && (s = pr(a?.pages, r.pages), t._replaceMainLayoutPublication(e, p, a, r) === null && (o = !1)), t._layoutLifecycle.succeed(), K(t, {
								pageCount: t.pageCount,
								exact: !0,
								complete: !0,
								...o && t._isLayoutViewActive(p) && s !== void 0 ? { unchangedPages: s } : {}
							}), t._layoutObservers.notify("onLayoutComplete", n.onLayoutComplete), i.resolve();
						}).catch((e) => {
							if (a === null) {
								i.reject(e);
								return;
							}
							if (e instanceof M) {
								t._layoutLifecycle.succeed();
								return;
							}
							let r = t._layoutLifecycle.fail(e);
							K(t, {
								pageCount: t.pageCount,
								exact: !1,
								complete: !1,
								error: r
							}), t._layoutObservers.notify("onLayoutComplete", n.onLayoutComplete, r);
						}), await i.promise;
					} else if (f && (n.sliceLayout !== !1 || n.onLayoutProgress)) for (;;) {
						a();
						let e = r?.requestedView(), o = e === void 0 ? p : j(n.currentDate, t.defaultCurrentDateMs, e);
						t.activeLayoutOptions = o;
						let s = new AbortController(), c = !1, u = r?.subscribeViewChange(() => {
							let e = r.requestedView();
							c || e === void 0 || e === !0 == (o.showTrackedChanges === !0) || (c = !0, s.abort());
						});
						v._layoutAbort = s;
						try {
							let e = await it(v._source.bodyLayoutInput, l, o, {
								...m,
								signal: s.signal
							});
							if (a(), c) continue;
							d.layoutVariants.prime(o, e);
							break;
						} catch (e) {
							if (e instanceof M && c && !i?.aborted) continue;
							throw e;
						} finally {
							u?.(), v._layoutAbort = null;
						}
					}
					else d.layoutVariants.layoutFor(p);
				}
				return a(), await v._resourceUsage(n.workerTimeoutMs ?? 1e3).then((e) => g.observeUsage(e), () => void 0), g.checkpoint("model and layout ready"), a(), g.succeed({ pages: v.pageCount }), v;
			} catch (e) {
				throw mt(p, v ? x : void 0), e;
			} finally {
				i?.removeEventListener("abort", x);
			}
		} catch (e) {
			throw g.fail(e), e;
		}
	}
	async _parse(e, t, n = !1, r, i, a, o) {
		if (o) {
			await this._parseProgressively(e, t, n, r, i, a, o);
			return;
		}
		let s = await this._bridge.request((r) => (this._parseRequestId = r, this._mode === "worker" ? {
			type: "parse",
			id: r,
			data: e,
			resourcePolicy: t,
			useGoogleFonts: n,
			allowFootnoteContinuation: this._allowFootnoteContinuation,
			cjkFallback: this._cjkFallback,
			defaultCurrentDateMs: k(this).defaultCurrentDateMs,
			...this._parseViewFields(),
			renderers: a
		} : {
			type: "parse",
			id: r,
			data: e,
			resourcePolicy: t
		}), [e], { timeoutMs: r });
		if (this._parseRequestId = null, "protocol" in s) throw Error("DOCX parse open returned a pull-protocol response");
		if (this._mode === "worker") if ("usage" in s && s.usage && i?.(s.usage), s.type === "mainThreadVerticalFallback") {
			let e = await Qe(this._bridge.transport(nt), s, {
				timeoutMs: r,
				onUsage: i
			});
			this._source = e.source, this._document = e.document, this._meta = null, this._mode = "main", this._mainThreadFallbackReason = s.reason ?? "vertical";
		} else this._meta = s.meta;
		else {
			let e = s, t = await Qe(this._bridge.transport(nt), e, {
				timeoutMs: r,
				onUsage: i
			});
			this._source = t.source, this._document = t.document;
		}
		this._review = X(this._meta?.comments ?? this._document?.comments ?? [], this._meta?.revisions ?? this._document?.revisions ?? []);
	}
	_onWorkerLayoutPush(e) {
		if (At((e, t) => this._worker.postMessage(e, t), e) || !("forId" in e) || e.forId !== this._parseRequestId) return;
		if (this._rearmParseWatchdog(), e.type === "measureHostFontLines") {
			an(e.routes).catch(() => []).then((t) => {
				e.forId === this._parseRequestId && this._worker.postMessage({
					type: "hostFontLinesMeasured",
					forId: e.forId,
					measurements: t
				});
			});
			return;
		}
		if (e.type === "measureNativeRouteLines") {
			Je(e.requests, !1).then((e) => e.lines, () => e.requests.map(() => null)).then((t) => {
				e.forId === this._parseRequestId && this._worker.postMessage({
					type: "nativeRouteLinesMeasured",
					forId: e.forId,
					lines: t
				});
			});
			return;
		}
		let t = this._progressive;
		if (t?.settled) return;
		if (e.type === "layoutProgress") {
			this._layoutObservers.notify("onLayoutProgress", t?.onProgress, { committedUnits: e.committedPages });
			return;
		}
		if (e.type !== "layoutPartial" || !t) return;
		let n = !t.published || this._isLayoutViewActive(t.layoutOptions);
		if (n && this._applyLayoutPartial(e.partial), t.published) {
			if (!n) return;
			K(this, {
				pageCount: e.partial.pageCount,
				exact: e.partial.exact,
				complete: !1,
				...e.partial.unchangedPages === void 0 ? {} : { unchangedPages: e.partial.unchangedPages }
			}), this._layoutObservers.notify("onLayoutPartial", t.onPartial, {
				availableUnits: e.partial.pageCount,
				exact: e.partial.exact
			});
			return;
		}
		t.published = !0, this._layoutLifecycle.begin(), K(this, {
			pageCount: e.partial.pageCount,
			exact: e.partial.exact,
			complete: !1
		}), t.firstPublication.resolve();
	}
	_applyLayoutPartial(e) {
		let t = e.review ?? this._meta;
		this._meta = {
			pageCount: e.pageCount,
			pageSizes: e.pageSizes,
			bookmarkPages: e.bookmarkPages,
			revisions: t?.revisions ?? [],
			comments: t?.comments ?? [],
			footnotes: t?.footnotes ?? [],
			endnotes: t?.endnotes ?? [],
			diagnostics: e.diagnostics,
			resourceDiagnostics: e.review?.resourceDiagnostics ?? this._meta?.resourceDiagnostics,
			commentAnchorRanges: e.commentAnchorRanges,
			revisionAnchorRanges: e.revisionAnchorRanges
		}, e.review && (this._review = X(e.review.comments, e.review.revisions)), this._invalidateLayoutDerivedCaches();
	}
	_onAuthoritativeMeta(e, t) {
		this._clearParseWatchdog();
		let n = this._progressive;
		if (n?.settled) return;
		let r = n !== null && this._meta !== null && this._isLayoutViewActive(n.layoutOptions);
		if (!n || this._isLayoutViewActive(n.layoutOptions) || !this._meta) this._meta = e;
		else {
			let t = this._meta;
			this._meta = {
				...e,
				diagnostics: t.diagnostics,
				pageCount: t.pageCount,
				pageSizes: t.pageSizes,
				bookmarkPages: t.bookmarkPages,
				commentAnchorRanges: t.commentAnchorRanges,
				revisionAnchorRanges: t.revisionAnchorRanges
			};
		}
		this._invalidateLayoutDerivedCaches(), this._review = X(e.comments, e.revisions), n && (n.settled = !0, this._layoutLifecycle.succeed(), K(this, {
			pageCount: this.pageCount,
			exact: !0,
			complete: !0,
			...r && t !== void 0 ? { unchangedPages: t } : {}
		}), n.firstPublication.resolve(), this._layoutObservers.notify("onLayoutComplete", n.onComplete));
	}
	_invalidateLayoutDerivedCaches() {
		this._bookmarkPages = null, this._commentAnchorRanges = null, this._revisionAnchorRanges = null, this._reviewProjectionIndex = null;
	}
	_replaceMainLayoutPublication(e, t, n, r) {
		let i = e.replaceIfCurrent(t, n, r);
		return i !== null && this._isLayoutViewActive(t) && this._invalidateLayoutDerivedCaches(), i;
	}
	_isLayoutViewActive(e) {
		return xr(k(this).activeLayoutOptions, e);
	}
	_rearmParseWatchdog() {
		this._parseWatchdogMs !== void 0 && (clearTimeout(this._parseWatchdog), this._parseWatchdog = setTimeout(() => this._onParseWentSilent(), this._parseWatchdogMs));
	}
	_clearParseWatchdog() {
		clearTimeout(this._parseWatchdog), this._parseWatchdog = void 0, this._parseWatchdogMs = void 0;
	}
	_onParseWentSilent() {
		let e = this._progressive, t = this._parseWatchdogMs;
		this._clearParseWatchdog();
		let n = /* @__PURE__ */ Error(`worker layout produced no progress for ${t}ms`);
		e && this._failWorkerProgressive(e, n), this._bridge.terminate();
	}
	_failWorkerProgressive(e, t) {
		if (e.settled) return;
		if (e.settled = !0, this._clearParseWatchdog(), !e.published) {
			e.firstPublication.reject(t);
			return;
		}
		let n = this._layoutLifecycle.fail(t);
		K(this, {
			pageCount: this.pageCount,
			exact: !1,
			complete: !1,
			error: n
		}), this._layoutObservers.notify("onLayoutComplete", e.onComplete, n);
	}
	_parseViewFields() {
		let e = k(this), t = e.activeLayoutOptions;
		return t ? {
			...t.currentDateMs === e.defaultCurrentDateMs ? {} : { currentDateMs: t.currentDateMs },
			...t.showTrackedChanges === !0 ? { showTrackedChanges: !0 } : {}
		} : {};
	}
	async _parseProgressively(e, t, n, r, i, a, o) {
		this._progressive = o, this._layoutAbort = o.abort, this._parseWatchdogMs = r;
		let s = this._bridge.request((r) => (this._parseRequestId = r, {
			type: "parse",
			id: r,
			data: e,
			resourcePolicy: t,
			useGoogleFonts: n,
			allowFootnoteContinuation: this._allowFootnoteContinuation,
			cjkFallback: this._cjkFallback,
			defaultCurrentDateMs: k(this).defaultCurrentDateMs,
			...this._parseViewFields(),
			renderers: a,
			progressiveLayout: !0
		}), [e], { timeoutMs: !1 });
		this._layoutCompletion = s.then(async (e) => {
			if (this._parseRequestId = null, "protocol" in e) throw Error("DOCX parse open returned a pull-protocol response");
			if ("usage" in e && e.usage && i?.(e.usage), e.type === "mainThreadVerticalFallback") {
				this._clearParseWatchdog(), o.settled = !0, this._progressive = null, this._layoutAbort = null;
				let t = await Qe(this._bridge.transport(nt), e, {
					timeoutMs: r,
					onUsage: i
				});
				this._source = t.source, this._document = t.document, this._meta = null, this._mode = "main", this._mainThreadFallbackReason = e.reason ?? "vertical", this._review = X(t.document.comments ?? [], t.document.revisions ?? []), o.firstPublication.resolve();
				return;
			}
			let t = e;
			this._onAuthoritativeMeta(t.meta, t.unchangedPages);
		}, (e) => {
			if (this._parseRequestId = null, this._clearParseWatchdog(), !o.settled) {
				if (o.abort.signal.aborted) {
					o.settled = !0, this._layoutLifecycle.succeed(), o.firstPublication.resolve();
					return;
				}
				this._failWorkerProgressive(o, e);
			}
		}), this._rearmParseWatchdog(), await o.firstPublication.promise;
	}
	destroy() {
		this._layoutAbort?.abort(), this._layoutAbort = null, this._clearParseWatchdog(), this._parseRequestId = null, this._progressive = null, this._layoutViewGeneration++, this._bridge.terminate(), this._document = null, this._source = null, this._meta = null, this._review = wr, k(this).services = null, this._bookmarkPages = null, this._commentAnchorRanges = null, this._revisionAnchorRanges = null, this._reviewProjectionIndex = null, this._rawParts.clear(), this._embeddedFontFaces.length > 0 && (T(this._embeddedFontFaces), this._embeddedFontFaces = []), this._officeFontFaces.length > 0 && (c(this._officeFontFaces), this._officeFontFaces = []), this._nativeRouteFacesReleased = !0, this._nativeRouteFaces?.length > 0 && (c(this._nativeRouteFaces), this._nativeRouteFaces = []), this._googleFontFaces.length > 0 && (y(this._googleFontFaces), this._googleFontFaces = []), v(this._fetchImage), b(this._fetchImage);
	}
	async getImage(e, t) {
		return this._rawParts.get(e, t, () => this._bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		})).then((e) => {
			let n = e.bytes;
			return new Blob([n], { type: t });
		}));
	}
	async getFontBytes(e) {
		let t = (await this._bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		}))).bytes;
		return new Uint8Array(t);
	}
	async _resourceUsage(e) {
		return (await this._bridge.request((e) => ({
			type: "resourceUsage",
			id: e
		}), void 0, { timeoutMs: e })).usage;
	}
	async getResourceMetrics() {
		let e = this._metrics;
		if (!e) throw Error("Document not loaded");
		return u(e, (e) => this._resourceUsage(e));
	}
	async toMarkdown() {
		return (await this._bridge.request((e) => ({
			type: "toMarkdown",
			id: e
		}))).markdown;
	}
	get pageCount() {
		return this._meta ? this._meta.pageCount : this._document ? this._getLayout()?.pages.length ?? 0 : 0;
	}
	get layoutComplete() {
		return this._layoutLifecycle.complete;
	}
	async waitUntilLayoutComplete() {
		this._layoutCompletion && await this._layoutCompletion, this._layoutLifecycle.throwIfFailed();
	}
	get mode() {
		return this._mode;
	}
	get document() {
		if (this._meta && !this._document) throw Error("the raw document model stays in the worker in mode: 'worker'; use mode: 'main' if you need direct model access");
		if (!this._document) throw Error("Document not loaded");
		return this._document;
	}
	get comments() {
		return this._reviewSnapshot().comments;
	}
	get revisions() {
		return this._reviewSnapshot().revisions;
	}
	commentAnchorRanges() {
		if (this._meta) return this._meta.commentAnchorRanges ?? Sr;
		if (!this._document || !this._source) return [];
		let e = this._reviewSnapshot().comments;
		if (e.length === 0) return Sr;
		let t = k(this), n = t.services;
		if (!n) throw Error("Document layout services are not initialized");
		let r = ze(n);
		if (!r) throw Error("Document layout variant store is not initialized");
		let i = t.activeLayoutOptions, a = i ? r.layoutFor(i) : r.defaultLayout;
		this._reviewProjectionIndex ??= He(a);
		let o = this._layoutLifecycle?.complete ?? !0 ? void 0 : { completedSourceKeys: this._reviewProjectionIndex.completedSourceKeys };
		return this._commentAnchorRanges ??= Qn(e, this._source, this._reviewProjectionIndex.renderedRunIndex, o), this._commentAnchorRanges;
	}
	revisionAnchorRanges() {
		if (this._meta) return this._meta.revisionAnchorRanges ?? Cr;
		if (!this._document || !this._source) return [];
		let e = this._reviewSnapshot().revisions;
		if (e.length === 0) return Cr;
		let t = k(this), n = t.services;
		if (!n) throw Error("Document layout services are not initialized");
		let r = ze(n);
		if (!r) throw Error("Document layout variant store is not initialized");
		let i = t.activeLayoutOptions, a = i ? r.layoutFor(i) : r.defaultLayout;
		this._reviewProjectionIndex ??= He(a);
		let o = this._layoutLifecycle?.complete ?? !0 ? void 0 : { completedSourceKeys: this._reviewProjectionIndex.completedSourceKeys };
		return this._revisionAnchorRanges ??= cr(e, this._source, this._reviewProjectionIndex.renderedRunIndex, o), this._revisionAnchorRanges;
	}
	_reviewSnapshot() {
		return this._review ||= X(this._meta?.comments ?? this._document?.comments ?? [], this._meta?.revisions ?? this._document?.revisions ?? []), this._review;
	}
	get footnotes() {
		return this._meta?.footnotes ?? this._document?.footnotes ?? [];
	}
	get endnotes() {
		return this._meta?.endnotes ?? this._document?.endnotes ?? [];
	}
	_getLayout() {
		if (!this._document) return null;
		let e = k(this), t = e.services;
		if (!t) throw Error("Document layout services are not initialized");
		let n = ze(t);
		if (!n) throw Error("Document layout variant store is not initialized");
		let r = e.activeLayoutOptions;
		return r ? n.layoutFor(r) : n.defaultLayout;
	}
	async setLayoutView(e = {}) {
		let t = e[gr], n = k(this), r = j(e.currentDate, n.defaultCurrentDateMs, e.showTrackedChanges === !0), i = ++this._layoutViewGeneration, a = n.activeLayoutOptions;
		if (!xr(a, r)) {
			if (this._mode === "worker" && this._meta) {
				let e = await this._bridge.request((e) => ({
					type: "selectLayoutView",
					id: e,
					currentDateMs: r.currentDateMs,
					showTrackedChanges: r.showTrackedChanges === !0
				}));
				if (i !== this._layoutViewGeneration) return;
				let a = e;
				n.activeLayoutOptions = r, this._meta = {
					...this._meta,
					...a.meta
				}, this._invalidateLayoutDerivedCaches(), vr(this, t);
				return;
			}
			n.activeLayoutOptions = r, this._invalidateLayoutDerivedCaches(), vr(this, t);
		}
	}
	_getBookmarkPages() {
		if (this._bookmarkPages) return this._bookmarkPages;
		if (this._meta) return this._bookmarkPages = new Map(this._meta.bookmarkPages), this._bookmarkPages;
		let e = this._getLayout();
		return e ? (this._bookmarkPages = _n(e), this._bookmarkPages) : null;
	}
	getBookmarkPage(e) {
		return this._getBookmarkPages()?.get(e);
	}
	pageSize(e) {
		if (this._meta) {
			let t = this._meta.pageSizes, n = t[Math.max(0, Math.min(e, t.length - 1))];
			return n ? {
				widthPt: n.widthPt,
				heightPt: n.heightPt
			} : {
				widthPt: 0,
				heightPt: 0
			};
		}
		if (!this._document) return {
			widthPt: 0,
			heightPt: 0
		};
		let t = this._getLayout();
		if (!t || t.pages.length === 0) return {
			widthPt: 0,
			heightPt: 0
		};
		let n = Math.max(0, Math.min(e, t.pages.length - 1)), r = t.pages[n].geometry;
		return {
			widthPt: r.widthPt,
			heightPt: r.heightPt
		};
	}
	_withActiveView(e) {
		let t = k(this).activeLayoutOptions;
		if (!t) return e;
		let n = { ...e };
		return e.currentDate === void 0 && (n.currentDate = t.currentDateMs), e.showTrackedChanges === void 0 && t.showTrackedChanges === !0 && (n.showTrackedChanges = !0), n;
	}
	renderPage(e, t, n = {}) {
		return this._renderPageWithTargetOwnership(e, t, n, !0);
	}
	_renderPageWithTargetOwnership(e, t, n, r) {
		if (this._mode === "worker") throw Error("renderPage(canvas) is unavailable in mode: 'worker'; use renderPageToBitmap() and paint it via an ImageBitmapRenderingContext");
		if (!this._source) throw Error("Document not loaded");
		return Ke(this._source, e, t, {
			...this._withActiveView(n),
			onDiagnostic: (e) => I(this, [e]),
			callerOwnedCanvasTarget: r,
			fetchImage: this._fetchImage,
			layoutServices: k(this).services ?? void 0,
			defaultCurrentDateMs: k(this).defaultCurrentDateMs,
			threeD: this._threeD,
			regionMap: this._regionMap,
			chartEx: this._chartEx,
			tiff: this._tiff
		});
	}
	async renderPageToBitmap(e, t = {}) {
		let { onTextRun: n, ...r } = t, i = {
			...this._withActiveView(r),
			dpr: r.dpr ?? m()
		};
		if (this._mode === "worker") {
			let t = new OffscreenCanvas(1, 1), r = await this._bridge.request((n) => ({
				type: "renderPage",
				id: n,
				pageIndex: e,
				opts: i,
				canvas: t
			}), [t]);
			try {
				if (I(this, r.diagnostics), n) for (let e of r.runs) n(e);
			} catch (e) {
				throw ee(r.bitmap), e;
			}
			return r.bitmap;
		}
		let a = new OffscreenCanvas(1, 1);
		return await this._renderPageWithTargetOwnership(a, e, {
			...i,
			onTextRun: n
		}, !1), a.transferToImageBitmap();
	}
	async collectPageRuns(e, t = {}) {
		let n = { ...this._withActiveView(t) };
		if (this._mode === "worker") return (await this._bridge.request((t) => ({
			type: "collectRuns",
			id: t,
			pageIndex: e,
			opts: n
		}))).runs;
		let r = k(this), i = r.services;
		if (!i) throw Error("Document layout services are not initialized");
		return Ne(i, e, {
			currentDate: n.currentDate,
			defaultCurrentDateMs: r.defaultCurrentDateMs,
			width: n.width,
			showTrackedChanges: n.showTrackedChanges
		});
	}
	async getCommentThreads(e, t = {}) {
		let { includeResolved: n, ...r } = t, i = await this.collectPageRuns(e, r);
		return tr(this.comments, this.commentAnchorRanges(), i, { includeResolved: n });
	}
	async getElementContextAt(e, t, n = {}) {
		let r = this._withActiveView(n);
		if (this._mode === "worker") return (await this._bridge.request((n) => ({
			type: "hitTestElement",
			id: n,
			pageIndex: e,
			point: t,
			opts: r
		}))).context;
		let i = k(this), a = i.services;
		if (!a) throw Error("Document layout services are not initialized");
		return Bn(a, e, t, {
			...r,
			defaultCurrentDateMs: i.defaultCurrentDateMs
		});
	}
};
function Tr(e, t) {
	if (!e.eastAsianVert) return 1;
	let n = t(e.text);
	return !(n > 0) || e.w >= n ? 1 : e.w / n;
}
function Er(e, t, n, r, i, a, o) {
	e.innerHTML = "", E(e, "ooxmlSelectionSurface", "docx"), E(e, "pageIndex", o === void 0 ? void 0 : String(o));
	let s = e.ownerDocument ?? document;
	for (let [o, c] of t.entries()) {
		let t = s.createElement("span");
		E(t, "ooxmlSelectionRun", "docx"), E(t, "runIndex", String(o)), c.paragraphId !== void 0 && E(t, "paragraphId", c.paragraphId), c.source !== void 0 && (E(t, "sourceStory", c.source.story), E(t, "sourceStoryInstance", c.source.storyInstance), E(t, "sourcePath", JSON.stringify(c.source.path))), t.textContent = c.text;
		let l = c.transform ?? "";
		if (a && c.eastAsianVert) {
			let e = Tr(c, a(c.font));
			e !== 1 && (l = `${l ? `${l} ` : ""}scaleX(${e})`);
		}
		let u = l ? `transform:${l};transform-origin:top left;` : "", d = i ? c.hyperlink : void 0, f = d ? "pointer" : "text", p = c.letterSpacingPx === void 0 ? "0" : `${c.letterSpacingPx}px`, m = c.trailingSpaceCompressionPx === void 0 ? "" : `width:${w(c.w, n)};overflow:hidden;`;
		t.style.cssText = `position:absolute;left:${w(c.x, n)};top:${w(c.y, r)};font:${c.font};line-height:${c.h}px;letter-spacing:${p};` + m + u + `white-space:pre;color:transparent;cursor:${f};pointer-events:all;`, d && i && (t.title = d.kind === "external" ? d.url : d.ref, t.addEventListener("click", (e) => {
			e.preventDefault(), i(d);
		})), e.appendChild(t);
	}
}
function Dr(e, t, n, r, i, a, o = {}) {
	e.innerHTML = "";
	let s = o.match ?? "rgba(255, 214, 0, 0.42)", c = o.active ?? "rgba(255, 140, 0, 0.55)";
	for (let o of n) {
		let n = o.active ? c : s;
		for (let s of o.slices) {
			let o = t[s.runIndex];
			if (!o) continue;
			let c = a(o.font), l = C(o.text, s.start, s.end, c), u = o.letterSpacingPx ?? 0, d = Math.max(0, Math.min(s.start, o.text.length)), f = Math.max(d, Math.min(s.end, o.text.length)), p = Ye(o.text.slice(d, f)).pitchBearing, m = Ye(o.text.slice(0, d)).pitchBearing, h = l.x + m * u, g = l.width + Math.max(0, p - 1) * u, _ = Tr(o, c), ee = h * _, v = g * _;
			if (v <= 0) continue;
			let y = document.createElement("div"), te = o.transform ? `transform:${o.transform};transform-origin:top left;` : "";
			y.style.cssText = `position:absolute;left:${w(o.x + ee, r)};top:${w(o.y, i)};width:${w(v, r)};height:${w(o.h, i)};` + te + `background:${n};pointer-events:none;`, e.appendChild(y);
		}
	}
}
var Or = class extends ie {
	constructor(e, t) {
		super(e, t, (e) => ({ page: e }));
	}
	pageRuns(e) {
		return this.unitRuns(e);
	}
	setPageRuns(e, t) {
		this.setUnitRuns(e, t);
	}
	pageHighlights(e) {
		return this.unitHighlights(e);
	}
	activePage() {
		return this.activeUnit();
	}
};
function kr(e, t, n, r, i = {}) {
	let a = e.find((e) => e.id === n && e.parentId === void 0);
	if (!a) return null;
	let o = new Map(e.map((e) => [e.id, e])), s = e.filter((e) => {
		if (e.parentId === void 0) return !1;
		let t = e, n = /* @__PURE__ */ new Set();
		for (; t.parentId !== void 0 && !n.has(t.id);) {
			n.add(t.id);
			let e = o.get(t.parentId);
			if (!e) return !1;
			if (e.id === a.id) return !0;
			t = e;
		}
		return !1;
	}), c = Ae({
		id: a.id,
		author: a.author,
		date: a.date,
		text: a.paragraphs?.join("\n") ?? a.text,
		status: a.resolved ? "resolved" : "active"
	}, s.map((e) => ({
		id: e.id,
		author: e.author,
		date: e.date,
		text: e.paragraphs?.join("\n") ?? e.text,
		status: e.resolved ? "resolved" : "active"
	})), i.maxTextCharacters), l = t.find((e) => e.commentId === n)?.source;
	return Object.freeze({
		format: "docx",
		kind: "comment",
		pageIndex: r,
		commentId: n,
		...l ? { source: Object.freeze({
			...l,
			path: Object.freeze([...l.path])
		}) } : {},
		thread: c.thread,
		truncated: c.truncated,
		truncationReasons: c.truncated ? ["text"] : [],
		textCharacters: c.textCharacters,
		maxTextCharacters: c.maxTextCharacters
	});
}
function Ar(e) {
	for (let t = e; t; t = t.parentElement) {
		let e = Oe(t.dataset.pageIndex);
		if (e !== null) return e;
	}
	return null;
}
var jr = new Set([
	"body",
	"header",
	"footer",
	"footnote",
	"endnote",
	"textbox"
]);
function Mr(e) {
	let t = e.dataset.sourceStory, n = e.dataset.sourceStoryInstance, r = e.dataset.sourcePath;
	if (!t || !jr.has(t) || !n || !r) return null;
	try {
		let e = JSON.parse(r);
		return !Array.isArray(e) || e.length === 0 || e.length > 32 || !e.every((e) => Number.isSafeInteger(e) && e >= 0) ? null : {
			story: t,
			storyInstance: n,
			path: [...e]
		};
	} catch {
		return null;
	}
}
function Q(e, t, n = {}) {
	let r = _t(e, t, (e) => {
		let t = Ar(e), n = Oe(e.dataset.runIndex);
		return t === null || n === null ? null : {
			pageIndex: t,
			runIndex: n,
			...e.dataset.paragraphId === void 0 ? {} : { paragraphId: e.dataset.paragraphId },
			...Mr(e) === null ? {} : { source: Mr(e) }
		};
	}, {
		maxChars: n.maxTextCharacters,
		maxLocators: n.maxRunLocators
	});
	if (!r) return null;
	let i = [...r.locators].sort((e, t) => e.pageIndex - t.pageIndex || e.runIndex - t.runIndex);
	return {
		format: "docx",
		kind: "text",
		text: r.text,
		pageIndexes: [...new Set(i.map((e) => e.pageIndex))],
		paragraphIds: [...new Set(i.flatMap((e) => e.paragraphId ? [e.paragraphId] : []))],
		runs: i,
		truncated: r.truncated,
		truncationReasons: r.truncationReasons,
		textCharacters: r.textCharacters,
		maxTextCharacters: r.maxTextCharacters,
		maxRunLocators: r.maxLocators
	};
}
function $(e, t, n, r, i) {
	return r === "worker" ? e.renderPageToBitmap(n, i) : e.renderPage(t, n, i);
}
var Nr = Symbol("DocxViewer.borrowedDocument"), Pr = class e {
	_pendingLoadAbort = null;
	_pendingRequestedView;
	_pendingViewChanged = null;
	_documentOwner;
	get _doc() {
		return this._documentOwner.current;
	}
	_borrowed;
	_hostWindow;
	_currentPage = 0;
	_scale = null;
	_canvas;
	_wrapper;
	_canvasMount;
	_textLayer = null;
	_highlightLayer = null;
	_elementLayer = null;
	_find;
	_findRequestGeneration = 0;
	_measureCtx = null;
	_opts;
	_showTrackedChangesExplicit = !1;
	_mode;
	_renderDispatcher;
	_errorRouter;
	_destroyed = !1;
	_selectionChangeListener = null;
	_selectionContextKey = "null";
	_elementContext = null;
	_elementHitGeneration = 0;
	_layoutViewGeneration = 0;
	_layoutViewPublicationGeneration = 0;
	_navigationGeneration = 0;
	_layoutUnsubscribe = null;
	_internalHyperlinkGeneration = 0;
	_layoutWaiters = /* @__PURE__ */ new Set();
	_layoutFailed = !1;
	_loadingIndicator;
	_elementClickListener = null;
	_contextMenuListener = null;
	static fromDocument(t, n, r = {}) {
		let i = J(n);
		return new e(t, {
			...r,
			currentDate: i.currentDate,
			showTrackedChanges: i.showTrackedChanges,
			[Nr]: n
		});
	}
	constructor(e, t = {}) {
		this._canvas = e, this._opts = t, this._showTrackedChangesExplicit = t.showTrackedChanges !== void 0;
		let n = t[Nr];
		this._borrowed = n !== void 0, this._mode = Ot("DocxViewer", t.mode, n), this._documentOwner = new Ct("DocxViewer", n ?? null, !1);
		let r = e.ownerDocument?.defaultView ?? (typeof window < "u" ? window : null);
		if (!r) throw Error("DocxViewer requires a canvas with an active Window");
		this._hostWindow = r, this._canvasMount = new Dt(e, {
			wrapperCssText: "position:relative;display:inline-block;vertical-align:top;",
			forceDisplayBlock: !0
		}), this._wrapper = this._canvasMount.wrapper, this._renderDispatcher = new ht(e, this._mode === "worker"), this._errorRouter = new bt("DocxViewer", t.onError);
		let i = new Tt(this._wrapper, t.enableTextSelection === !0, t.enableElementSelection === !0);
		this._textLayer = i.textLayer, this._highlightLayer = i.highlightLayer, this._elementLayer = i.elementLayer, this._loadingIndicator = new St(this._wrapper, "Loading page");
		let a = this._wrapper.ownerDocument.createElement("progress");
		a.setAttribute("aria-hidden", "true"), this._loadingIndicator.layer.appendChild(a), this._wrapper.insertBefore(this._loadingIndicator.layer, this._elementLayer), this._textLayer && (t.onSelectionContextChange || t.enableElementSelection) && (this._selectionChangeListener = () => this._emitSelectionContextChange(), this._wrapper.ownerDocument.addEventListener("selectionchange", this._selectionChangeListener)), t.enableElementSelection && (this._elementClickListener = (e) => {
			this._onElementClick(e).catch((e) => this._reportRenderError(e));
		}, this._wrapper.addEventListener("click", this._elementClickListener)), t.onContextMenu && (this._contextMenuListener = (e) => this._onContextMenu(e), this._wrapper.addEventListener("contextmenu", this._contextMenuListener)), this._find = new Or(() => this.pageCount, (e) => this._collectPageRuns(e)), n && this._bindLayoutDocument(n);
	}
	async load(e) {
		if (this._destroyed) throw Error("DocxViewer is destroyed");
		if (this._borrowed) throw Error("DocxViewer.load() is unsupported on a Viewer created by fromDocument(); the borrowed document is already loaded.");
		let t = !1, n = this._pendingRequestedView;
		this._pendingLoadAbort?.abort();
		let r = new AbortController();
		this._pendingLoadAbort = r, this._pendingRequestedView = n;
		try {
			let i = await this._documentOwner.replace(async () => {
				let t = await Z.load(e, {
					password: this._opts.password,
					useGoogleFonts: this._opts.useGoogleFonts,
					allowFootnoteContinuation: this._opts.allowFootnoteContinuation,
					cjkFallback: this._opts.cjkFallback,
					maxZipEntryBytes: this._opts.maxZipEntryBytes,
					resourceLimits: this._opts.resourceLimits,
					debug: this._opts.debug,
					onResourceMetrics: this._opts.onResourceMetrics,
					workerTimeoutMs: this._opts.workerTimeoutMs,
					wasmUrl: this._opts.wasmUrl,
					math: this._opts.math,
					threeD: this._opts.threeD,
					regionMap: this._opts.regionMap,
					chartEx: this._opts.chartEx,
					tiff: this._opts.tiff,
					mode: this._mode,
					...this._opts.progressiveLayout ? { progressiveLayout: !0 } : {},
					...this._opts.sliceLayout === void 0 ? {} : { sliceLayout: this._opts.sliceLayout },
					[br]: {
						signal: r.signal,
						requestedView: () => this._pendingRequestedView,
						subscribeViewChange: (e) => (this._pendingViewChanged = e, () => {
							this._pendingViewChanged === e && (this._pendingViewChanged = null);
						})
					},
					onLayoutProgress: this._opts.onLayoutProgress,
					onLayoutPartial: this._opts.onLayoutPartial,
					onLayoutComplete: this._opts.onLayoutComplete,
					...n === void 0 ? this._opts.legacyDoc === void 0 ? this._opts.showTrackedChanges === !0 ? { showTrackedChanges: !0 } : {} : this._showTrackedChangesExplicit ? { showTrackedChanges: this._opts.showTrackedChanges } : void 0 : { showTrackedChanges: n },
					...this._opts.legacyDoc === void 0 ? void 0 : { legacyDoc: this._opts.legacyDoc },
					...this._opts.currentDate === void 0 ? {} : { currentDate: this._opts.currentDate }
				});
				return await _r(t, r.signal, () => this._pendingRequestedView, () => this._opts.currentDate, this), t;
			}, () => {
				this._invalidateElementContext(!1), t = !0, this._renderDispatcher.begin(), this._findRequestGeneration++, this._find.invalidate(), this._unbindLayoutDocument();
			});
			if (!i) return;
			if (this._destroyed) throw Error("DocxViewer is destroyed");
			if (this._pendingLoadAbort !== r || (this._pendingRequestedView !== void 0 && (this._showTrackedChangesExplicit = !0, this._opts = {
				...this._opts,
				showTrackedChanges: this._pendingRequestedView
			}), this._currentPage = 0, this._bindLayoutDocument(i), this._find.invalidate(), await this._render(), this._pendingLoadAbort !== r)) return;
		} catch (e) {
			if (this._destroyed) throw Error("DocxViewer is destroyed");
			if (this._pendingLoadAbort !== r) return;
			throw e instanceof Error ? e : Error(String(e));
		} finally {
			this._pendingLoadAbort === r && (this._pendingLoadAbort = null, this._pendingRequestedView = void 0, this._pendingViewChanged = null);
		}
		t && !this._destroyed && this._emitSelectionContextChange();
	}
	get pageCount() {
		return this._doc?.pageCount ?? 0;
	}
	get currentPage() {
		return this._currentPage;
	}
	get layoutComplete() {
		return this._doc?.layoutComplete ?? !0;
	}
	async waitUntilLayoutComplete() {
		await this._errorRouter.ownBackgroundLifecycle(async () => {
			await this._doc?.waitUntilLayoutComplete?.();
		});
	}
	get canvasElement() {
		return this._canvas;
	}
	async goToPage(e) {
		let t = this._doc;
		if (!t) return;
		let n = this._cancelPendingNavigation(), r = Math.max(0, Number.isNaN(e) ? 0 : Math.trunc(e));
		if (r >= this.pageCount && !this.layoutComplete) {
			this._setLoading(!0);
			try {
				await this._waitForPage(t, r, n);
			} finally {
				n === this._navigationGeneration && this._setLoading(!1);
			}
		}
		if (this._destroyed || n !== this._navigationGeneration || t !== this._doc) return;
		let i = Math.max(0, Math.min(r, this.pageCount - 1)), a = i !== this._currentPage;
		a && this._invalidateElementContext(!1), this._currentPage = i, await this._render(), a && !this._destroyed && this._emitSelectionContextChange();
	}
	async nextPage() {
		await this.goToPage(this._currentPage + 1);
	}
	async prevPage() {
		await this.goToPage(this._currentPage - 1);
	}
	_naturalWidthPx() {
		return !this._doc || this._doc.pageCount === 0 ? 0 : this._doc.pageSize(this._currentPage).widthPt * r;
	}
	_renderWidth() {
		if (this._scale === null) return this._opts.width;
		let e = this._naturalWidthPx();
		return e <= 0 ? this._opts.width : Math.round(e * this._scale);
	}
	getScale() {
		if (this._scale !== null) return this._scale;
		let e = this._naturalWidthPx();
		return e <= 0 ? 1 : this._opts.width && this._opts.width > 0 ? this._opts.width / e : 1;
	}
	_zoomMin() {
		return this._opts.zoomMin ?? .1;
	}
	_zoomMax() {
		return this._opts.zoomMax ?? 4;
	}
	async setScale(e) {
		let t = kt(e, this._zoomMin(), this._zoomMax()), n = t !== this.getScale();
		this._scale = t, await this._render(), n && this._opts.onScaleChange?.(t);
	}
	async zoomIn() {
		await this.setScale(gt(this.getScale()));
	}
	async zoomOut() {
		await this.setScale(jt(this.getScale()));
	}
	async fitWidth() {
		await this._fit("width");
	}
	async fitPage() {
		await this._fit("page");
	}
	async _fit(e) {
		if (!this._doc || this._doc.pageCount === 0) return;
		let t = this._doc.pageSize(this._currentPage), n = this._fitContainer();
		if (!n) return;
		let i = Mt({
			contentWidth: t.widthPt * r,
			contentHeight: t.heightPt * r,
			containerWidth: n.clientWidth,
			containerHeight: n.clientHeight
		}, e);
		i <= 0 || await this.setScale(i);
	}
	_fitContainer() {
		return this._opts.container ?? this._wrapper.parentElement ?? null;
	}
	async findText(e, t = {}) {
		let n = this._doc;
		if (!n) return [];
		let r = ++this._findRequestGeneration;
		if (e.length > 0 && !n.layoutComplete && (await this._errorRouter.ownBackgroundLifecycle(() => n.waitUntilLayoutComplete()), this._destroyed || this._doc !== n || r !== this._findRequestGeneration)) return [];
		let i = await this._errorRouter.ownAwaitable(() => this._find.find(e, t));
		return this._redrawHighlights(), i;
	}
	async findNext() {
		return this._activateMatch(this._find.next());
	}
	async findPrev() {
		return this._activateMatch(this._find.prev());
	}
	clearFind() {
		this._findRequestGeneration++, this._find.invalidate(), this._redrawHighlights();
	}
	async _activateMatch(e) {
		return e ? (e.location.page === this._currentPage ? this._redrawHighlights() : await this.goToPage(e.location.page), e) : (this._redrawHighlights(), null);
	}
	_redrawHighlights() {
		let e = this._find.pageRuns(this._currentPage) ?? [];
		this._buildHighlightLayer(e);
	}
	async getResourceMetrics() {
		if (!this._doc) throw Error("Document not loaded");
		return await this._doc.getResourceMetrics();
	}
	getSelectionContext(e = {}) {
		if (this._destroyed) throw Error("DocxViewer is destroyed");
		return (this._textLayer ? Q(this._wrapper, this._wrapper.ownerDocument?.getSelection?.() ?? null, e) : null) ?? (this._elementContext ? Vn(this._elementContext, e.maxTextCharacters) : null);
	}
	_emitSelectionContextChange() {
		let e = this.getSelectionContext();
		e?.kind === "text" && (this._elementHitGeneration++, this._elementContext = null, this._redrawElementOutline());
		let t = JSON.stringify(e);
		t !== this._selectionContextKey && (this._selectionContextKey = t, this._opts.onSelectionContextChange?.(e ? structuredClone(e) : null));
	}
	_setElementContext(e) {
		this._elementContext = e ? structuredClone(e) : null, this._redrawElementOutline(), this._emitSelectionContextChange();
	}
	_invalidateElementContext(e = !0) {
		this._elementHitGeneration++, this._elementContext = null, this._redrawElementOutline(), e && this._emitSelectionContextChange();
	}
	_redrawElementOutline() {
		let e = this._elementContext, t = this._doc;
		if (!e || !t || e.pageIndex !== this._currentPage) {
			xt(this._elementLayer, null);
			return;
		}
		let n = t.pageSize(e.pageIndex);
		xt(this._elementLayer, {
			x: e.bounds.xPt / n.widthPt,
			y: e.bounds.yPt / n.heightPt,
			width: e.bounds.widthPt / n.widthPt,
			height: e.bounds.heightPt / n.heightPt
		});
	}
	async _onElementClick(e) {
		this._destroyed || e.defaultPrevented || e.button !== 0 || await this._resolveContextAt(e);
	}
	_onContextMenu(e) {
		let t;
		this._opts.onContextMenu?.({
			originalEvent: e,
			getContext: () => t ??= this._resolveContextAt(e)
		});
	}
	async _resolveContextAt(e) {
		let t = this._doc;
		if (this._destroyed || !t) return null;
		if (this._textLayer && Q(this._wrapper, this._wrapper.ownerDocument?.getSelection?.() ?? null)) return this._emitSelectionContextChange(), this._destroyed ? null : this.getSelectionContext();
		if (!this._opts.enableElementSelection) return this.getSelectionContext();
		let n = this._canvas.getBoundingClientRect();
		if (n.width <= 0 || n.height <= 0) return this._invalidateElementContext(), null;
		let r = e.clientX - n.left, i = e.clientY - n.top;
		if (r < 0 || i < 0 || r > n.width || i > n.height) return this._invalidateElementContext(), null;
		let a = ++this._elementHitGeneration, o = this._currentPage, s = t.pageSize(o), c;
		try {
			c = await t.getElementContextAt(o, {
				xPt: r / n.width * s.widthPt,
				yPt: i / n.height * s.heightPt
			}, {
				currentDate: this._opts.currentDate,
				showTrackedChanges: this._opts.showTrackedChanges,
				maxTextCharacters: En
			});
		} catch (e) {
			if (this._destroyed || a !== this._elementHitGeneration || o !== this._currentPage || t !== this._doc) return null;
			throw e;
		}
		return this._destroyed || a !== this._elementHitGeneration || o !== this._currentPage || t !== this._doc ? null : (this._setElementContext(c), this._destroyed ? null : this.getSelectionContext());
	}
	destroy() {
		this._destroyed || (this._destroyed = !0, this._pendingLoadAbort?.abort(), this._pendingLoadAbort = null, this._pendingViewChanged = null, this._findRequestGeneration++, this._layoutViewGeneration++, this._unbindLayoutDocument(), this._errorRouter.close(), this._renderDispatcher.destroy(), Ve(this._canvas), this._documentOwner.close(), this._find.invalidate(), this._selectionChangeListener &&= (this._wrapper.ownerDocument.removeEventListener("selectionchange", this._selectionChangeListener), null), this._elementHitGeneration++, this._elementClickListener &&= (this._wrapper.removeEventListener("click", this._elementClickListener), null), this._contextMenuListener &&= (this._wrapper.removeEventListener("contextmenu", this._contextMenuListener), null), this._elementContext = null, this._canvasMount.restore());
	}
	async _render() {
		let e = this._renderDispatcher.begin();
		try {
			await this._renderPage(e);
		} catch (t) {
			if (!this._renderDispatcher.isCurrent(e)) return;
			throw t;
		}
	}
	_reportRenderError(e) {
		this._errorRouter.report(e);
	}
	async _renderPage(e) {
		if (!this._doc) return;
		let t = this._mode === "worker", n = this._renderWidth(), r = this._doc.pageSize(this._currentPage), i = n ?? r.widthPt * 1.3333333333333333, a = r.widthPt > 0 ? i * r.heightPt / r.widthPt : 0, o = [], s = (e) => o.push(e), c = this._opts.dpr ?? m(), l = {
			width: n,
			dpr: this._opts.dpr,
			imageResources: this._opts.imageResources,
			defaultTextColor: this._opts.defaultTextColor,
			currentDate: this._opts.currentDate,
			showTrackedChanges: this._opts.showTrackedChanges,
			onTextRun: s
		};
		if (t) {
			let t = await $(this._doc, this._canvas, this._currentPage, "worker", l);
			if (!this._renderDispatcher.commitBitmap(e, t, {
				cssWidth: i > 0 ? i : Math.round(t.width / c),
				cssHeight: a > 0 ? a : Math.round(t.height / c)
			})) return;
		} else if (await $(this._doc, this._canvas, this._currentPage, "main", l), !this._renderDispatcher.isCurrent(e)) return;
		this._textLayer && this._buildTextLayer(this._textLayer, o), this._find.setPageRuns(this._currentPage, o), this._buildHighlightLayer(o), this._opts.onPageChange?.(this._currentPage, this.pageCount, this.layoutComplete);
	}
	_clearPresentedPage() {
		this._renderDispatcher.begin(), Ve(this._canvas), this._canvas.width = 0, this._canvas.height = 0, this._textLayer?.replaceChildren(), this._find.invalidate();
	}
	_bindLayoutDocument(e) {
		this._unbindLayoutDocument(), this._layoutFailed = !1, this._layoutViewPublicationGeneration = 0;
		let t = yr(e, (t) => this._onLayoutViewPublication(e, t), (e) => this._reportRenderError(e)), n = !0, r = fr(e, () => ({
			pageCount: e.pageCount,
			exact: e.layoutComplete,
			complete: e.layoutComplete
		}), (t) => {
			if (n) {
				n = !1;
				return;
			}
			this._onLayoutPublication(e, t);
		}, (e) => this._reportRenderError(e));
		this._layoutUnsubscribe = () => {
			r(), t();
		};
	}
	_unbindLayoutDocument() {
		this._layoutUnsubscribe?.(), this._layoutUnsubscribe = null, this._layoutFailed = !1, this._cancelPendingNavigation();
	}
	_onLayoutPublication(e, t) {
		if (!(this._destroyed || e !== this._doc)) {
			if (this._wakeLayoutWaiters(), t.error !== void 0) {
				t.pageCount === 0 && this._clearPresentedPage(), this._layoutFailed = !0, this._errorRouter.reportBackground(t.error, this._opts.onLayoutComplete !== void 0);
				return;
			}
			this._find.invalidate(), this._currentPage = Math.max(0, Math.min(this._currentPage, t.pageCount - 1)), this._render().catch((e) => this._reportRenderError(e));
		}
	}
	_onLayoutViewPublication(e, t) {
		this._destroyed || e !== this._doc || t.generation <= this._layoutViewPublicationGeneration || (this._layoutViewPublicationGeneration = t.generation, t.requester !== this && (this._layoutViewGeneration++, this._opts = {
			...this._opts,
			currentDate: t.view.currentDate,
			showTrackedChanges: t.view.showTrackedChanges
		}, this._find.invalidate(), this._currentPage = Math.max(0, Math.min(this._currentPage, e.pageCount - 1)), this._render().catch((e) => this._reportRenderError(e))));
	}
	async _waitForPage(e, t, n) {
		await this._errorRouter.ownBackgroundLifecycle(async () => {
			for (; !this._destroyed && n === this._navigationGeneration && e === this._doc && t >= e.pageCount && !e.layoutComplete && !this._layoutFailed;) await new Promise((e) => {
				this._layoutWaiters.add(e);
			});
			e === this._doc && (e.layoutComplete || this._layoutFailed) && await e.waitUntilLayoutComplete();
		});
	}
	_wakeLayoutWaiters() {
		for (let e of this._layoutWaiters) e();
		this._layoutWaiters.clear();
	}
	_cancelPendingNavigation() {
		let e = ++this._navigationGeneration;
		return this._wakeLayoutWaiters(), this._setLoading(!1), e;
	}
	_setLoading(e) {
		this._loadingIndicator.setLoading(e);
	}
	async setShowTrackedChanges(e) {
		let t = ++this._layoutViewGeneration;
		if (this._pendingLoadAbort) {
			let t = this._pendingRequestedView !== e;
			this._pendingRequestedView = e, t && this._pendingViewChanged?.();
		}
		let n = this._doc, r = this._opts.legacyDoc === void 0 ? this._opts.showTrackedChanges === !0 : n ? J(n).showTrackedChanges : this._opts.showTrackedChanges === !0;
		if ((!n || r === e) && (this._showTrackedChangesExplicit = !0, this._opts = {
			...this._opts,
			showTrackedChanges: e
		}), r === e) {
			n && await Y(n, {
				showTrackedChanges: e,
				currentDate: this._opts.currentDate
			}, this);
			return;
		}
		let i = {
			...this._opts,
			showTrackedChanges: e
		};
		(!n || await Y(n, {
			showTrackedChanges: e,
			currentDate: i.currentDate
		}, this)) && (this._destroyed || t !== this._layoutViewGeneration || n !== this._doc || (this._showTrackedChangesExplicit = !0, this._opts = i, this._find.invalidate(), this._currentPage = Math.max(0, Math.min(this._currentPage, this.pageCount - 1)), await this._render()));
	}
	_buildHighlightLayer(e) {
		let t = this._highlightLayer;
		if (!t) return;
		let { width: n, height: r } = this._canvasCssPx();
		Dr(t, e, this._find.pageHighlights(this._currentPage), n, r, (e) => this._measureForFont(e), this._opts.findHighlightColors);
	}
	_canvasCssPx() {
		return {
			width: parseFloat(this._canvas.style.width) || this._canvas.width,
			height: parseFloat(this._canvas.style.height) || this._canvas.height
		};
	}
	_measureForFont(e) {
		if (!this._measureCtx) {
			let e = document.createElement("canvas");
			this._measureCtx = e.getContext("2d");
		}
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	async _collectPageRuns(e) {
		return this._doc ? this._doc.collectPageRuns(e, {
			width: this._renderWidth(),
			currentDate: this._opts.currentDate,
			showTrackedChanges: this._opts.showTrackedChanges
		}) : [];
	}
	_buildTextLayer(e, t) {
		let { width: n, height: r } = this._canvasCssPx();
		Er(e, t, n, r, this._hyperlinkHandler(), (e) => this._measureForFont(e), this._currentPage);
	}
	_hyperlinkHandler() {
		return this._opts.enableHyperlinks === !1 ? void 0 : this._opts.onHyperlinkClick || ((e) => {
			if (e.kind === "external") {
				x(e.url, void 0, this._hostWindow);
				return;
			}
			let t = this._doc;
			if (!t) return;
			let n = ++this._internalHyperlinkGeneration;
			this._navigateInternalHyperlink(t, e.ref, n).catch((e) => this._reportRenderError(e));
		});
	}
	async _navigateInternalHyperlink(e, t, n) {
		if (e.layoutComplete || await e.waitUntilLayoutComplete(), this._destroyed || this._doc !== e || n !== this._internalHyperlinkGeneration) return;
		let r = e.getBookmarkPage(t);
		r !== void 0 && await this.goToPage(r);
	}
}, Fr = class {
	hooks;
	pageById = /* @__PURE__ */ new Map();
	runsByPage = /* @__PURE__ */ new Map();
	indexedPages = /* @__PURE__ */ new Set();
	frontier = 0;
	generation = 0;
	constructor(e) {
		this.hooks = e;
	}
	reset() {
		this.generation++, this.pageById.clear(), this.runsByPage.clear(), this.indexedPages.clear(), this.frontier = 0;
	}
	commitRuns(e, t) {
		this.runsByPage.set(e, {
			scale: this.hooks.scale(),
			runs: Promise.resolve(t)
		});
		let n = this.hooks.document();
		n && e === this.frontier && this.indexPage(e, t, n.commentAnchorRanges());
	}
	indexPage(e, t, n) {
		if (!this.indexedPages.has(e)) {
			for (let r of n) !this.pageById.has(r.commentId) && U(r, t).length > 0 && this.pageById.set(r.commentId, e);
			for (this.indexedPages.add(e); this.indexedPages.has(this.frontier);) this.frontier++;
		}
	}
	async runsForPage(e, t) {
		for (; !this.hooks.destroyed() && this.hooks.document() === t;) {
			let n = this.hooks.scale(), r = this.runsByPage.get(e);
			(!r || r.scale !== n) && (r = {
				scale: n,
				runs: t.collectPageRuns(e, {
					width: this.hooks.pageWidth(e),
					currentDate: this.hooks.currentDate(),
					...this.hooks.showTrackedChanges() ? { showTrackedChanges: !0 } : {}
				})
			}, this.runsByPage.set(e, r));
			try {
				let e = await r.runs;
				if (this.hooks.destroyed() || this.hooks.document() !== t) return null;
				if (this.hooks.scale() !== n) continue;
				return e;
			} catch (t) {
				throw this.runsByPage.get(e) === r && this.runsByPage.delete(e), t;
			}
		}
		return null;
	}
	async goToComment(e, t) {
		if (this.hooks.destroyed()) throw Error("DocxScrollViewer is destroyed");
		let n = this.hooks.document();
		if (!n || !n.comments.some((t) => t.id === e && t.parentId === void 0)) return !1;
		let r = ++this.generation, i = !n.layoutComplete, a = n.commentAnchorRanges().filter((t) => t.commentId === e), o = t?.pageIndex;
		if (o !== void 0 && (!Number.isInteger(o) || o < 0)) return !1;
		let s = o ?? this.pageById.get(e), c = async () => {
			let t = n.commentAnchorRanges();
			for (; s === void 0 && this.frontier < n.pageCount;) {
				let i = this.frontier, a = await this.runsForPage(i, n);
				if (this.hooks.destroyed()) throw Error("DocxScrollViewer is destroyed");
				if (this.hooks.document() !== n || r !== this.generation || !a) return;
				this.indexPage(i, a, t), s = this.pageById.get(e);
			}
		};
		if (o === void 0 && s === void 0 && a.length > 0 && await c(), i && (o !== void 0 && o >= n.pageCount || o === void 0 && s === void 0)) {
			if (await this.hooks.waitForLayout(n), this.hooks.destroyed()) throw Error("DocxScrollViewer is destroyed");
			if (this.hooks.document() !== n || r !== this.generation) return !1;
			a = n.commentAnchorRanges().filter((t) => t.commentId === e), this.pageById.clear(), this.runsByPage.clear(), this.indexedPages.clear(), this.frontier = 0, s = o, o === void 0 && a.length > 0 && await c();
		}
		if (a.length === 0 || s === void 0 || o !== void 0 && o >= n.pageCount) return !1;
		let l = await this.runsForPage(s, n);
		if (this.hooks.destroyed()) throw Error("DocxScrollViewer is destroyed");
		if (this.hooks.document() !== n || r !== this.generation || !l) return !1;
		let u = a.flatMap((e) => U(e, l))[0];
		return u ? (this.hooks.select(e, s, u, t), !0) : !1;
	}
	destroy() {
		this.reset();
	}
}, Ir = class {
	hooks;
	unsubscribe = null;
	viewGeneration = 0;
	prefix = 0;
	constructor(e) {
		this.hooks = e;
	}
	get presentedPageCount() {
		return this.prefix;
	}
	set presentedPageCount(e) {
		this.prefix = e;
	}
	bind(e) {
		this.unbind(), this.viewGeneration = 0, this.prefix = e.pageCount;
		let t = yr(e, (t) => this.onViewPublication(e, t), this.hooks.report), n = !0, r = fr(e, () => ({
			pageCount: e.pageCount,
			exact: e.layoutComplete,
			complete: e.layoutComplete
		}), (t) => {
			if (n) {
				n = !1;
				return;
			}
			this.onPublication(e, t);
		}, this.hooks.report);
		this.unsubscribe = () => {
			r(), t();
		};
	}
	unbind() {
		this.unsubscribe?.(), this.unsubscribe = null, this.prefix = 0;
	}
	onPublication(e, t) {
		if (!(this.hooks.destroyed() || e !== this.hooks.current())) {
			if (t.error !== void 0) {
				t.pageCount === 0 && (this.prefix = 0), this.hooks.reportBackground(t.error);
				return;
			}
			this.hooks.invalidateFind(), this.hooks.refreshComments(), this.apply(t);
		}
	}
	onViewPublication(e, t) {
		this.hooks.destroyed() || e !== this.hooks.current() || t.generation <= this.viewGeneration || (this.viewGeneration = t.generation, this.hooks.adoptView(t));
	}
	apply(e) {
		let t = [...this.hooks.mounted()], n = this.prefix;
		if (this.prefix = e.pageCount, (e.unchangedPages ?? 0) >= Math.min(n, e.pageCount)) {
			this.hooks.relayout();
			return;
		}
		this.hooks.invalidateRender(), this.hooks.relayout();
		for (let [e, n] of t) e >= this.prefix || !this.hooks.stillMounted(e, n) || this.hooks.refreshSlot(e, n);
	}
	destroy() {
		this.unbind();
	}
}, Lr = 12, Rr = 13, zr = Symbol("DocxScrollViewer.borrowedDocument"), Br;
function Vr() {
	return Br ??= import("./comment-ui-runtime-BlgDzQx_.js");
}
var Hr = class e {
	_pendingLoadAbort = null;
	_pendingRequestedView;
	_pendingViewChanged = null;
	_documentOwner;
	get _doc() {
		return this._documentOwner.current;
	}
	_borrowed;
	_opts;
	_errorRouter;
	_container;
	_shell;
	get _wrapper() {
		return this._shell.wrapper;
	}
	get _scrollHost() {
		return this._shell.scrollHost;
	}
	get _spacer() {
		return this._shell.spacer;
	}
	_mode;
	_viewport = new de({
		options: () => this._opts,
		container: () => this._container,
		scrollHost: () => this._scrollHost
	});
	_zoom = new we({
		scrollHost: () => this._scrollHost,
		spacer: () => this._spacer,
		count: () => this._doc?.pageCount ?? 0,
		zoomMin: () => this._opts.zoomMin ?? .1,
		zoomMax: () => this._opts.zoomMax ?? 4,
		baseScale: () => this._baseScale(),
		fitWidthPx: () => this._viewport.fitWidth(),
		fitContentSize: (e) => {
			if (!this._doc) return null;
			let t = this._doc.pageSize(0);
			return {
				width: (e === "width" ? this._widestPageWidthPt() : t.widthPt) * r,
				height: t.heightPt * r
			};
		},
		indexAt: (e) => this._pageIndexAtOffset(this._range(), e),
		offset: (e) => this._scrollGeometry.offsets[e] ?? 0,
		height: (e) => this._heights[e] || 0,
		totalHeight: () => this._scrollGeometry.totalHeight,
		recomputeHeights: () => this._recomputeHeights(),
		syncSpacerWidth: () => this._syncSpacerWidth(),
		padLeft: () => this._viewport.horizontalPadding().left,
		invalidateRender: () => {
			this._renderEpoch++;
		},
		preview: () => this._previewVisible(),
		scheduleSettle: () => this._scheduleSettle(),
		onScaleChange: (e) => this._opts.onScaleChange?.(e),
		relayout: () => this.relayout(),
		mountVisible: () => this._mountVisible(),
		refitOnResize: () => this._opts.refitOnResize !== !1
	});
	get _scale() {
		return this._zoom.scale;
	}
	get _scaleEstablished() {
		return this._zoom.established;
	}
	_scroller = new fe({
		spacer: () => this._spacer,
		count: () => this._doc?.pageCount ?? 0,
		range: () => this._range(),
		createSlot: () => this._createSlot(),
		attachSlot: (e) => this._scrollHost.appendChild(e.wrapper),
		resetSlot: (e, t) => this._resetSlot(e, t),
		positionSlot: (e, t, n) => this._positionSlot(t, e, n),
		renderSlot: (e, t, n) => this._renderSlot(e, t, n),
		previewSlot: (e, t, n) => this._previewSlot(t, e, n),
		settleSlot: (e, t) => this._refreshSlotAtomically(e, t),
		renderedScale: (e) => e.renderedScale,
		scale: () => this._scale,
		syncSpacerWidth: () => this._syncSpacerWidth(),
		onRange: (e) => this._emitVisiblePageChange(e),
		onExistingSlot: (e, t, n) => this._renderSlot(e, t, n)
	});
	_slots = this._scroller.slots;
	_layout = new Ir({
		current: () => this._doc,
		destroyed: () => this._destroyed,
		report: (e) => this._reportRenderError(e),
		reportBackground: (e) => this._errorRouter.reportBackground(e, this._opts.onLayoutComplete !== void 0),
		invalidateFind: () => this._find.invalidate(),
		refreshComments: () => this._refreshCommentSurface(),
		adoptView: (e) => {
			e.requester !== this && (this._layoutViewGeneration++, this._showTrackedChanges = e.view.showTrackedChanges, this._currentDate = e.view.currentDate, this._find.invalidate(), this._layout.apply({
				pageCount: this._doc.pageCount,
				exact: !0,
				complete: this._doc.layoutComplete
			}));
		},
		relayout: () => this.relayout(),
		invalidateRender: () => {
			this._renderEpoch++;
		},
		mounted: () => this._slots,
		stillMounted: (e, t) => this._slots.get(e) === t,
		refreshSlot: (e, t) => this._refreshSlotAtomically(e, t)
	});
	_renderHooks = {
		slots: () => this._slots,
		epoch: () => this._renderEpoch,
		scale: () => this._scale,
		slotIndex: (e) => e.renderedPage,
		token: () => 0,
		nextToken: () => 0,
		wantRuns: (e) => !!(this._opts.enableTextSelection && e.textLayer) || this._findActive || !!e.commentTintLayer,
		reportError: (e) => this._reportRenderError(e)
	};
	_bitmap = new me({
		...this._renderHooks,
		inFlight: () => this._scroller.inFlight,
		destroyed: () => this._destroyed,
		width: (e) => this._pageWidthPx(e),
		dpr: () => this._viewport.dpr(),
		canRetry: () => !0,
		render: (e, t, n, r, i) => $(this._doc, t, e, "worker", {
			width: n,
			dpr: r,
			imageResources: this._opts.imageResources,
			defaultTextColor: this._opts.defaultTextColor,
			currentDate: this._currentDate,
			...this._showTrackedChanges ? { showTrackedChanges: !0 } : {},
			onTextRun: i
		}),
		commitBitmap: (e, t, n, r, i, a) => n.commitBitmap(r, i, {
			cssWidth: a,
			cssHeight: this._pageHeightPx(e)
		}),
		commitRuns: (e, t, n, r, i) => this._commitRenderedRuns(e, t, n, t.canvas, i, !0)
	});
	_main = new he({
		...this._renderHooks,
		render: (e, t, n, r, i) => $(this._doc, t, e, "main", {
			width: n,
			dpr: r,
			imageResources: this._opts.imageResources,
			defaultTextColor: this._opts.defaultTextColor,
			currentDate: this._currentDate,
			...this._showTrackedChanges ? { showTrackedChanges: !0 } : {},
			onTextRun: i
		}),
		commitRuns: (e, t, n, r, i, a, o) => this._commitRenderedRuns(e, t, n, r, a, o),
		shadow: () => this._pageShadow
	});
	_navigation = new ye({
		host: () => this._scrollHost,
		spacer: () => this._spacer,
		count: () => this.pageCount,
		established: () => this._scaleEstablished,
		offset: (e) => this._scrollGeometry.offsets[e] ?? 0,
		height: (e) => this._heights[e] || 0,
		indexAt: (e) => this._pageIndexAtOffset(this._range(), e),
		totalHeight: () => this._scrollGeometry.totalHeight,
		width: (e) => this._pageWidthPx(e),
		padLeft: () => this._viewport.horizontalPadding().left,
		marginOrigin: () => this._commentMargin.originPx,
		mount: () => this._mountVisible()
	});
	_selection = new xe({
		wrapper: () => this._wrapper,
		scrollHost: () => this._scrollHost,
		slots: () => this._slots,
		resource: () => this._doc,
		destroyed: () => this._destroyed,
		textSelectionEnabled: () => this._opts.enableTextSelection === !0,
		elementSelectionEnabled: () => this._opts.enableElementSelection === !0,
		textSelected: () => Q(this._wrapper, this._wrapper.ownerDocument?.getSelection?.() ?? null) !== null,
		getContext: () => this.getSelectionContext(),
		hitTest: (e, t, n, r) => {
			let i = e.pageSize(t);
			return e.getElementContextAt(t, {
				xPt: n * i.widthPt,
				yPt: r * i.heightPt
			}, {
				currentDate: this._currentDate,
				...this._showTrackedChanges ? { showTrackedChanges: !0 } : {},
				maxTextCharacters: En
			});
		},
		outline: (e, t, n) => {
			if (n.pageIndex !== t) return null;
			let r = e.pageSize(t);
			return {
				x: n.bounds.xPt / r.widthPt,
				y: n.bounds.yPt / r.heightPt,
				width: n.bounds.widthPt / r.widthPt,
				height: n.bounds.heightPt / r.heightPt
			};
		},
		onChange: (e) => this._opts.onSelectionContextChange?.(e),
		onContextMenu: (e, t) => this._opts.onContextMenu?.({
			originalEvent: e,
			getContext: t
		}),
		reportError: (e) => this._reportRenderError(e)
	});
	_heights = [];
	_scrollGeometry = {
		offsets: [],
		totalHeight: 0
	};
	_visibleEvents = new Se((e, t, n) => this._opts.onVisiblePageChange?.(e, t, n));
	_loader = new le({
		name: () => "DocxScrollViewer",
		borrowed: () => this._borrowed,
		borrowedMessage: () => "DocxScrollViewer.load() is unsupported on a Viewer created by fromDocument(); the borrowed document is already loaded.",
		destroyed: () => this._destroyed,
		owner: () => this._documentOwner,
		beginLoad: () => {
			let e = this._pendingRequestedView;
			this._pendingLoadAbort?.abort();
			let t = new AbortController();
			return this._pendingLoadAbort = t, this._pendingRequestedView = e, t;
		},
		isCurrentLoad: (e) => this._pendingLoadAbort === e,
		finishLoad: (e) => {
			this._pendingLoadAbort === e && (this._pendingLoadAbort = null, this._pendingRequestedView = void 0, this._pendingViewChanged = null);
		},
		acquire: async (e, t) => {
			let n = this._pendingRequestedView, r = await Z.load(e, {
				password: this._opts.password,
				useGoogleFonts: this._opts.useGoogleFonts,
				allowFootnoteContinuation: this._opts.allowFootnoteContinuation,
				cjkFallback: this._opts.cjkFallback,
				maxZipEntryBytes: this._opts.maxZipEntryBytes,
				resourceLimits: this._opts.resourceLimits,
				debug: this._opts.debug,
				onResourceMetrics: this._opts.onResourceMetrics,
				workerTimeoutMs: this._opts.workerTimeoutMs,
				wasmUrl: this._opts.wasmUrl,
				math: this._opts.math,
				threeD: this._opts.threeD,
				regionMap: this._opts.regionMap,
				chartEx: this._opts.chartEx,
				tiff: this._opts.tiff,
				mode: this._mode,
				...n === void 0 ? this._opts.legacyDoc === void 0 ? this._showTrackedChanges ? { showTrackedChanges: !0 } : {} : this._requestedShowTrackedChanges === void 0 ? void 0 : { showTrackedChanges: this._requestedShowTrackedChanges } : { showTrackedChanges: n },
				...this._currentDate === void 0 ? {} : { currentDate: this._currentDate },
				...this._opts.legacyDoc === void 0 ? void 0 : { legacyDoc: this._opts.legacyDoc },
				...this._opts.progressiveLayout ? { progressiveLayout: !0 } : {},
				...this._opts.sliceLayout === void 0 ? {} : { sliceLayout: this._opts.sliceLayout },
				[br]: {
					signal: t.signal,
					requestedView: () => this._pendingRequestedView,
					subscribeViewChange: (e) => (this._pendingViewChanged = e, () => {
						this._pendingViewChanged === e && (this._pendingViewChanged = null);
					})
				},
				onLayoutProgress: this._opts.onLayoutProgress,
				onLayoutPartial: this._opts.onLayoutPartial,
				onLayoutComplete: this._opts.onLayoutComplete
			});
			return await _r(r, t.signal, () => this._pendingRequestedView, () => this._currentDate, this), r;
		},
		beforeReplace: (e) => {
			if (this._selection.invalidateElementContext(!1), this._findRequestGeneration++, this._find.invalidate(), this._findActive = !1, this._activeCommentId = null, this._activeCommentPage = null, this._commentNavigation.reset(), this._layout.unbind(), e) {
				for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
				this._visibleEvents.reset();
			}
		},
		afterReplace: (e) => {
			this._pendingRequestedView !== void 0 && (this._showTrackedChanges = this._pendingRequestedView, this._requestedShowTrackedChanges = this._pendingRequestedView), this._opts.legacyDoc !== void 0 && (this._showTrackedChanges = J(e).showTrackedChanges), this._layout.bind(e), this._find.invalidate(), this._findActive = !1, this._activeCommentId = null, this._activeCommentPage = null, this._commentNavigation.reset();
		},
		mountOpeningWindow: async () => {
			let e = [];
			this._relayout(e), await Promise.all(e);
		},
		selectionChanged: () => this._selection.emitChange()
	});
	_activeCommentId = null;
	_activeCommentPage = null;
	_commentUi = null;
	_internalHyperlinkGeneration = 0;
	_commentAnchorRangesForMargin = null;
	_commentAnchorIds = /* @__PURE__ */ new Set();
	_commentMargin = new ge({
		container: () => this._container,
		scrollHost: () => this._scrollHost,
		spacer: () => this._spacer,
		enabled: () => this._commentsEnabled(),
		cards: () => this._commentsOptions()?.cards !== !1,
		hasDisplayableComments: () => this._hasDisplayableComments(),
		requestedSide: () => this._commentsOptions()?.side,
		zoom: () => this._scaleEstablished ? this._scale : 1,
		gapPx: Lr,
		widthPx: 280,
		fontSizePx: Rr
	});
	_layers = new Ee({
		markerLayer: (e) => e.commentTintLayer,
		syncMargin: (e) => this._commentMargin.syncMargin(e),
		marginSide: () => this._commentMargin.side(),
		marginExtent: () => this._commentMargin.extent(),
		commentsEnabled: () => this._commentsEnabled(),
		previewMargin: (e, t) => this._commentUi?.previewReadOnlyCommentMargin(e, t),
		disposeMargin: (e) => {
			this._commentUi?.disposeReadOnlyCommentMargin(e), this._commentUi || e.replaceChildren();
		},
		disposeDecoration: (e) => {
			this._commentUi?.disposeReadOnlyCommentDecoration(e), this._commentUi || e.replaceChildren();
		},
		redrawOutline: (e, t) => this._selection.redrawOutlineForSlot(e, t),
		markerRatio: (e) => e,
		resetMarkerTransform: () => !0,
		resetDecorationVisibility: () => !1
	});
	_commentNavigation = new Fr({
		document: () => this._doc,
		destroyed: () => this._destroyed,
		scale: () => this._scale,
		pageWidth: (e) => this._pageWidthPx(e),
		currentDate: () => this._currentDate,
		showTrackedChanges: () => this._showTrackedChanges,
		waitForLayout: (e) => this._errorRouter.ownBackgroundLifecycle(() => e.waitUntilLayoutComplete()),
		select: (e, t, n, r) => {
			this._activeCommentId = e, this._activeCommentPage = t, this._selection.clearElementContext(), this._scrollToPageTarget(t, n, r);
			for (let [e, t] of this._slots) this._redrawSlotComments(e, t);
			this._selection.emitChange();
		}
	});
	_commentOverlay = new Te({
		slots: () => this._slots,
		scale: () => this._scale,
		destroyed: () => this._destroyed,
		ownerWindow: () => this._wrapper.ownerDocument.defaultView,
		width: (e) => this._pageWidthPx(e),
		height: (e) => this._pageHeightPx(e),
		side: () => this._commentMargin.side(),
		marginExtent: () => this._commentMargin.extent(),
		connectorOptions: () => this._commentsOptions()?.connectors,
		runtime: () => this._commentUi,
		redrawComments: (e, t) => this._redrawSlotComments(e, t)
	});
	_destroyed = !1;
	get _renderEpoch() {
		return this._scroller.renderEpoch;
	}
	set _renderEpoch(e) {
		this._scroller.renderEpoch = e;
	}
	get _prevBase() {
		return this._zoom.prevBase;
	}
	set _prevBase(e) {
		this._zoom.prevBase = e;
	}
	_pageShadow;
	_find = new Or(() => this.pageCount, (e) => this._collectPageRuns(e));
	_findActive = !1;
	_highlights = new ce({
		slots: () => this._slots,
		active: () => this._findActive,
		runs: (e) => this._find.pageRuns(e),
		setRuns: (e, t) => this._find.setPageRuns(e, t),
		paint: (e, t, n, r) => Dr(t.highlightLayer, n, this._find.pageHighlights(e), this._pageWidthPx(e), this._pageHeightPx(e), r, this._opts.findHighlightColors),
		reveal: (e) => this.scrollToPage(e),
		unitOf: (e) => e.page
	});
	_findRequestGeneration = 0;
	_showTrackedChanges;
	_currentDate;
	_layoutViewGeneration = 0;
	static fromDocument(t, n, r = {}) {
		let i = J(n);
		return new e(t, {
			...r,
			currentDate: i.currentDate,
			showTrackedChanges: i.showTrackedChanges,
			[zr]: n
		});
	}
	constructor(e, t = {}) {
		if (e.tagName === "CANVAS") throw Error("DocxScrollViewer takes a container element (e.g. a <div>), not a <canvas> — the viewer creates and manages its own canvases. Pass a block container; for the single-page canvas API use DocxViewer.");
		this._container = e, this._opts = t, this._errorRouter = new bt("DocxScrollViewer", t.onError), this._showTrackedChanges = t.showTrackedChanges === !0, t.legacyDoc !== void 0 && (this._requestedShowTrackedChanges = t.showTrackedChanges), this._currentDate = t.currentDate, this._pageShadow = t.pageShadow ?? "0 1px 3px rgba(0,0,0,0.2)";
		let n = t[zr];
		this._borrowed = n !== void 0, n ? (this._documentOwner = new Ct("DocxScrollViewer", n, !1), this._mode = Ot("DocxScrollViewer", t.mode, n)) : (this._documentOwner = new Ct("DocxScrollViewer"), this._mode = Ot("DocxScrollViewer", t.mode, void 0)), this._shell = new De(e, {
			background: t.background,
			comments: !!t.comments,
			onScroll: () => this._onScroll(),
			onOutsideComment: () => {
				if (this._activeCommentId !== null) {
					this._activeCommentId = null, this._activeCommentPage = null;
					for (let [e, t] of this._slots) this._redrawSlotComments(e, t);
					this._selection.emitChange();
				}
			}
		}), this._commentsEnabled() && Vr().then((e) => {
			if (!this._destroyed) {
				this._commentUi = e;
				for (let [e, t] of this._slots) this._redrawSlotComments(e, t);
			}
		}).catch((e) => this._reportRenderError(e)), this._selection.bind(!!t.onSelectionContextChange, !!t.onContextMenu), this._zoom.bind(this._container, this._scrollHost, this._opts.enableZoom !== !1), this._borrowed && (this._layout.bind(n), this.relayout());
	}
	async load(e) {
		await this._loader.load(e);
	}
	get pageCount() {
		return this._doc?.pageCount ?? 0;
	}
	get layoutComplete() {
		return this._doc?.layoutComplete ?? !0;
	}
	async waitUntilLayoutComplete() {
		await this._errorRouter.ownBackgroundLifecycle(async () => {
			await this._doc?.waitUntilLayoutComplete?.();
		});
	}
	_refreshCommentSurface() {
		if (!(!this._commentsEnabled() || this._slots.size === 0)) {
			this._syncSpacerWidth();
			for (let [e, t] of this._slots) this._redrawSlotComments(e, t);
		}
	}
	_pageWidthPx(e) {
		return this._doc.pageSize(e).widthPt * r * this._scale;
	}
	_pageHeightPx(e) {
		return this._doc.pageSize(e).heightPt * r * this._scale;
	}
	_hasDisplayableComments() {
		if (!this._commentsEnabled()) return !1;
		let e = this._doc;
		if (!e) return !1;
		let t = e.commentAnchorRanges();
		if (this._commentAnchorRangesForMargin !== t && (this._commentAnchorRangesForMargin = t, this._commentAnchorIds = new Set(t.map((e) => e.commentId))), this._commentAnchorIds.size === 0) return !1;
		let n = this._commentsOptions()?.includeResolved === !0;
		return e.comments.some((e) => this._commentAnchorIds.has(e.id) && e.parentId === void 0 && (n || e.resolved !== !0));
	}
	_commentsEnabled() {
		return this._opts.comments === !0 || typeof this._opts.comments == "object";
	}
	_commentsOptions() {
		return typeof this._opts.comments == "object" ? this._opts.comments : void 0;
	}
	_widestPageWidthPt() {
		if (!this._doc) return 0;
		let e = 0, t = this._layout.presentedPageCount || this._doc.pageCount;
		for (let n = 0; n < t; n++) {
			let t = this._doc.pageSize(n).widthPt;
			t > e && (e = t);
		}
		return e;
	}
	_baseScale() {
		if (!this._doc || this._doc.pageCount === 0) return 0;
		let e = this._viewport.fitWidth();
		if (e <= 0) return 0;
		let t = this._widestPageWidthPt();
		return t <= 0 ? 0 : e / (t * r);
	}
	relayout() {
		this._relayout();
	}
	_relayout(e) {
		if (this._doc) {
			if (this._doc.layoutComplete !== !1 && (this._layout.presentedPageCount = this._doc.pageCount), this._scaleEstablished) {
				let e = this._baseScale();
				if (e > 0 && e !== this._prevBase) {
					let t = this._prevBase > 0 ? this._scale / this._prevBase : 1;
					this._prevBase = e, this.setScale(e * t);
				}
			} else if (!this._zoom.establishBase()) return;
			this._recomputeHeights(), this._syncSpacer(), this._mountVisible(e);
			for (let [e, t] of this._slots) t.renderedPage === e && t.renderedScale >= 0 && this._redrawSlotComments(e, t);
		}
	}
	_recomputeHeights() {
		let e = Math.min(this._layout.presentedPageCount, this._doc.pageCount), t = Array(e);
		for (let n = 0; n < e; n++) t[n] = this._pageHeightPx(n);
		this._heights = t, this._scrollGeometry = S(t, this._viewport.gap(), this._viewport.verticalPadding());
	}
	_pageIndexAtOffset(e, t) {
		let { offsets: n } = e, r = 0, i = n.length - 1, a = 0;
		for (; r <= i;) {
			let e = r + i >> 1;
			n[e] <= t ? (a = e, r = e + 1) : i = e - 1;
		}
		return a;
	}
	_range() {
		return ve(this._scrollGeometry, this._scrollHost.scrollTop, this._scrollHost.clientHeight, this._viewport.overscan());
	}
	_syncSpacer() {
		this._scroller.syncSpacer();
	}
	_syncSpacerWidth() {
		let { left: e, right: t } = this._viewport.horizontalPadding(), n = 0;
		for (let e = 0; e < this._heights.length; e++) {
			let t = this._pageWidthPx(e);
			t > n && (n = t);
		}
		this._commentMargin.syncSpacerWidth(n, e, t);
	}
	_onScroll() {
		!this._doc || !this._scaleEstablished || this._mountVisible(void 0, !1);
	}
	_mountVisible(e, t = !0) {
		this._scroller.mount(e, t);
	}
	_emitVisiblePageChange(e) {
		this._doc && this._visibleEvents.publish(e, this._doc.pageCount, this.layoutComplete);
	}
	_createSlot() {
		let { wrapper: e, canvas: t, textLayer: n, highlightLayer: r } = be(this._scrollHost, this._opts.enableTextSelection === !0, this._pageShadow), { markerLayer: i, margin: a, decorationLayer: o } = Ce(e, this._commentsEnabled(), this._commentsOptions()?.cards !== !1, this._commentsOptions()?.connectors !== void 0, (e) => this._commentMargin.syncMargin(e)), s = Et(e, this._opts.enableElementSelection === !0);
		return this._scrollHost.appendChild(e), {
			wrapper: e,
			canvas: t,
			textLayer: n,
			highlightLayer: r,
			elementLayer: s,
			commentTintLayer: i,
			commentMargin: a,
			commentDecorationLayer: o,
			commentRuns: Object.freeze([]),
			commentGeometry: null,
			renderedPage: -1,
			renderedScale: -1,
			dispatcher: new ht(t, this._mode === "worker")
		};
	}
	_recycleSlot(e, t) {
		this._scroller.recycleSlot(e, t);
	}
	_resetSlot(e, t) {
		t.dispatcher.destroy(), this._destroyed || (t.dispatcher = new ht(t.canvas, this._mode === "worker")), this._layers.reset(t), t.commentRuns = Object.freeze([]), t.commentGeometry = null, t.renderedPage = -1, t.renderedScale = -1, t.wrapper.remove();
	}
	_positionSlot(e, t, n) {
		this._layers.position(t, e, n.offsets[t], this._pageWidthPx(t), this._pageHeightPx(t), this._scrollHost.clientWidth, this._viewport.horizontalPadding().left);
	}
	_renderSlot(e, t, n = !0) {
		if (!this._doc || t.renderedPage === e) return null;
		t.renderedPage = e;
		let r = this._viewport.dpr(), i = this._pageWidthPx(e), a = this._scale, o = t.dispatcher, s = o.begin();
		return this._mode === "worker" ? this._renderSlotBitmap(e, t, i, r, a, o, s, n) : this._main.render(e, t, i, r, 0, o, s, n);
	}
	_hyperlinkHandler() {
		return this._opts.enableHyperlinks === !1 ? void 0 : this._opts.onHyperlinkClick || ((e) => {
			if (e.kind === "external") {
				x(e.url);
				return;
			}
			let t = this._doc;
			if (!t) return;
			let n = ++this._internalHyperlinkGeneration;
			this._navigateInternalHyperlink(t, e.ref, n).catch((e) => this._reportRenderError(e));
		});
	}
	async _navigateInternalHyperlink(e, t, n) {
		if (e.layoutComplete || await e.waitUntilLayoutComplete(), this._destroyed || this._doc !== e || n !== this._internalHyperlinkGeneration) return;
		let r = e.getBookmarkPage(t);
		r !== void 0 && this.scrollToPage(r);
	}
	_canvasCssPx(e) {
		return {
			width: parseFloat(e.style.width) || e.width,
			height: parseFloat(e.style.height) || e.height
		};
	}
	_commitRenderedRuns(e, t, n, r, i, a) {
		if (t.textLayer && (a && this._clearTextLayerPreview(t.textLayer), this._opts.enableTextSelection)) {
			let { width: i, height: a } = this._canvasCssPx(r);
			Er(t.textLayer, n, i, a, this._hyperlinkHandler(), (e) => this._highlights.measure(e), e);
		}
		i && this._highlights.refreshRuns(e, n), this._commitCommentRuns(e, t, n), this._highlights.redrawSlot(e, t);
	}
	_reportRenderError(e) {
		this._errorRouter.report(e);
	}
	_renderSlotBitmap(e, t, n, r, i, a = t.dispatcher, o = a.begin(), s = !0) {
		return this._bitmap.render(e, t, n, r, i, 0, a, o, s);
	}
	setScale(e) {
		this._zoom.setScale(e);
	}
	getScale() {
		return this._zoom.getScale();
	}
	zoomIn() {
		this._zoom.zoomIn();
	}
	zoomOut() {
		this._zoom.zoomOut();
	}
	fitWidth() {
		this._zoom.fit("width");
	}
	fitPage() {
		this._zoom.fit("page");
	}
	_previewVisible() {
		this._scroller.preview();
	}
	_previewSlot(e, t, n) {
		this._positionSlot(e, t, n), this._layers.preview(e, this._pageWidthPx(t), this._pageHeightPx(t), this._scale);
	}
	_clearTextLayerPreview(e) {
		pe(e);
	}
	_scheduleSettle() {
		this._scroller.scheduleSettle(150);
	}
	_refreshSlotAtomically(e, t) {
		if (!this._doc) return;
		let n = this._viewport.dpr(), r = this._pageWidthPx(e), i = this._scale;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, i);
			return;
		}
		this._main.settle(e, t, r, n);
	}
	async setShowTrackedChanges(e) {
		let t = ++this._layoutViewGeneration;
		if (this._pendingLoadAbort) {
			let t = this._pendingRequestedView !== e;
			this._pendingRequestedView = e, t && this._pendingViewChanged?.();
		}
		let n = this._doc;
		if (this._opts.legacyDoc !== void 0 && (this._requestedShowTrackedChanges = e), this._showTrackedChanges === e) {
			n && await Y(n, {
				showTrackedChanges: e,
				currentDate: this._currentDate
			}, this);
			return;
		}
		(!n || await Y(n, {
			showTrackedChanges: e,
			currentDate: this._currentDate
		}, this)) && (this._destroyed || t !== this._layoutViewGeneration || n !== this._doc || (this._showTrackedChanges = e, this._opts.legacyDoc !== void 0 && (this._requestedShowTrackedChanges = e), this._find.invalidate(), this._layout.apply({
			pageCount: n?.pageCount ?? 0,
			exact: !0,
			complete: n?.layoutComplete !== !1
		})));
	}
	scrollToPage(e, t) {
		this._navigation.scrollToUnit(e, t);
	}
	_scrollToPageTarget(e, t, n) {
		this._navigation.scrollToPoint(e, t.x + t.w / 2, t.y + t.h / 2, n);
	}
	async goToComment(e, t) {
		return this._commentNavigation.goToComment(e, t);
	}
	async findText(e, t = {}) {
		if (!this._doc) return [];
		let n = ++this._findRequestGeneration;
		if (this._doc.layoutComplete === !1) {
			let e = this._doc;
			if (await this._errorRouter.ownBackgroundLifecycle(() => e.waitUntilLayoutComplete()), this._destroyed || this._doc !== e || n !== this._findRequestGeneration) return [];
		}
		this._findActive = e.length > 0;
		let r = await this._errorRouter.ownAwaitable(() => this._find.find(e, t));
		return this._highlights.redrawAll(), r;
	}
	async findNext() {
		return this._highlights.activate(this._find.next());
	}
	async findPrev() {
		return this._highlights.activate(this._find.prev());
	}
	clearFind() {
		this._findRequestGeneration++, this._findActive = !1, this._find.invalidate(), this._highlights.redrawAll();
	}
	async _collectPageRuns(e) {
		return this._doc ? this._doc.collectPageRuns(e, {
			width: this._pageWidthPx(e),
			currentDate: this._currentDate,
			...this._showTrackedChanges ? { showTrackedChanges: !0 } : {}
		}) : [];
	}
	_commitCommentRuns(e, t, n) {
		t.commentTintLayer && (t.commentRuns = Object.freeze([...n]), this._commentNavigation.commitRuns(e, t.commentRuns), t.commentTintLayer.style.transform = "", t.commentTintLayer.style.transformOrigin = "", this._redrawSlotComments(e, t), t.commentTintLayer.style.visibility = "", t.commentMargin && (t.commentMargin.style.visibility = ""), t.commentDecorationLayer && (t.commentDecorationLayer.style.visibility = ""));
	}
	_redrawSlotComments(e, t) {
		if (!this._doc || !t.commentTintLayer) return;
		this._commentMargin.syncMargin(t.commentMargin);
		let n = this._commentUi;
		if (!n) {
			t.commentTintLayer.replaceChildren(), t.commentMargin?.replaceChildren(), t.commentDecorationLayer?.replaceChildren(), t.commentGeometry = null;
			return;
		}
		t.commentGeometry = n.buildDocxCommentMargin(t.commentTintLayer, t.commentMargin, t.commentRuns, {
			comments: this._doc.comments,
			anchors: this._doc.commentAnchorRanges()
		}, this._pageWidthPx(e), this._pageHeightPx(e), this._activeCommentId, (t, n) => {
			let r = n ? t : this._activeCommentId === t ? null : this._activeCommentId;
			if (r !== this._activeCommentId) {
				this._activeCommentId = r, this._activeCommentPage = r ? e : null, this._selection.clearElementContext();
				for (let [e, t] of this._slots) this._redrawSlotComments(e, t);
				this._selection.emitChange();
			}
		}, this._commentMargin.zoom(), 280, this._commentsOptions()?.markers !== !1, this._commentsOptions()?.includeResolved === !0, t.commentDecorationLayer ? () => this._commentOverlay.schedule(e, t, !1) : void 0, t.commentDecorationLayer ? () => this._commentOverlay.schedule(e, t, !0) : void 0), this._commentOverlay.drawConnectors(e, t);
	}
	get topVisiblePage() {
		return this._scroller.lastRange?.topIndex ?? 0;
	}
	async getResourceMetrics() {
		if (!this._doc) throw Error("Document not loaded");
		return await this._doc.getResourceMetrics();
	}
	getSelectionContext(e = {}) {
		if (this._destroyed) throw Error("DocxScrollViewer is destroyed");
		return (this._doc && this._activeCommentId !== null && this._activeCommentPage !== null ? kr(this._doc.comments, this._doc.commentAnchorRanges(), this._activeCommentId, this._activeCommentPage, e) : null) || ((this._opts.enableTextSelection ? Q(this._wrapper, this._wrapper.ownerDocument?.getSelection?.() ?? null, e) : null) ?? (this._selection.elementContext ? Vn(this._selection.elementContext, e.maxTextCharacters) : null));
	}
	destroy() {
		this._destroyed || (this._destroyed = !0, this._pendingLoadAbort?.abort(), this._pendingLoadAbort = null, this._pendingViewChanged = null, this._findRequestGeneration++, this._errorRouter.close(), this._layout.unbind(), this._layoutViewGeneration++, this._commentNavigation.reset(), this._find.invalidate(), this._findActive = !1, this._selection.destroy(), this._highlights.destroy(), this._commentOverlay.destroy(), this._selection.clearElementContext(), this._scroller.destroy(), this._zoom.destroy(), this._commentMargin.destroy(), this._documentOwner.close(), this._shell.destroy());
	}
};
function Ur(e) {
	let t = [];
	for (let n of e.content) {
		if (n.type !== "paragraph") continue;
		let e = "";
		for (let t of n.runs) t.type === "text" && !t.noteRef && (e += t.text);
		e = e.trim(), e && t.push(e);
	}
	return t.join(" ");
}
var Wr = /* @__PURE__ */ e({
	DocxDocument: () => Z,
	DocxScrollViewer: () => Hr,
	DocxViewer: () => Pr,
	OoxmlDecodedImageLimitError: () => lt,
	OoxmlError: () => t,
	OoxmlResourceLimitError: () => a,
	TiffDecodeError: () => dt,
	autoResize: () => ft,
	buildDocxHighlightLayer: () => Dr,
	buildDocxTextLayer: () => Er,
	isOoxmlDecodedImageLimitError: () => ct,
	isTiffDecodeError: () => ut,
	noteText: () => Ur,
	openExternalHyperlink: () => x,
	readDocxTextSelectionContext: () => Q,
	resolveCommentAnchorRuns: () => U,
	resolveDocxCommentThreads: () => tr,
	resolveRevisionAnchorRuns: () => lr
});
export { ln as _, Q as a, Z as c, lr as d, U as f, I as g, gn as h, Pr as i, K as l, Cn as m, Ur as n, Dr as o, tr as p, Hr as r, Er as s, Wr as t, dr as u };
