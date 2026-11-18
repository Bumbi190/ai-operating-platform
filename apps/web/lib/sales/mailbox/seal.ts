import type {MailboxContext,SealedMailboxEnvelope} from './types'
const encoder=new TextEncoder()
function bytes(value:ArrayBuffer|Uint8Array){const b=value instanceof Uint8Array?value:new Uint8Array(value);let raw='';for(const v of b)raw+=String.fromCharCode(v);return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function fromBase64url(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('INVALID_HOST_KEY');const raw=atob(value.replaceAll('-','+').replaceAll('_','/'));const b=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes(b)!==value)throw Error('INVALID_HOST_KEY');return b}
export function mailboxContextLabel(c:MailboxContext):string{return `OmniraSales/strato/v1\n${c.projectId}\n${c.workerId}\n${c.setupId}\n${c.kid}`}
export function validateMailboxCredentials(email:string,password:string):void{
 if(typeof password!=='string'||password.includes('\0')||encoder.encode(password).byteLength<1)throw Error('INVALID_CREDENTIAL')
 if(encoder.encode(password).byteLength>2048||encoder.encode(JSON.stringify({email,password})).byteLength>4096)throw Error('CREDENTIAL_TOO_LARGE')
}
export async function sealMailboxCredentials(context:MailboxContext,publicJwk:JsonWebKey,password:string):Promise<SealedMailboxEnvelope>{
 const subtle=globalThis.crypto?.subtle;if(!subtle)throw Error('CRYPTO_UNAVAILABLE')
 for(const key of ['projectId','workerId','mailboxId','setupId'] as const)if(typeof context[key]!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).test(context[key]))throw Error('INVALID_CONTEXT')
 if(!/^[a-f0-9]{64}$/.test(context.kid)||typeof context.email!=='string'||encoder.encode(context.email).byteLength>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(context.email))throw Error('INVALID_CONTEXT')
 if(!Number.isFinite(Date.parse(context.expiresAt))||Date.parse(context.expiresAt)<=Date.now())throw Error('SETUP_EXPIRED')
 validateMailboxCredentials(context.email,password)
 const payload=encoder.encode(JSON.stringify({email:context.email,password}))
 if(!publicJwk||Object.keys(publicJwk).some(k=>!['kty','n','e','alg','ext','key_ops'].includes(k))||publicJwk.kty!=='RSA'||publicJwk.e!=='AQAB'||typeof publicJwk.n!=='string'||(publicJwk.alg!==undefined&&publicJwk.alg!=='RSA-OAEP-256'))throw Error('INVALID_HOST_KEY')
 const modulus=fromBase64url(publicJwk.n);if(modulus.byteLength!==384||modulus[0]<128)throw Error('INVALID_HOST_KEY')
 const rsa=await subtle.importKey('jwk',publicJwk,{name:'RSA-OAEP',hash:'SHA-256'},true,['wrapKey'])
 const digest=new Uint8Array(await subtle.digest('SHA-256',await subtle.exportKey('spki',rsa))),kid=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');if(kid!==context.kid)throw Error('INVALID_HOST_KEY')
 const label=encoder.encode(mailboxContextLabel(context)),key=await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),iv=globalThis.crypto.getRandomValues(new Uint8Array(12))
 const wrappedKey=await subtle.wrapKey('raw',key,rsa,{name:'RSA-OAEP',label}),ciphertext=await subtle.encrypt({name:'AES-GCM',iv,additionalData:label,tagLength:128},key,payload)
 return {format:'sales-strato-envelope-v1',wrappedKey:bytes(wrappedKey),iv:bytes(iv),ciphertext:bytes(ciphertext)}
}
