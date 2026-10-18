import type {CodeWorkValidation} from '../types'
class ReviewValidationError extends Error {constructor(readonly code:string,readonly path:string){super('review contract rejected')}}
export function ensure(condition:unknown,code:string,path='input'):asserts condition {if(!condition)throw new ReviewValidationError(code,path)}
export function attempt<T>(operation:()=>T):CodeWorkValidation<T>{try{return{ok:true,value:operation()}}catch(e){return{ok:false,violations:[{path:e instanceof ReviewValidationError?e.path:'input',code:e instanceof ReviewValidationError?e.code:'invalid_input',detail:'review contract rejected'}]}}}
export function requireValid<T>(value:CodeWorkValidation<T>):T {ensure(value.ok,value.ok?'invalid_input':value.violations[0]?.code??'invalid_input');return value.value}
export function bytes(s:string):number{return new TextEncoder().encode(s).byteLength}
export function exact(value:unknown,keys:readonly string[],path='input'):asserts value is Record<string,any>{
 ensure(!!value&&typeof value==='object'&&!Array.isArray(value),'object_required',path)
 ensure(Object.keys(value).sort().join(',')===[...keys].sort().join(','),'exact_keys_required',path)
}
export function id(v:unknown):asserts v is string{ensure(typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v),'id_invalid')}
export function hash(v:unknown):asserts v is string{ensure(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'hash_invalid')}
export function gitHash(v:unknown):asserts v is string{ensure(typeof v==='string'&&/^[a-f0-9]{40}$/.test(v),'git_hash_invalid')}
export function integer(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):asserts v is number{ensure(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max&&!Object.is(v,-0),'integer_invalid')}
export function text(v:unknown,max=4096,allowEmpty=false):asserts v is string{ensure(typeof v==='string'&&!v.includes('\0')&&bytes(v)<=max&&(allowEmpty||v.trim().length>0),'text_invalid')}
export function iso(v:unknown):asserts v is string{ensure(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'timestamp_invalid')}
export function list(v:unknown,max:number,min=0):asserts v is any[]{ensure(Array.isArray(v)&&v.length>=min&&v.length<=max,'array_invalid')}
export function unique(v:readonly unknown[]):void{ensure(new Set(v).size===v.length,'duplicate_value')}
export function same(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b)}
export function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v)}return v}
/** Bounded parsed-JSON clone. No authenticity or hostile JS object/proxy boundary. */
export function jsonCopy(v:unknown,maxBytes=262144):any {
 let nodes=0
 const walk=(x:unknown,depth:number):any=>{
  ensure(++nodes<=20000&&depth<=24,'input_complexity_exceeded')
  if(x===null||typeof x==='boolean')return x
  if(typeof x==='string'){ensure(bytes(x)<=maxBytes&&new TextDecoder().decode(new TextEncoder().encode(x))===x,'text_encoding_invalid');return x}
  if(typeof x==='number'){ensure(Number.isFinite(x)&&!Object.is(x,-0),'number_invalid');return x}
  ensure(!!x&&typeof x==='object','json_value_required')
  if(Array.isArray(x)){ensure(x.length<=4096&&Object.keys(x).length===x.length,'array_invalid');return x.map(c=>walk(c,depth+1))}
  const proto=Object.getPrototypeOf(x);ensure(proto===null||proto===Object.prototype,'plain_object_required')
  const entries=Object.entries(Object.getOwnPropertyDescriptors(x));ensure(entries.length<=256,'object_too_large')
  const out:Record<string,unknown>=Object.create(null)
  for(const[k,d]of entries){ensure(d.enumerable&&'value'in d&&!['__proto__','constructor','prototype'].includes(k),'json_property_invalid');out[k]=walk(d.value,depth+1)}
  return out
 }
 const copy=walk(v,0);ensure(bytes(JSON.stringify(copy))<=maxBytes,'input_too_large');return copy
}
