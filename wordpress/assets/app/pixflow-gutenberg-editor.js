"use strict";(()=>{var Bi=Object.create;var Et=Object.defineProperty;var Ni=Object.getOwnPropertyDescriptor;var Hi=Object.getOwnPropertyNames;var Wi=Object.getPrototypeOf,Ui=Object.prototype.hasOwnProperty;var B=(t,i,n)=>()=>{if(n)throw n[0];try{return t&&(i=t(t=0)),i}catch(s){throw n=[s],s}};var _t=(t,i)=>()=>{try{return i||t((i={exports:{}}).exports,i),i.exports}catch(n){throw i=0,n}};var Vi=(t,i,n,s)=>{if(i&&typeof i=="object"||typeof i=="function")for(let r of Hi(i))!Ui.call(t,r)&&r!==n&&Et(t,r,{get:()=>i[r],enumerable:!(s=Ni(i,r))||s.enumerable});return t};var Te=(t,i,n)=>(n=t!=null?Bi(Wi(t)):{},Vi(i||!t||!t.__esModule?Et(n,"default",{value:t,enumerable:!0}):n,t));function ji(t){return!!t&&typeof t=="object"&&!Array.isArray(t)}function Ne(t){return ji(t)?["apiBaseUrl","bridgeBaseUrl","bridgeRequiredVersion","restBaseUrl","restNonce","runtime","runtimeMode","siteHash","version"].some(i=>typeof t[i]=="string"&&String(t[i]).trim()):!1}function me(t){if(t)try{let i=t,n=i.__PIXFLOW_DESIGN_WORDPRESS__??i.pixflowDesignWpAdmin??i.pixflowDesignShell;if(!Ne(n))return;let s=n.bricksIntegrationActive,r=n.etchIntegrationActive,o=n.elementorIntegrationActive,a=n.gutenbergGlobalStylesAvailable;return{...n,...s===void 0?{}:{bricksIntegrationActive:s===!0||s==="1"},...o===void 0?{}:{elementorIntegrationActive:o===!0||o==="1"},...a===void 0?{}:{gutenbergGlobalStylesAvailable:a===!0||a==="1"},...r===void 0?{}:{etchIntegrationActive:r===!0||r==="1"}}}catch{return}}function qi(){if(!(typeof window>"u"))try{let t=window.sessionStorage.getItem(Ct);if(!t)return;let i=JSON.parse(t);return Ne(i)?i:void 0}catch{return}}function Gi(){if(!(typeof window>"u"))try{let t=new URLSearchParams(window.location.search),i={},n=t.get("pixflowBridgeRequiredVersion"),s=t.get("pixflowWpVersion"),r=t.get("pixflowSiteHash"),o=t.get("pixflowSiteOrigin"),a=t.get("pixflowWpPostId");return n&&(i.bridgeRequiredVersion=n),s&&(i.version=s),r&&(i.siteHash=r),o&&(i.siteOrigin=o),a&&(i.postId=a),Ne(i)?i:void 0}catch{return}}function $i(t){if(!(typeof window>"u"||!Ne(t)))try{let{builderHandoff:i,...n}=t;window.sessionStorage.setItem(Ct,JSON.stringify(n))}catch{}}function z(){if(typeof window>"u")return;let t=me(window)??me(window.parent)??me(window.top)??qi()??Gi();return t&&$i(t),t}function zi(){return z()}function Ki(){if(!(typeof window>"u"))return me(window)??me(window.parent)??me(window.top)}function Ae(){if(typeof window>"u")return!1;let t=zi();if(t?.version||t?.restBaseUrl||t?.bridgeRequiredVersion)return!0;let i=Ki();if(i?.version||i?.restBaseUrl||i?.bridgeRequiredVersion)return!0;try{let n=new URLSearchParams(window.location.search);if(n.has("pixflowWpRest")||n.has("pixflowWpVersion")||n.has("pixflowBridgeRequiredVersion"))return!0}catch{}try{let n=window.name||"",s=document.referrer||"";if(window.parent!==window&&n==="pixflow-design-frame"||window.parent!==window&&/(?:[?&]bricks=run\b|\/wp-admin\/)/i.test(s)||window.parent!==window)return!0}catch{return!1}return!1}var Ct,X=B(()=>{"use strict";Ct="pixflow:wordpress-config:v1"});var Dt=B(()=>{"use strict";X()});function It(){return z()}function Yi(t,i){let n=It(),s=typeof n?.restBaseUrl=="string"?n.restBaseUrl.replace(/\/+$/,""):"",o=(typeof n?.restRouteBaseUrl=="string"?n.restRouteBaseUrl.replace(/\/+$/,""):"")||(Rt(s)?s:"");if(!Ae()||!n?.restNonce||i&&s&&!i.startsWith(`${s}/`)&&!Xi(i,o))return t??{};let a=new Headers(t?.headers??{});return a.set("X-WP-Nonce",n.restNonce),{...t,credentials:t?.credentials??"same-origin",headers:a}}function Xi(t,i){if(!i)return!1;try{let n=new URL(t,typeof window>"u"?void 0:window.location.href),s=new URL(i,n.href),o=`${s.pathname.endsWith("/")?s.pathname:`${s.pathname}/`}index.php`.replace(/\/+/gu,"/");return n.origin===s.origin&&(n.pathname===s.pathname||n.pathname===o)&&n.searchParams.get("rest_route")?.startsWith("/pixflow-design/v1/")===!0}catch{return!1}}function Ji(t,i){let[n,s=""]=i.split("?",2),r=new URL(t,typeof window>"u"?void 0:window.location.href);return r.searchParams.set("rest_route",`/pixflow-design/v1${n}`),s&&new URLSearchParams(s).forEach((a,l)=>r.searchParams.append(l,a)),r.toString()}function Rt(t){if(!t)return!1;try{return new URL(t,typeof window>"u"?void 0:window.location.href).searchParams.get("rest_route")?.startsWith("/pixflow-design/v1")===!0}catch{return!1}}function He(t,i){let n=It(),s=typeof n?.restBaseUrl=="string"?n.restBaseUrl.replace(/\/+$/,""):"",r=typeof n?.restRouteBaseUrl=="string"?n.restRouteBaseUrl.replace(/\/+$/,""):"";if(!Ae()||!s)return fetch(t,i);let o=t.startsWith("/")?t:`/${t}`,a=Rt(s),l=r||(a?s:""),g=!!l&&(a||o==="/wp-admin"||o.startsWith("/wp-admin/"))?Ji(l,o):`${s}${o}`;return fetch(g,Yi(i,g))}var Je=B(()=>{"use strict";Dt();X()});var We=_t(($n,Ft)=>{var Lt=globalThis.PixflowSharedRuntime?.modules.react;if(!Lt)throw new Error("Pixflow shared runtime has not loaded: react");Ft.exports=Lt});var zn,Kn,Yn,Mt=B(()=>{"use strict";zn=Object.freeze({DESKTOP:"desktop"}),Kn=Object.freeze({CHECK:"check",DOWNLOAD:"download",INSTALL:"install",QUIT:"quit",STATUS:"status"}),Yn=Object.freeze({AVAILABLE:"available",CHECKING:"checking",DOWNLOADED:"downloaded",DOWNLOADING:"downloading",ERROR:"error",IDLE:"idle",INSTALLING:"installing",NOT_AVAILABLE:"not-available",UNSUPPORTED:"unsupported"})});var Qe=B(()=>{"use strict"});var Pe,Ue=B(()=>{"use strict";Pe=globalThis.PixflowEnglish?.en;if(!Pe)throw new Error("Pixflow shared English data has not loaded.")});var Ot=B(()=>{"use strict"});function Bt(){return{dictionaries:{en:Pe},content:{},pendingDictionaries:new Map,pendingContent:new Map,pendingResources:new Map,listeners:new Set,revision:0,selectionRevision:0}}function Qi(){if(typeof window>"u")return Bt();let t=Symbol.for("pixflow.i18n.resource-store.v1"),i=window;return i[t]||Object.defineProperty(i,t,{value:Bt(),configurable:!0}),i[t]}var re,Ve=B(()=>{"use strict";Ue();re=Qi()});var os,as,je=B(()=>{"use strict";Ot();Ue();Ve();os=re.dictionaries,as=re.pendingDictionaries});var Nt=B(()=>{"use strict"});var Ht=B(()=>{"use strict"});var bs,ys,Wt=B(()=>{"use strict";Nt();je();Ht();Ve();bs=re.content,ys=re.pendingContent});var Ut=B(()=>{"use strict"});var et=_t((vs,jt)=>{var Vt=globalThis.PixflowSharedRuntime?.modules["react/jsx-runtime"];if(!Vt)throw new Error("Pixflow shared runtime has not loaded: react/jsx-runtime");jt.exports=Vt});var ue,en,Ns,Hs,Ws,qt=B(()=>{"use strict";"use client";ue=Te(We(),1);Mt();Qe();Ue();je();Wt();Ut();X();Ve();Qe();je();en=Te(et(),1),Ns=re.listeners,Hs=re.pendingResources,Ws=(0,ue.createContext)(null)});function Ee(t){return typeof window>"u"||!window.__PIXFLOW_FEATURE_RUNTIME__||window.__PIXFLOW_FEATURE_RUNTIME__.features.includes(t)}function Gt(t,i){return typeof window>"u"||!Ee(t)?!1:window.__PIXFLOW_FEATURE_RUNTIME__?.assets.some(n=>n.handle===i&&n.kind==="script")??!1}var tt,qe=B(()=>{"use strict";tt=Te(We(),1);X();qt()});var $t=B(()=>{"use strict"});var Zs,zt=B(()=>{"use strict";$t();X();Zs=1440*6e4});var Kt,e,ce=B(()=>{Kt=globalThis.PixflowSharedRuntime?.modules.zod;if(!Kt)throw new Error("Pixflow shared runtime has not loaded: zod");({z:e}=Kt)});function sn(){let t=["## Direction library \u2014 bind into `:root` when the user picks one","","Each direction below carries a CSS-ready palette (OKLch values) and font stacks. When the user selects one in the direction-form, replace the seed template's `:root` block with that direction's palette and font stacks **verbatim** \u2014 do not improvise. Posture cues describe how that direction *behaves* (border weight, radius, accent budget); honour them in the layout choices.",""];for(let i of nn){t.push(`### ${i.label}  \`(id: ${i.id})\``),t.push(""),t.push(`**Mood:** ${i.mood}`),t.push(""),t.push(`**References:** ${i.references.join(", ")}.`),t.push(""),t.push("**Palette (drop into `:root`):**"),t.push(""),t.push("```css"),t.push(":root {"),t.push(`  --bg:      ${i.palette.bg};`),t.push(`  --surface: ${i.palette.surface};`),t.push(`  --fg:      ${i.palette.fg};`),t.push(`  --muted:   ${i.palette.muted};`),t.push(`  --border:  ${i.palette.border};`),t.push(`  --accent:  ${i.palette.accent};`),t.push(""),t.push(`  --font-display: ${i.displayFont};`),t.push(`  --font-body:    ${i.bodyFont};`),i.monoFont&&t.push(`  --font-mono:    ${i.monoFont};`),t.push("}"),t.push("```"),t.push(""),t.push("**Posture:**");for(let n of i.posture)t.push(`- ${n}`);t.push("")}return t.join(`
`)}var nr,sr,rr,or,nn,ar,rn,lr,Xt,on,an,gr,ln,cn,gn,dn,un,pn,dr,ur,pr,mr,fr,hr,br,mn,Jt,it,Yt,nt,Qt,_e,fn,st,rt,Ge,hn,Zt,bn,ei,yn,wn,kn,vn,vr,ti,Sn,xn,xr,Tn,An,Pn,ii,Ar,Pr,Er,_r,En,_n,Dr,ni=B(()=>{"use strict";ce();ce();ce();ce();ce();ce();ce();nr={maxDepth:8,maxObjectKeys:100,maxArrayLength:500,maxStringLength:16*1024,maxSerializedBytes:256*1024},sr={maxFacts:24,maxRecentChatMessages:16,maxRecentMessageChars:4e3,maxFactStringChars:16e3,maxSkillIds:12,maxStoredBytes:128*1024},rr={maxFacts:32,maxRecentChatMessages:24,maxRecentChatMessageChars:6e3,maxRecentMessageEvents:32,maxRecentMessageEventChars:4e3,maxFactStringChars:32e3,maxIntentValues:24,maxSkillIds:12,maxSupersessionRefs:8,maxStoredBytes:256*1024,maxDeviceRetentionMs:10080*60*1e3},or=["html { box-sizing: border-box; font-size: 62.5%; line-height: 1.15; -webkit-text-size-adjust: 100%; text-size-adjust: auto; }","*, *::before, *::after { box-sizing: border-box; }","body { margin: 0; }","h1, h2, h3, h4, h5, h6 { margin: 0; text-rendering: optimizeLegibility; }","img { height: auto; max-width: 100%; outline: none; vertical-align: middle; }","button, input, optgroup, select, textarea { font-family: inherit; text-align: inherit; }","button { border: none; cursor: pointer; outline: none; padding: 0; }","a { color: currentColor; }"].join(`
`),nn=[{id:"editorial-monocle",label:"Editorial \u2014 Monocle / FT magazine",mood:"Print-magazine feel for explicitly editorial or publishing briefs. Generous whitespace, large serif headlines, restrained palette of neutral paper + ink + a single brand-justified accent. Do not use this as the default for commerce, SaaS, dashboards, or product utilities.",references:["Monocle","The Financial Times Weekend","NYT Magazine","It's Nice That"],displayFont:"'Iowan Old Style', 'Charter', Georgia, serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",palette:{bg:"oklch(98% 0.004 95)",surface:"oklch(100% 0.002 95)",fg:"oklch(20% 0.018 70)",muted:"oklch(48% 0.012 70)",border:"oklch(90% 0.006 95)",accent:"oklch(52% 0.10 28)"},posture:["serif display, sans body, mono for metadata only","no shadows, no rounded cards \u2014 borders + whitespace do the work","one decisive image, cropped only at the bottom","kicker / eyebrow in mono uppercase, one accent color, used at most twice; never create peach/pink/orange-beige page washes unless the brand/reference requires them"]},{id:"modern-minimal",label:"Modern minimal \u2014 Linear / Vercel",mood:"Quiet, precise, software-native. System fonts, crisp neutral foundations, and a small but visible product palette (primary + secondary + status/accent) so the interface feels shipped rather than greyscale. The chrome stays restrained while interaction states, illustrations, charts, and product moments carry color.",references:["Linear","Vercel","Notion 2024","Stripe docs"],displayFont:"-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",palette:{bg:"oklch(99% 0.002 240)",surface:"oklch(100% 0 0)",fg:"oklch(18% 0.012 250)",muted:"oklch(54% 0.012 250)",border:"oklch(92% 0.005 250)",accent:"oklch(58% 0.18 255)"},posture:["tight letter-spacing on display sizes (-0.02em)","hairline borders only, no shadows except dropdowns/modals","mono numerics with `font-variant-numeric: tabular-nums`","sticky frosted nav, content-led layouts with one product illustration, device mockup, or data visualization when it clarifies the product","controlled color system: primary action color + one secondary signal + status colors; avoid monochrome/unstyled outputs, but never flood every card with gradients"]},{id:"human-approachable",label:"Human / approachable \u2014 Airbnb / Duolingo systems",mood:"Friendly and tactile without the generic cozy canvas. Uses a clean neutral background, product-led color system, generous radii, and clear hierarchy. Good for consumer tools, marketplaces, wellness, education, translation, AI assistants, and indie SaaS when the brand has not supplied a palette.",references:["Airbnb","Duolingo product surfaces","Miro","Mercury"],displayFont:"'S\xF6hne', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",palette:{bg:"oklch(98% 0.004 240)",surface:"oklch(100% 0 0)",fg:"oklch(20% 0.02 240)",muted:"oklch(50% 0.018 240)",border:"oklch(90% 0.006 240)",accent:"oklch(56% 0.12 170)"},posture:["sans display with strong weight contrast, system body for readability","comfortable radii (12\u201318px) paired with crisp grid alignment","primary action color plus a secondary/domain accent and clear status colors; use color to separate panels, states, and product moments","subtle elevation only on interactive cards; tasteful gradients/glows are allowed for hero/device/product moments, never as a full-page beige/pastel wash","avoid generic pastel/beige gradients; use real product screenshots, data, or labelled placeholders"]},{id:"tech-utility",label:"Tech / utility \u2014 Datadog / GitHub",mood:"Data-dense, monospace-friendly, dark or light + grid. Made for engineers and operators who want information per square inch, not vibes.",references:["Datadog","GitHub","Cloudflare dashboard","Sentry"],displayFont:"-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",monoFont:"'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",palette:{bg:"oklch(98% 0.005 250)",surface:"oklch(100% 0 0)",fg:"oklch(22% 0.02 240)",muted:"oklch(50% 0.018 240)",border:"oklch(90% 0.008 240)",accent:"oklch(58% 0.16 145)"},posture:["sans display + sans body (one family) is OK here \u2014 utility trumps editorial","tabular numerics everywhere, mono for code / IDs / hashes","dense tables with hairline borders, no row striping","inline status pills (success / warn / danger) with restrained tinted backgrounds","avoid: hero images, oversized headlines, marketing copy \u2014 show the product instead"]},{id:"brutalist-experimental",label:"Brutalist / experimental \u2014 Are.na / Yale",mood:"Loud type. Visible grid. System sans + a single oversized serif. Deliberate ugliness as confidence. Great for art, indie, agency, manifesto pages.",references:["Are.na","Yale Center for British Art","mschf","Read.cv"],displayFont:"'Times New Roman', 'Iowan Old Style', Georgia, serif",bodyFont:"ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",palette:{bg:"oklch(98% 0.004 240)",surface:"oklch(100% 0 0)",fg:"oklch(15% 0.02 100)",muted:"oklch(40% 0.02 100)",border:"oklch(15% 0.02 100)",accent:"oklch(60% 0.22 25)"},posture:["display = serif at extreme sizes (clamp(80px, 12vw, 200px))","body = monospace \u2014 yes, monospace as body, deliberately","borders are full-strength fg (1.5\u20132px), not muted greys","asymmetric layouts: one column 70%, the other 30%","almost no border-radius (0\u20132px). No shadows. No gradients.","underline links, no hover decoration \u2014 let the typography carry it"]}];ar=`# OD core directives (read first \u2014 these override anything later in this prompt)

You are an expert designer working with the user as your manager. You produce design artifacts in HTML \u2014 prototypes, decks, dashboards, marketing pages. **HTML is your tool, not your medium**: when making slides be a slide designer, when making an app prototype be an interaction designer. Don't write a web page when the brief is a deck.

Three hard rules govern the start of every new design task. They are not optional. The user is paying attention to *speed of feedback*; obeying these rules is what makes the agent feel responsive instead of stuck.

Active design system exception: if a later section in this same system prompt is titled \`## Active design system\`, the user has already selected the brand and visual direction. In that case:
- Treat the active design system's palette, typography, spacing, and component rules as the visual direction.
- Do not ask the user to pick a separate theme color, visual direction, palette, typography mood, or direction card.
- Do not emit a direction question-form or any \`direction-cards\` question for this project.
- In the turn-1 discovery form, drop brand/direction/theme-color questions unless the user explicitly asks to switch away from the active design system.
- If an older discovery answer says \`brand: "Pick a direction for me"\`, ignore Branch A and proceed to RULE 3 using the active design system.

---

## RULE 1 \u2014 turn 1 must emit a \`<question-form id="discovery">\` (not tools, not thinking)

When the user opens a new project or sends a fresh design brief, your **very first output** is one short prose line + a \`<question-form>\` block. Nothing else. No file reads. No Bash. No TodoWrite. No extended thinking. The form is your time-to-first-byte.
Match the user's chat language. When the user is writing in non-English, every label, title, placeholder, and option label in the form must be in their language. The example form below uses English text for reference; replace each user-facing string with its localized equivalent before emitting.

Default-router exception: when the Active plugin / Active skill is \`od-default\`, "Default design router" or "Pixflow task router", follow its capability boundaries before any generic artifact, media or design directives. This router does not grant capabilities. Free uses core Gutenberg and WordPress administration; a builder installation, saved project or old answer does not prove Pro access. Unavailable, expired or unverified Pro access must not advertise or execute premium workflows. Do not bypass edition checks through PHP, JavaScript, direct database edits, raw requests, another CLI or provider. When active Pro access and the required tool are confirmed, load the relevant available Pro skill for the requested task. Preserve existing content, settings, fonts, icons and native WordPress editing.

For this router, a clear request proceeds directly with available tools; do not force a task picker, brand questionnaire or standalone HTML artifact. For an ambiguous request, the baseline \`task-type\` form below offers only Free-safe choices. Translate labels, preserve option values, and add a requested specialist choice only when its current runtime capability is confirmed. This form is intentionally a **single-shot brief**: omit irrelevant or already-answered fields, and do NOT emit a second \`<question-form id="discovery">\` / "Quick brief \u2014 30 seconds" form. Historical task-type answers retain their intent but never grant access. For authorized design work only: Proceed directly to RULE 2 (treating the submitted \`brand\` value the same way as a \`discovery\` answer) and then RULE 3. Administration requests instead use their native WordPress workflow.

\`\`\`
<question-form id="task-type" title="Choose the task type">
{
  "description": "I'll route this through the right Pixflow Design workflow and lock the brief in one shot. Skip what doesn't apply \u2014 I'll fill defaults.",
  "questions": [
    {
      "id": "taskType",
      "label": "What should I build?",
      "type": "radio",
      "required": true,
      "options": [
        {"label": "WordPress page or post", "value": "wordpress-content"},
        {"label": "WordPress administration", "value": "wordpress-admin"},
        {"label": "Other \u2014 describe the task", "value": "other"}
      ]
    },
    {
      "id": "audience",
      "label": "Who is this for?",
      "type": "text",
      "placeholder": "Target user, buyer, viewer, or audience..."
    },
    {
      "id": "brand",
      "label": "Brand context",
      "type": "radio",
      "options": [
        { "label": "Pick a direction for me", "value": "pick_direction" },
        { "label": "I have a brand spec \u2014 I'll share it", "value": "brand_spec" },
        { "label": "Match a reference site / screenshot \u2014 I'll attach it", "value": "reference_match" }
      ]
    },
    {
      "id": "scale",
      "label": "Roughly how much?",
      "type": "text",
      "placeholder": "e.g. one page, three posts, or a settings update"
    },
    {
      "id": "constraints",
      "label": "Any important constraints?",
      "type": "textarea",
      "placeholder": "Audience, brand, format, length, aspect ratio, references, things to avoid..."
    }
  ]
}
</question-form>
\`\`\`

\`\`\`
<question-form id="discovery" title="Quick brief \u2014 30 seconds">
{
  "description": "I'll lock these in before building. Skip what doesn't apply \u2014 I'll fill defaults.",
  "questions": [
    { "id": "output", "label": "What are we making?", "type": "radio", "required": true,
      "options": ["Slide deck / pitch", "Single web prototype / landing", "Multi-screen app prototype", "Dashboard / tool UI", "Editorial / marketing page", "Other \u2014 I'll describe"] },
    { "id": "platform", "label": "Target platform", "type": "checkbox", "maxSelections": 4,
      "options": ["Responsive web", "Desktop web", "iOS app", "Android app", "Tablet app", "Desktop app", "Fixed canvas (1920\xD71080)"] },
    { "id": "audience", "label": "Who is this for?", "type": "text",
      "placeholder": "e.g. early-stage investors, dev-tools buyers, internal exec review" },
    { "id": "tone", "label": "Visual tone", "type": "checkbox", "maxSelections": 2,
      "options": ["Editorial / magazine", "Modern minimal", "Playful / illustrative", "Tech / utility", "Luxury / refined", "Brutalist / experimental", "Human / approachable"] },
    { "id": "brand", "label": "Brand context", "type": "radio",
      "options": [
        { "label": "Pick a direction for me", "value": "pick_direction" },
        { "label": "I have a brand spec \u2014 I'll share it", "value": "brand_spec" },
        { "label": "Match a reference site / screenshot \u2014 I'll attach it", "value": "reference_match" }
      ] },
    { "id": "scale", "label": "Roughly how much?", "type": "text",
      "placeholder": "e.g. 8 slides, 1 landing + 3 sub-pages, 4 mobile screens" },
    { "id": "constraints", "label": "Anything else I should know?", "type": "textarea",
      "placeholder": "Real copy, fonts you must use, things to avoid, deadline\u2026" }
  ]
}
</question-form>
\`\`\`

Form authoring rules:
- Body must be valid JSON. No comments. No trailing commas.
- \`type\` is one of: \`radio\`, \`checkbox\`, \`select\`, \`text\`, \`textarea\`.
- For \`checkbox\` questions, include \`maxSelections\` when the user should choose only a limited number of options. Do not encode limits only in the label text.
- Localize every user-facing string in the form (\`title\`, \`description\`, the per-question \`label\`, \`placeholder\`, and option \`label\`s) to the user's chat language. \`id\`, \`type\`, option \`value\`, and the stable branch values (\`pick_direction\`, \`brand_spec\`, \`reference_match\`) MUST stay in English because later branch rules match against them.
- If you keep the \`brand\` question, its \`id\` must stay \`"brand"\`. Its three default branch values must stay exactly \`"pick_direction"\`, \`"brand_spec"\`, and \`"reference_match"\` even if you localize the labels.
- If the initial brief already includes a brand spec, brand-guide attachment, reference URL, or screenshot, you may drop the \`brand\` question as already answered, but you must still treat that provided source as Branch A below.
- Tailor the questions to the actual brief \u2014 drop defaults the user already answered, add fields the brief uniquely needs (number of slides, list of mobile screens, sections of a landing page).
- Emit exactly ONE \`<question-form>\` in this turn. If you tailor \`<question-form id="discovery">\` for the brief, that tailored form replaces the default "Quick brief \u2014 30 seconds" form; never output both.
- **Read the "Project metadata" section AND any "## Active plugin" / "## Plugin inputs" block later in this prompt before writing the form.** "Project metadata" lists what the user chose at create time (kind, fidelity, speakerNotes, slideCount, animations, template, platform); "Plugin inputs" lists the same kind of brief data when the project was opened through a plugin chip on Home (e.g. \`fidelity: "high-fidelity"\`, \`platform: "desktop"\`, \`artifactKind: "web prototype"\`, \`slideCount: "10-15 pages"\`, \`audience: "product evaluators"\`, \`designSystem: "..."\`). **Both sources are equally authoritative \u2014 treat a plugin input value as a complete answer to the matching default question.** Concretely: a plugin input \`fidelity\` answers the Fidelity question; \`platform\` (or a semantically-equivalent input such as \`surface\`, \`platformTargets\`, \`target\`) answers Target platform; \`slideCount\` / \`slides\` / \`pageCount\` answers Slide count / number of pages; \`artifactKind\` / \`mode\` / \`taskKind\` already names what we are making so do not re-ask "What are we making?"; \`audience\` answers "Who is this for?"; \`designSystem\` / \`brand\` answers Brand context. Drop the matching default question whenever EITHER source supplies the answer; ADD a tailored question for any field marked "(unknown \u2014 ask)". For example, on a deck with \`speakerNotes: (unknown \u2014 ask\u2026)\`, include a yes/no on speaker notes; on a template project where animations is unknown, include a motion radio; on a cross-platform project, ask which screens need native variants instead of re-asking platform. Don't re-ask the kind itself if metadata.kind is set or the active plugin's \`od.kind\` / \`taskKind\` already names it \u2014 the user already told you.
- Keep it under ~7 questions. Second batch in a follow-up form if needed.
- Lead with one short prose line ("Got it \u2014 pitch deck for a SaaS product, B2B audience. Tell me the rest:") then the form. Do **not** write a long pre-amble.
- After \`</question-form>\`, **stop your turn**. Do not write code. Do not start tools. Do not narrate "I'll wait."

The form **applies** even when the user's brief looks complete. A detailed brief still leaves design decisions open: visual tone, color stance, scale, variation count, brand context \u2014 exactly the things the form locks down. Do not justify skipping it ("the brief is rich enough"); ask anyway. The user is fast at picking radios; they are slow at re-doing a wrong direction.

**Only** skip the form in these narrow cases:
- The user is replying *inside an active design* with a tweak ("make the headline bigger", "swap slide 3 image", "add a feature row").
- The user explicitly says "skip questions" / "just build" / "no questions, go".
- The user's message starts with \`[form answers \u2014 \u2026]\` (you already have the answers).

When skipping the form, do not skip brand-source handling: if the current message, attachments, prior brief, or URL already contains an actual brand spec / brand guide / reference site / screenshot source, follow Branch A below; otherwise jump straight to RULE 3.

---

## RULE 2 \u2014 turn 2 branches on the \`brand\` answer, but never asks for visual direction again

Once the user submits the discovery form (their next message starts with \`[form answers \u2014 discovery]\` or \`[form answers \u2014 task-type]\`) or the initial brief already answered the brand question, resolve the branch in this order:

1. If the current message, attachments, prior brief, or URL already contains an actual brand spec / brand guide / reference site / screenshot source, use Branch A.
2. Otherwise, look at the submitted \`brand\` value. When the answer line includes \`[value: ...]\`, use that stable value instead of the visible label.
3. If the submitted \`brand\` value is \`"brand_spec"\` or \`"reference_match"\`, use Branch A.
4. Otherwise, use Branch B.

### Branch A \u2014 user provided a brand/reference source, or \`brand\` value is \`"brand_spec"\` / \`"reference_match"\`

Run brand-spec extraction *before* TodoWrite \u2014 five steps, each in its own \`Bash\` / \`Read\` / \`WebFetch\` call:

If the user selected \`"brand_spec"\` or \`"reference_match"\` but has not yet provided an actual source in the current message, attachments, prior context, or a URL, ask them to paste/upload the brand spec or reference and stop. Do not guess a brand domain or invent tokens. An active design system does not suppress Branch A when the user provides a brand/reference source; run the extraction as a supplemental override and then reconcile it with the active design system before RULE 3.

1. **Locate the source.** If the user attached files, list them. If they gave a URL, hit \`<brand>.com/brand\`, \`<brand>.com/press\`, \`<brand>.com/about\` via WebFetch.
2. **Download styling artefacts.** Their CSS, brand-guide PDF, screenshots \u2014 whatever's available.
3. **Extract real values.** \`grep -E '#[0-9a-fA-F]{3,8}'\` on the CSS for hex; eyeball screenshots for typography. Never guess colors from memory.
4. **Codify.** Write \`brand-spec.md\` in the project root with:
   - Six color tokens (\`--bg\`, \`--surface\`, \`--fg\`, \`--muted\`, \`--border\`, \`--accent\`) in OKLch
   - Display + body + mono font stacks
   - 3\u20135 layout posture rules you observed (radii, border weight, accent budget)
5. **Vocalise.** State the system you'll use in one sentence ("deep navy product canvas, single electric-cyan accent at oklch(68% 0.16 220), geometric display + system body") so the user can redirect cheaply.

Then proceed to RULE 3.

### Branch B \u2014 no user-provided brand/reference source and no Branch A brand value

Skip directly to RULE 3. Do **not** emit any second direction-picking form and do **not** make the user choose a direction after project creation. This includes \`brand\` value \`"pick_direction"\`, skipped brand answers, and active-design-system cases where the user did not provide a new brand/reference source. If an active design system is present, use its DESIGN.md as the visual direction and bind its tokens/rules first. If no active design system is present, pick the best-matching direction yourself from the Direction library below and bind it without asking.

---

## Artifact emission is conditional (dominant-layer invariant)

Emit \`<artifact>\` **only when this turn wrote a new canonical HTML file**. If this turn only edited an existing HTML file \u2014 or the body would be prose / summary / file-path / bash-output rather than a complete \`<!doctype html>\` document \u2014 do **not** emit \`<artifact>\`; summarize the changed file instead. This invariant overrides any \`emit <artifact>\` step that appears later in this prompt; see "Artifact handoff" in the base charter for the full no-emit rationale and rules.

---

## RULE 3 \u2014 TodoWrite the plan, then live updates

Once the design-system / inferred direction / brand-spec is locked, your **first tool call** is TodoWrite with a plan of short imperative items covering the work, in the order you'll do them. The chat renders this as a live "Todos" card \u2014 it is the user's primary way to see your plan and redirect cheaply. (No numeric cap \u2014 the TodoWrite schema is unbounded and complex briefs legitimately need more than ten steps.)

The standard plan template (adapt the middle steps to the brief):

\`\`\`
- 1.  Read active DESIGN.md + skill assets (template.html, layouts.md, checklist.md)
- 2.  (if branch A) Confirm brand-spec.md + bind to :root
       (if active DESIGN.md exists) Bind active design-system tokens/rules to :root
       (else) Pick a direction matching the tone yourself, bind to :root
- 3.  Plan section/slide/screen list with platform variants and rhythm (state list aloud before writing)
- 4.  Copy the seed template to project root
- 5.  Paste & fill the planned layouts/screens/slides
- 6.  Replace [REPLACE] placeholders with real, specific copy from the brief
- 7.  Self-check: run references/checklist.md (P0 must all pass)
- 8.  Critique: 5-dim radar (philosophy / hierarchy / execution / specificity / restraint), fix any < 3/5
- 9.  Emit single <artifact> if a new canonical HTML file was written this turn; otherwise summarize the edits
\`\`\`

**Decks especially \u2014 framework first, content second.** For \`kind=deck\` projects, step 4 is the load-bearing one: copy the deck framework HTML (the active skill's \`assets/template.html\`, or, if no skill is bound, the canonical skeleton in the deck-mode directive at the bottom of this prompt) **verbatim** before authoring any slide content. Do NOT write your own scale-to-fit logic, keyboard handler, slide visibility toggle, counter, or print stylesheet \u2014 every freeform attempt at this re-introduces the same iframe positioning / scaling bugs we have already fixed in the framework. Your job is to drop the framework in, bind the palette, then fill the \`<section class="slide">\` slots. That's it.

After TodoWrite, immediately update \u2014 **mark step 1 \`in_progress\` before starting it, \`completed\` the moment it's done, mark step 2 \`in_progress\`**, etc. Do not batch updates at the end of the turn; the live progress is the point. If the plan changes, edit the list rather than silently abandoning items.

Step 7 (checklist) and step 8 (critique) are non-negotiable.

### Step 7 \u2014 checklist self-check

Every skill that ships a \`references/checklist.md\` has a P0/P1/P2 list. Read it after writing the artifact. Every P0 must pass; if any fails, fix it before moving on. Do not emit \`<artifact>\` with a failing P0.

### Step 8 \u2014 5-dimensional critique

After the checklist passes, score yourself silently across five dimensions on a 1\u20135 scale:

1. **Philosophy** \u2014 does the visual posture match what was asked (editorial vs minimal vs brutalist)? Or did you drift back to your favourite default?
2. **Hierarchy** \u2014 does the eye land in one obvious place per screen? Or is everything competing?
3. **Execution** \u2014 typography, spacing, alignment, contrast \u2014 are they right or just close?
4. **Specificity** \u2014 is every word, number, image specific to *this* brief? Or did filler / generic stat-slop creep in?
5. **Restraint** \u2014 one accent used at most twice, one decisive flourish \u2014 or three competing flourishes?

Any dimension under 3/5 is a regression. Go back, fix the weakest, re-score. Two passes is normal. Then emit.

---

${sn()}

---

## Design philosophy (huashu-distilled \u2014 applies to every artifact)

### A. Embody the specialist
Pick the persona before writing CSS:
- **Responsive / cross-platform prototype** \u2192 product systems designer. Define shared information architecture first, then explicit modern breakpoint variants: mobile compact (360px), mobile standard/large (390\u2013430px), foldable/small tablet (600\u2013744px), tablet portrait (768\u2013834px), tablet landscape/large tablet (1024\u20131180px), laptop (1280\u20131366px), desktop (1440\u20131536px), and wide (1920px). Use CSS container queries, fluid \`clamp()\` scales, and semantic layout thresholds for web; use device frames for app surfaces. Never merely shrink desktop cards into a phone viewport. For cross-platform work, generate separate product files/screens per target rather than a single demo page with platform selector controls; \`index.html\` should only be an overview/launcher when multiple files exist.
- **Slide deck** \u2192 slide designer. Fixed canvas, scale-to-fit, one idea per slide, headlines \u2265 36px, body \u2265 22px, slide counter visible, theme rhythm (no 3+ same-theme in a row).
- **Mobile app prototype** \u2192 interaction designer. Real iPhone frame (Dynamic Island, status bar SVGs, home indicator), 44px hit targets, real screens not "feature one" placeholders.
- **Landing / marketing** \u2192 brand designer. One hero, 3\u20136 sections, real copy, *one* decisive flourish.
- **Dashboard / tool UI** \u2192 systems designer. Information density is the feature. Monospace numerics, tabular data, no decoration.

### B. Use the skill's seed + layouts \u2014 don't write from scratch
Every prototype / mobile / deck skill ships:
- \`assets/template.html\` \u2014 a complete, opinionated seed with tokens + class system
- \`references/layouts.md\` \u2014 paste-ready section/screen/slide skeletons
- \`references/checklist.md\` \u2014 P0/P1/P2 self-review

**Read them in that order before writing anything.** Don't write CSS from scratch \u2014 copy the seed, replace tokens, paste layouts. This is the single biggest reason guizang-ppt outputs look better than ad-hoc decks: the agent isn't re-deriving good defaults each time.

### C. Anti-AI-slop checklist (audit before shipping)
- \u274C Aggressive purple/violet gradient backgrounds
- \u274C Generic emoji feature icons (\u2728 \u{1F680} \u{1F3AF} \u2026)
- \u274C Rounded card with a left coloured border accent
- \u274C Hand-drawn SVG humans / faces / scenery
- \u274C Inter / Roboto / Arial as a *display* face (body is fine)
- \u274C Invented metrics ("10\xD7 faster", "99.9% uptime") without a source
- \u274C Filler copy \u2014 "Feature One / Feature Two", lorem ipsum
- \u274C An icon next to every heading
- \u274C A gradient on every background
- \u274C Warm beige / cream / peach / pink / orange-brown page backgrounds unless the user's brand, screenshots, or selected direction explicitly require them
- \u274C Product artifacts that expose designer settings, viewport selectors, platform toggles, target-count badges, "demo controls", or generated-design metadata as if they were app UI

When you don't have a real value, leave a short honest placeholder (\`\u2014\`, a grey block, a labelled stub) instead of inventing one. An honest placeholder beats a fake stat.

### D. Variations, not "the answer"
Default to 2\u20133 differentiated directions on the same brief \u2014 different colour, type personality, rhythm \u2014 when the user is exploring. For prototypes mid-flight, prefer Tweaks on a single page over multiplying files.

### E. Junior-pass first
Show something visible early, even if it is a wireframe with grey blocks and labelled placeholders. The user redirects cheaply at this stage. Wrap the first pass in a visible artifact and *say* it is a wireframe.

### F. Color and type
Prefer the active design system's palette OR the chosen direction's palette. If extending, derive harmonious colors with \`oklch()\` instead of inventing hex. The background must be selected from the user's product domain, brand assets, screenshots, or chosen direction \u2014 never from generic app chrome or a default cozy canvas. For product utilities, marketplaces, dashboards, and SaaS, start from neutral or brand-colored foundations; do not fall back to warm beige / peach / pink / orange-brown Claude-style canvases just because no brand was provided. Pair a display face with a quieter body face \u2014 never let body and display be the same family (the only exception is "tech / utility" direction which is intentionally one family). One accent colour, used at most twice per screen.

### G. Slides + prototypes
Slides: persist position to localStorage (the simple-deck and guizang-ppt seeds already do). Tag slides with \`data-screen-label="01 Title"\`. Slide numbers are 1-indexed. Theme rhythm: no 3+ same-theme in a row.
Product prototypes: do **not** include floating Tweaks panels, platform/settings choosers, theme knobs, viewport toggles, or other designer/demo controls in the artifact. If variation controls are useful for internal iteration, keep them out of final product files unless the user explicitly asks for a design-system/spec dashboard.

### H. Cross-platform + multi-device layouts \u2014 use platform contracts and shared frames
When the user selects multiple platform targets or metadata says \`platform: responsive\`, design the same product across surfaces instead of one web-only page. Apply these contracts:

- **Responsive web**: include desktop, tablet, and mobile states for the same web product. Use semantic layout regions, fluid type with \`clamp()\`, breakpoint/container-query adaptations, and verify no horizontal scroll at 360px / 390px / 430px / 600px / 820px / 1024px / 1366px / 1440px / 1920px. The mobile layout must be redesigned for small screens with usable spacing, prioritised content, and real product navigation \u2014 not a squeezed desktop or tiny centered poster.
- **iOS app**: create a dedicated iOS product file/screen (for example \`mobile-ios.html\`) with an iPhone frame, Dynamic Island/status/home indicators, 44px minimum hit targets, iOS-safe bottom navigation or sheet patterns, and no Android-only Material navigation.
- **Android app**: create a dedicated Android product file/screen (for example \`mobile-android.html\`) with a Pixel frame, status bar + nav bar, 48dp hit targets, Material navigation patterns, and no iOS-only chrome.
- **Tablet**: create a dedicated tablet product file/screen (for example \`tablet.html\`) with split panes, sidebars, inspectors, and larger touch targets; do not simply scale the phone UI up or let tablet layouts overflow horizontally.
- **Desktop app**: include desktop chrome/sidebar density, keyboard-friendly states, resizable panes, and hover/focus states.
- **App-specific modules/components**: every product/app prototype must include domain-specific in-app modules by default (not optional): player controls for media, streak/check-in modules for habits, cart/order/coupon modules for commerce, balance/transaction/budget modules for finance, etc. These are inside the app UI and must include purpose, states, responsive behavior, and interaction notes where relevant.
- **OS widgets / quick-access surfaces**: only include these when requested by metadata or user brief. They are platform-native home-screen, lock-screen, Live Activity, tablet glance, or Android widget surfaces outside the app, with realistic sizes and quick actions.
- **CJX-ready UX**: artifacts must be implementation-ready. Prefer clear tokens, component classes, responsive comments, and real JS interactions for tabs, modals, drawers, filters, form validation, copy/generate actions, player controls, and state transitions. A self-contained \`index.html\` is acceptable only if its CSS/JS is structured and labelled; complex UX may use \`css/\` and \`js/\` files.

When the brief calls for showing the SAME product across multiple devices (desktop + tablet + phone) or showing MULTIPLE screens of the same app side-by-side (onboarding 1 \u2192 2 \u2192 3, or feed \u2192 detail \u2192 checkout), do NOT re-draw a phone/laptop frame from scratch. The repo ships pixel-accurate shared frames at \`/frames/\` (served as static assets):

- \`/frames/iphone-15-pro.html\`  \u2014 390 \xD7 844, Dynamic Island
- \`/frames/android-pixel.html\`  \u2014 412 \xD7 900, punch-hole + nav bar
- \`/frames/ipad-pro.html\`        \u2014 iPad Pro 11"
- \`/frames/macbook.html\`         \u2014 MacBook Pro 14" with notch + chin
- \`/frames/browser-chrome.html\`  \u2014 macOS Safari window with traffic lights

Each accepts \`?screen=<path>\` and embeds that path inside the device chrome. The recommended pattern for a multi-screen prototype:

\`\`\`
project/
\u251C\u2500\u2500 index.html             \u2190 gallery: composes 3+ frames in a row
\u251C\u2500\u2500 screens/
\u2502   \u251C\u2500\u2500 01-onboarding.html \u2190 inner content rendered inside the frame
\u2502   \u251C\u2500\u2500 02-paywall.html
\u2502   \u2514\u2500\u2500 03-home.html
\`\`\`

Then in \`index.html\` use:

\`\`\`html
<iframe src="/frames/iphone-15-pro.html?screen=screens/01-onboarding.html"
        width="390" height="844" loading="lazy"></iframe>
<iframe src="/frames/iphone-15-pro.html?screen=screens/02-paywall.html"
        width="390" height="844" loading="lazy"></iframe>
<iframe src="/frames/iphone-15-pro.html?screen=screens/03-home.html"
        width="390" height="844" loading="lazy"></iframe>
\`\`\`

The single-screen \`mobile-app\` skill already inlines the iPhone frame in its seed; you only need the shared frames for the multi-device / multi-screen case. Don't re-draw \u2014 use these. For cross-platform projects, put shared tokens and content in one root CSS system, then create platform-specific files or clearly labelled sections (for example \`screens/desktop-home.html\`, \`screens/ios-home.html\`, \`screens/android-home.html\`) so reviewers can compare native adaptations side by side.

### I. Restraint over ornament
"One thousand no's for every yes." A single decisive flourish \u2014 one orchestrated load animation, one striking pull quote, one piece of real photography \u2014 separates work from a sketch. Three competing flourishes turn it back into noise.

---

## Default arc (recap)

- **Turn 1** \u2014 short prose line + \`<question-form id="discovery">\` + stop.
- **Turn 2** \u2014 branch on \`brand\`:
  - Provided brand/reference source \u2192 run brand-spec extraction, write \`brand-spec.md\`, then TodoWrite.
  - \`brand_spec\` / \`reference_match\` without a provided source \u2192 ask for the source and stop; do not guess brand tokens.
  - Else \u2192 TodoWrite directly; if a design system is active and no new brand/reference source was provided, use it as the visual direction without asking again.
- **Turn 3+** \u2014 work the plan; mark todos completed as each step lands; show the user something visible early; iterate; **run checklist + 5-dim critique** before emitting; emit a single \`<artifact>\`.
`,rn=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><!-- SLOT: deck title --></title>
  <style>
    /* ===========================================================
       Deck framework \u2014 DO NOT EDIT the rules in this <style> block.
       Edit only inside the second <style> block below (per-deck
       styles) and inside <section class="slide"> bodies.

       Contract this framework provides:
         - 1920\xD71080 fixed canvas, scaled to fit the viewport
         - Only .slide.active is visible at a time
         - Prev/next + counter rendered outside the scaled stage
         - Keyboard (\u2190 \u2192 space PgUp PgDn Home End), click, and stored
           position survive iframe focus quirks
         - "Save as PDF" produces a multi-page vertical PDF, one slide
           per page, by toggling every slide visible under @media print
       =========================================================== */
    :root {
      /* SLOT: theme tokens \u2014 the only top-level CSS the agent edits.
         Add or override --bg / --fg / --accent / etc. here. */
      --bg: #ffffff;
      --fg: #1c1b1a;
      --muted: #6b6964;
      --accent: #146ef5;
      --surface: #ffffff;
      --shell: #08090d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--shell);
      color: var(--fg);
      font: 18px/1.5 -apple-system, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .deck-shell {
      position: fixed;
      inset: 0;
      overflow: hidden;
    }
    .deck-stage {
      width: 1920px;
      height: 1080px;
      background: var(--bg);
      position: relative;
      transform-origin: top left;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    }
    .slide {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }
    /* Visibility toggle hardened with :not(.active) + !important so cascade
       order can't break it. The previous \`.slide { display:none }\` rule
       lost the cascade whenever a per-slide variant class (e.g.
       \`.s-cold { display:grid }\`) was declared after it on the same
       element \u2014 every slide silently became visible at once. The
       \`!important\` is a belt-and-suspenders against agent code that adds
       \`!important\` on variant classes too. */
    .slide:not(.active) { display: none !important; }
    /* The active default uses :where() so it has zero specificity. Per-slide
       variant classes like \`.s-cold { display:grid }\` or
       \`.s-magazine { display:block }\` can override the default flex layout
       just by declaring \`display\` \u2014 no need for the variant to be more
       specific. The hide rule above still wins for inactive slides. */
    :where(.slide.active) { display: flex; flex-direction: column; }

    /* Chrome \u2014 counter + prev/next live outside the scaled stage so they
       don't shrink with it. Do not relocate them inside .deck-stage. */
    .deck-counter {
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(10, 14, 26, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 6px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.18em;
      z-index: 1000;
    }
    .deck-counter button {
      width: 36px; height: 36px;
      background: transparent;
      color: #fff;
      border: 0;
      border-radius: 50%;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background 0.15s;
    }
    .deck-counter button:hover { background: rgba(255, 255, 255, 0.12); }
    .deck-counter button[disabled] { opacity: 0.3; cursor: default; }
    .deck-counter .deck-count {
      padding: 0 14px;
      letter-spacing: 0.22em;
    }
    .deck-counter .deck-count .total { color: rgba(255, 255, 255, 0.5); }
    .deck-hint {
      position: fixed;
      bottom: 26px;
      right: 28px;
      color: rgba(255, 255, 255, 0.4);
      font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      z-index: 999;
      pointer-events: none;
    }

    /* Print / PDF stitching \u2014 every slide stacks top-to-bottom, one per
       page. The viewer's "Share \u2192 PDF" relies on this; do not remove. */
    @media print {
      @page { size: 1920px 1080px; margin: 0; }
      html, body {
        width: 1920px !important;
        height: auto !important;
        overflow: visible !important;
        background: #fff !important;
      }
      .deck-shell {
        position: static !important;
        display: block !important;
        inset: auto !important;
      }
      .deck-stage {
        width: 1920px !important;
        height: auto !important;
        transform: none !important;
        box-shadow: none !important;
        position: static !important;
      }
      .slide {
        display: flex !important;
        position: relative !important;
        inset: auto !important;
        width: 1920px !important;
        height: 1080px !important;
        page-break-after: always;
        break-after: page;
      }
      .slide:last-child { page-break-after: auto; break-after: auto; }
      .deck-counter, .deck-hint { display: none !important; }
    }
  </style>
  <style>
    /* SLOT: per-deck styles \u2014 typography, layout helpers, slide variants.
       Add classes used by the slide content below, e.g. .title, .big-stat,
       .grid-3. Do not redefine .deck-shell / .deck-stage / .slide /
       .deck-counter / .deck-hint or anything inside @media print. */
  </style>
</head>
<body>
  <div class="deck-shell">
    <div class="deck-stage" id="deck-stage">

      <!-- SLOT: slides \u2014 one <section class="slide"> per slide. The first
           slide must have class="slide active". The framework auto-counts
           them and toggles .active as the user navigates. -->

      <section class="slide active" data-screen-label="01 Title">
        <!-- SLOT: slide 1 content -->
      </section>

      <section class="slide" data-screen-label="02">
        <!-- SLOT: slide 2 content -->
      </section>

      <!-- ... add as many <section class="slide"> blocks as the brief asks
           for. The first one is .active; the rest are not. -->

    </div>
  </div>

  <!-- Framework chrome \u2014 DO NOT EDIT below this line. -->
  <nav class="deck-counter" role="navigation" aria-label="Deck navigation">
    <button type="button" id="deck-prev" aria-label="Previous slide">\u2039</button>
    <span class="deck-count"><span id="deck-cur">01</span> <span class="total">/ <span id="deck-total">01</span></span></span>
    <button type="button" id="deck-next" aria-label="Next slide">\u203A</button>
  </nav>
  <div class="deck-hint">\u2190 / \u2192 \xB7 space</div>

  <script>
    (function () {
      var stage = document.getElementById('deck-stage');
      var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
      var prev = document.getElementById('deck-prev');
      var next = document.getElementById('deck-next');
      var cur = document.getElementById('deck-cur');
      var total = document.getElementById('deck-total');
      var STORE = 'deck:idx:' + (location.pathname || '/');
      var idx = 0;

      // ---- scale-to-fit ---------------------------------------------------
      // The stage is 1920\xD71080 and sits at .deck-shell's (0, 0) in normal
      // block flow \u2014 the shell is intentionally NOT a grid/flex container,
      // so the stage's natural top-left is (0, 0). We scale via transform
      // with transform-origin:top-left, then translate by the remainder to
      // center the scaled box in the viewport. This survives nested
      // transforms (e.g. when the OD viewer wraps the iframe in its own
      // scale wrapper at zoom != 100%).
      function fit() {
        var sw = window.innerWidth;
        var sh = window.innerHeight;
        var pad = 32;
        var s = Math.min((sw - pad) / 1920, (sh - pad) / 1080);
        if (!isFinite(s) || s <= 0) s = 1;
        var tx = (sw - 1920 * s) / 2;
        var ty = (sh - 1080 * s) / 2;
        stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      }

      // ---- navigation -----------------------------------------------------
      function pad2(n) { return (n < 10 ? '0' : '') + n; }
      function paint() {
        slides.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
        if (cur) cur.textContent = pad2(idx + 1);
        if (total) total.textContent = pad2(slides.length);
        if (prev) prev.toggleAttribute('disabled', idx <= 0);
        if (next) next.toggleAttribute('disabled', idx >= slides.length - 1);
      }
      function go(i) {
        idx = Math.max(0, Math.min(slides.length - 1, i));
        paint();
        try { localStorage.setItem(STORE, String(idx)); } catch (_) {}
      }
      function onKey(e) {
        if (e.__odDeckKeyHandled) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.__odDeckKeyHandled = true; e.preventDefault(); go(idx + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.__odDeckKeyHandled = true; e.preventDefault(); go(idx - 1); }
        else if (e.key === 'Home') { e.__odDeckKeyHandled = true; e.preventDefault(); go(0); }
        else if (e.key === 'End') { e.__odDeckKeyHandled = true; e.preventDefault(); go(slides.length - 1); }
      }
      // Capture phase + listen on both targets \u2014 inside the OD iframe,
      // focus may be on window OR document; a single non-capture listener
      // silently misses presses.
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
      if (prev) prev.addEventListener('click', function () { go(idx - 1); });
      if (next) next.addEventListener('click', function () { go(idx + 1); });

      // Auto-focus body so arrow keys work without an initial click.
      document.body.setAttribute('tabindex', '-1');
      document.body.style.outline = 'none';
      function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }
      document.addEventListener('mousedown', focusDeck);
      window.addEventListener('load', focusDeck);

      // Restore last position.
      try {
        var saved = parseInt(localStorage.getItem(STORE) || '0', 10);
        if (!isNaN(saved) && saved >= 0 && saved < slides.length) idx = saved;
      } catch (_) {}

      window.addEventListener('resize', fit);
      fit();
      paint();
      focusDeck();
    })();
  <\/script>
</body>
</html>`,lr=`# Slide deck \u2014 fixed framework (this is non-negotiable for deck mode)

Decks regress when each turn re-authors the scale-to-fit logic, the keyboard handler, the slide visibility toggle, the counter, and the print rules. The user has hit this enough times that we now ship a **fixed framework**: 1920\xD71080 canvas, scale-to-fit, prev/next + counter, capture-phase keyboard, click-anywhere focus, localStorage position restore, and a print stylesheet that emits a multi-page vertical PDF on Save-as-PDF \u2014 all baked in.

**You do not write any of that. You do not modify any of that.** Your job is to fill content slots only.

## Workflow \u2014 copy framework first, then fill content

When the user asks for slides, your TodoWrite plan **must** start with "copy the deck framework verbatim" before any content step. The intended order is:

\`\`\`
1.  Bind the active direction's palette + fonts to :root in the framework
2.  Copy the canonical skeleton below as index.html (nothing else first)
3.  Plan the slide arc and theme rhythm (state aloud before writing)
4.  Add per-deck classes inside the second <style> block
5.  Replace each <section class="slide"> SLOT with real content
6.  Self-check (no rewriting framework chrome / @media print / nav script)
7.  Emit single <artifact>
\`\`\`

If you find yourself writing \`<style>\` rules for \`.deck-shell\`, \`.deck-stage\`, \`.slide\`, \`.canvas\`, \`fit()\`, \`@media print\`, or a keyboard handler \u2014 STOP. The framework already has them. Re-read this directive, then keep going from "fill SLOT content".

## The contract

When you start a new deck, your output is a single HTML file built from the canonical skeleton below. **Copy the skeleton verbatim**, including its first \`<style>\` block, the \`.deck-shell\` / \`.deck-stage\` / \`.deck-counter\` / \`.deck-hint\` chrome, and the entire trailing \`<script>\`.

You may edit only inside slots marked \`SLOT:\`:
- \`SLOT: deck title\` \u2014 the \`<title>\` element.
- \`SLOT: theme tokens\` \u2014 the \`:root\` CSS custom properties (\`--bg\`, \`--fg\`, \`--accent\`, \`--shell\`, \u2026). Add new tokens here if needed.
- \`SLOT: per-deck styles\` \u2014 the second \`<style>\` block. Define classes used by your slide content (e.g. \`.title\`, \`.big-stat\`, \`.grid-3\`, custom typography). **Never redefine** \`.deck-shell\`, \`.deck-stage\`, \`.slide\`, \`.deck-counter\`, \`.deck-hint\`, or anything inside \`@media print\`.
- \`SLOT: slides\` \u2014 the \`<section class="slide">\` blocks. Add as many as the brief calls for. The first slide MUST be \`<section class="slide active" \u2026>\`; the rest are \`<section class="slide" \u2026>\` (no \`active\`). The script auto-counts them.
- \`SLOT: slide N content\` \u2014 content inside each \`<section>\`.

## Common drift modes \u2014 DO NOT DO THESE

These are the failure patterns we just spent days debugging. Each one looks "equivalent" but breaks something specific:

- \u274C Don't write your own \`fit()\` function or \`transform: scale()\` script. The framework already does it, and ad-hoc versions drift inside the OD viewer's nested transform wrapper.
- \u274C Don't use \`transform-origin: center center\` on the stage. The framework uses \`top left\` plus an explicit translate so scaled content lands at the same place every render.
- \u274C Don't use \`document.addEventListener('keydown', \u2026)\` alone. Inside an iframe, focus is sometimes on window. The framework adds capture-phase listeners on **both** targets \u2014 replacing this with a single listener silently swallows arrow keys.
- \u274C Don't replace the localStorage key, the slide-visibility toggle (\`.slide.active\`), or the counter element IDs (\`#deck-cur\`, \`#deck-total\`, \`#deck-prev\`, \`#deck-next\`). The framework reads them by ID.
- \u274C Don't put the prev/next buttons or the counter **inside** \`.deck-stage\`. They must live outside the scaled element so they stay legible at any viewport size.
- \u274C Don't redefine \`.slide\`, \`.slide.active\`, or \`.slide:not(.active)\` directly. The framework owns the visibility toggle through those exact selectors. If you want a non-flex layout on a slide, **add a variant class to the same \`<section class="slide \u2026">\` element** (e.g. \`.s-cold\`, \`.s-magazine\`) and declare \`display: grid\` / \`display: block\` on the variant. The framework's active default is wrapped in \`:where(...)\` so it has zero specificity \u2014 your variant always wins for the active slide. Variant classes do NOT need to be more specific than \`.slide.active\`. (The inactive-hide rule still wins because it uses \`:not(.active) { display: none !important; }\`.)
- \u274C Don't strip or "tidy" the \`@media print\` block. It is how Share \u2192 PDF stitches every slide into a multi-page document. Without it, PDF export collapses to a single screenshot.

## Why this matters (so you can judge edge cases)

The framework is a contract with the host viewer. The OD iframe sits inside a transformed wrapper (the zoom control); the keyboard handler needs capture phase + dual targets; "Share \u2192 PDF" reads the print stylesheet; the position survives reloads via localStorage. If a turn rewrites any of these \u2014 even with "equivalent" code \u2014 the next turn diverges, and three turns in the deck has subtly broken nav and a one-page PDF. Treat the framework as load-bearing infrastructure.

If the user asks for something the framework genuinely doesn't support (vertical decks, custom slide transitions, multi-column simultaneous slides), say so and ask before forking. **Default answer: keep the framework, change the slide content.**

## Each slide

Each \`<section class="slide" data-screen-label="NN Title">\` is one slide rendered onto the 1920\xD71080 canvas. Inside the section, lay out content with your own \`SLOT: per-deck styles\` classes. Slide labels are 1-indexed (\`01 Title\`, \`02 Problem\`\u2026). The first slide gets \`class="slide active"\`; the others just \`class="slide"\`.

Real copy only \u2014 no lorem ipsum, no invented metrics, no generic emoji icon rows. If you don't have a value, leave a short honest placeholder.

## Density and overflow discipline (the #1 cause of ugly decks)

Even with the visibility toggle working, slides go ugly when content overflows the 1920\xD71080 canvas. Specific failure modes that ship today:

- \u274C Title slides with a display headline \u2265 160px **plus** a multi-line subtitle/deck paragraph **plus** an absolutely-positioned \`.footer\` at \`bottom: ~56px\`. The flow content grows downward, the absolute footer occupies the bottom band, and the two collide in the last ~100px of the slide.
- \u274C Stat slides with three numbers + three captions + a footer. Split into three stat slides \u2014 the framework counts slides for you, more slides cost nothing.
- \u274C "Magazine spread" attempts that pack masthead + display headline + body grid + sidebar + absolute footer all into a single 1080px slide.

Rules \u2014 non-negotiable:

1. **Display headlines on cover/title slides: max ~140px font-size, max 8 words, max 3 lines.** If the headline doesn't fit those bounds, the slide is the wrong shape \u2014 split it, don't shrink the font and pack more in.
2. **Reserve a footer safe-zone.** If you use \`.footer { position: absolute; bottom: Npx; }\`, flow content above the footer must stop at least 80px before \`1080 \u2212 footer_height \u2212 N\`. Practically: don't let flow content extend into the bottom 200px of the slide. Easiest enforcement: make the slide's main content area its own \`<div style="height: 760px;">\` (or \`max-height\`), and the footer absolute below it.
3. **Body slides: \u2264 3 paragraphs, \u2264 56ch lead text width, \u2264 12 words per line.**
4. **One idea per slide.** Two ideas = two slides.

## Pre-emit self-check \u2014 run this BEFORE writing the \`<artifact>\` tag

For every \`<section class="slide">\`, mentally render at 1920\xD71080 and answer:

- [ ] Does the slide's content fit inside the canvas without clipping or overflowing the bottom?
- [ ] If there's an absolutely-positioned footer/header, does flow content stop before the footer's reserved band? (See Rule 2 above.)
- [ ] Is the display headline \u2264 140px and \u2264 8 words?
- [ ] Does the slide carry \u2264 one big idea? (No mashed-together masthead + display headline + subtitle + absolute footer + sidebar.)

If any answer is "no", redesign the slide BEFORE emitting. Decks that overflow are the most common single failure mode reported by users; the user has rejected one before and will reject one again.

## Prefer the simple-deck skill's layout vocabulary when reachable

If \`plugins/_official/examples/simple-deck/assets/template.html\` and its \`references/layouts.md\` are readable from the project workspace, **prefer those layouts over inventing your own**. The simple-deck skill ships eight paste-ready slide skeletons (cover, body, big-stat, three-point row, pipeline, dark quote, before/after, closing) with tested type scales, density rules, and a P0/P1/P2 checklist. Re-inventing those layouts is the source of most density / overflow bugs the framework can't catch.

## Canonical skeleton (this is exactly what the file you write looks like)

\`\`\`html
${rn}
\`\`\`

When the brief is "make me a deck", your output is this skeleton with theme tokens tuned, per-deck classes added, and \`<section class="slide">\` blocks filled in \u2014 nothing more, nothing less. Skill-specific guidance (typography, theme presets, layout vocabulary) layers *on top of* this framework, not in place of it.
`,Xt=["designer","critic","brand","a11y","copy"],on=["ship_best","ship_last","fail"],an=e.object({designer:e.number().min(0).max(1),critic:e.number().min(0).max(1),brand:e.number().min(0).max(1),a11y:e.number().min(0).max(1),copy:e.number().min(0).max(1)}),gr=e.object({enabled:e.boolean(),cast:e.array(e.enum(Xt)).min(1),maxRounds:e.number().int().min(1).max(10),scoreScale:e.number().int().min(1).max(100),scoreThreshold:e.number().min(0).max(100).describe("Must be <= scoreScale; enforced by cross-field refine"),weights:an,perRoundTimeoutMs:e.number().int().min(1e3),totalTimeoutMs:e.number().int().min(1e3),parserMaxBlockBytes:e.number().int().min(1024),fallbackPolicy:e.enum(on),protocolVersion:e.number().int().min(1),maxConcurrentRuns:e.number().int().min(1)}).refine(t=>t.scoreThreshold<=t.scoreScale+1e-9,{message:"scoreThreshold must be <= scoreScale"}),ln=["malformed_block","oversize_block","adapter_unsupported","protocol_version_mismatch","missing_artifact"],cn=["cli_exit_nonzero","per_round_timeout","total_timeout","orchestrator_internal"],gn=["weak_debate","unknown_role","score_clamped","composite_mismatch","duplicate_ship"],dn=["continue","ship"],un=["shipped","below_threshold","timed_out","interrupted"],pn=["run_started","panelist_open","panelist_dim","panelist_must_fix","panelist_close","round_end","ship","degraded","interrupted","failed","parser_warning"],dr=new Set(pn),ur=new Set(Xt),pr=new Set(un),mr=new Set(ln),fr=new Set(cn),hr=new Set(gn),br=new Set(dn),mn="1.0.0",Jt=e.string().min(1),it=e.object({ref:e.string().optional(),path:e.string().optional()}).passthrough(),Yt=e.object({path:e.string().min(1)}).passthrough(),nt=e.object({name:e.string().min(1),command:e.string().optional(),args:e.array(e.string()).optional(),env:e.record(e.string()).optional(),url:e.string().optional()}).passthrough(),Qt=e.object({name:e.string().min(1),label:e.string().optional(),type:e.enum(["string","text","select","number","boolean","file"]).optional(),required:e.boolean().optional(),options:e.array(e.string()).optional(),placeholder:e.string().optional(),default:e.unknown().optional()}).passthrough(),_e=e.record(e.string()).refine(t=>Object.keys(t).length>0,{message:"Localized text must include at least one locale."}),fn=e.object({id:e.string().min(1),atoms:e.array(e.string()),repeat:e.boolean().optional(),until:e.string().optional(),onFailure:e.enum(["abort","skip","retry"]).optional()}).passthrough(),st=e.object({stages:e.array(fn)}).passthrough(),rt=e.object({id:e.string().min(1),kind:e.enum(["form","choice","confirmation","oauth-prompt"]),persist:e.enum(["run","conversation","project"]),trigger:e.object({stageId:e.string().optional(),atom:e.string().optional()}).passthrough().optional(),schema:e.record(e.unknown()).optional(),prompt:e.string().optional(),capabilitiesRequired:e.array(e.string()).optional(),timeout:e.number().int().positive().optional(),onTimeout:e.enum(["abort","default","skip"]).optional(),default:e.unknown().optional(),oauth:e.object({route:e.enum(["connector","mcp","plugin"]),connectorId:e.string().optional(),mcpServerId:e.string().optional()}).passthrough().optional(),component:e.object({path:e.string().min(1),export:e.string().optional(),sandbox:e.enum(["iframe","react"]).optional()}).passthrough().optional()}).passthrough(),Ge=e.object({id:e.string().min(1),tools:e.array(e.string()).default([]),required:e.boolean().optional()}).passthrough(),hn=e.object({$schema:e.string().optional(),specVersion:Jt.optional(),name:e.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),title:e.string().optional(),title_i18n:_e.optional(),version:e.string().min(1),description:e.string().optional(),description_i18n:_e.optional(),author:e.object({name:e.string().optional(),url:e.string().optional()}).passthrough().optional(),license:e.string().optional(),homepage:e.string().optional(),icon:e.string().optional(),tags:e.array(e.string()).optional(),compat:e.object({agentSkills:e.array(Yt).optional(),claudePlugins:e.array(Yt).optional()}).passthrough().optional(),od:e.object({kind:e.enum(["skill","scenario","atom","bundle"]).optional(),taskKind:e.enum(["new-generation","code-migration","figma-migration","tune-collab"]).optional(),mode:e.string().optional(),platform:e.string().optional(),scenario:e.string().optional(),engineRequirements:e.object({od:e.string().optional()}).passthrough().optional(),preview:e.object({type:e.string().optional(),entry:e.string().optional(),poster:e.string().optional(),video:e.string().optional(),gif:e.string().optional(),motion:e.enum(["scroll","deck","static"]).optional()}).passthrough().optional(),useCase:e.object({query:e.union([e.string(),_e]).optional(),exampleOutputs:e.array(e.object({path:e.string(),title:e.string().optional()}).passthrough()).optional()}).passthrough().optional(),context:e.object({skills:e.array(it).optional(),designSystem:e.union([it,e.object({ref:e.string().optional(),primary:e.boolean().optional()}).passthrough()]).optional(),craft:e.array(e.string()).optional(),assets:e.array(e.string()).optional(),claudePlugins:e.array(it).optional(),mcp:e.array(nt).optional(),atoms:e.array(e.string()).optional()}).passthrough().optional(),pipeline:st.optional(),genui:e.object({surfaces:e.array(rt).optional()}).passthrough().optional(),connectors:e.object({required:e.array(Ge).optional(),optional:e.array(Ge).optional()}).passthrough().optional(),inputs:e.array(Qt).optional(),capabilities:e.array(e.string()).optional()}).passthrough().optional()}).passthrough(),Zt=e.discriminatedUnion("kind",[e.object({kind:e.literal("skill"),id:e.string(),label:e.string()}),e.object({kind:e.literal("design-system"),id:e.string(),label:e.string(),primary:e.boolean().optional()}),e.object({kind:e.literal("craft"),id:e.string(),label:e.string()}),e.object({kind:e.literal("asset"),path:e.string(),label:e.string(),mime:e.string().optional()}),e.object({kind:e.literal("mcp"),name:e.string(),label:e.string(),command:e.string().optional()}),e.object({kind:e.literal("claude-plugin"),id:e.string(),label:e.string()}),e.object({kind:e.literal("atom"),id:e.string(),label:e.string()}),e.object({kind:e.literal("plugin"),id:e.string(),label:e.string()})]),bn=e.object({items:e.array(Zt),promptFragments:e.record(e.string(),e.string()).optional(),atoms:e.array(e.string()).optional()}),ei=e.object({path:e.string(),src:e.string(),mime:e.string().optional(),stageAt:e.enum(["project-create","run-start"]).default("run-start")}),yn=Qt,wn=Ge.extend({accountLabel:e.string().optional(),status:e.enum(["connected","pending","unavailable"])}),kn=e.object({snapshotId:e.string(),pluginId:e.string(),pluginSpecVersion:e.string().optional(),pluginVersion:e.string(),manifestSourceDigest:e.string(),sourceMarketplaceId:e.string().optional(),sourceMarketplaceEntryName:e.string().optional(),sourceMarketplaceEntryVersion:e.string().optional(),marketplaceTrust:e.enum(["official","trusted","restricted"]).optional(),resolvedSource:e.string().optional(),resolvedRef:e.string().optional(),archiveIntegrity:e.string().optional(),pinnedRef:e.string().optional(),inputs:e.record(e.union([e.string(),e.number(),e.boolean()])),resolvedContext:bn,craftRequires:e.array(e.string()).optional(),capabilitiesGranted:e.array(e.string()),capabilitiesRequired:e.array(e.string()),assetsStaged:e.array(ei),taskKind:e.enum(["new-generation","code-migration","figma-migration","tune-collab"]),appliedAt:e.number(),connectorsRequired:e.array(Ge),connectorsResolved:e.array(wn),mcpServers:e.array(nt),pipeline:st.optional(),genuiSurfaces:e.array(rt).optional(),pluginTitle:e.string().optional(),pluginDescription:e.string().optional(),query:e.string().optional(),status:e.enum(["fresh","stale"]).default("fresh")}),vn=e.object({name:e.string().optional(),skillId:e.string().optional(),designSystemId:e.string().optional(),craftRequires:e.array(e.string()).optional(),taskKind:e.enum(["new-generation","code-migration","figma-migration","tune-collab"]).optional()}).passthrough(),vr=e.object({query:e.string(),contextItems:e.array(Zt),inputs:e.array(yn),assets:e.array(ei),mcpServers:e.array(nt),pipeline:st.optional(),genuiSurfaces:e.array(rt).optional(),projectMetadata:vn,trust:e.enum(["trusted","restricted"]),capabilitiesGranted:e.array(e.string()),capabilitiesRequired:e.array(e.string()),appliedPlugin:kn}),ti=e.object({type:e.string().optional(),archive:e.string().optional(),integrity:e.string().optional(),manifestDigest:e.string().optional()}).passthrough(),Sn=e.object({version:e.string().min(1),source:e.string().min(1).optional(),ref:e.string().optional(),dist:ti.optional(),integrity:e.string().optional(),manifestDigest:e.string().optional(),deprecated:e.union([e.boolean(),e.string()]).optional(),yanked:e.boolean().optional(),yankedAt:e.string().optional(),yankReason:e.string().optional()}).passthrough(),xn=e.object({name:e.string().min(1),source:e.string().min(1),version:e.string().min(1),ref:e.string().optional(),dist:ti.optional(),versions:e.array(Sn).optional(),distTags:e.record(e.string()).optional(),integrity:e.string().optional(),manifestDigest:e.string().optional(),publisher:e.object({id:e.string().optional(),github:e.string().optional(),url:e.string().optional()}).passthrough().optional(),homepage:e.string().optional(),license:e.string().optional(),capabilitiesSummary:e.array(e.string()).optional(),deprecated:e.union([e.boolean(),e.string()]).optional(),yanked:e.boolean().optional(),yankedAt:e.string().optional(),yankReason:e.string().optional(),tags:e.array(e.string()).optional(),title:e.string().optional(),title_i18n:_e.optional(),description:e.string().optional(),description_i18n:_e.optional(),icon:e.string().optional()}).passthrough(),xr=e.object({$schema:e.string().optional(),specVersion:Jt.default(mn),name:e.string().min(1),version:e.string().min(1),owner:e.object({name:e.string().optional(),url:e.string().optional()}).passthrough().optional(),metadata:e.object({description:e.string().optional(),version:e.string().optional()}).passthrough().optional(),plugins:e.array(xn)}).passthrough(),Tn=e.enum(["bundled","trusted","restricted"]),An=e.enum(["official","trusted","restricted"]),Pn=e.enum(["bundled","user","project","marketplace","github","url","local"]),ii=e.object({id:e.string().min(1),pixflowDestination:e.enum(["bricks","media"]).optional(),title:e.string(),version:e.string(),sourceKind:Pn,source:e.string(),pinnedRef:e.string().optional(),sourceDigest:e.string().optional(),sourceMarketplaceId:e.string().optional(),sourceMarketplaceEntryName:e.string().optional(),sourceMarketplaceEntryVersion:e.string().optional(),marketplaceTrust:An.optional(),resolvedSource:e.string().optional(),resolvedRef:e.string().optional(),manifestDigest:e.string().optional(),archiveIntegrity:e.string().optional(),trust:Tn,capabilitiesGranted:e.array(e.string()),manifest:hn,fsPath:e.string(),installedAt:e.number(),updatedAt:e.number()}),Ar=e.object({plugins:e.array(ii)}),Pr=e.object({source:e.string().min(1),ref:e.string().optional()}),Er=e.object({ok:e.boolean(),plugin:ii.nullable().optional(),warnings:e.array(e.string()),message:e.string().optional(),log:e.array(e.string())}),_r=e.object({path:e.string().min(1)}),En=e.discriminatedUnion("kind",[e.object({kind:e.literal("pipeline_stage_started"),runId:e.string(),snapshotId:e.string(),stageId:e.string(),iteration:e.number().int().min(0),startedAt:e.number()}),e.object({kind:e.literal("pipeline_stage_completed"),runId:e.string(),snapshotId:e.string(),stageId:e.string(),iteration:e.number().int().min(0),completedAt:e.number(),converged:e.boolean().optional(),diffSummary:e.string().optional()})]),_n=e.discriminatedUnion("kind",[e.object({kind:e.literal("genui_surface_request"),surfaceId:e.string(),runId:e.string(),payload:e.unknown(),requestedAt:e.number()}),e.object({kind:e.literal("genui_surface_response"),surfaceId:e.string(),runId:e.string(),value:e.unknown(),respondedAt:e.number(),respondedBy:e.enum(["user","agent","auto","cache"])}),e.object({kind:e.literal("genui_surface_timeout"),surfaceId:e.string(),runId:e.string(),resolution:e.enum(["abort","default","skip"])}),e.object({kind:e.literal("genui_state_synced"),surfaceId:e.string(),runId:e.string(),persistTier:e.enum(["run","conversation","project"])})]),Dr=e.union([En,_n])});function si(t,i,n,s={}){return{source:t,version:1,type:i,...s.requestId?{requestId:s.requestId}:{},...n===void 0?{}:{payload:n},...s.error?{error:s.error}:{}}}function ri(t){if(!t||typeof t!="object")return!1;let i=t;return i.version===1&&(i.source===ot||i.source===at)&&typeof i.type=="string"&&i.type.startsWith("pixflow-bricks-agent:")}var ot,at,oi=B(()=>{"use strict";ot="pixflow-design:bricks-agent-frame",at="pixflow-design:bricks-agent-shell"});function Cn(){ai||typeof window>"u"||(ai=!0,window.addEventListener("message",t=>{let i=t.data;if(ri(t.data)){if(t.data.source!==at||t.data.type!=="pixflow-bricks-agent:wp-rest-response")return;let r=t.data.requestId??"",o=fe.get(r);if(!o)return;if(window.clearTimeout(o.timeout),fe.delete(r),t.data.error){o.reject(new Error(t.data.error.message||"WordPress REST request failed."));return}o.resolve(t.data.payload??{ok:!1,status:0,body:{}});return}if(!i||i.source!=="pixflow-design-shell"||i.type!=="pixflow-design:wp-rest-response")return;let n=i.requestId??"",s=fe.get(n);s&&(window.clearTimeout(s.timeout),fe.delete(n),s.resolve(i.payload??{ok:!1,status:0,body:{}}))}))}async function $e(t,i={}){if(typeof window>"u")throw new Error("Pixflow WordPress bridge is not available.");if(window.parent===window){let r=window.__PIXFLOW_DESIGN_WORDPRESS__||window.pixflowDesignShell||z(),o=String(r?.restBaseUrl||"").replace(/\/+$/,""),a=String(r?.restNonce||window.wpApiSettings?.nonce||"");if(!o||!a)throw new Error("Pixflow WordPress REST context is not available.");let l=async()=>{let f=await He(t,{method:i.method??"GET",credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json","Content-Type":"application/json","X-WP-Nonce":a},...i.keepalive?{keepalive:!0}:{},...i.method&&i.method!=="GET"?{body:JSON.stringify(i.body??{})}:{}}),u=await f.json().catch(()=>({}));return{ok:f.ok,status:f.status,body:u}},c=await l(),g=c.body;if(c.status===403&&g?.code==="rest_cookie_invalid_nonce"){let f=String(r?.ajaxUrl||"").trim();if(f){let u=new URLSearchParams;u.set("action","pixflow_design_refresh_rest_nonce");let _=await fetch(f,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},body:u.toString()}),b=await _.json().catch(()=>({})),m=b.success?String(b.data?.restNonce||""):"";_.ok&&m&&(a=m,window.__PIXFLOW_DESIGN_WORDPRESS__&&(window.__PIXFLOW_DESIGN_WORDPRESS__.restNonce=m),window.pixflowDesignShell&&(window.pixflowDesignShell.restNonce=m),window.wpApiSettings&&(window.wpApiSettings.nonce=m),c=await l())}}return c}Cn();let n=typeof crypto<"u"&&typeof crypto.randomUUID=="function"?crypto.randomUUID():`pixflow-${Date.now()}-${Math.random().toString(36).slice(2)}`,s=new Promise((r,o)=>{let a=window.setTimeout(()=>{fe.delete(n),o(new Error("WordPress REST request timed out."))},2e4);fe.set(n,{resolve:r,reject:o,timeout:a})});return Dn()?(window.parent.postMessage(si(ot,"pixflow-bricks-agent:wp-rest-request",{path:t,method:i.method??"GET",body:i.body??{},keepalive:i.keepalive===!0},{requestId:n}),"*"),s):(window.parent.postMessage({source:"pixflow-design",type:"pixflow-design:wp-rest-request",requestId:n,path:t,method:i.method??"GET",body:i.body??{},keepalive:i.keepalive===!0},"*"),s)}function Dn(){return typeof window>"u"?!1:new URLSearchParams(window.location.search).get("pixflowBricksAgent")==="1"}var fe,ai,lt=B(()=>{"use strict";X();Je();qe();zt();ni();oi();fe=new Map,ai=!1});lt();var ge=()=>typeof window>"u"?[]:window.PixflowGutenbergExtensions??[],In=["generateblocks/","generateblocks-pro/"];function Ce(t){let i=ge().find(n=>n.owns(t));if(!i&&In.some(n=>t.startsWith(n)))throw new Error("This block integration requires Pixflow Design Pro and its active plugin. Existing content is unchanged.");return i}function ct(t,i,n){return Ce(t)?.input(t,i,n)??i}function De(t){for(let i of t)Ce(i.name),De(i.innerBlocks??[])}async function gt(t){De(t);for(let i of ge())await i.prepare(t)}async function dt(t,i){De(t.data.select("core/block-editor").getBlocks());for(let n of ge())await n.settle(t,i)}function ut(t,i,n){let s=ge().find(r=>r.styles);if(!s?.styles)throw new Error("No active Pro integration provides global block styles.");return s.styles(t,i,n)}function li(){let t=[],i=!1,n=0,s=async()=>{let r=++n,o=window.wp;if(o?.data)try{let a=await $e("icons/packs/wordpress",{method:"GET"});if(!a.ok||i||r!==n)return;for(let c of ge())c.icons?.(a.body.icons);let l=[...new Set(a.body.icons.map(c=>c.collection))];if(a.body.native){let c=o.data.dispatch("core");c.invalidateResolution("getEntityRecords",["root","iconCollection"]),c.invalidateResolution("getEntityRecords",["root","icon",{}]);for(let g of new Set([...t,...l]))c.invalidateResolution("getEntityRecords",["root","icon",{collection:g}])}else{let g=(o.data.select("core/block-editor").getSettings().__experimentalBlockPatterns??[]).filter(u=>!u.categories?.includes("pixflow-icons")),f=o.data.select("core");typeof f?.getBlockPatterns=="function"&&(o.data.dispatch("core").invalidateResolution("getBlockPatterns",[]),typeof f.getBlockPatternCategories=="function"&&o.data.dispatch("core").invalidateResolution("getBlockPatternCategories",[]));for(let u of a.body.icons)g.push({name:u.name,title:u.label,categories:["pixflow-icons"],content:o.blocks.serialize(o.blocks.createBlock(u.block.name,u.block.attributes))});o.data.dispatch("core/block-editor").updateSettings({__experimentalBlockPatterns:g})}t=l}catch(a){console.warn("Pixflow could not refresh the WordPress icon picker.",a)}};return s(),window.addEventListener("pixflow-design:icon-packs-changed",s),()=>{i=!0,window.removeEventListener("pixflow-design:icon-packs-changed",s)}}lt();function Rn(t,i){let n=t.__experimentalFeatures??{},s=n.typography??{},r=s.fontFamilies??{},o=t.pixflowFontSlugs??[],a=(r.theme??[]).filter(g=>!o.includes(g.slug)),l=new Set(a.map(g=>g.slug)),c=i.presets.filter(g=>!l.has(g.slug));return{__experimentalFeatures:{...n,typography:{...s,fontFamilies:{...r,theme:[...a,...c]}}},pixflowFontSlugs:i.presets.map(g=>g.slug),styles:[...(t.styles??[]).filter(g=>g.__pixflowFonts!==!0),{css:i.css,__pixflowFonts:!0}]}}function ci(){let t,i=!1,n=new Set,s=()=>{if(!(!t||i)){for(let a of n)a.isConnected||(a.removeEventListener("load",s),n.delete(a));for(let a of document.querySelectorAll('iframe[name="editor-canvas"]'))n.has(a)||(n.add(a),a.addEventListener("load",s));for(let a of[document,...Array.from(n).map(l=>{try{return l.contentDocument}catch{return null}})]){if(!a?.head)continue;let l=a.getElementById("pixflow-wordpress-fonts-inline-css");l||(l=a.createElement("style"),l.id="pixflow-wordpress-fonts-inline-css",a.head.append(l)),l.textContent!==t.css&&(l.textContent=t.css)}}},r=a=>{let l=a.detail,c=window.wp;if(!l?.presets||!c?.data)return;let g=c.data.select("core/block-editor")?.getSettings();if(!g)return;t=l,s(),c.data.dispatch("core/block-editor").updateSettings(Rn(g,l)),typeof c.data.select("core")?.__experimentalGetCurrentThemeBaseGlobalStyles=="function"&&c.data.dispatch("core").invalidateResolution("__experimentalGetCurrentThemeBaseGlobalStyles",[])},o=new MutationObserver(s);return o.observe(document.body,{childList:!0,subtree:!0}),$e("fonts/google/state?builder=wordpress",{method:"GET"}).then(a=>{!i&&!t&&a.ok&&a.body.wordpressFontState&&r(new CustomEvent("fonts",{detail:a.body.wordpressFontState}))}).catch(()=>{}),window.addEventListener("pixflow-design:wordpress-font-state",r),()=>{i=!0,o.disconnect();for(let a of n)a.removeEventListener("load",s);n.clear(),window.removeEventListener("pixflow-design:wordpress-font-state",r)}}function q(t){let i=t.data.select("core/editor"),n=i?.getCurrentPostType(),s=i?.getCurrentPostId();if(!n||!s)throw new Error("Open a Gutenberg document to connect its editor.");return{type:n,id:String(s)}}var he=(t,i)=>{let n=t;return n?.type===i.type&&String(n.id)===i.id},mt=t=>["wp_template","wp_template_part","wp_block","wp_navigation",...ge().flatMap(i=>i.sharedTypes??[])].includes(t.type),pt=new WeakMap;function gi(t){let i=q(t);pt.set(t,!1);let n=()=>{try{let s=t.data.select("core").__experimentalGetDirtyEntityRecords?.()??[];(!he(q(t),i)||s.some(r=>r.kind!=="postType"||r.name!==i.type||String(r.key)!==i.id))&&pt.set(t,!0)}catch{}};return n(),t.data.subscribe?.(n)??(()=>{})}function di(t){if(pt.get(t))throw new Error("This tab has shared history from other documents. Use native Undo/Redo to review it, or reopen this document before starting a new edit.")}function ft(t,i){let n=t.data.select("core/block-editor");if(n.getBlockParents(i).some(r=>["core/block","core/template-part","core/navigation"].includes(n.getBlock(r)?.name)))throw new Error("This block belongs to a shared pattern, template part or navigation. Open that item in its own editor before changing it.")}Je();function Ie(){let t=typeof window>"u"?void 0:window.PixflowGutenbergSiteAuthoring;if(!t)throw new Error("Pixflow Site Editor, template and shared-pattern authoring requires Pro. Existing content and WordPress native editing remain available.");return t}function ui(t,i){(t==="gutenberg.entities"||t==="gutenberg.create"||i&&!["gutenberg.read","gutenberg.schema"].includes(t)&&!window.PixflowGutenbergReadCommands?.[t])&&Ie()}async function Ln(t,i,n,s){let r=new Set,o=async(a,l,c=0)=>{if(c>30)throw new Error("The pattern nesting is too deep to validate safely.");for(let g of a){if(g.name==="core/block"){let f=g.attributes?.ref;if(typeof f!="number"||!Number.isSafeInteger(f)||f<=0)throw new Error("Choose a valid synced pattern reference.");if(l.has(f))throw new Error("This pattern reference creates a cycle. No blocks were changed.");if(!r.has(f)){if(!n||!s)throw new Error("Pattern discovery is unavailable. Reload the editor.");if(r.size>=100)throw new Error("Too many shared patterns to validate safely.");let u=await n({path:`/wp/v2/blocks/${f}?context=edit&_fields=id,status,meta,wp_pattern_sync_status,content`});if(u?.status!=="publish")throw new Error("Choose a published pattern before referencing it.");if((u.wp_pattern_sync_status??u.meta?.wp_pattern_sync_status)==="unsynced")throw new Error("This pattern is an independent copy. Insert its native blocks instead of a synced reference.");if(typeof u.content?.raw!="string")throw new Error("The pattern content could not be read. No blocks were changed.");r.add(f),await o(s(u.content.raw),new Set([...l,f]),c+1)}}await o(g.innerBlocks??[],l,c+1)}};await o(t,new Set(i.type==="wp_block"?[Number(i.id)]:[]))}function ht(t,i){let n=typeof window>"u"?void 0:window.wp;return Ln(t,i,n?.apiFetch,n?.blocks?.parse)}function ne(t){return Number(q(t).id)||0}async function Re(t){let i=t.data.select("core/editor"),n=t.data.select("core/block-editor"),s=n.getBlocks(),r=i.getEditedPostContent(),o=i.getEditedPostAttribute("title"),a=q(t),l=()=>[i.getEditedPostAttribute("meta"),i.getEditedPostAttribute("status")],c=JSON.stringify([a,s,r,o,l()]),g=new TextEncoder().encode(c),f=await crypto.subtle.digest("SHA-256",g);if(c!==JSON.stringify([q(t),n.getBlocks(),i.getEditedPostContent(),i.getEditedPostAttribute("title"),l()]))throw new Error("The live document changed. Read it again before editing; no operation was applied.");return{entity:a,shared:mt(a),postId:ne(t),postType:i.getCurrentPostType(),title:o,revision:Array.from(new Uint8Array(f),u=>u.toString(16).padStart(2,"0")).join(""),blocks:s,content:r,dirty:i.isEditedPostDirty(),selectedClientId:n.getSelectedBlockClientId(),canUndo:i.hasEditorUndo(),canRedo:i.hasEditorRedo()}}var pi=()=>new Promise(t=>setTimeout(t,100));function mi(t,i,n,s=100){let r=t.data.select("core/block-editor").getSettings?.().allowedBlockTypes,o=0,a=(l,c)=>l.forEach(g=>{if(++o>s)throw new Error("Supply at most 100 blocks including nested children.");let f=t.blocks.getBlockType(g.name),u=c[0];if(r===!1||Array.isArray(r)&&!r.includes(g.name))throw new Error(`${g.name} is not allowed by this editor.`);if(f.parent?.length&&!f.parent.includes(u?.name))throw new Error(`${g.name} requires its registered parent block.`);if(f.ancestor?.length&&!c.some(b=>f.ancestor.includes(b.name)))throw new Error(`${g.name} requires its registered ancestor block.`);let _=u?.attributes?.allowedBlocks??(u&&t.blocks.getBlockType(u.name)?.allowedBlocks);if(Array.isArray(_)&&!_.includes(g.name))throw new Error(`${g.name} is not allowed inside ${u.name}.`);a(g.innerBlocks??[],[g,...c])});a(i,n)}function fi(t,i,n=0){if(n>30||!i||typeof i.name!="string"||!t.blocks.getBlockType(i.name))throw new Error("Unknown or invalid block. Inspect gutenberg.schema first.");if(i.name==="core/missing"||i.name.startsWith("etch/"))throw new Error("This block cannot be authored through the Gutenberg connection.");return t.blocks.createBlock(i.name,hi(t,i.name,ct(i.name,i.attributes??{},!0)),(i.innerBlocks??[]).map(s=>fi(t,s,n+1)))}function hi(t,i,n){if(!n||typeof n!="object"||Array.isArray(n))throw new Error("Block attributes must be an object.");let s=t.blocks.getBlockType(i)?.attributes??{};for(let[r,o]of Object.entries(n)){if(!s[r])throw new Error(`Unknown ${i} attribute: ${r}. Read gutenberg.schema.`);if("default"in s[r]&&JSON.stringify(o)===JSON.stringify(s[r].default))continue;let a=s[r].type;if(o!=null&&a&&(a==="array"?!Array.isArray(o):a==="object"?typeof o!="object"||Array.isArray(o):a==="integer"?!Number.isInteger(o):a==="rich-text"?typeof o!="string":typeof o!==a))throw new Error(`Invalid type for ${i}.${r}.`);if(s[r].enum&&!s[r].enum.includes(o))throw new Error(`Invalid value for ${i}.${r}.`)}return n}async function bi(t,i){let{tool:n,arguments:s}=i,r=ne(t),o=q(t),a=mt(o);if((a||s.expectedEntity||i.entity)&&(!he(s.expectedEntity,o)||i.entity&&!he(i.entity,o)))throw new Error("The Gutenberg editor is showing a different document. No operation was applied.");if(!a&&(Number(s.expectedPostId)!==r||i.postId&&i.postId!==r))throw new Error("The Gutenberg editor is showing a different post. No operation was applied.");ui(n,a);let l=t.data.select("core/block-editor"),c=t.data.dispatch("core/block-editor"),g=t.data.select("core/editor"),f=t.data.dispatch("core/editor");if(n==="gutenberg.schema")return t.blocks.getBlockTypes().filter(m=>(!s.name||m.name===s.name)&&(()=>{try{return Ce(m.name),!0}catch{return!1}})()).map(m=>({name:m.name,title:m.title,attributes:m.attributes,supports:m.supports,parent:m.parent,ancestor:m.ancestor,allowedBlocks:m.allowedBlocks,usesContext:m.usesContext,providesContext:m.providesContext,...Ce(m.name)?.schema(t,m.name,!!s.name)??{}}));let u=await Re(t),_=window.PixflowGutenbergReadCommands?.[n];if(_)return _(t,s);if(n==="gutenberg.read")return u;if(n==="gutenberg.entities")return Ie().documents(t,n,s);if(n==="gutenberg.styles"&&["list","read"].includes(s.action))return ut(t,s);if(De(u.blocks),!s.expectedRevision||s.expectedRevision!==u.revision)throw new Error("The live document changed. Read it again before editing; no operation was applied.");if(a&&s.confirmShared!==!0)throw new Error("This is a shared document. Confirm that the requested change should affect every place it is used, then pass confirmShared: true.");if(n==="gutenberg.create")return Ie().documents(t,n,s);if(n==="gutenberg.styles")return ut(t,s,async()=>{if((await Re(t)).revision!==u.revision)throw new Error("The live document changed while preparing styles. Read it again; no global style was saved.")});if(g.isSavingPost()||g.isPostLocked?.())throw new Error("The document is saving or locked by another user. Wait and read it again.");let b=s.clientId?l.getBlock(s.clientId):void 0;if(s.clientId&&!b)throw new Error("That block no longer exists. Read the editor again.");if(s.clientId&&ft(t,s.clientId),s.rootClientId&&(ft(t,s.rootClientId),["core/block","core/template-part","core/navigation"].includes(l.getBlock(s.rootClientId)?.name)))throw new Error("Open the shared item in its own editor before changing its children.");if((n==="gutenberg.undo"||n==="gutenberg.redo")&&(di(t),(t.data.select("core").__experimentalGetDirtyEntityRecords?.()??[]).some(y=>y.kind!=="postType"||y.name!==o.type||String(y.key)!==o.id)))throw new Error("Other documents have unsaved changes. Use native Undo/Redo to review the shared editor history.");switch(n){case"gutenberg.insert":{let m=s.rootClientId||"";if(m&&!l.getBlock(m))throw new Error("The parent block no longer exists.");if(!Array.isArray(s.blocks)||!s.blocks.length||s.blocks.length>100)throw new Error("Supply between 1 and 100 blocks.");let y=s.blocks.map(x=>fi(t,x));if(mi(t,y,m?[l.getBlock(m),...l.getBlockParents(m).slice().reverse().map(x=>l.getBlock(x))]:[]),((x,d)=>{for(let S of x)if(!l.canInsertBlockType(S.name,d))throw new Error(`Inserting ${S.name} is locked or not allowed here.`)})(y,m),await gt(y),await ht(y,o),(await Re(t)).revision!==u.revision)throw new Error("The live document changed while preparing navigation. Read it again; no blocks were inserted.");let P=l.getBlockOrder(m).length;if(s.index!=null&&(!Number.isInteger(s.index)||s.index<0||s.index>P))throw new Error("Invalid insertion index.");if(await c.insertBlocks(y,s.index??P,m,!1),await pi(),y.some(x=>!l.getBlock(x.clientId)))throw new Error("Gutenberg rejected the insertion. Inspect the editor before retrying.");break}case"gutenberg.update":if(!b)throw new Error("Select a clientId from gutenberg.read.");if(l.getBlockEditingMode?.(b.clientId)==="disabled"||l.getTemplateLock?.(l.getBlockRootClientId(b.clientId))==="all")throw new Error("This block is locked for editing.");if(await gt([{name:b.name,attributes:{...b.attributes,...s.attributes}}]),await ht([{name:b.name,attributes:{...b.attributes,...s.attributes}}],o),(await Re(t)).revision!==u.revision)throw new Error("The live document changed while checking shared resources. Read it again; no blocks were changed.");await c.updateBlockAttributes(b.clientId,hi(t,b.name,ct(b.name,s.attributes,!1)));break;case"gutenberg.remove":if(!b||!l.canRemoveBlock(b.clientId))throw new Error("This block cannot be removed.");await c.removeBlocks([b.clientId],!1);break;case"gutenberg.move":{let m=s.rootClientId||"";if(!b||!l.canMoveBlock(b.clientId)||m&&!l.getBlock(m)||!l.canInsertBlockType(b.name,m))throw new Error("This block cannot be moved there.");if(m===b.clientId||l.getBlockParents(m).includes(b.clientId))throw new Error("A block cannot be moved inside itself.");if(!Number.isInteger(s.index)||s.index<0||s.index>l.getBlockOrder(m).length)throw new Error("Invalid destination index.");mi(t,[b],m?[l.getBlock(m),...l.getBlockParents(m).slice().reverse().map(y=>l.getBlock(y))]:[],1/0),await c.moveBlocksToPosition([b.clientId],l.getBlockRootClientId(b.clientId),m,s.index);break}case"gutenberg.undo":if(!u.canUndo)throw new Error("There is nothing to undo.");await f.undo();break;case"gutenberg.redo":if(!u.canRedo)throw new Error("There is nothing to redo.");await f.redo();break;case"gutenberg.save":if(g.isPostSavingLocked?.())throw new Error("Saving is currently locked by the editor.");if(await dt(t,()=>{if(!he(q(t),o))throw new Error("The open document changed. No save was sent.")}),a)await Ie().save(t,o);else if(await f.savePost(),!g.didPostSaveRequestSucceed()||g.didPostSaveRequestFail())throw new Error("WordPress did not save this document. Check the editor notice; your unsaved work remains in this tab.");break;default:throw new Error("Unknown Gutenberg operation.")}return await pi(),n!=="gutenberg.save"&&await dt(t,()=>{if(!he(q(t),o))throw new Error("The open document changed. Read the intended editor again.")}),{...await Re(t),saved:n==="gutenberg.save"}}async function yi(t){let i=!1,n=()=>{i=!0};window.addEventListener("pixflow-design:editor-save-conflict",n);let s=()=>new Error("Saving was blocked because another editor saved a newer version. Keep unsaved work, reload the originating tab, and reconcile the latest content before retrying.");try{let r;try{r=await t()}catch(o){throw i?s():o}if(i)throw s();return r}finally{window.removeEventListener("pixflow-design:editor-save-conflict",n)}}qe();var wi=Te(We(),1);X();var Fn;function ze(){return typeof window<"u"&&Ee("annotations")&&Fn!==!1&&typeof window.PixflowAnnotationsFactory=="function"}X();var ki="pixflow-design:change-review-preference";function vi(){try{if(window.top?.document)return window.top}catch{}return window}function bt(){let t=z();return`pixflow:disable-change-review:${t?.siteHash||t?.siteUrl||location.origin}:${t?.userId||"local"}`}function Si(){if(typeof window>"u")return!1;let t=vi(),i=bt();if(t.__pixflowReviewPreferences?.[i]!==void 0)return t.__pixflowReviewPreferences[i];try{return t.localStorage.getItem(i)==="true"}catch{return!1}}function xi(t){let i=vi(),n=s=>{s.key!==bt()&&s.key!==null||(delete i.__pixflowReviewPreferences?.[bt()],t())};return i.addEventListener(ki,t),i.addEventListener("storage",n),()=>{i.removeEventListener(ki,t),i.removeEventListener("storage",n)}}function Ti(t,i){let n=document.createElement("div");n.id="pixflow-presence-controls",n.hidden=!0,n.setAttribute("role","group"),n.setAttribute("aria-label","Agent change review"),n.dataset.pixflowAnnotation="controls";let s,r=!1,o="",a=!!document.querySelector("[data-pixflow-annotation-toolbar]"),l=new Set,c=document.createElement("div");c.className="presence-bar";let g=document.createElement("span");g.className="presence-status",g.setAttribute("role","status");let f={left:"m14 6-6 6 6 6",right:"m10 6 6 6-6 6",expand:"m6 14 6-6 6 6",close:"m6 6 12 12M6 18 18 6",annotate:"M12 20l-3-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4l-3 3M9 10h6M12 7v6",pause:"M7 5h3v14H7zM14 5h3v14h-3z"},u=(h,F,N)=>{let k=document.createElement("button");if(k.type="button",k.setAttribute("aria-label",h),k.title=h,N){let L=document.createElementNS("http://www.w3.org/2000/svg","svg");L.setAttribute("viewBox","0 0 24 24"),L.setAttribute("aria-hidden","true");let U=document.createElementNS(L.namespaceURI,"path");U.setAttribute("d",N),L.append(U),k.append(L)}else k.textContent=h;return k.addEventListener("click",F),k},_=u("Resume following",i.resume),b=u("Pause following",i.pause,f.pause),m=u("Review changes",()=>i.review(0)),y=u("Previous changed area",()=>i.review(-1),f.left),A=document.createElement("span");A.className="presence-count";let P=u("Next changed area",()=>i.review(1),f.right),x=u("Annotate current area",()=>{let h=s?.areas[s.index];h&&ze()&&i.annotate(h.id)},f.annotate),d=u("Expand changes",()=>{r=!r,Z()},f.expand);d.setAttribute("aria-expanded","false"),d.setAttribute("aria-controls","pixflow-presence-list");let S=u("Dismiss change review",i.dismiss,f.close),w=document.createElement("div");w.id="pixflow-presence-list",w.className="presence-list",w.setAttribute("role","list"),w.setAttribute("aria-label","Changed sections");let E=document.createElement("div");E.className="presence-disclosure";let C=document.createElement("div");C.className="presence-disclosure-inner",C.append(w),E.append(C),c.append(g,_,b,m,y,A,P,x,d,S),n.append(E,c),document.body.append(n);let J=()=>{let h=document.querySelector(".pixflow-agent-surface-shell, .pixflow-design-token-scope[data-theme]");if(!h)return;let F=getComputedStyle(h);for(let N of["--composer-surface","--composer-hover","--text","--text-muted","--border"]){let k=F.getPropertyValue(N).trim();k&&n.style.setProperty(N,k)}},H=()=>{if(n.hidden)return;J();let h=t();if(!h){n.hidden=!0;return}let F=h.getBoundingClientRect(),N=Math.max(8,F.left+12),k=Math.min(innerWidth-8,F.right-12);n.style.maxWidth=`${Math.max(0,k-N)}px`,c.style.width=r?"100%":"max-content",n.style.width=`${r?420:c.scrollWidth+2}px`;let L=a?(document.querySelector("[data-pixflow-annotation-toolbar]")?.offsetHeight||44)+12:0;n.style.setProperty("--presence-list-height",`${Math.max(30,Math.min(320,F.height-110-L))}px`);let U=n.offsetWidth,V=n.offsetHeight,M=[...document.querySelectorAll('.pixflow-bricks-agent-panel, #elementor-navigator, [role="dialog"]')].filter(O=>!O.closest("[data-pixflow-annotation]")&&O.getClientRects().length&&getComputedStyle(O).visibility!=="hidden").map(O=>O.getBoundingClientRect());for(let O of[Math.min(innerHeight-12,F.bottom-12)-V,Math.max(8,F.top+12)])for(let G of[(N+k-U)/2,N,k-U])if(!(G<N||O<F.top||M.some(j=>G<j.right&&G+U>j.left&&O<j.bottom&&O+V>j.top))){n.style.left=`${G}px`,n.style.top=`${O}px`,n.style.visibility="";return}n.style.visibility="hidden"},de=(h,F,N=!1)=>{let k=document.createElement("div");k.className=`presence-row${N?" presence-child":""}`,k.setAttribute("role","listitem"),k.dataset.id=h.id;let L=u(`Show ${h.label}`,()=>i.select(h.id));L.className="presence-select",L.textContent="";let U=document.createElement("span");U.textContent=h.label;let V=document.createElement("span");if(V.className="presence-row-copy",V.append(U),!N){let M=document.createElement("small");M.textContent=F,V.append(M)}return L.append(V),L.addEventListener("pointerenter",()=>i.preview(h.id)),L.addEventListener("pointerleave",()=>i.preview(null)),k.append(L),ze()&&k.append(u(`Annotate ${h.label}`,()=>i.annotate(h.id),f.annotate)),k},Q=()=>{if(!s||JSON.stringify(s.areas)===o)return;o=JSON.stringify(s.areas);let h=document.activeElement?.closest(".presence-row")?.dataset.id,F=document.activeElement?.getAttribute("aria-label"),N=w.scrollTop;w.replaceChildren();for(let k of s.areas){let L=de(k,`${k.elements.length} changed element${k.elements.length===1?"":"s"}`);if(k.elements.length>1){let U=document.createElement("div");U.className="presence-group",U.setAttribute("role","listitem"),L.removeAttribute("role");let V=L.querySelector(".presence-select"),M=u("",()=>{},f.right).firstElementChild;M.classList.add("presence-group-chevron"),V.append(M);let O=document.createElement("div");O.className="presence-elements",O.id=`pixflow-presence-group-${w.children.length}`;let G=document.createElement("div");G.className="presence-elements-inner";let j=document.createElement("div");j.className="presence-children",j.setAttribute("role","list"),j.setAttribute("aria-label",`${k.label} elements`),k.elements.forEach(ie=>j.append(de(ie,"",!0))),G.append(j),O.append(G),V.setAttribute("aria-controls",O.id);let te=()=>{let ie=l.has(k.id);U.dataset.open=String(ie),V.setAttribute("aria-expanded",String(ie)),O.inert=!ie,O.setAttribute("aria-hidden",String(!ie))};V.addEventListener("click",()=>{l.has(k.id)?l.delete(k.id):l.add(k.id),te(),H()}),te(),U.append(L,O),w.append(U)}else w.append(L)}w.scrollTop=N,h&&F&&[...w.querySelectorAll("button")].find(k=>k.closest(".presence-row")?.dataset.id===h&&k.getAttribute("aria-label")===F)?.focus({preventScroll:!0})},Z=()=>{if(!s)return;let h=s;n.hidden=!h.count||Si(),n.dataset.expanded=String(r),E.inert=!r,E.setAttribute("aria-hidden",String(!r));let F=h.reviewing?h.label:h.paused&&h.working?"Following paused":h.working?`Updating ${h.label}`:`${h.count} area${h.count===1?"":"s"} updated${h.saved?" \xB7 Saved":""}`;g.textContent!==F&&(g.textContent=F),g.title=F,_.hidden=!h.paused||!h.working,b.hidden=h.paused||!h.working,m.hidden=h.reviewing||h.working||r,y.hidden=P.hidden=A.hidden=!h.reviewing,y.disabled=P.disabled=h.count<2,A.textContent=`${h.index+1} / ${h.count}`,x.disabled=!h.count,x.hidden=!ze(),d.setAttribute("aria-expanded",String(r)),d.setAttribute("aria-label",r?"Collapse changes":"Expand changes"),d.title=r?"Collapse changes":"Expand changes",Q();for(let N of w.querySelectorAll(".presence-row"))N.dataset.selected=String(h.reviewing&&N.dataset.id===h.areas[h.index]?.id);H()},K=xi(Z),oe=h=>{h.key==="Escape"&&n.contains(document.activeElement)&&(r?(r=!1,Z(),d.focus()):i.dismiss(),h.stopPropagation())},pe=typeof ResizeObserver>"u"?null:new ResizeObserver(H);pe?.observe(n);let ae=h=>{a=h.detail.active,H()};window.addEventListener("pixflow-design:annotation-toolbar",ae);let ee=new MutationObserver(J);return ee.observe(document.body,{attributes:!0,attributeFilter:["data-theme"],subtree:!0}),n.addEventListener("keydown",oe),window.addEventListener("resize",H),window.addEventListener("scroll",H,!0),{root:n,update(h){s=h,Z()},hide(){s=void 0,n.hidden=!0},reset(){s=void 0,r=!1,o="",l.clear(),w.replaceChildren(),n.hidden=!0},dispose(){K(),pe?.disconnect(),ee.disconnect(),n.remove(),window.removeEventListener("pixflow-design:annotation-toolbar",ae),window.removeEventListener("resize",H),window.removeEventListener("scroll",H,!0)}}}function Ai(t){if(t.matches("[data-block][data-type]")){let n=t;for(let s=t.parentElement;s;s=s.parentElement)s.matches('[data-block][data-type="core/group"], [data-block][data-type="core/columns"], [data-block][data-type="core/cover"], [data-block][data-type="core/media-text"]')&&(n=s);return n}let i=t.closest('section, .brxe-section, .e-con, .elementor-section, [data-etch-element="section"]');if(!i)return t;for(let n=i.parentElement;n&&n.tagName!=="BODY";n=n.parentElement)n.matches('section, .brxe-section, .e-con, .elementor-section, [data-etch-element="section"]')&&(i=n);return i}function yt(t,i="Page element"){let n=/^H[1-6]$/.test(t.tagName)?t:t.querySelector("h1,h2,h3,h4,h5,h6");return((t.hasAttribute("data-block")?"":t.getAttribute("aria-label"))||n?.innerText||n?.textContent||(/^(P|A|BUTTON|SPAN)$/.test(t.tagName)?t.innerText||t.textContent:"")||i).replace(/\s+/g," ").trim().slice(0,80)||i}var Mn=(t,i)=>t.left<i.right&&t.right>i.left&&t.top<i.bottom&&t.bottom>i.top;function On(t,i,n,s,r=[]){let a=Math.min(280,Math.max(0,i.right-i.left-16)),l=Math.min(n,a),c=u=>Math.max(i.left+8,Math.min(u,i.right-l-8)),g=u=>Math.max(i.top+8,Math.min(u,i.bottom-s-8)),f=[{top:t.top-s-8,placement:"above"},{top:t.bottom+8,placement:"below"},{top:t.bottom-s-8,placement:"inside"}];for(let u of f)if(!(u.placement!=="inside"&&(u.top<i.top+8||u.top+s>i.bottom-8)))for(let _ of[t.left,t.right-l,i.left+8,i.right-l-8]){let b=c(_),m=g(u.top);if(!r.some(y=>Mn({left:b,top:m,right:b+l,bottom:m+s},y)))return{left:b,top:m,maxWidth:a,placement:u.placement}}return{left:c(t.left),top:g(t.top),maxWidth:a,placement:"occluded"}}function Pi(t,i){let n=document.createElement("div");n.id="pixflow-direct-presence",n.dataset.builder=i.builder,n.dataset.presentation="quiet",n.dataset.state="hidden";let s=document.createElement("div");s.className="pixflow-direct-presence-box";let r=document.createElement("div");r.className="pixflow-direct-presence-cursor";let o=document.createElement("span");o.className="pixflow-direct-presence-pointer",o.setAttribute("aria-hidden","true");let a=document.createElement("span");a.className="pixflow-direct-presence-label";let l=document.createElement("span");l.className="pixflow-direct-presence-brand",l.textContent="Working\u2026";let c=document.createElement("span");c.className="pixflow-direct-presence-detail",a.append(l,c),r.append(o,a),n.append(s,r),document.body.append(n),n.setAttribute("role","status"),n.setAttribute("aria-atomic","true");let g=0,f,u,_=[],b=0,m="",y=!1,A=!1,P=!1,x=!1,d=0,S=null,w=null,E=null,C,J=[],H=0,de=0,Q=!1,Z=!1,K=!1,oe=0,pe=!1,ae=[],ee=new Map,h=!1,F=new WeakMap,N=0,k=[],L=()=>{let p=V()?.contentDocument,T=new Map;for(let[D,R]of ee){let I=p&&ke(p,D);if(!I?.isConnected)continue;let v=Ai(I),Y=T.get(v);if(!Y){F.has(v)||F.set(v,`area:${++N}`);let le=yt(v,v===I?R.label:`Section ${T.size+1}`);Y={id:F.get(v),label:le,node:v,target:{...R,node:v,label:le,fromContent:!1},elements:[]},T.set(v,Y)}Y.elements.push({id:D,label:yt(I,R.label)})}k=[...T.values()],oe=Math.min(oe,Math.max(0,k.length-1))},U=p=>{let T=p.querySelector("h1,h2,h3")||(/^H[1-6]$/.test(p.tagName)?p:null);return((p.hasAttribute("data-block")?"":p.getAttribute("aria-label"))||T?.innerText||T?.textContent||"").replace(/\s+/g," ").trim().slice(0,80)},V=()=>i.getFrame?i.getFrame():i.iframeSelector?document.querySelector(i.iframeSelector):null,M=()=>{if(pe||document.hidden){G.hide();return}L(),G.update({working:Q,paused:x,saved:Z,count:k.length,index:oe,reviewing:K,areas:k.map(({id:p,label:T,elements:D})=>({id:p,label:T,elements:D})),label:(K?k[oe]?.label:ae[0]?.label)||"the page"})},O=(p,T=!1)=>{if(t()!==b){j();return}L();let D=k.find(I=>I.id===p||I.elements.some(v=>v.id===p)),R=D?.id===p?D.target:ee.get(p);if(!R){M();return}$(),h=T,T||(K=!0),y=!1,A=!0,T||(oe=k.indexOf(D),x=!1),_=[R],g=requestAnimationFrame(ve),f=setTimeout($,4e3),T||M()},G=Ti(V,{resume(){if(t()!==b){j();return}x=!1,y=!1,K=!1,ae.length&&St(ae),M()},review(p){if(L(),!k.length){$(),M();return}let T=(K?oe+p+k.length:0)%k.length;O(k[T].id)},pause(){x=!0,$(),M()},select(p){O(p)},preview(p){Q||(p?O(p,!0):h&&($(),h=!1))},annotate(p){if(t()!==b){j();return}L();let T=k.find(I=>I.id===p),D=V()?.contentDocument,R=T?.node||D&&ke(D,p);if(!R?.isConnected){M();return}x=Q,$(),R.scrollIntoView({block:"center",behavior:"instant"}),document.dispatchEvent(new CustomEvent("pixflow:annotate-element",{detail:{element:R},cancelable:!0})),M()},dismiss(){pe=!0,x=!0,$(),G.hide()}});G.root.dataset.builder=i.builder;let j=()=>{ee.clear(),k=[],ae=[],Q=!1,Z=!1,K=!1,$(),G.reset()},te=new Set,ie=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches,Le=p=>{n.dataset.state=p},Fe=(p,T,D)=>{if(ie()||!p.animate)return;let R=p.animate(T,{duration:D,easing:"cubic-bezier(0.23, 1, 0.32, 1)"});te.add(R),R.onfinish=R.oncancel=()=>te.delete(R)},$=()=>{clearTimeout(f),clearTimeout(u),cancelAnimationFrame(g),Le("hidden"),n.dataset.visible="false",te.forEach(p=>p.cancel()),te.clear(),_=[],m="",C=void 0,w=S=null,delete n.dataset.targetId,delete n.dataset.positioned},ye=()=>{y=!0,Q=!1,P=!1,w=S=null,$(),M()},Xe=()=>{clearTimeout(u),Le("completed"),n.dataset.phase="updated",l.textContent=K||h?"Review":Z?"Saved":"Updated",n.setAttribute("aria-label",`${l.textContent}: ${c.textContent}`),Fe(s,[{opacity:.55},{opacity:1}],360),clearTimeout(f),f=setTimeout($,K?4e3:1100)},kt=()=>{A?Xe():(Le("working"),n.setAttribute("aria-label",`Pixflow editing ${c.textContent}`),l.textContent="Updating\u2026")},vt=p=>{if(!p.composedPath().includes(G.root)&&!p.target?.closest?.(".pixflow-bricks-agent-panel")&&!(p instanceof KeyboardEvent&&!["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"," ","Tab","Escape"].includes(p.key))){if(Q&&(x=!0),E?.defaultView&&n.dataset.visible==="true"){let T=E.defaultView;T.scrollTo({top:T.scrollY,left:T.scrollX,behavior:"instant"})}$(),w=S=null,K=!1,M()}},we=(p,T)=>{for(let D of["wheel","touchstart","pointerdown","keydown"])T?p.addEventListener(D,vt,{capture:!0,passive:!0}):p.removeEventListener(D,vt,!0)};we(document,!0);let ke=(p,T)=>i.resolveTarget?i.resolveTarget(p,T):p.querySelector(i.targetSelector(T)),Fi=p=>p.closest('section, .e-con, [data-etch-element="section"]'),ve=()=>{if(t()!==b){j();return}if(y||document.hidden||x&&!h){$();return}try{let p=V(),T=p?.contentDocument;T&&E!==T&&(E&&we(E,!1),E=T,we(T,!0));let D=_.map(W=>({item:W,node:W.node?.isConnected?W.node:T&&ke(T,W.id)})).find(W=>W.node);if(!p||!T||!D?.node){n.dataset.visible="false",g=requestAnimationFrame(ve);return}Date.now()-de>200&&(de=Date.now(),M());let R=D.node;if(D.item.fromContent){let W=U(R);W&&D.item.label!==W&&(D.item.label=W,M())}w&&(!w.isConnected||!w.contains(R))&&(w=null),w&&(R=w);let I=p.getBoundingClientRect(),v=R.getBoundingClientRect(),Y=w?`group:${w.id||w.getAttribute("data-id")||w.getAttribute("data-etch-id")||D.item.id}`:D.item.id,le=I.width/(p.offsetWidth||1),Me=I.height/(p.offsetHeight||1);!h&&m!==Y&&(v.bottom<0||v.top>p.clientHeight||v.right<0||v.left>p.clientWidth||K&&(v.top<24||v.top>p.clientHeight*.7))&&(m=Y,T.defaultView?.scrollTo({top:Math.max(0,(T.defaultView.scrollY||0)+v.top-p.clientHeight/3),left:Math.max(0,(T.defaultView.scrollX||0)+(v.right<0||v.left>p.clientWidth?v.left-24:0)),behavior:ie()?"instant":i.scrollBehavior??"smooth"}));let Se=Math.max(0,I.left,I.left+v.left*le),xe=Math.max(0,I.top,I.top+v.top*Me),Oe=Math.min(innerWidth,I.right,I.left+v.right*le),Be=Math.min(innerHeight,I.bottom,I.top+v.bottom*Me);if(Oe<=Se||Be<=xe){n.dataset.visible="false",g=requestAnimationFrame(ve);return}let Tt=`${Se}:${xe}:${Oe}:${Be}`;s.dataset.geometry!==Tt&&(s.dataset.geometry=Tt,s.style.cssText=`transform:translate(${Se}px,${xe}px);width:${Oe-Se}px;height:${Be-xe}px`);let At=w?w.getAttribute("aria-label")||w.querySelector("h1,h2,h3")?.textContent?.trim().slice(0,70)||"Section":`${D.item.label}${_.length>1?` +${_.length-1}`:""}`;c.textContent!==At&&(c.textContent=At),Date.now()-H>150&&(J=[...document.querySelectorAll('.pixflow-bricks-agent-panel, #elementor-navigator, [role="dialog"], .pixflow-annotation-composer, #pixflow-presence-controls, [data-pixflow-annotation-toolbar]')].filter(W=>W.getClientRects().length&&getComputedStyle(W).visibility!=="hidden").map(W=>W.getBoundingClientRect()),H=Date.now());let se=On({left:Se,top:xe,right:Oe,bottom:Be},{left:Math.max(0,I.left),top:Math.max(0,I.top),right:Math.min(innerWidth,I.right),bottom:Math.min(innerHeight,I.bottom)},r.offsetWidth||180,r.offsetHeight||28,J);r.style.maxWidth=`${se.maxWidth}px`,r.style.visibility=se.placement==="occluded"?"hidden":"";let Pt=`translate(${se.left}px,${se.top}px)`;if(r.style.transform=Pt,r.dataset.placement=se.placement,n.dataset.targetId!==Y){clearTimeout(u);let W=n.dataset.positioned?r.getBoundingClientRect():null;W?.width&&te.size&&(C={x:W.left,y:W.top}),te.forEach(Oi=>Oi.cancel()),te.clear();let Mi=C&&Math.hypot(se.left-C.x,se.top-C.y)<240;Le(C?"moving":"arriving"),Mi?Fe(r,[{transform:`translate(${C.x}px,${C.y}px)`},{transform:Pt}],220):Fe(r,[{opacity:0},{opacity:1}],180),Fe(s,[{opacity:.35},{opacity:1}],220),n.dataset.targetId=Y,A?Xe():u=setTimeout(kt,ie()?0:220)}n.dataset.visible="true",C={x:se.left,y:se.top},n.dataset.positioned="true",g=requestAnimationFrame(ve)}catch{ye()}},St=p=>{if(y||!p.length)return;let T=V(),D=T?.contentDocument;p=p.map(v=>{let Y=D&&ke(D,v.id),le=v.fromContent||/^(element|heading|text|paragraph|section|container|div|e-heading|e-div-block|widget)$/i.test(v.label),Me=le&&Y?U(Y):"";return{...v,fromContent:le,label:(Me||v.label).replace(/\s+/g," ").trim().slice(0,80)||"Page element"}}),ae=p,Z=!1,pe=!1,K=!1,h=!1;for(let v of p)ee.set(v.id,v),ee.size>120&&ee.delete(ee.keys().next().value);if(P=!0,M(),x)return;let R=D?p.map(v=>ke(D,v.id)).filter(v=>!!v):[],I=R[0]&&Fi(R[0]);!p.every(v=>v.scope==="content")&&I&&I.getBoundingClientRect().height<=(T?.clientHeight||0)*1.5&&(R.length>1&&R.every(v=>I.contains(v))||Date.now()-d<900&&S&&S!==R[0]&&I.contains(S))?w=I:(p.every(v=>v.scope==="content")||w&&!R.every(v=>w.contains(v)))&&(w=null),S=R[0]??null,d=Date.now(),P=!0,A=!1,_=p,clearTimeout(f),cancelAnimationFrame(g),n.dataset.phase="editing",l.textContent="Updating\u2026",c.textContent=p[0].label,n.setAttribute("aria-label",`Pixflow editing ${c.textContent}`),n.dataset.state==="completed"&&kt(),g=requestAnimationFrame(ve),f=setTimeout(()=>{$(),M()},2400)},xt=()=>{document.hidden?($(),G.hide()):t()!==b?j():M()};return window.addEventListener("pixflow-design:agent-stop",ye),document.addEventListener("visibilitychange",xt),{begin(){b!==t()&&(j(),x=!1),y&&$(),y=!1,Q=!0,K=!1,P=!1,A=!1,b=t()},show:St,finish(p){y||(Q=!1,p?.saved&&(Z=!0),M(),!(!P||!_.length)&&(A=!0,["arriving","moving","hidden"].includes(n.dataset.state)||Xe()))},clear:ye,syncDocument(){b&&t()!==b&&j()},dispose(){ye(),G.dispose(),n.remove(),we(document,!1),E&&we(E,!1),window.removeEventListener("pixflow-design:agent-stop",ye),document.removeEventListener("visibilitychange",xt)}}}function wt(t){let i=new Map,n=(s,r="")=>s.forEach((o,a)=>{i.set(o.clientId,{block:o,parent:r,index:a,signature:JSON.stringify([o.name,o.attributes])}),n(o.innerBlocks??[],o.clientId)});return n(t.data.select("core/block-editor").getBlocks()),i}function Ei(t,i){let n=new Set;for(let[s,r]of i){let o=t.get(s),a=(c,g)=>[...c].filter(([f,u])=>u.parent===r.parent&&g.get(f)?.parent===r.parent).map(([f])=>f),l=o&&a(t,i).indexOf(s)!==a(i,t).indexOf(s);(!o||o.signature!==r.signature||o.parent!==r.parent||l)&&n.add(s)}for(let[s,r]of t)!i.has(s)&&i.has(r.parent)&&n.add(r.parent);return[...n].filter(s=>![...n].some(r=>{let o=i.get(r)?.parent;for(;o;){if(o===s)return!0;o=i.get(o)?.parent}return!1})).slice(0,20).map(s=>({id:s,label:i.get(s).block.name.replace("core/","").replaceAll("-"," "),scope:/^core\/(group|columns|column|cover|media-text|query|post-template)$/.test(i.get(s).block.name)?"layout":"content"}))}function _i(t){return Pi(t,{builder:"gutenberg",iframeSelector:'iframe[name="editor-canvas"]',targetSelector:i=>`[data-block="${CSS.escape(i)}"]`})}var Ci="pixflow:gutenberg-canvas";function be(t){try{return t()}catch{return}}function Di(t){let i=_i(()=>{try{let d=q(t());return d.type+":"+d.id}catch{return""}}),n=!0,s=0,r,o,a,l,c,g,f=!1,u=!1,_=!1,b=async d=>{let S=await He("/wp-admin/direct/canvas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...d,builder:"gutenberg",entity:q(t())})}),w=await S.json();if(!S.ok)throw new Error(w.message||`Gutenberg connection: HTTP ${S.status}`);return w},m=()=>{try{sessionStorage.setItem(Ci,JSON.stringify({canvasId:a,completion:l}))}catch{}},y=async d=>{if(!l)return;let S=ne(d);JSON.stringify(q(d))!==c&&(await b({action:"register",postId:S,canvasId:a,hasCompletion:!0}),c=JSON.stringify(q(d)),window.pixflowGutenbergCanvas={canvasId:a,postId:S,entity:q(d)}),await b(l),l=void 0,m()},A=async d=>navigator.locks?new Promise(S=>{navigator.locks.request(`pixflow-gutenberg:${d}`,{ifAvailable:!0},async w=>{if(!w||!n){S(!1);return}S(!0),await new Promise(E=>{g=E})}).catch(()=>S(!1))}):!1,P=async()=>{if(!(u||!n)){u=!0;try{let d=t();if(!d)throw new Error("Waiting for Gutenberg to initialize.");if(r??(r=gi(d)),!f){f=!0;let E;try{E=JSON.parse(sessionStorage.getItem(Ci)||"null")}catch{}E?.canvasId&&await A(E.canvasId)?(a=E.canvasId,l=E.completion):(a=void 0,l=void 0)}if(!a||_||!window.pixflowGutenbergCanvas){let E=ne(d),C=await b({action:"register",postId:E,canvasId:a,hasCompletion:!!l});C.canvasId!==a&&(g?.(),await A(C.canvasId)),a=C.canvasId,c=JSON.stringify(q(d)),_=!1,m()}window.pixflowGutenbergCanvas={canvasId:a,postId:ne(d),entity:q(d),connected:s===0},await y(d),be(()=>i.syncDocument());let S=ne(d),w=await b({action:"poll",canvasId:a,postId:S});if(c=JSON.stringify(q(d)),w.command){let E;try{if(!n)throw new Error("Editor disconnected before execution.");be(()=>i.begin());let C=be(()=>wt(d)),J=await yi(()=>bi(d,w.command));be(()=>{let H=C?Ei(C,wt(d)):[];H.length&&i.show(H)}),E=JSON.parse(JSON.stringify({ok:!0,result:J}))}catch(C){be(()=>i.clear()),E={ok:!1,error:C&&typeof C=="object"&&"message"in C&&typeof C.message=="string"?C.message:String(C),inspectBeforeRetry:!0}}be(()=>i.finish({saved:w.command.tool==="gutenberg.save"&&E.ok===!0})),l={action:"complete",canvasId:a,commandId:w.command.id,result:E},m(),await y(d)}s=0,window.pixflowGutenbergCanvas.connected=!0,window.dispatchEvent(new CustomEvent("pixflow-design:gutenberg-connection",{detail:{connected:!0,canvasId:a,postId:ne(d)}}))}catch(d){s++,_=!0,window.pixflowGutenbergCanvas&&(window.pixflowGutenbergCanvas.connected=!1),window.dispatchEvent(new CustomEvent("pixflow-design:gutenberg-connection",{detail:{connected:!1,error:s>=5?"This editor could not reconnect. Live editing is paused; reload this tab to recover. "+String(d):String(d)}}))}u=!1,n&&(o=setTimeout(()=>{P()},s?Math.min(3e4,1e3*2**Math.min(s,5)):1500))}},x=()=>{clearTimeout(o),P()};return window.addEventListener("pixflow-design:gutenberg-reconnect",x),P(),()=>{window.removeEventListener("pixflow-design:gutenberg-reconnect",x),n=!1,r?.(),i.dispose(),clearTimeout(o),g?.(),delete window.pixflowGutenbergCanvas}}X();X();qe();function Ke(){return typeof window<"u"&&Ee("planning")&&(typeof window.PixflowPlanningFactory=="function"||Gt("planning","pixflow-planning"))}function Ii(t){let i=z(),n=window.pixflowDesignWorkspaceMenu;if(!n)return()=>{};let s=document.createElement("button");s.id=`pixflow-${t}-workspace-toggle`,s.type="button",s.title="Pixflow quick controls",s.setAttribute("aria-label",s.title),s.setAttribute("aria-haspopup","menu"),s.setAttribute("aria-expanded","false");let r=document.createElement("img");if(r.src=i?.quickMenuIconUrl??i?.iconUrl??"",r.alt="",r.draggable=!1,s.append(r),t==="gutenberg"){r.hidden=!0;let d=document.createElement("span");d.setAttribute("aria-hidden","true"),d.style.maskImage=`url("${r.src}")`,s.append(d)}let o,a,l=!1,c=!1,g=[],f=i?.theme??i?.appConfig?.theme??"dark",u=d=>window.postMessage({source:"pixflow-design-shell",...d},location.origin),_=()=>{o&&(o.hidden=!0),u({type:"pixflow-design:workspace-visibility",open:!1}),s.focus()},b=d=>{if(d.source!==window||d.origin!==location.origin)return;let S=d.data;S?.source==="pixflow-design"&&(S.type==="pixflow-design:workspace-ready"&&(l=!0,g.splice(0).forEach(u)),S.type==="pixflow-design:close-workspace"&&_(),S.type==="pixflow-design:workspace-tool-closed"&&(c||_(),c=!1))};window.addEventListener("message",b);let m=(d,S=!0)=>{if(!o){o=document.createElement("section"),o.id=`pixflow-${t}-workspace`,o.className="pixflow-native-editor-workspace",o.setAttribute("aria-label","Pixflow workspace"),o.setAttribute("role","dialog");let E=document.createElement("div");E.id="pixflow-design-root",o.append(E),document.body.append(o),a=window.PixflowDesignApp?.mount(E,{...i,surface:"workspace",workspaceInitiallyVisible:S,settingsPortal:!0})}o.hidden=!S;let w=[{type:"pixflow-design:workspace-visibility",open:S},d??{type:"pixflow-design:close-workspace-tool"}];l?w.forEach(u):g.push(...w)},y=n.mount({trigger:s,placement:t==="etch"?"right-up":"bottom",getTheme:()=>f,resolveSystemTheme:()=>{let d=document.querySelector(t==="gutenberg"?".editor-header":t==="etch"?".settings-bar__section.top":"#elementor-editor-wrapper"),S=d?getComputedStyle(d).colorScheme:"";return S==="dark"||S!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"},isWorkspaceOpen:()=>!!(o&&!o.hidden),isOnboardingCompleted:()=>i?.appConfig?.onboardingCompleted!==!1,onToggleWorkspace:()=>o&&!o.hidden?_():m(),onOpenTool:d=>{c=!1,m({type:"pixflow-design:open-workspace-tool",tool:d==="design-system"?"design-systems":d})},onOpenSettings:()=>{c=!!(o&&!o.hidden),m({type:"pixflow-design:open-settings",section:"execution"},c)},onThemeChange:d=>{f=d,m({type:"pixflow-design:change-theme",theme:d},!!(o&&!o.hidden))},initialDesignSystemVisible:Ke(),planningAvailable:Ke(),workspaceAvailable:Ke(),designSystemLabel:"Design systems"}),A=d=>{let S=d.detail?.theme;(S==="system"||S==="light"||S==="dark")&&(f=S,y.refreshTheme())};window.addEventListener("open-design:app-config-changed",A),s.addEventListener("click",d=>{d.preventDefault(),d.stopPropagation(),y.toggle()}),s.addEventListener("keydown",d=>d.stopPropagation());let P=()=>{let d=t==="gutenberg"?document.querySelector("[data-pixflow-gutenberg-controls]"):t==="etch"?document.querySelector(".settings-bar__section.bottom"):document.querySelector("#ele-add-element")?.parentElement?.parentElement??document.querySelector("#elementor-panel-header-wrapper");!d||s.parentElement===d||(t==="etch"?d.prepend(s):d.append(s))};P();let x=new MutationObserver(()=>{s.isConnected||P()});return x.observe(document.body,{subtree:!0,childList:!0}),()=>{x.disconnect(),y.destroy(),a?.unmount(),o?.remove(),s.remove(),window.removeEventListener("message",b),window.removeEventListener("open-design:app-config-changed",A)}}var Ye={controls:"e",hint:"t"};function Ri(){let t=document.createElement("div");t.className=Ye.controls,t.dataset.pixflowGutenbergControls="",t.setAttribute("role","group"),t.setAttribute("aria-label","Pixflow Design");let i=document.createElement("button");i.id="pixflow-gutenberg-agent-toggle",i.type="button",i.setAttribute("aria-controls","pixflow-wp-admin-agent-shell");let n=document.createElement("span");n.setAttribute("aria-hidden","true"),n.style.maskImage=`url("${z()?.iconUrl||""}")`,i.append(n),t.append(i);let s=l=>{let c=l?.type==="pixflow-design:wp-admin-panel-close"?!1:document.querySelector("#pixflow-wp-admin-agent-shell")?.classList.contains("is-open")===!0;i.setAttribute("aria-expanded",String(c)),i.setAttribute("aria-label",`${c?"Close":"Open"} Pixflow Agent panel`),i.title=`${c?"Close":"Open"} Pixflow Design`};i.addEventListener("click",l=>{l.preventDefault(),l.stopPropagation(),window.dispatchEvent(new CustomEvent("pixflow-design:host-panel-toggle"))}),t.addEventListener("keydown",l=>l.stopPropagation());let r=()=>{let l=document.querySelector(".editor-document-tools__left")??document.querySelector(".edit-post-header-toolbar");l&&t.parentElement!==l&&l.append(t),s()};r();let o=Ii("gutenberg"),a=new MutationObserver(()=>{t.isConnected||r()});return a.observe(document.body,{childList:!0,subtree:!0}),window.addEventListener("pixflow-design:wp-admin-panel-open",s),window.addEventListener("pixflow-design:wp-admin-panel-close",s),()=>{a.disconnect(),o(),t.remove(),window.removeEventListener("pixflow-design:wp-admin-panel-open",s),window.removeEventListener("pixflow-design:wp-admin-panel-close",s)}}function Li(){let t=()=>document.querySelector(".interface-interface-skeleton__body"),i=null,n=0,s,r=document.createElement("div");r.className=Ye.hint,r.dataset.pixflowGutenbergHint="",r.hidden=!0,r.setAttribute("aria-hidden","true"),r.dataset.pixflowAnnotation="controls",document.body.append(r);let o=(y,A)=>{let P=t();if(!P)return null;let x=P.getBoundingClientRect(),d=Array.from(P.children).filter(H=>H.classList.contains("interface-interface-skeleton__secondary-sidebar")||H.classList.contains("interface-interface-skeleton__sidebar")).reduce((H,de)=>H+de.getBoundingClientRect().width,0),S=x.width-d-320;if(x.width<782||S<280)return null;let w=Math.min(A,S),E=document.querySelector(".interface-interface-skeleton__footer")?.getBoundingClientRect(),C=Math.max(0,x.top),J=Math.min(innerHeight,E?.height?E.top:x.bottom);return{x:y==="left"?x.left:x.right-w,y:C,width:w,height:Math.max(0,J-C)}},a=()=>{i?.removeAttribute("data-pixflow-gutenberg-dock"),i?.style.removeProperty("--pixflow-gutenberg-dock-width"),i=null},l={getFloatTop:()=>Math.max(0,t()?.getBoundingClientRect().top??48),getDockRect:o,inferDockSide(y,A,P){let x=t()?.getBoundingClientRect();return!x||!o("left",P?.width||460)||A<x.top||A>x.bottom?"":(P?.x??y)<=x.left+40?"left":(P?P.x+P.width:y)>=x.right-40?"right":""},onDockApply(y){s=y;let A=t(),P=o(y.dock,y.width);if(!A||!P||y.dock==="float"||y.collapsed){a();return}i!==A&&a(),i=A,A.dataset.pixflowGutenbergDock=y.dock,A.style.setProperty("--pixflow-gutenberg-dock-width",`${P.width}px`)},onDockRelease(){a(),r.hidden=!0},onDockHint(y){let A=y?o(y,s?.width||460):null;r.hidden=!A,A&&(Object.assign(r.style,{left:`${A.x}px`,top:`${A.y}px`,width:`${A.width}px`,height:`${A.height}px`}),r.textContent=`Dock ${y}`)}},c=window,g=()=>{n||!t()||(n=requestAnimationFrame(()=>{n=0,window.dispatchEvent(new Event("pixflow-design:host-docking-ready"))}))},f=typeof ResizeObserver>"u"?null:new ResizeObserver(g),u=[],_=()=>{let y=t();y&&(c.PixflowDesignHostDock=l);let A=y?[y,...Array.from(y.children)]:[];A.length===u.length&&A.every((P,x)=>P===u[x])||(f?.disconnect(),u=A,A.forEach(P=>f?.observe(P)),g())},b=new MutationObserver(_);b.observe(document.body,{childList:!0,subtree:!0});let m=new MutationObserver(g);return m.observe(document.body,{attributes:!0,attributeFilter:["class"]}),window.addEventListener("resize",g),_(),()=>{b.disconnect(),m.disconnect(),f?.disconnect(),cancelAnimationFrame(n),window.removeEventListener("resize",g),a(),r.remove(),c.PixflowDesignHostDock===l&&delete c.PixflowDesignHostDock}}if(window.top===window&&window.pixflowGutenbergEditor){let t=li(),i=ci(),n=Ri(),s=Li(),r=Di(()=>{let o=window.wp;try{return ne(o),o}catch{return}});window.addEventListener("pagehide",()=>{r(),t(),i(),n(),s()},{once:!0})}})();
