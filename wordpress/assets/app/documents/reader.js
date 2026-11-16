import{a as Fe,b as $e}from"./chunks/chunk-FRQ4HX4C.js";import{c as lt}from"./chunks/chunk-EMBIDUMY.js";var n={};lt(n,{BRAND:()=>Mt,DIRTY:()=>V,EMPTY_PATH:()=>ht,INVALID:()=>m,NEVER:()=>vr,OK:()=>S,ParseStatus:()=>x,Schema:()=>v,ZodAny:()=>U,ZodArray:()=>B,ZodBigInt:()=>G,ZodBoolean:()=>K,ZodBranded:()=>ge,ZodCatch:()=>se,ZodDate:()=>X,ZodDefault:()=>ie,ZodDiscriminatedUnion:()=>we,ZodEffects:()=>P,ZodEnum:()=>re,ZodError:()=>I,ZodFirstPartyTypeKind:()=>g,ZodFunction:()=>Se,ZodIntersection:()=>Q,ZodIssueCode:()=>l,ZodLazy:()=>ee,ZodLiteral:()=>te,ZodMap:()=>pe,ZodNaN:()=>fe,ZodNativeEnum:()=>ne,ZodNever:()=>N,ZodNull:()=>Z,ZodNullable:()=>L,ZodNumber:()=>H,ZodObject:()=>A,ZodOptional:()=>E,ZodParsedType:()=>h,ZodPipeline:()=>ye,ZodPromise:()=>z,ZodReadonly:()=>oe,ZodRecord:()=>xe,ZodSchema:()=>v,ZodSet:()=>he,ZodString:()=>W,ZodSymbol:()=>de,ZodTransformer:()=>P,ZodTuple:()=>M,ZodType:()=>v,ZodUndefined:()=>Y,ZodUnion:()=>J,ZodUnknown:()=>j,ZodVoid:()=>ue,addIssueToContext:()=>d,any:()=>zt,array:()=>Kt,bigint:()=>jt,boolean:()=>Xe,coerce:()=>br,custom:()=>He,date:()=>Bt,datetimeRegex:()=>ze,defaultErrorMap:()=>F,discriminatedUnion:()=>Jt,effect:()=>dr,enum:()=>ar,function:()=>ir,getErrorMap:()=>ae,getParsedType:()=>D,instanceof:()=>Ft,intersection:()=>Qt,isAborted:()=>ke,isAsync:()=>ce,isDirty:()=>_e,isValid:()=>q,late:()=>Lt,lazy:()=>sr,literal:()=>or,makeIssue:()=>me,map:()=>rr,nan:()=>$t,nativeEnum:()=>cr,never:()=>Ht,null:()=>Ut,nullable:()=>pr,number:()=>Ke,object:()=>Xt,objectUtil:()=>Ae,oboolean:()=>yr,onumber:()=>gr,optional:()=>ur,ostring:()=>mr,pipeline:()=>fr,preprocess:()=>hr,promise:()=>lr,quotelessJson:()=>dt,record:()=>tr,set:()=>nr,setErrorMap:()=>pt,strictObject:()=>Yt,string:()=>Ge,symbol:()=>qt,transformer:()=>dr,tuple:()=>er,undefined:()=>Wt,union:()=>Zt,unknown:()=>Vt,util:()=>k,void:()=>Gt});var k;(function(t){t.assertEqual=s=>{};function e(s){}t.assertIs=e;function r(s){throw new Error}t.assertNever=r,t.arrayToEnum=s=>{let o={};for(let a of s)o[a]=a;return o},t.getValidEnumValues=s=>{let o=t.objectKeys(s).filter(c=>typeof s[s[c]]!="number"),a={};for(let c of o)a[c]=s[c];return t.objectValues(a)},t.objectValues=s=>t.objectKeys(s).map(function(o){return s[o]}),t.objectKeys=typeof Object.keys=="function"?s=>Object.keys(s):s=>{let o=[];for(let a in s)Object.prototype.hasOwnProperty.call(s,a)&&o.push(a);return o},t.find=(s,o)=>{for(let a of s)if(o(a))return a},t.isInteger=typeof Number.isInteger=="function"?s=>Number.isInteger(s):s=>typeof s=="number"&&Number.isFinite(s)&&Math.floor(s)===s;function i(s,o=" | "){return s.map(a=>typeof a=="string"?`'${a}'`:a).join(o)}t.joinValues=i,t.jsonStringifyReplacer=(s,o)=>typeof o=="bigint"?o.toString():o})(k||(k={}));var Ae;(function(t){t.mergeShapes=(e,r)=>({...e,...r})})(Ae||(Ae={}));var h=k.arrayToEnum(["string","nan","number","integer","float","boolean","date","bigint","symbol","function","undefined","null","array","object","unknown","promise","void","never","map","set"]),D=t=>{switch(typeof t){case"undefined":return h.undefined;case"string":return h.string;case"number":return Number.isNaN(t)?h.nan:h.number;case"boolean":return h.boolean;case"function":return h.function;case"bigint":return h.bigint;case"symbol":return h.symbol;case"object":return Array.isArray(t)?h.array:t===null?h.null:t.then&&typeof t.then=="function"&&t.catch&&typeof t.catch=="function"?h.promise:typeof Map<"u"&&t instanceof Map?h.map:typeof Set<"u"&&t instanceof Set?h.set:typeof Date<"u"&&t instanceof Date?h.date:h.object;default:return h.unknown}};var l=k.arrayToEnum(["invalid_type","invalid_literal","custom","invalid_union","invalid_union_discriminator","invalid_enum_value","unrecognized_keys","invalid_arguments","invalid_return_type","invalid_date","invalid_string","too_small","too_big","invalid_intersection_types","not_multiple_of","not_finite"]),dt=t=>JSON.stringify(t,null,2).replace(/"([^"]+)":/g,"$1:"),I=class t extends Error{get errors(){return this.issues}constructor(e){super(),this.issues=[],this.addIssue=i=>{this.issues=[...this.issues,i]},this.addIssues=(i=[])=>{this.issues=[...this.issues,...i]};let r=new.target.prototype;Object.setPrototypeOf?Object.setPrototypeOf(this,r):this.__proto__=r,this.name="ZodError",this.issues=e}format(e){let r=e||function(o){return o.message},i={_errors:[]},s=o=>{for(let a of o.issues)if(a.code==="invalid_union")a.unionErrors.map(s);else if(a.code==="invalid_return_type")s(a.returnTypeError);else if(a.code==="invalid_arguments")s(a.argumentsError);else if(a.path.length===0)i._errors.push(r(a));else{let c=i,p=0;for(;p<a.path.length;){let u=a.path[p];p===a.path.length-1?(c[u]=c[u]||{_errors:[]},c[u]._errors.push(r(a))):c[u]=c[u]||{_errors:[]},c=c[u],p++}}};return s(this),i}static assert(e){if(!(e instanceof t))throw new Error(`Not a ZodError: ${e}`)}toString(){return this.message}get message(){return JSON.stringify(this.issues,k.jsonStringifyReplacer,2)}get isEmpty(){return this.issues.length===0}flatten(e=r=>r.message){let r={},i=[];for(let s of this.issues)if(s.path.length>0){let o=s.path[0];r[o]=r[o]||[],r[o].push(e(s))}else i.push(e(s));return{formErrors:i,fieldErrors:r}}get formErrors(){return this.flatten()}};I.create=t=>new I(t);var ut=(t,e)=>{let r;switch(t.code){case l.invalid_type:t.received===h.undefined?r="Required":r=`Expected ${t.expected}, received ${t.received}`;break;case l.invalid_literal:r=`Invalid literal value, expected ${JSON.stringify(t.expected,k.jsonStringifyReplacer)}`;break;case l.unrecognized_keys:r=`Unrecognized key(s) in object: ${k.joinValues(t.keys,", ")}`;break;case l.invalid_union:r="Invalid input";break;case l.invalid_union_discriminator:r=`Invalid discriminator value. Expected ${k.joinValues(t.options)}`;break;case l.invalid_enum_value:r=`Invalid enum value. Expected ${k.joinValues(t.options)}, received '${t.received}'`;break;case l.invalid_arguments:r="Invalid function arguments";break;case l.invalid_return_type:r="Invalid function return type";break;case l.invalid_date:r="Invalid date";break;case l.invalid_string:typeof t.validation=="object"?"includes"in t.validation?(r=`Invalid input: must include "${t.validation.includes}"`,typeof t.validation.position=="number"&&(r=`${r} at one or more positions greater than or equal to ${t.validation.position}`)):"startsWith"in t.validation?r=`Invalid input: must start with "${t.validation.startsWith}"`:"endsWith"in t.validation?r=`Invalid input: must end with "${t.validation.endsWith}"`:k.assertNever(t.validation):t.validation!=="regex"?r=`Invalid ${t.validation}`:r="Invalid";break;case l.too_small:t.type==="array"?r=`Array must contain ${t.exact?"exactly":t.inclusive?"at least":"more than"} ${t.minimum} element(s)`:t.type==="string"?r=`String must contain ${t.exact?"exactly":t.inclusive?"at least":"over"} ${t.minimum} character(s)`:t.type==="number"?r=`Number must be ${t.exact?"exactly equal to ":t.inclusive?"greater than or equal to ":"greater than "}${t.minimum}`:t.type==="bigint"?r=`Number must be ${t.exact?"exactly equal to ":t.inclusive?"greater than or equal to ":"greater than "}${t.minimum}`:t.type==="date"?r=`Date must be ${t.exact?"exactly equal to ":t.inclusive?"greater than or equal to ":"greater than "}${new Date(Number(t.minimum))}`:r="Invalid input";break;case l.too_big:t.type==="array"?r=`Array must contain ${t.exact?"exactly":t.inclusive?"at most":"less than"} ${t.maximum} element(s)`:t.type==="string"?r=`String must contain ${t.exact?"exactly":t.inclusive?"at most":"under"} ${t.maximum} character(s)`:t.type==="number"?r=`Number must be ${t.exact?"exactly":t.inclusive?"less than or equal to":"less than"} ${t.maximum}`:t.type==="bigint"?r=`BigInt must be ${t.exact?"exactly":t.inclusive?"less than or equal to":"less than"} ${t.maximum}`:t.type==="date"?r=`Date must be ${t.exact?"exactly":t.inclusive?"smaller than or equal to":"smaller than"} ${new Date(Number(t.maximum))}`:r="Invalid input";break;case l.custom:r="Invalid input";break;case l.invalid_intersection_types:r="Intersection results could not be merged";break;case l.not_multiple_of:r=`Number must be a multiple of ${t.multipleOf}`;break;case l.not_finite:r="Number must be finite";break;default:r=e.defaultError,k.assertNever(t)}return{message:r}},F=ut;var je=F;function pt(t){je=t}function ae(){return je}var me=t=>{let{data:e,path:r,errorMaps:i,issueData:s}=t,o=[...r,...s.path||[]],a={...s,path:o};if(s.message!==void 0)return{...s,path:o,message:s.message};let c="",p=i.filter(u=>!!u).slice().reverse();for(let u of p)c=u(a,{data:e,defaultError:c}).message;return{...s,path:o,message:c}},ht=[];function d(t,e){let r=ae(),i=me({issueData:e,data:t.data,path:t.path,errorMaps:[t.common.contextualErrorMap,t.schemaErrorMap,r,r===F?void 0:F].filter(s=>!!s)});t.common.issues.push(i)}var x=class t{constructor(){this.value="valid"}dirty(){this.value==="valid"&&(this.value="dirty")}abort(){this.value!=="aborted"&&(this.value="aborted")}static mergeArray(e,r){let i=[];for(let s of r){if(s.status==="aborted")return m;s.status==="dirty"&&e.dirty(),i.push(s.value)}return{status:e.value,value:i}}static async mergeObjectAsync(e,r){let i=[];for(let s of r){let o=await s.key,a=await s.value;i.push({key:o,value:a})}return t.mergeObjectSync(e,i)}static mergeObjectSync(e,r){let i={};for(let s of r){let{key:o,value:a}=s;if(o.status==="aborted"||a.status==="aborted")return m;o.status==="dirty"&&e.dirty(),a.status==="dirty"&&e.dirty(),o.value!=="__proto__"&&(typeof a.value<"u"||s.alwaysSet)&&(i[o.value]=a.value)}return{status:e.value,value:i}}},m=Object.freeze({status:"aborted"}),V=t=>({status:"dirty",value:t}),S=t=>({status:"valid",value:t}),ke=t=>t.status==="aborted",_e=t=>t.status==="dirty",q=t=>t.status==="valid",ce=t=>typeof Promise<"u"&&t instanceof Promise;var f;(function(t){t.errToObj=e=>typeof e=="string"?{message:e}:e||{},t.toString=e=>typeof e=="string"?e:e?.message})(f||(f={}));var C=class{constructor(e,r,i,s){this._cachedPath=[],this.parent=e,this.data=r,this._path=i,this._key=s}get path(){return this._cachedPath.length||(Array.isArray(this._key)?this._cachedPath.push(...this._path,...this._key):this._cachedPath.push(...this._path,this._key)),this._cachedPath}},Be=(t,e)=>{if(q(e))return{success:!0,data:e.value};if(!t.common.issues.length)throw new Error("Validation failed but no issues detected.");return{success:!1,get error(){if(this._error)return this._error;let r=new I(t.common.issues);return this._error=r,this._error}}};function b(t){if(!t)return{};let{errorMap:e,invalid_type_error:r,required_error:i,description:s}=t;if(e&&(r||i))throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);return e?{errorMap:e,description:s}:{errorMap:(a,c)=>{let{message:p}=t;return a.code==="invalid_enum_value"?{message:p??c.defaultError}:typeof c.data>"u"?{message:p??i??c.defaultError}:a.code!=="invalid_type"?{message:c.defaultError}:{message:p??r??c.defaultError}},description:s}}var v=class{get description(){return this._def.description}_getType(e){return D(e.data)}_getOrReturnCtx(e,r){return r||{common:e.parent.common,data:e.data,parsedType:D(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}_processInputParams(e){return{status:new x,ctx:{common:e.parent.common,data:e.data,parsedType:D(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}}_parseSync(e){let r=this._parse(e);if(ce(r))throw new Error("Synchronous parse encountered promise.");return r}_parseAsync(e){let r=this._parse(e);return Promise.resolve(r)}parse(e,r){let i=this.safeParse(e,r);if(i.success)return i.data;throw i.error}safeParse(e,r){let i={common:{issues:[],async:r?.async??!1,contextualErrorMap:r?.errorMap},path:r?.path||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:D(e)},s=this._parseSync({data:e,path:i.path,parent:i});return Be(i,s)}"~validate"(e){let r={common:{issues:[],async:!!this["~standard"].async},path:[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:D(e)};if(!this["~standard"].async)try{let i=this._parseSync({data:e,path:[],parent:r});return q(i)?{value:i.value}:{issues:r.common.issues}}catch(i){i?.message?.toLowerCase()?.includes("encountered")&&(this["~standard"].async=!0),r.common={issues:[],async:!0}}return this._parseAsync({data:e,path:[],parent:r}).then(i=>q(i)?{value:i.value}:{issues:r.common.issues})}async parseAsync(e,r){let i=await this.safeParseAsync(e,r);if(i.success)return i.data;throw i.error}async safeParseAsync(e,r){let i={common:{issues:[],contextualErrorMap:r?.errorMap,async:!0},path:r?.path||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:D(e)},s=this._parse({data:e,path:i.path,parent:i}),o=await(ce(s)?s:Promise.resolve(s));return Be(i,o)}refine(e,r){let i=s=>typeof r=="string"||typeof r>"u"?{message:r}:typeof r=="function"?r(s):r;return this._refinement((s,o)=>{let a=e(s),c=()=>o.addIssue({code:l.custom,...i(s)});return typeof Promise<"u"&&a instanceof Promise?a.then(p=>p?!0:(c(),!1)):a?!0:(c(),!1)})}refinement(e,r){return this._refinement((i,s)=>e(i)?!0:(s.addIssue(typeof r=="function"?r(i,s):r),!1))}_refinement(e){return new P({schema:this,typeName:g.ZodEffects,effect:{type:"refinement",refinement:e}})}superRefine(e){return this._refinement(e)}constructor(e){this.spa=this.safeParseAsync,this._def=e,this.parse=this.parse.bind(this),this.safeParse=this.safeParse.bind(this),this.parseAsync=this.parseAsync.bind(this),this.safeParseAsync=this.safeParseAsync.bind(this),this.spa=this.spa.bind(this),this.refine=this.refine.bind(this),this.refinement=this.refinement.bind(this),this.superRefine=this.superRefine.bind(this),this.optional=this.optional.bind(this),this.nullable=this.nullable.bind(this),this.nullish=this.nullish.bind(this),this.array=this.array.bind(this),this.promise=this.promise.bind(this),this.or=this.or.bind(this),this.and=this.and.bind(this),this.transform=this.transform.bind(this),this.brand=this.brand.bind(this),this.default=this.default.bind(this),this.catch=this.catch.bind(this),this.describe=this.describe.bind(this),this.pipe=this.pipe.bind(this),this.readonly=this.readonly.bind(this),this.isNullable=this.isNullable.bind(this),this.isOptional=this.isOptional.bind(this),this["~standard"]={version:1,vendor:"zod",validate:r=>this["~validate"](r)}}optional(){return E.create(this,this._def)}nullable(){return L.create(this,this._def)}nullish(){return this.nullable().optional()}array(){return B.create(this)}promise(){return z.create(this,this._def)}or(e){return J.create([this,e],this._def)}and(e){return Q.create(this,e,this._def)}transform(e){return new P({...b(this._def),schema:this,typeName:g.ZodEffects,effect:{type:"transform",transform:e}})}default(e){let r=typeof e=="function"?e:()=>e;return new ie({...b(this._def),innerType:this,defaultValue:r,typeName:g.ZodDefault})}brand(){return new ge({typeName:g.ZodBranded,type:this,...b(this._def)})}catch(e){let r=typeof e=="function"?e:()=>e;return new se({...b(this._def),innerType:this,catchValue:r,typeName:g.ZodCatch})}describe(e){let r=this.constructor;return new r({...this._def,description:e})}pipe(e){return ye.create(this,e)}readonly(){return oe.create(this)}isOptional(){return this.safeParse(void 0).success}isNullable(){return this.safeParse(null).success}},ft=/^c[^\s-]{8,}$/i,mt=/^[0-9a-z]+$/,gt=/^[0-9A-HJKMNP-TV-Z]{26}$/i,yt=/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,bt=/^[a-z0-9_-]{21}$/i,vt=/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,kt=/^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,_t=/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i,wt="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$",Ee,xt=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,St=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,Tt=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,It=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,At=/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,Et=/^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,We="((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))",Ct=new RegExp(`^${We}$`);function Ue(t){let e="[0-5]\\d";t.precision?e=`${e}\\.\\d{${t.precision}}`:t.precision==null&&(e=`${e}(\\.\\d+)?`);let r=t.precision?"+":"?";return`([01]\\d|2[0-3]):[0-5]\\d(:${e})${r}`}function Pt(t){return new RegExp(`^${Ue(t)}$`)}function ze(t){let e=`${We}T${Ue(t)}`,r=[];return r.push(t.local?"Z?":"Z"),t.offset&&r.push("([+-]\\d{2}:?\\d{2})"),e=`${e}(${r.join("|")})`,new RegExp(`^${e}$`)}function Ot(t,e){return!!((e==="v4"||!e)&&xt.test(t)||(e==="v6"||!e)&&Tt.test(t))}function Rt(t,e){if(!vt.test(t))return!1;try{let[r]=t.split(".");if(!r)return!1;let i=r.replace(/-/g,"+").replace(/_/g,"/").padEnd(r.length+(4-r.length%4)%4,"="),s=JSON.parse(atob(i));return!(typeof s!="object"||s===null||"typ"in s&&s?.typ!=="JWT"||!s.alg||e&&s.alg!==e)}catch{return!1}}function Nt(t,e){return!!((e==="v4"||!e)&&St.test(t)||(e==="v6"||!e)&&It.test(t))}var W=class t extends v{_parse(e){if(this._def.coerce&&(e.data=String(e.data)),this._getType(e)!==h.string){let o=this._getOrReturnCtx(e);return d(o,{code:l.invalid_type,expected:h.string,received:o.parsedType}),m}let i=new x,s;for(let o of this._def.checks)if(o.kind==="min")e.data.length<o.value&&(s=this._getOrReturnCtx(e,s),d(s,{code:l.too_small,minimum:o.value,type:"string",inclusive:!0,exact:!1,message:o.message}),i.dirty());else if(o.kind==="max")e.data.length>o.value&&(s=this._getOrReturnCtx(e,s),d(s,{code:l.too_big,maximum:o.value,type:"string",inclusive:!0,exact:!1,message:o.message}),i.dirty());else if(o.kind==="length"){let a=e.data.length>o.value,c=e.data.length<o.value;(a||c)&&(s=this._getOrReturnCtx(e,s),a?d(s,{code:l.too_big,maximum:o.value,type:"string",inclusive:!0,exact:!0,message:o.message}):c&&d(s,{code:l.too_small,minimum:o.value,type:"string",inclusive:!0,exact:!0,message:o.message}),i.dirty())}else if(o.kind==="email")_t.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"email",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="emoji")Ee||(Ee=new RegExp(wt,"u")),Ee.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"emoji",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="uuid")yt.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"uuid",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="nanoid")bt.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"nanoid",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="cuid")ft.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"cuid",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="cuid2")mt.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"cuid2",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="ulid")gt.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"ulid",code:l.invalid_string,message:o.message}),i.dirty());else if(o.kind==="url")try{new URL(e.data)}catch{s=this._getOrReturnCtx(e,s),d(s,{validation:"url",code:l.invalid_string,message:o.message}),i.dirty()}else o.kind==="regex"?(o.regex.lastIndex=0,o.regex.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"regex",code:l.invalid_string,message:o.message}),i.dirty())):o.kind==="trim"?e.data=e.data.trim():o.kind==="includes"?e.data.includes(o.value,o.position)||(s=this._getOrReturnCtx(e,s),d(s,{code:l.invalid_string,validation:{includes:o.value,position:o.position},message:o.message}),i.dirty()):o.kind==="toLowerCase"?e.data=e.data.toLowerCase():o.kind==="toUpperCase"?e.data=e.data.toUpperCase():o.kind==="startsWith"?e.data.startsWith(o.value)||(s=this._getOrReturnCtx(e,s),d(s,{code:l.invalid_string,validation:{startsWith:o.value},message:o.message}),i.dirty()):o.kind==="endsWith"?e.data.endsWith(o.value)||(s=this._getOrReturnCtx(e,s),d(s,{code:l.invalid_string,validation:{endsWith:o.value},message:o.message}),i.dirty()):o.kind==="datetime"?ze(o).test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{code:l.invalid_string,validation:"datetime",message:o.message}),i.dirty()):o.kind==="date"?Ct.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{code:l.invalid_string,validation:"date",message:o.message}),i.dirty()):o.kind==="time"?Pt(o).test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{code:l.invalid_string,validation:"time",message:o.message}),i.dirty()):o.kind==="duration"?kt.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"duration",code:l.invalid_string,message:o.message}),i.dirty()):o.kind==="ip"?Ot(e.data,o.version)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"ip",code:l.invalid_string,message:o.message}),i.dirty()):o.kind==="jwt"?Rt(e.data,o.alg)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"jwt",code:l.invalid_string,message:o.message}),i.dirty()):o.kind==="cidr"?Nt(e.data,o.version)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"cidr",code:l.invalid_string,message:o.message}),i.dirty()):o.kind==="base64"?At.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"base64",code:l.invalid_string,message:o.message}),i.dirty()):o.kind==="base64url"?Et.test(e.data)||(s=this._getOrReturnCtx(e,s),d(s,{validation:"base64url",code:l.invalid_string,message:o.message}),i.dirty()):k.assertNever(o);return{status:i.value,value:e.data}}_regex(e,r,i){return this.refinement(s=>e.test(s),{validation:r,code:l.invalid_string,...f.errToObj(i)})}_addCheck(e){return new t({...this._def,checks:[...this._def.checks,e]})}email(e){return this._addCheck({kind:"email",...f.errToObj(e)})}url(e){return this._addCheck({kind:"url",...f.errToObj(e)})}emoji(e){return this._addCheck({kind:"emoji",...f.errToObj(e)})}uuid(e){return this._addCheck({kind:"uuid",...f.errToObj(e)})}nanoid(e){return this._addCheck({kind:"nanoid",...f.errToObj(e)})}cuid(e){return this._addCheck({kind:"cuid",...f.errToObj(e)})}cuid2(e){return this._addCheck({kind:"cuid2",...f.errToObj(e)})}ulid(e){return this._addCheck({kind:"ulid",...f.errToObj(e)})}base64(e){return this._addCheck({kind:"base64",...f.errToObj(e)})}base64url(e){return this._addCheck({kind:"base64url",...f.errToObj(e)})}jwt(e){return this._addCheck({kind:"jwt",...f.errToObj(e)})}ip(e){return this._addCheck({kind:"ip",...f.errToObj(e)})}cidr(e){return this._addCheck({kind:"cidr",...f.errToObj(e)})}datetime(e){return typeof e=="string"?this._addCheck({kind:"datetime",precision:null,offset:!1,local:!1,message:e}):this._addCheck({kind:"datetime",precision:typeof e?.precision>"u"?null:e?.precision,offset:e?.offset??!1,local:e?.local??!1,...f.errToObj(e?.message)})}date(e){return this._addCheck({kind:"date",message:e})}time(e){return typeof e=="string"?this._addCheck({kind:"time",precision:null,message:e}):this._addCheck({kind:"time",precision:typeof e?.precision>"u"?null:e?.precision,...f.errToObj(e?.message)})}duration(e){return this._addCheck({kind:"duration",...f.errToObj(e)})}regex(e,r){return this._addCheck({kind:"regex",regex:e,...f.errToObj(r)})}includes(e,r){return this._addCheck({kind:"includes",value:e,position:r?.position,...f.errToObj(r?.message)})}startsWith(e,r){return this._addCheck({kind:"startsWith",value:e,...f.errToObj(r)})}endsWith(e,r){return this._addCheck({kind:"endsWith",value:e,...f.errToObj(r)})}min(e,r){return this._addCheck({kind:"min",value:e,...f.errToObj(r)})}max(e,r){return this._addCheck({kind:"max",value:e,...f.errToObj(r)})}length(e,r){return this._addCheck({kind:"length",value:e,...f.errToObj(r)})}nonempty(e){return this.min(1,f.errToObj(e))}trim(){return new t({...this._def,checks:[...this._def.checks,{kind:"trim"}]})}toLowerCase(){return new t({...this._def,checks:[...this._def.checks,{kind:"toLowerCase"}]})}toUpperCase(){return new t({...this._def,checks:[...this._def.checks,{kind:"toUpperCase"}]})}get isDatetime(){return!!this._def.checks.find(e=>e.kind==="datetime")}get isDate(){return!!this._def.checks.find(e=>e.kind==="date")}get isTime(){return!!this._def.checks.find(e=>e.kind==="time")}get isDuration(){return!!this._def.checks.find(e=>e.kind==="duration")}get isEmail(){return!!this._def.checks.find(e=>e.kind==="email")}get isURL(){return!!this._def.checks.find(e=>e.kind==="url")}get isEmoji(){return!!this._def.checks.find(e=>e.kind==="emoji")}get isUUID(){return!!this._def.checks.find(e=>e.kind==="uuid")}get isNANOID(){return!!this._def.checks.find(e=>e.kind==="nanoid")}get isCUID(){return!!this._def.checks.find(e=>e.kind==="cuid")}get isCUID2(){return!!this._def.checks.find(e=>e.kind==="cuid2")}get isULID(){return!!this._def.checks.find(e=>e.kind==="ulid")}get isIP(){return!!this._def.checks.find(e=>e.kind==="ip")}get isCIDR(){return!!this._def.checks.find(e=>e.kind==="cidr")}get isBase64(){return!!this._def.checks.find(e=>e.kind==="base64")}get isBase64url(){return!!this._def.checks.find(e=>e.kind==="base64url")}get minLength(){let e=null;for(let r of this._def.checks)r.kind==="min"&&(e===null||r.value>e)&&(e=r.value);return e}get maxLength(){let e=null;for(let r of this._def.checks)r.kind==="max"&&(e===null||r.value<e)&&(e=r.value);return e}};W.create=t=>new W({checks:[],typeName:g.ZodString,coerce:t?.coerce??!1,...b(t)});function Dt(t,e){let r=(t.toString().split(".")[1]||"").length,i=(e.toString().split(".")[1]||"").length,s=r>i?r:i,o=Number.parseInt(t.toFixed(s).replace(".","")),a=Number.parseInt(e.toFixed(s).replace(".",""));return o%a/10**s}var H=class t extends v{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte,this.step=this.multipleOf}_parse(e){if(this._def.coerce&&(e.data=Number(e.data)),this._getType(e)!==h.number){let o=this._getOrReturnCtx(e);return d(o,{code:l.invalid_type,expected:h.number,received:o.parsedType}),m}let i,s=new x;for(let o of this._def.checks)o.kind==="int"?k.isInteger(e.data)||(i=this._getOrReturnCtx(e,i),d(i,{code:l.invalid_type,expected:"integer",received:"float",message:o.message}),s.dirty()):o.kind==="min"?(o.inclusive?e.data<o.value:e.data<=o.value)&&(i=this._getOrReturnCtx(e,i),d(i,{code:l.too_small,minimum:o.value,type:"number",inclusive:o.inclusive,exact:!1,message:o.message}),s.dirty()):o.kind==="max"?(o.inclusive?e.data>o.value:e.data>=o.value)&&(i=this._getOrReturnCtx(e,i),d(i,{code:l.too_big,maximum:o.value,type:"number",inclusive:o.inclusive,exact:!1,message:o.message}),s.dirty()):o.kind==="multipleOf"?Dt(e.data,o.value)!==0&&(i=this._getOrReturnCtx(e,i),d(i,{code:l.not_multiple_of,multipleOf:o.value,message:o.message}),s.dirty()):o.kind==="finite"?Number.isFinite(e.data)||(i=this._getOrReturnCtx(e,i),d(i,{code:l.not_finite,message:o.message}),s.dirty()):k.assertNever(o);return{status:s.value,value:e.data}}gte(e,r){return this.setLimit("min",e,!0,f.toString(r))}gt(e,r){return this.setLimit("min",e,!1,f.toString(r))}lte(e,r){return this.setLimit("max",e,!0,f.toString(r))}lt(e,r){return this.setLimit("max",e,!1,f.toString(r))}setLimit(e,r,i,s){return new t({...this._def,checks:[...this._def.checks,{kind:e,value:r,inclusive:i,message:f.toString(s)}]})}_addCheck(e){return new t({...this._def,checks:[...this._def.checks,e]})}int(e){return this._addCheck({kind:"int",message:f.toString(e)})}positive(e){return this._addCheck({kind:"min",value:0,inclusive:!1,message:f.toString(e)})}negative(e){return this._addCheck({kind:"max",value:0,inclusive:!1,message:f.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:0,inclusive:!0,message:f.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:0,inclusive:!0,message:f.toString(e)})}multipleOf(e,r){return this._addCheck({kind:"multipleOf",value:e,message:f.toString(r)})}finite(e){return this._addCheck({kind:"finite",message:f.toString(e)})}safe(e){return this._addCheck({kind:"min",inclusive:!0,value:Number.MIN_SAFE_INTEGER,message:f.toString(e)})._addCheck({kind:"max",inclusive:!0,value:Number.MAX_SAFE_INTEGER,message:f.toString(e)})}get minValue(){let e=null;for(let r of this._def.checks)r.kind==="min"&&(e===null||r.value>e)&&(e=r.value);return e}get maxValue(){let e=null;for(let r of this._def.checks)r.kind==="max"&&(e===null||r.value<e)&&(e=r.value);return e}get isInt(){return!!this._def.checks.find(e=>e.kind==="int"||e.kind==="multipleOf"&&k.isInteger(e.value))}get isFinite(){let e=null,r=null;for(let i of this._def.checks){if(i.kind==="finite"||i.kind==="int"||i.kind==="multipleOf")return!0;i.kind==="min"?(r===null||i.value>r)&&(r=i.value):i.kind==="max"&&(e===null||i.value<e)&&(e=i.value)}return Number.isFinite(r)&&Number.isFinite(e)}};H.create=t=>new H({checks:[],typeName:g.ZodNumber,coerce:t?.coerce||!1,...b(t)});var G=class t extends v{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte}_parse(e){if(this._def.coerce)try{e.data=BigInt(e.data)}catch{return this._getInvalidInput(e)}if(this._getType(e)!==h.bigint)return this._getInvalidInput(e);let i,s=new x;for(let o of this._def.checks)o.kind==="min"?(o.inclusive?e.data<o.value:e.data<=o.value)&&(i=this._getOrReturnCtx(e,i),d(i,{code:l.too_small,type:"bigint",minimum:o.value,inclusive:o.inclusive,message:o.message}),s.dirty()):o.kind==="max"?(o.inclusive?e.data>o.value:e.data>=o.value)&&(i=this._getOrReturnCtx(e,i),d(i,{code:l.too_big,type:"bigint",maximum:o.value,inclusive:o.inclusive,message:o.message}),s.dirty()):o.kind==="multipleOf"?e.data%o.value!==BigInt(0)&&(i=this._getOrReturnCtx(e,i),d(i,{code:l.not_multiple_of,multipleOf:o.value,message:o.message}),s.dirty()):k.assertNever(o);return{status:s.value,value:e.data}}_getInvalidInput(e){let r=this._getOrReturnCtx(e);return d(r,{code:l.invalid_type,expected:h.bigint,received:r.parsedType}),m}gte(e,r){return this.setLimit("min",e,!0,f.toString(r))}gt(e,r){return this.setLimit("min",e,!1,f.toString(r))}lte(e,r){return this.setLimit("max",e,!0,f.toString(r))}lt(e,r){return this.setLimit("max",e,!1,f.toString(r))}setLimit(e,r,i,s){return new t({...this._def,checks:[...this._def.checks,{kind:e,value:r,inclusive:i,message:f.toString(s)}]})}_addCheck(e){return new t({...this._def,checks:[...this._def.checks,e]})}positive(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!1,message:f.toString(e)})}negative(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!1,message:f.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!0,message:f.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!0,message:f.toString(e)})}multipleOf(e,r){return this._addCheck({kind:"multipleOf",value:e,message:f.toString(r)})}get minValue(){let e=null;for(let r of this._def.checks)r.kind==="min"&&(e===null||r.value>e)&&(e=r.value);return e}get maxValue(){let e=null;for(let r of this._def.checks)r.kind==="max"&&(e===null||r.value<e)&&(e=r.value);return e}};G.create=t=>new G({checks:[],typeName:g.ZodBigInt,coerce:t?.coerce??!1,...b(t)});var K=class extends v{_parse(e){if(this._def.coerce&&(e.data=!!e.data),this._getType(e)!==h.boolean){let i=this._getOrReturnCtx(e);return d(i,{code:l.invalid_type,expected:h.boolean,received:i.parsedType}),m}return S(e.data)}};K.create=t=>new K({typeName:g.ZodBoolean,coerce:t?.coerce||!1,...b(t)});var X=class t extends v{_parse(e){if(this._def.coerce&&(e.data=new Date(e.data)),this._getType(e)!==h.date){let o=this._getOrReturnCtx(e);return d(o,{code:l.invalid_type,expected:h.date,received:o.parsedType}),m}if(Number.isNaN(e.data.getTime())){let o=this._getOrReturnCtx(e);return d(o,{code:l.invalid_date}),m}let i=new x,s;for(let o of this._def.checks)o.kind==="min"?e.data.getTime()<o.value&&(s=this._getOrReturnCtx(e,s),d(s,{code:l.too_small,message:o.message,inclusive:!0,exact:!1,minimum:o.value,type:"date"}),i.dirty()):o.kind==="max"?e.data.getTime()>o.value&&(s=this._getOrReturnCtx(e,s),d(s,{code:l.too_big,message:o.message,inclusive:!0,exact:!1,maximum:o.value,type:"date"}),i.dirty()):k.assertNever(o);return{status:i.value,value:new Date(e.data.getTime())}}_addCheck(e){return new t({...this._def,checks:[...this._def.checks,e]})}min(e,r){return this._addCheck({kind:"min",value:e.getTime(),message:f.toString(r)})}max(e,r){return this._addCheck({kind:"max",value:e.getTime(),message:f.toString(r)})}get minDate(){let e=null;for(let r of this._def.checks)r.kind==="min"&&(e===null||r.value>e)&&(e=r.value);return e!=null?new Date(e):null}get maxDate(){let e=null;for(let r of this._def.checks)r.kind==="max"&&(e===null||r.value<e)&&(e=r.value);return e!=null?new Date(e):null}};X.create=t=>new X({checks:[],coerce:t?.coerce||!1,typeName:g.ZodDate,...b(t)});var de=class extends v{_parse(e){if(this._getType(e)!==h.symbol){let i=this._getOrReturnCtx(e);return d(i,{code:l.invalid_type,expected:h.symbol,received:i.parsedType}),m}return S(e.data)}};de.create=t=>new de({typeName:g.ZodSymbol,...b(t)});var Y=class extends v{_parse(e){if(this._getType(e)!==h.undefined){let i=this._getOrReturnCtx(e);return d(i,{code:l.invalid_type,expected:h.undefined,received:i.parsedType}),m}return S(e.data)}};Y.create=t=>new Y({typeName:g.ZodUndefined,...b(t)});var Z=class extends v{_parse(e){if(this._getType(e)!==h.null){let i=this._getOrReturnCtx(e);return d(i,{code:l.invalid_type,expected:h.null,received:i.parsedType}),m}return S(e.data)}};Z.create=t=>new Z({typeName:g.ZodNull,...b(t)});var U=class extends v{constructor(){super(...arguments),this._any=!0}_parse(e){return S(e.data)}};U.create=t=>new U({typeName:g.ZodAny,...b(t)});var j=class extends v{constructor(){super(...arguments),this._unknown=!0}_parse(e){return S(e.data)}};j.create=t=>new j({typeName:g.ZodUnknown,...b(t)});var N=class extends v{_parse(e){let r=this._getOrReturnCtx(e);return d(r,{code:l.invalid_type,expected:h.never,received:r.parsedType}),m}};N.create=t=>new N({typeName:g.ZodNever,...b(t)});var ue=class extends v{_parse(e){if(this._getType(e)!==h.undefined){let i=this._getOrReturnCtx(e);return d(i,{code:l.invalid_type,expected:h.void,received:i.parsedType}),m}return S(e.data)}};ue.create=t=>new ue({typeName:g.ZodVoid,...b(t)});var B=class t extends v{_parse(e){let{ctx:r,status:i}=this._processInputParams(e),s=this._def;if(r.parsedType!==h.array)return d(r,{code:l.invalid_type,expected:h.array,received:r.parsedType}),m;if(s.exactLength!==null){let a=r.data.length>s.exactLength.value,c=r.data.length<s.exactLength.value;(a||c)&&(d(r,{code:a?l.too_big:l.too_small,minimum:c?s.exactLength.value:void 0,maximum:a?s.exactLength.value:void 0,type:"array",inclusive:!0,exact:!0,message:s.exactLength.message}),i.dirty())}if(s.minLength!==null&&r.data.length<s.minLength.value&&(d(r,{code:l.too_small,minimum:s.minLength.value,type:"array",inclusive:!0,exact:!1,message:s.minLength.message}),i.dirty()),s.maxLength!==null&&r.data.length>s.maxLength.value&&(d(r,{code:l.too_big,maximum:s.maxLength.value,type:"array",inclusive:!0,exact:!1,message:s.maxLength.message}),i.dirty()),r.common.async)return Promise.all([...r.data].map((a,c)=>s.type._parseAsync(new C(r,a,r.path,c)))).then(a=>x.mergeArray(i,a));let o=[...r.data].map((a,c)=>s.type._parseSync(new C(r,a,r.path,c)));return x.mergeArray(i,o)}get element(){return this._def.type}min(e,r){return new t({...this._def,minLength:{value:e,message:f.toString(r)}})}max(e,r){return new t({...this._def,maxLength:{value:e,message:f.toString(r)}})}length(e,r){return new t({...this._def,exactLength:{value:e,message:f.toString(r)}})}nonempty(e){return this.min(1,e)}};B.create=(t,e)=>new B({type:t,minLength:null,maxLength:null,exactLength:null,typeName:g.ZodArray,...b(e)});function le(t){if(t instanceof A){let e={};for(let r in t.shape){let i=t.shape[r];e[r]=E.create(le(i))}return new A({...t._def,shape:()=>e})}else return t instanceof B?new B({...t._def,type:le(t.element)}):t instanceof E?E.create(le(t.unwrap())):t instanceof L?L.create(le(t.unwrap())):t instanceof M?M.create(t.items.map(e=>le(e))):t}var A=class t extends v{constructor(){super(...arguments),this._cached=null,this.nonstrict=this.passthrough,this.augment=this.extend}_getCached(){if(this._cached!==null)return this._cached;let e=this._def.shape(),r=k.objectKeys(e);return this._cached={shape:e,keys:r},this._cached}_parse(e){if(this._getType(e)!==h.object){let u=this._getOrReturnCtx(e);return d(u,{code:l.invalid_type,expected:h.object,received:u.parsedType}),m}let{status:i,ctx:s}=this._processInputParams(e),{shape:o,keys:a}=this._getCached(),c=[];if(!(this._def.catchall instanceof N&&this._def.unknownKeys==="strip"))for(let u in s.data)a.includes(u)||c.push(u);let p=[];for(let u of a){let y=o[u],_=s.data[u];p.push({key:{status:"valid",value:u},value:y._parse(new C(s,_,s.path,u)),alwaysSet:u in s.data})}if(this._def.catchall instanceof N){let u=this._def.unknownKeys;if(u==="passthrough")for(let y of c)p.push({key:{status:"valid",value:y},value:{status:"valid",value:s.data[y]}});else if(u==="strict")c.length>0&&(d(s,{code:l.unrecognized_keys,keys:c}),i.dirty());else if(u!=="strip")throw new Error("Internal ZodObject error: invalid unknownKeys value.")}else{let u=this._def.catchall;for(let y of c){let _=s.data[y];p.push({key:{status:"valid",value:y},value:u._parse(new C(s,_,s.path,y)),alwaysSet:y in s.data})}}return s.common.async?Promise.resolve().then(async()=>{let u=[];for(let y of p){let _=await y.key,w=await y.value;u.push({key:_,value:w,alwaysSet:y.alwaysSet})}return u}).then(u=>x.mergeObjectSync(i,u)):x.mergeObjectSync(i,p)}get shape(){return this._def.shape()}strict(e){return f.errToObj,new t({...this._def,unknownKeys:"strict",...e!==void 0?{errorMap:(r,i)=>{let s=this._def.errorMap?.(r,i).message??i.defaultError;return r.code==="unrecognized_keys"?{message:f.errToObj(e).message??s}:{message:s}}}:{}})}strip(){return new t({...this._def,unknownKeys:"strip"})}passthrough(){return new t({...this._def,unknownKeys:"passthrough"})}extend(e){return new t({...this._def,shape:()=>({...this._def.shape(),...e})})}merge(e){return new t({unknownKeys:e._def.unknownKeys,catchall:e._def.catchall,shape:()=>({...this._def.shape(),...e._def.shape()}),typeName:g.ZodObject})}setKey(e,r){return this.augment({[e]:r})}catchall(e){return new t({...this._def,catchall:e})}pick(e){let r={};for(let i of k.objectKeys(e))e[i]&&this.shape[i]&&(r[i]=this.shape[i]);return new t({...this._def,shape:()=>r})}omit(e){let r={};for(let i of k.objectKeys(this.shape))e[i]||(r[i]=this.shape[i]);return new t({...this._def,shape:()=>r})}deepPartial(){return le(this)}partial(e){let r={};for(let i of k.objectKeys(this.shape)){let s=this.shape[i];e&&!e[i]?r[i]=s:r[i]=s.optional()}return new t({...this._def,shape:()=>r})}required(e){let r={};for(let i of k.objectKeys(this.shape))if(e&&!e[i])r[i]=this.shape[i];else{let o=this.shape[i];for(;o instanceof E;)o=o._def.innerType;r[i]=o}return new t({...this._def,shape:()=>r})}keyof(){return Ve(k.objectKeys(this.shape))}};A.create=(t,e)=>new A({shape:()=>t,unknownKeys:"strip",catchall:N.create(),typeName:g.ZodObject,...b(e)});A.strictCreate=(t,e)=>new A({shape:()=>t,unknownKeys:"strict",catchall:N.create(),typeName:g.ZodObject,...b(e)});A.lazycreate=(t,e)=>new A({shape:t,unknownKeys:"strip",catchall:N.create(),typeName:g.ZodObject,...b(e)});var J=class extends v{_parse(e){let{ctx:r}=this._processInputParams(e),i=this._def.options;function s(o){for(let c of o)if(c.result.status==="valid")return c.result;for(let c of o)if(c.result.status==="dirty")return r.common.issues.push(...c.ctx.common.issues),c.result;let a=o.map(c=>new I(c.ctx.common.issues));return d(r,{code:l.invalid_union,unionErrors:a}),m}if(r.common.async)return Promise.all(i.map(async o=>{let a={...r,common:{...r.common,issues:[]},parent:null};return{result:await o._parseAsync({data:r.data,path:r.path,parent:a}),ctx:a}})).then(s);{let o,a=[];for(let p of i){let u={...r,common:{...r.common,issues:[]},parent:null},y=p._parseSync({data:r.data,path:r.path,parent:u});if(y.status==="valid")return y;y.status==="dirty"&&!o&&(o={result:y,ctx:u}),u.common.issues.length&&a.push(u.common.issues)}if(o)return r.common.issues.push(...o.ctx.common.issues),o.result;let c=a.map(p=>new I(p));return d(r,{code:l.invalid_union,unionErrors:c}),m}}get options(){return this._def.options}};J.create=(t,e)=>new J({options:t,typeName:g.ZodUnion,...b(e)});var $=t=>t instanceof ee?$(t.schema):t instanceof P?$(t.innerType()):t instanceof te?[t.value]:t instanceof re?t.options:t instanceof ne?k.objectValues(t.enum):t instanceof ie?$(t._def.innerType):t instanceof Y?[void 0]:t instanceof Z?[null]:t instanceof E?[void 0,...$(t.unwrap())]:t instanceof L?[null,...$(t.unwrap())]:t instanceof ge||t instanceof oe?$(t.unwrap()):t instanceof se?$(t._def.innerType):[],we=class t extends v{_parse(e){let{ctx:r}=this._processInputParams(e);if(r.parsedType!==h.object)return d(r,{code:l.invalid_type,expected:h.object,received:r.parsedType}),m;let i=this.discriminator,s=r.data[i],o=this.optionsMap.get(s);return o?r.common.async?o._parseAsync({data:r.data,path:r.path,parent:r}):o._parseSync({data:r.data,path:r.path,parent:r}):(d(r,{code:l.invalid_union_discriminator,options:Array.from(this.optionsMap.keys()),path:[i]}),m)}get discriminator(){return this._def.discriminator}get options(){return this._def.options}get optionsMap(){return this._def.optionsMap}static create(e,r,i){let s=new Map;for(let o of r){let a=$(o.shape[e]);if(!a.length)throw new Error(`A discriminator value for key \`${e}\` could not be extracted from all schema options`);for(let c of a){if(s.has(c))throw new Error(`Discriminator property ${String(e)} has duplicate value ${String(c)}`);s.set(c,o)}}return new t({typeName:g.ZodDiscriminatedUnion,discriminator:e,options:r,optionsMap:s,...b(i)})}};function Ce(t,e){let r=D(t),i=D(e);if(t===e)return{valid:!0,data:t};if(r===h.object&&i===h.object){let s=k.objectKeys(e),o=k.objectKeys(t).filter(c=>s.indexOf(c)!==-1),a={...t,...e};for(let c of o){let p=Ce(t[c],e[c]);if(!p.valid)return{valid:!1};a[c]=p.data}return{valid:!0,data:a}}else if(r===h.array&&i===h.array){if(t.length!==e.length)return{valid:!1};let s=[];for(let o=0;o<t.length;o++){let a=t[o],c=e[o],p=Ce(a,c);if(!p.valid)return{valid:!1};s.push(p.data)}return{valid:!0,data:s}}else return r===h.date&&i===h.date&&+t==+e?{valid:!0,data:t}:{valid:!1}}var Q=class extends v{_parse(e){let{status:r,ctx:i}=this._processInputParams(e),s=(o,a)=>{if(ke(o)||ke(a))return m;let c=Ce(o.value,a.value);return c.valid?((_e(o)||_e(a))&&r.dirty(),{status:r.value,value:c.data}):(d(i,{code:l.invalid_intersection_types}),m)};return i.common.async?Promise.all([this._def.left._parseAsync({data:i.data,path:i.path,parent:i}),this._def.right._parseAsync({data:i.data,path:i.path,parent:i})]).then(([o,a])=>s(o,a)):s(this._def.left._parseSync({data:i.data,path:i.path,parent:i}),this._def.right._parseSync({data:i.data,path:i.path,parent:i}))}};Q.create=(t,e,r)=>new Q({left:t,right:e,typeName:g.ZodIntersection,...b(r)});var M=class t extends v{_parse(e){let{status:r,ctx:i}=this._processInputParams(e);if(i.parsedType!==h.array)return d(i,{code:l.invalid_type,expected:h.array,received:i.parsedType}),m;if(i.data.length<this._def.items.length)return d(i,{code:l.too_small,minimum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),m;!this._def.rest&&i.data.length>this._def.items.length&&(d(i,{code:l.too_big,maximum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),r.dirty());let o=[...i.data].map((a,c)=>{let p=this._def.items[c]||this._def.rest;return p?p._parse(new C(i,a,i.path,c)):null}).filter(a=>!!a);return i.common.async?Promise.all(o).then(a=>x.mergeArray(r,a)):x.mergeArray(r,o)}get items(){return this._def.items}rest(e){return new t({...this._def,rest:e})}};M.create=(t,e)=>{if(!Array.isArray(t))throw new Error("You must pass an array of schemas to z.tuple([ ... ])");return new M({items:t,typeName:g.ZodTuple,rest:null,...b(e)})};var xe=class t extends v{get keySchema(){return this._def.keyType}get valueSchema(){return this._def.valueType}_parse(e){let{status:r,ctx:i}=this._processInputParams(e);if(i.parsedType!==h.object)return d(i,{code:l.invalid_type,expected:h.object,received:i.parsedType}),m;let s=[],o=this._def.keyType,a=this._def.valueType;for(let c in i.data)s.push({key:o._parse(new C(i,c,i.path,c)),value:a._parse(new C(i,i.data[c],i.path,c)),alwaysSet:c in i.data});return i.common.async?x.mergeObjectAsync(r,s):x.mergeObjectSync(r,s)}get element(){return this._def.valueType}static create(e,r,i){return r instanceof v?new t({keyType:e,valueType:r,typeName:g.ZodRecord,...b(i)}):new t({keyType:W.create(),valueType:e,typeName:g.ZodRecord,...b(r)})}},pe=class extends v{get keySchema(){return this._def.keyType}get valueSchema(){return this._def.valueType}_parse(e){let{status:r,ctx:i}=this._processInputParams(e);if(i.parsedType!==h.map)return d(i,{code:l.invalid_type,expected:h.map,received:i.parsedType}),m;let s=this._def.keyType,o=this._def.valueType,a=[...i.data.entries()].map(([c,p],u)=>({key:s._parse(new C(i,c,i.path,[u,"key"])),value:o._parse(new C(i,p,i.path,[u,"value"]))}));if(i.common.async){let c=new Map;return Promise.resolve().then(async()=>{for(let p of a){let u=await p.key,y=await p.value;if(u.status==="aborted"||y.status==="aborted")return m;(u.status==="dirty"||y.status==="dirty")&&r.dirty(),c.set(u.value,y.value)}return{status:r.value,value:c}})}else{let c=new Map;for(let p of a){let u=p.key,y=p.value;if(u.status==="aborted"||y.status==="aborted")return m;(u.status==="dirty"||y.status==="dirty")&&r.dirty(),c.set(u.value,y.value)}return{status:r.value,value:c}}}};pe.create=(t,e,r)=>new pe({valueType:e,keyType:t,typeName:g.ZodMap,...b(r)});var he=class t extends v{_parse(e){let{status:r,ctx:i}=this._processInputParams(e);if(i.parsedType!==h.set)return d(i,{code:l.invalid_type,expected:h.set,received:i.parsedType}),m;let s=this._def;s.minSize!==null&&i.data.size<s.minSize.value&&(d(i,{code:l.too_small,minimum:s.minSize.value,type:"set",inclusive:!0,exact:!1,message:s.minSize.message}),r.dirty()),s.maxSize!==null&&i.data.size>s.maxSize.value&&(d(i,{code:l.too_big,maximum:s.maxSize.value,type:"set",inclusive:!0,exact:!1,message:s.maxSize.message}),r.dirty());let o=this._def.valueType;function a(p){let u=new Set;for(let y of p){if(y.status==="aborted")return m;y.status==="dirty"&&r.dirty(),u.add(y.value)}return{status:r.value,value:u}}let c=[...i.data.values()].map((p,u)=>o._parse(new C(i,p,i.path,u)));return i.common.async?Promise.all(c).then(p=>a(p)):a(c)}min(e,r){return new t({...this._def,minSize:{value:e,message:f.toString(r)}})}max(e,r){return new t({...this._def,maxSize:{value:e,message:f.toString(r)}})}size(e,r){return this.min(e,r).max(e,r)}nonempty(e){return this.min(1,e)}};he.create=(t,e)=>new he({valueType:t,minSize:null,maxSize:null,typeName:g.ZodSet,...b(e)});var Se=class t extends v{constructor(){super(...arguments),this.validate=this.implement}_parse(e){let{ctx:r}=this._processInputParams(e);if(r.parsedType!==h.function)return d(r,{code:l.invalid_type,expected:h.function,received:r.parsedType}),m;function i(c,p){return me({data:c,path:r.path,errorMaps:[r.common.contextualErrorMap,r.schemaErrorMap,ae(),F].filter(u=>!!u),issueData:{code:l.invalid_arguments,argumentsError:p}})}function s(c,p){return me({data:c,path:r.path,errorMaps:[r.common.contextualErrorMap,r.schemaErrorMap,ae(),F].filter(u=>!!u),issueData:{code:l.invalid_return_type,returnTypeError:p}})}let o={errorMap:r.common.contextualErrorMap},a=r.data;if(this._def.returns instanceof z){let c=this;return S(async function(...p){let u=new I([]),y=await c._def.args.parseAsync(p,o).catch(O=>{throw u.addIssue(i(p,O)),u}),_=await Reflect.apply(a,this,y);return await c._def.returns._def.type.parseAsync(_,o).catch(O=>{throw u.addIssue(s(_,O)),u})})}else{let c=this;return S(function(...p){let u=c._def.args.safeParse(p,o);if(!u.success)throw new I([i(p,u.error)]);let y=Reflect.apply(a,this,u.data),_=c._def.returns.safeParse(y,o);if(!_.success)throw new I([s(y,_.error)]);return _.data})}}parameters(){return this._def.args}returnType(){return this._def.returns}args(...e){return new t({...this._def,args:M.create(e).rest(j.create())})}returns(e){return new t({...this._def,returns:e})}implement(e){return this.parse(e)}strictImplement(e){return this.parse(e)}static create(e,r,i){return new t({args:e||M.create([]).rest(j.create()),returns:r||j.create(),typeName:g.ZodFunction,...b(i)})}},ee=class extends v{get schema(){return this._def.getter()}_parse(e){let{ctx:r}=this._processInputParams(e);return this._def.getter()._parse({data:r.data,path:r.path,parent:r})}};ee.create=(t,e)=>new ee({getter:t,typeName:g.ZodLazy,...b(e)});var te=class extends v{_parse(e){if(e.data!==this._def.value){let r=this._getOrReturnCtx(e);return d(r,{received:r.data,code:l.invalid_literal,expected:this._def.value}),m}return{status:"valid",value:e.data}}get value(){return this._def.value}};te.create=(t,e)=>new te({value:t,typeName:g.ZodLiteral,...b(e)});function Ve(t,e){return new re({values:t,typeName:g.ZodEnum,...b(e)})}var re=class t extends v{_parse(e){if(typeof e.data!="string"){let r=this._getOrReturnCtx(e),i=this._def.values;return d(r,{expected:k.joinValues(i),received:r.parsedType,code:l.invalid_type}),m}if(this._cache||(this._cache=new Set(this._def.values)),!this._cache.has(e.data)){let r=this._getOrReturnCtx(e),i=this._def.values;return d(r,{received:r.data,code:l.invalid_enum_value,options:i}),m}return S(e.data)}get options(){return this._def.values}get enum(){let e={};for(let r of this._def.values)e[r]=r;return e}get Values(){let e={};for(let r of this._def.values)e[r]=r;return e}get Enum(){let e={};for(let r of this._def.values)e[r]=r;return e}extract(e,r=this._def){return t.create(e,{...this._def,...r})}exclude(e,r=this._def){return t.create(this.options.filter(i=>!e.includes(i)),{...this._def,...r})}};re.create=Ve;var ne=class extends v{_parse(e){let r=k.getValidEnumValues(this._def.values),i=this._getOrReturnCtx(e);if(i.parsedType!==h.string&&i.parsedType!==h.number){let s=k.objectValues(r);return d(i,{expected:k.joinValues(s),received:i.parsedType,code:l.invalid_type}),m}if(this._cache||(this._cache=new Set(k.getValidEnumValues(this._def.values))),!this._cache.has(e.data)){let s=k.objectValues(r);return d(i,{received:i.data,code:l.invalid_enum_value,options:s}),m}return S(e.data)}get enum(){return this._def.values}};ne.create=(t,e)=>new ne({values:t,typeName:g.ZodNativeEnum,...b(e)});var z=class extends v{unwrap(){return this._def.type}_parse(e){let{ctx:r}=this._processInputParams(e);if(r.parsedType!==h.promise&&r.common.async===!1)return d(r,{code:l.invalid_type,expected:h.promise,received:r.parsedType}),m;let i=r.parsedType===h.promise?r.data:Promise.resolve(r.data);return S(i.then(s=>this._def.type.parseAsync(s,{path:r.path,errorMap:r.common.contextualErrorMap})))}};z.create=(t,e)=>new z({type:t,typeName:g.ZodPromise,...b(e)});var P=class extends v{innerType(){return this._def.schema}sourceType(){return this._def.schema._def.typeName===g.ZodEffects?this._def.schema.sourceType():this._def.schema}_parse(e){let{status:r,ctx:i}=this._processInputParams(e),s=this._def.effect||null,o={addIssue:a=>{d(i,a),a.fatal?r.abort():r.dirty()},get path(){return i.path}};if(o.addIssue=o.addIssue.bind(o),s.type==="preprocess"){let a=s.transform(i.data,o);if(i.common.async)return Promise.resolve(a).then(async c=>{if(r.value==="aborted")return m;let p=await this._def.schema._parseAsync({data:c,path:i.path,parent:i});return p.status==="aborted"?m:p.status==="dirty"?V(p.value):r.value==="dirty"?V(p.value):p});{if(r.value==="aborted")return m;let c=this._def.schema._parseSync({data:a,path:i.path,parent:i});return c.status==="aborted"?m:c.status==="dirty"?V(c.value):r.value==="dirty"?V(c.value):c}}if(s.type==="refinement"){let a=c=>{let p=s.refinement(c,o);if(i.common.async)return Promise.resolve(p);if(p instanceof Promise)throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");return c};if(i.common.async===!1){let c=this._def.schema._parseSync({data:i.data,path:i.path,parent:i});return c.status==="aborted"?m:(c.status==="dirty"&&r.dirty(),a(c.value),{status:r.value,value:c.value})}else return this._def.schema._parseAsync({data:i.data,path:i.path,parent:i}).then(c=>c.status==="aborted"?m:(c.status==="dirty"&&r.dirty(),a(c.value).then(()=>({status:r.value,value:c.value}))))}if(s.type==="transform")if(i.common.async===!1){let a=this._def.schema._parseSync({data:i.data,path:i.path,parent:i});if(!q(a))return m;let c=s.transform(a.value,o);if(c instanceof Promise)throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");return{status:r.value,value:c}}else return this._def.schema._parseAsync({data:i.data,path:i.path,parent:i}).then(a=>q(a)?Promise.resolve(s.transform(a.value,o)).then(c=>({status:r.value,value:c})):m);k.assertNever(s)}};P.create=(t,e,r)=>new P({schema:t,typeName:g.ZodEffects,effect:e,...b(r)});P.createWithPreprocess=(t,e,r)=>new P({schema:e,effect:{type:"preprocess",transform:t},typeName:g.ZodEffects,...b(r)});var E=class extends v{_parse(e){return this._getType(e)===h.undefined?S(void 0):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}};E.create=(t,e)=>new E({innerType:t,typeName:g.ZodOptional,...b(e)});var L=class extends v{_parse(e){return this._getType(e)===h.null?S(null):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}};L.create=(t,e)=>new L({innerType:t,typeName:g.ZodNullable,...b(e)});var ie=class extends v{_parse(e){let{ctx:r}=this._processInputParams(e),i=r.data;return r.parsedType===h.undefined&&(i=this._def.defaultValue()),this._def.innerType._parse({data:i,path:r.path,parent:r})}removeDefault(){return this._def.innerType}};ie.create=(t,e)=>new ie({innerType:t,typeName:g.ZodDefault,defaultValue:typeof e.default=="function"?e.default:()=>e.default,...b(e)});var se=class extends v{_parse(e){let{ctx:r}=this._processInputParams(e),i={...r,common:{...r.common,issues:[]}},s=this._def.innerType._parse({data:i.data,path:i.path,parent:{...i}});return ce(s)?s.then(o=>({status:"valid",value:o.status==="valid"?o.value:this._def.catchValue({get error(){return new I(i.common.issues)},input:i.data})})):{status:"valid",value:s.status==="valid"?s.value:this._def.catchValue({get error(){return new I(i.common.issues)},input:i.data})}}removeCatch(){return this._def.innerType}};se.create=(t,e)=>new se({innerType:t,typeName:g.ZodCatch,catchValue:typeof e.catch=="function"?e.catch:()=>e.catch,...b(e)});var fe=class extends v{_parse(e){if(this._getType(e)!==h.nan){let i=this._getOrReturnCtx(e);return d(i,{code:l.invalid_type,expected:h.nan,received:i.parsedType}),m}return{status:"valid",value:e.data}}};fe.create=t=>new fe({typeName:g.ZodNaN,...b(t)});var Mt=Symbol("zod_brand"),ge=class extends v{_parse(e){let{ctx:r}=this._processInputParams(e),i=r.data;return this._def.type._parse({data:i,path:r.path,parent:r})}unwrap(){return this._def.type}},ye=class t extends v{_parse(e){let{status:r,ctx:i}=this._processInputParams(e);if(i.common.async)return(async()=>{let o=await this._def.in._parseAsync({data:i.data,path:i.path,parent:i});return o.status==="aborted"?m:o.status==="dirty"?(r.dirty(),V(o.value)):this._def.out._parseAsync({data:o.value,path:i.path,parent:i})})();{let s=this._def.in._parseSync({data:i.data,path:i.path,parent:i});return s.status==="aborted"?m:s.status==="dirty"?(r.dirty(),{status:"dirty",value:s.value}):this._def.out._parseSync({data:s.value,path:i.path,parent:i})}}static create(e,r){return new t({in:e,out:r,typeName:g.ZodPipeline})}},oe=class extends v{_parse(e){let r=this._def.innerType._parse(e),i=s=>(q(s)&&(s.value=Object.freeze(s.value)),s);return ce(r)?r.then(s=>i(s)):i(r)}unwrap(){return this._def.innerType}};oe.create=(t,e)=>new oe({innerType:t,typeName:g.ZodReadonly,...b(e)});function qe(t,e){let r=typeof t=="function"?t(e):typeof t=="string"?{message:t}:t;return typeof r=="string"?{message:r}:r}function He(t,e={},r){return t?U.create().superRefine((i,s)=>{let o=t(i);if(o instanceof Promise)return o.then(a=>{if(!a){let c=qe(e,i),p=c.fatal??r??!0;s.addIssue({code:"custom",...c,fatal:p})}});if(!o){let a=qe(e,i),c=a.fatal??r??!0;s.addIssue({code:"custom",...a,fatal:c})}}):U.create()}var Lt={object:A.lazycreate},g;(function(t){t.ZodString="ZodString",t.ZodNumber="ZodNumber",t.ZodNaN="ZodNaN",t.ZodBigInt="ZodBigInt",t.ZodBoolean="ZodBoolean",t.ZodDate="ZodDate",t.ZodSymbol="ZodSymbol",t.ZodUndefined="ZodUndefined",t.ZodNull="ZodNull",t.ZodAny="ZodAny",t.ZodUnknown="ZodUnknown",t.ZodNever="ZodNever",t.ZodVoid="ZodVoid",t.ZodArray="ZodArray",t.ZodObject="ZodObject",t.ZodUnion="ZodUnion",t.ZodDiscriminatedUnion="ZodDiscriminatedUnion",t.ZodIntersection="ZodIntersection",t.ZodTuple="ZodTuple",t.ZodRecord="ZodRecord",t.ZodMap="ZodMap",t.ZodSet="ZodSet",t.ZodFunction="ZodFunction",t.ZodLazy="ZodLazy",t.ZodLiteral="ZodLiteral",t.ZodEnum="ZodEnum",t.ZodEffects="ZodEffects",t.ZodNativeEnum="ZodNativeEnum",t.ZodOptional="ZodOptional",t.ZodNullable="ZodNullable",t.ZodDefault="ZodDefault",t.ZodCatch="ZodCatch",t.ZodPromise="ZodPromise",t.ZodBranded="ZodBranded",t.ZodPipeline="ZodPipeline",t.ZodReadonly="ZodReadonly"})(g||(g={}));var Ft=(t,e={message:`Input not instance of ${t.name}`})=>He(r=>r instanceof t,e),Ge=W.create,Ke=H.create,$t=fe.create,jt=G.create,Xe=K.create,Bt=X.create,qt=de.create,Wt=Y.create,Ut=Z.create,zt=U.create,Vt=j.create,Ht=N.create,Gt=ue.create,Kt=B.create,Xt=A.create,Yt=A.strictCreate,Zt=J.create,Jt=we.create,Qt=Q.create,er=M.create,tr=xe.create,rr=pe.create,nr=he.create,ir=Se.create,sr=ee.create,or=te.create,ar=re.create,cr=ne.create,lr=z.create,dr=P.create,ur=E.create,pr=L.create,hr=P.createWithPreprocess,fr=ye.create,mr=()=>Ge().optional(),gr=()=>Ke().optional(),yr=()=>Xe().optional(),br={string:(t=>W.create({...t,coerce:!0})),number:(t=>H.create({...t,coerce:!0})),boolean:(t=>K.create({...t,coerce:!0})),bigint:(t=>G.create({...t,coerce:!0})),date:(t=>X.create({...t,coerce:!0}))};var vr=m;var _n={maxDepth:8,maxObjectKeys:100,maxArrayLength:500,maxStringLength:16*1024,maxSerializedBytes:256*1024};var wn={maxFacts:24,maxRecentChatMessages:16,maxRecentMessageChars:4e3,maxFactStringChars:16e3,maxSkillIds:12,maxStoredBytes:128*1024};var xn={maxFacts:32,maxRecentChatMessages:24,maxRecentChatMessageChars:6e3,maxRecentMessageEvents:32,maxRecentMessageEventChars:4e3,maxFactStringChars:32e3,maxIntentValues:24,maxSkillIds:12,maxSupersessionRefs:8,maxStoredBytes:256*1024,maxDeviceRetentionMs:10080*60*1e3};var Sn=["html { box-sizing: border-box; font-size: 62.5%; line-height: 1.15; -webkit-text-size-adjust: 100%; text-size-adjust: auto; }","*, *::before, *::after { box-sizing: border-box; }","body { margin: 0; }","h1, h2, h3, h4, h5, h6 { margin: 0; text-rendering: optimizeLegibility; }","img { height: auto; max-width: 100%; outline: none; vertical-align: middle; }","button, input, optgroup, select, textarea { font-family: inherit; text-align: inherit; }","button { border: none; cursor: pointer; outline: none; padding: 0; }","a { color: currentColor; }"].join(`
`);var kr=[{id:"editorial-monocle",label:"Editorial \u2014 Monocle / FT magazine",mood:"Print-magazine feel for explicitly editorial or publishing briefs. Generous whitespace, large serif headlines, restrained palette of neutral paper + ink + a single brand-justified accent. Do not use this as the default for commerce, SaaS, dashboards, or product utilities.",references:["Monocle","The Financial Times Weekend","NYT Magazine","It's Nice That"],displayFont:"'Iowan Old Style', 'Charter', Georgia, serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",palette:{bg:"oklch(98% 0.004 95)",surface:"oklch(100% 0.002 95)",fg:"oklch(20% 0.018 70)",muted:"oklch(48% 0.012 70)",border:"oklch(90% 0.006 95)",accent:"oklch(52% 0.10 28)"},posture:["serif display, sans body, mono for metadata only","no shadows, no rounded cards \u2014 borders + whitespace do the work","one decisive image, cropped only at the bottom","kicker / eyebrow in mono uppercase, one accent color, used at most twice; never create peach/pink/orange-beige page washes unless the brand/reference requires them"]},{id:"modern-minimal",label:"Modern minimal \u2014 Linear / Vercel",mood:"Quiet, precise, software-native. System fonts, crisp neutral foundations, and a small but visible product palette (primary + secondary + status/accent) so the interface feels shipped rather than greyscale. The chrome stays restrained while interaction states, illustrations, charts, and product moments carry color.",references:["Linear","Vercel","Notion 2024","Stripe docs"],displayFont:"-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",palette:{bg:"oklch(99% 0.002 240)",surface:"oklch(100% 0 0)",fg:"oklch(18% 0.012 250)",muted:"oklch(54% 0.012 250)",border:"oklch(92% 0.005 250)",accent:"oklch(58% 0.18 255)"},posture:["tight letter-spacing on display sizes (-0.02em)","hairline borders only, no shadows except dropdowns/modals","mono numerics with `font-variant-numeric: tabular-nums`","sticky frosted nav, content-led layouts with one product illustration, device mockup, or data visualization when it clarifies the product","controlled color system: primary action color + one secondary signal + status colors; avoid monochrome/unstyled outputs, but never flood every card with gradients"]},{id:"human-approachable",label:"Human / approachable \u2014 Airbnb / Duolingo systems",mood:"Friendly and tactile without the generic cozy canvas. Uses a clean neutral background, product-led color system, generous radii, and clear hierarchy. Good for consumer tools, marketplaces, wellness, education, translation, AI assistants, and indie SaaS when the brand has not supplied a palette.",references:["Airbnb","Duolingo product surfaces","Miro","Mercury"],displayFont:"'S\xF6hne', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",palette:{bg:"oklch(98% 0.004 240)",surface:"oklch(100% 0 0)",fg:"oklch(20% 0.02 240)",muted:"oklch(50% 0.018 240)",border:"oklch(90% 0.006 240)",accent:"oklch(56% 0.12 170)"},posture:["sans display with strong weight contrast, system body for readability","comfortable radii (12\u201318px) paired with crisp grid alignment","primary action color plus a secondary/domain accent and clear status colors; use color to separate panels, states, and product moments","subtle elevation only on interactive cards; tasteful gradients/glows are allowed for hero/device/product moments, never as a full-page beige/pastel wash","avoid generic pastel/beige gradients; use real product screenshots, data, or labelled placeholders"]},{id:"tech-utility",label:"Tech / utility \u2014 Datadog / GitHub",mood:"Data-dense, monospace-friendly, dark or light + grid. Made for engineers and operators who want information per square inch, not vibes.",references:["Datadog","GitHub","Cloudflare dashboard","Sentry"],displayFont:"-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",bodyFont:"-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",monoFont:"'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",palette:{bg:"oklch(98% 0.005 250)",surface:"oklch(100% 0 0)",fg:"oklch(22% 0.02 240)",muted:"oklch(50% 0.018 240)",border:"oklch(90% 0.008 240)",accent:"oklch(58% 0.16 145)"},posture:["sans display + sans body (one family) is OK here \u2014 utility trumps editorial","tabular numerics everywhere, mono for code / IDs / hashes","dense tables with hairline borders, no row striping","inline status pills (success / warn / danger) with restrained tinted backgrounds","avoid: hero images, oversized headlines, marketing copy \u2014 show the product instead"]},{id:"brutalist-experimental",label:"Brutalist / experimental \u2014 Are.na / Yale",mood:"Loud type. Visible grid. System sans + a single oversized serif. Deliberate ugliness as confidence. Great for art, indie, agency, manifesto pages.",references:["Are.na","Yale Center for British Art","mschf","Read.cv"],displayFont:"'Times New Roman', 'Iowan Old Style', Georgia, serif",bodyFont:"ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",palette:{bg:"oklch(98% 0.004 240)",surface:"oklch(100% 0 0)",fg:"oklch(15% 0.02 100)",muted:"oklch(40% 0.02 100)",border:"oklch(15% 0.02 100)",accent:"oklch(60% 0.22 25)"},posture:["display = serif at extreme sizes (clamp(80px, 12vw, 200px))","body = monospace \u2014 yes, monospace as body, deliberately","borders are full-strength fg (1.5\u20132px), not muted greys","asymmetric layouts: one column 70%, the other 30%","almost no border-radius (0\u20132px). No shadows. No gradients.","underline links, no hover decoration \u2014 let the typography carry it"]}];function _r(){let t=["## Direction library \u2014 bind into `:root` when the user picks one","","Each direction below carries a CSS-ready palette (OKLch values) and font stacks. When the user selects one in the direction-form, replace the seed template's `:root` block with that direction's palette and font stacks **verbatim** \u2014 do not improvise. Posture cues describe how that direction *behaves* (border weight, radius, accent budget); honour them in the layout choices.",""];for(let e of kr){t.push(`### ${e.label}  \`(id: ${e.id})\``),t.push(""),t.push(`**Mood:** ${e.mood}`),t.push(""),t.push(`**References:** ${e.references.join(", ")}.`),t.push(""),t.push("**Palette (drop into `:root`):**"),t.push(""),t.push("```css"),t.push(":root {"),t.push(`  --bg:      ${e.palette.bg};`),t.push(`  --surface: ${e.palette.surface};`),t.push(`  --fg:      ${e.palette.fg};`),t.push(`  --muted:   ${e.palette.muted};`),t.push(`  --border:  ${e.palette.border};`),t.push(`  --accent:  ${e.palette.accent};`),t.push(""),t.push(`  --font-display: ${e.displayFont};`),t.push(`  --font-body:    ${e.bodyFont};`),e.monoFont&&t.push(`  --font-mono:    ${e.monoFont};`),t.push("}"),t.push("```"),t.push(""),t.push("**Posture:**");for(let r of e.posture)t.push(`- ${r}`);t.push("")}return t.join(`
`)}var Tn=`# OD core directives (read first \u2014 these override anything later in this prompt)

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

${_r()}

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
`,wr=`<!doctype html>
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
</html>`,In=`# Slide deck \u2014 fixed framework (this is non-negotiable for deck mode)

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
${wr}
\`\`\`

When the brief is "make me a deck", your output is this skeleton with theme tokens tuned, per-deck classes added, and \`<section class="slide">\` blocks filled in \u2014 nothing more, nothing less. Skill-specific guidance (typography, theme presets, layout vocabulary) layers *on top of* this framework, not in place of it.
`;var Ze=["designer","critic","brand","a11y","copy"],xr=["ship_best","ship_last","fail"];var Sr=n.object({designer:n.number().min(0).max(1),critic:n.number().min(0).max(1),brand:n.number().min(0).max(1),a11y:n.number().min(0).max(1),copy:n.number().min(0).max(1)}),En=n.object({enabled:n.boolean(),cast:n.array(n.enum(Ze)).min(1),maxRounds:n.number().int().min(1).max(10),scoreScale:n.number().int().min(1).max(100),scoreThreshold:n.number().min(0).max(100).describe("Must be <= scoreScale; enforced by cross-field refine"),weights:Sr,perRoundTimeoutMs:n.number().int().min(1e3),totalTimeoutMs:n.number().int().min(1e3),parserMaxBlockBytes:n.number().int().min(1024),fallbackPolicy:n.enum(xr),protocolVersion:n.number().int().min(1),maxConcurrentRuns:n.number().int().min(1)}).refine(t=>t.scoreThreshold<=t.scoreScale+1e-9,{message:"scoreThreshold must be <= scoreScale"});var Tr=["malformed_block","oversize_block","adapter_unsupported","protocol_version_mismatch","missing_artifact"],Ir=["cli_exit_nonzero","per_round_timeout","total_timeout","orchestrator_internal"],Ar=["weak_debate","unknown_role","score_clamped","composite_mismatch","duplicate_ship"],Er=["continue","ship"],Cr=["shipped","below_threshold","timed_out","interrupted"],Pr=["run_started","panelist_open","panelist_dim","panelist_must_fix","panelist_close","round_end","ship","degraded","interrupted","failed","parser_warning"],Cn=new Set(Pr),Pn=new Set(Ze),On=new Set(Cr),Rn=new Set(Tr),Nn=new Set(Ir),Dn=new Set(Ar),Mn=new Set(Er);var Or="1.0.0",Je=n.string().min(1),Pe=n.object({ref:n.string().optional(),path:n.string().optional()}).passthrough(),Ye=n.object({path:n.string().min(1)}).passthrough(),Oe=n.object({name:n.string().min(1),command:n.string().optional(),args:n.array(n.string()).optional(),env:n.record(n.string()).optional(),url:n.string().optional()}).passthrough(),Qe=n.object({name:n.string().min(1),label:n.string().optional(),type:n.enum(["string","text","select","number","boolean","file"]).optional(),required:n.boolean().optional(),options:n.array(n.string()).optional(),placeholder:n.string().optional(),default:n.unknown().optional()}).passthrough(),be=n.record(n.string()).refine(t=>Object.keys(t).length>0,{message:"Localized text must include at least one locale."});var Rr=n.object({id:n.string().min(1),atoms:n.array(n.string()),repeat:n.boolean().optional(),until:n.string().optional(),onFailure:n.enum(["abort","skip","retry"]).optional()}).passthrough(),Re=n.object({stages:n.array(Rr)}).passthrough(),Ne=n.object({id:n.string().min(1),kind:n.enum(["form","choice","confirmation","oauth-prompt"]),persist:n.enum(["run","conversation","project"]),trigger:n.object({stageId:n.string().optional(),atom:n.string().optional()}).passthrough().optional(),schema:n.record(n.unknown()).optional(),prompt:n.string().optional(),capabilitiesRequired:n.array(n.string()).optional(),timeout:n.number().int().positive().optional(),onTimeout:n.enum(["abort","default","skip"]).optional(),default:n.unknown().optional(),oauth:n.object({route:n.enum(["connector","mcp","plugin"]),connectorId:n.string().optional(),mcpServerId:n.string().optional()}).passthrough().optional(),component:n.object({path:n.string().min(1),export:n.string().optional(),sandbox:n.enum(["iframe","react"]).optional()}).passthrough().optional()}).passthrough(),Te=n.object({id:n.string().min(1),tools:n.array(n.string()).default([]),required:n.boolean().optional()}).passthrough(),Nr=n.object({$schema:n.string().optional(),specVersion:Je.optional(),name:n.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),title:n.string().optional(),title_i18n:be.optional(),version:n.string().min(1),description:n.string().optional(),description_i18n:be.optional(),author:n.object({name:n.string().optional(),url:n.string().optional()}).passthrough().optional(),license:n.string().optional(),homepage:n.string().optional(),icon:n.string().optional(),tags:n.array(n.string()).optional(),compat:n.object({agentSkills:n.array(Ye).optional(),claudePlugins:n.array(Ye).optional()}).passthrough().optional(),od:n.object({kind:n.enum(["skill","scenario","atom","bundle"]).optional(),taskKind:n.enum(["new-generation","code-migration","figma-migration","tune-collab"]).optional(),mode:n.string().optional(),platform:n.string().optional(),scenario:n.string().optional(),engineRequirements:n.object({od:n.string().optional()}).passthrough().optional(),preview:n.object({type:n.string().optional(),entry:n.string().optional(),poster:n.string().optional(),video:n.string().optional(),gif:n.string().optional(),motion:n.enum(["scroll","deck","static"]).optional()}).passthrough().optional(),useCase:n.object({query:n.union([n.string(),be]).optional(),exampleOutputs:n.array(n.object({path:n.string(),title:n.string().optional()}).passthrough()).optional()}).passthrough().optional(),context:n.object({skills:n.array(Pe).optional(),designSystem:n.union([Pe,n.object({ref:n.string().optional(),primary:n.boolean().optional()}).passthrough()]).optional(),craft:n.array(n.string()).optional(),assets:n.array(n.string()).optional(),claudePlugins:n.array(Pe).optional(),mcp:n.array(Oe).optional(),atoms:n.array(n.string()).optional()}).passthrough().optional(),pipeline:Re.optional(),genui:n.object({surfaces:n.array(Ne).optional()}).passthrough().optional(),connectors:n.object({required:n.array(Te).optional(),optional:n.array(Te).optional()}).passthrough().optional(),inputs:n.array(Qe).optional(),capabilities:n.array(n.string()).optional()}).passthrough().optional()}).passthrough(),et=n.discriminatedUnion("kind",[n.object({kind:n.literal("skill"),id:n.string(),label:n.string()}),n.object({kind:n.literal("design-system"),id:n.string(),label:n.string(),primary:n.boolean().optional()}),n.object({kind:n.literal("craft"),id:n.string(),label:n.string()}),n.object({kind:n.literal("asset"),path:n.string(),label:n.string(),mime:n.string().optional()}),n.object({kind:n.literal("mcp"),name:n.string(),label:n.string(),command:n.string().optional()}),n.object({kind:n.literal("claude-plugin"),id:n.string(),label:n.string()}),n.object({kind:n.literal("atom"),id:n.string(),label:n.string()}),n.object({kind:n.literal("plugin"),id:n.string(),label:n.string()})]),Dr=n.object({items:n.array(et),promptFragments:n.record(n.string(),n.string()).optional(),atoms:n.array(n.string()).optional()}),tt=n.object({path:n.string(),src:n.string(),mime:n.string().optional(),stageAt:n.enum(["project-create","run-start"]).default("run-start")}),Mr=Qe,Lr=Te.extend({accountLabel:n.string().optional(),status:n.enum(["connected","pending","unavailable"])}),Fr=n.object({snapshotId:n.string(),pluginId:n.string(),pluginSpecVersion:n.string().optional(),pluginVersion:n.string(),manifestSourceDigest:n.string(),sourceMarketplaceId:n.string().optional(),sourceMarketplaceEntryName:n.string().optional(),sourceMarketplaceEntryVersion:n.string().optional(),marketplaceTrust:n.enum(["official","trusted","restricted"]).optional(),resolvedSource:n.string().optional(),resolvedRef:n.string().optional(),archiveIntegrity:n.string().optional(),pinnedRef:n.string().optional(),inputs:n.record(n.union([n.string(),n.number(),n.boolean()])),resolvedContext:Dr,craftRequires:n.array(n.string()).optional(),capabilitiesGranted:n.array(n.string()),capabilitiesRequired:n.array(n.string()),assetsStaged:n.array(tt),taskKind:n.enum(["new-generation","code-migration","figma-migration","tune-collab"]),appliedAt:n.number(),connectorsRequired:n.array(Te),connectorsResolved:n.array(Lr),mcpServers:n.array(Oe),pipeline:Re.optional(),genuiSurfaces:n.array(Ne).optional(),pluginTitle:n.string().optional(),pluginDescription:n.string().optional(),query:n.string().optional(),status:n.enum(["fresh","stale"]).default("fresh")}),$r=n.object({name:n.string().optional(),skillId:n.string().optional(),designSystemId:n.string().optional(),craftRequires:n.array(n.string()).optional(),taskKind:n.enum(["new-generation","code-migration","figma-migration","tune-collab"]).optional()}).passthrough(),jn=n.object({query:n.string(),contextItems:n.array(et),inputs:n.array(Mr),assets:n.array(tt),mcpServers:n.array(Oe),pipeline:Re.optional(),genuiSurfaces:n.array(Ne).optional(),projectMetadata:$r,trust:n.enum(["trusted","restricted"]),capabilitiesGranted:n.array(n.string()),capabilitiesRequired:n.array(n.string()),appliedPlugin:Fr}),rt=n.object({type:n.string().optional(),archive:n.string().optional(),integrity:n.string().optional(),manifestDigest:n.string().optional()}).passthrough(),jr=n.object({version:n.string().min(1),source:n.string().min(1).optional(),ref:n.string().optional(),dist:rt.optional(),integrity:n.string().optional(),manifestDigest:n.string().optional(),deprecated:n.union([n.boolean(),n.string()]).optional(),yanked:n.boolean().optional(),yankedAt:n.string().optional(),yankReason:n.string().optional()}).passthrough(),Br=n.object({name:n.string().min(1),source:n.string().min(1),version:n.string().min(1),ref:n.string().optional(),dist:rt.optional(),versions:n.array(jr).optional(),distTags:n.record(n.string()).optional(),integrity:n.string().optional(),manifestDigest:n.string().optional(),publisher:n.object({id:n.string().optional(),github:n.string().optional(),url:n.string().optional()}).passthrough().optional(),homepage:n.string().optional(),license:n.string().optional(),capabilitiesSummary:n.array(n.string()).optional(),deprecated:n.union([n.boolean(),n.string()]).optional(),yanked:n.boolean().optional(),yankedAt:n.string().optional(),yankReason:n.string().optional(),tags:n.array(n.string()).optional(),title:n.string().optional(),title_i18n:be.optional(),description:n.string().optional(),description_i18n:be.optional(),icon:n.string().optional()}).passthrough(),qn=n.object({$schema:n.string().optional(),specVersion:Je.default(Or),name:n.string().min(1),version:n.string().min(1),owner:n.object({name:n.string().optional(),url:n.string().optional()}).passthrough().optional(),metadata:n.object({description:n.string().optional(),version:n.string().optional()}).passthrough().optional(),plugins:n.array(Br)}).passthrough(),qr=n.enum(["bundled","trusted","restricted"]),Wr=n.enum(["official","trusted","restricted"]),Ur=n.enum(["bundled","user","project","marketplace","github","url","local"]),nt=n.object({id:n.string().min(1),pixflowDestination:n.enum(["bricks","media"]).optional(),title:n.string(),version:n.string(),sourceKind:Ur,source:n.string(),pinnedRef:n.string().optional(),sourceDigest:n.string().optional(),sourceMarketplaceId:n.string().optional(),sourceMarketplaceEntryName:n.string().optional(),sourceMarketplaceEntryVersion:n.string().optional(),marketplaceTrust:Wr.optional(),resolvedSource:n.string().optional(),resolvedRef:n.string().optional(),manifestDigest:n.string().optional(),archiveIntegrity:n.string().optional(),trust:qr,capabilitiesGranted:n.array(n.string()),manifest:Nr,fsPath:n.string(),installedAt:n.number(),updatedAt:n.number()}),Un=n.object({plugins:n.array(nt)}),zn=n.object({source:n.string().min(1),ref:n.string().optional()}),Vn=n.object({ok:n.boolean(),plugin:nt.nullable().optional(),warnings:n.array(n.string()),message:n.string().optional(),log:n.array(n.string())}),Hn=n.object({path:n.string().min(1)}),zr=n.discriminatedUnion("kind",[n.object({kind:n.literal("pipeline_stage_started"),runId:n.string(),snapshotId:n.string(),stageId:n.string(),iteration:n.number().int().min(0),startedAt:n.number()}),n.object({kind:n.literal("pipeline_stage_completed"),runId:n.string(),snapshotId:n.string(),stageId:n.string(),iteration:n.number().int().min(0),completedAt:n.number(),converged:n.boolean().optional(),diffSummary:n.string().optional()})]),Vr=n.discriminatedUnion("kind",[n.object({kind:n.literal("genui_surface_request"),surfaceId:n.string(),runId:n.string(),payload:n.unknown(),requestedAt:n.number()}),n.object({kind:n.literal("genui_surface_response"),surfaceId:n.string(),runId:n.string(),value:n.unknown(),respondedAt:n.number(),respondedBy:n.enum(["user","agent","auto","cache"])}),n.object({kind:n.literal("genui_surface_timeout"),surfaceId:n.string(),runId:n.string(),resolution:n.enum(["abort","default","skip"])}),n.object({kind:n.literal("genui_state_synced"),surfaceId:n.string(),runId:n.string(),persistTier:n.enum(["run","conversation","project"])})]),Kn=n.union([zr,Vr]);var it=12e4,st=160;var Xn=17*1024*1024;function ot(t){let e=new Uint8Array(t);if(e[0]===255&&e[1]===254)return new TextDecoder("utf-16le").decode(e);if(e[0]===254&&e[1]===255)return new TextDecoder("utf-16be").decode(e);try{return new TextDecoder("utf-8",{fatal:!0}).decode(e)}catch{return new TextDecoder("windows-1252").decode(e)}}function Gr(t){let e="";for(let r=t+1;r>0;r=Math.floor((r-1)/26))e=String.fromCharCode(65+(r-1)%26)+e;return e}function ve(t){if(t.type==="image"||t.type==="embed")return"";let e=t.children||[];if(t.type==="row")return e.map((s,o)=>{let a=s.type==="cell"?s.metadata:void 0;return`${typeof a?.row=="number"&&typeof a.col=="number"?`${Gr(a.col)}${a.row+1}`:`column ${o+1}`}: ${ve(s)}`}).join(" | ");let r=e.length?e.map(ve).filter(Boolean).join(t.type==="paragraph"||t.type==="heading"?"":`
`):t.text||"",i=t.notes?.map(ve).filter(Boolean).join(`
`);return t.type==="note"?`Notes: ${r}`:i?r+`
`+i:r}async function Qn(t,e,r,i){let s=$e(t);if(!s)return{status:"unsupported",sections:[],note:"This file format has no document reader."};if(e.byteLength>20971520)return{status:"unreadable",sections:[],note:"This document exceeds the 20 MB reading limit."};let o=[],a=_=>new URL(_,r).href,c=it,p=!1,u=(_,w)=>{let O=w.replaceAll("\0","").trim();if(!O)return!0;for(let R=0;R<O.length;R+=6e3){if(c<=0||o.length>=st)return p=!0,!1;let T=O.slice(R,R+Math.min(c,6e3));if(o.push({label:(R?`${_} (continued)`:_).slice(0,200),text:T}),c-=T.length,!c&&R+T.length<O.length)return p=!0,!1}return!0},y;try{if(s==="pdf")y=await(await import("./chunks/document-reader-pdf-OH6QGK6D.js")).readPdf(e,a,u,i);else if(s==="doc"||s==="xls"||s==="ppt")await(await import("./chunks/document-reader-legacy-4FSYTUFL.js")).readLegacyDocument(s,e,a,u,i);else if(Fe(s)||s==="csv"||s==="tsv"){let{parseOffice:_}=await import("./chunks/officeparser.browser.slim-T6YSWZHZ.js"),w=s==="csv"||s==="tsv",O=await _(w?new TextEncoder().encode(ot(e)).buffer:e,{fileType:s==="tsv"?"csv":s,allowRemoteAssets:!1,abortSignal:i,...s==="tsv"?{csvDelimiter:"	"}:{},decompressionLimits:{maxUncompressedBytes:50*1024*1024,maxTableCells:5e4,maxXmlElements:25e4}});for(let[R,T]of O.content.entries()){i.throwIfAborted();let De=T.type==="slide"?`Slide ${T.metadata?.slideNumber??R+1}`:T.type==="sheet"?T.metadata?.sheetName||`Sheet ${R+1}`:T.type==="heading"?T.text||`Heading ${R+1}`:`Block ${R+1}`;if((T.type==="sheet"||T.type==="table")&&T.children?.length){for(let[at,Me]of T.children.entries()){let Ie=Me.children?.find(Le=>Le.type==="cell"&&typeof Le.metadata?.row=="number"),ct=Ie?.type==="cell"&&typeof Ie.metadata?.row=="number"?Ie.metadata.row+1:at+1;if(!u(`${w?s.toUpperCase():De} \xB7 row ${ct}`,ve(Me)))break}if(p)break}else if(!u(De,ve(T)))break}O.warnings.length&&(y="The document parser reported incomplete or unsupported content.")}else{let _=ot(e).split(/\r\n|\r|\n/);for(let w=0;w<_.length&&(i.throwIfAborted(),!!u(`Lines ${w+1}\u2013${Math.min(w+80,_.length)}`,_.slice(w,w+80).join(`
`)));w+=80);}}catch(_){i.throwIfAborted();let w=_;if(w.name==="PasswordException"||w.code?.startsWith("PASSWORD_")||w.code==="encrypted")return{status:"locked",sections:[],note:"This document is password protected. Attach an unlocked copy."};y="This file could not be read completely. Check that it opens and try exporting a fresh copy."}return p&&(y="The extract reached the document size limit. Some content was omitted."),o.length?{status:y?"partial":"readable",sections:o,...y?{note:y}:{}}:{status:"unreadable",sections:o,note:y||"No readable text was found."}}export{Qn as readDocument};
