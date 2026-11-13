import {generateKeyPairSync,createPrivateKey,createPublicKey,createHash,privateDecrypt,createDecipheriv,constants} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
const refuse=()=>{throw Error('CRYPTO_REFUSED')}
function fields(v,allowed){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))refuse()}
function binary(v,min,max){if(typeof v!=='string'||!/^[A-Za-z0-9_-]+$/.test(v))refuse();const b=Buffer.from(v,'base64url');if(b.length<min||b.length>max||b.toString('base64url')!==v)refuse();return b}
function keyFrom(v){if(typeof v!=='string'||Buffer.byteLength(v)>2560||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))refuse();const der=Buffer.from(v,'base64');if(der.toString('base64')!==v)refuse();const k=createPrivateKey({key:der,format:'der',type:'pkcs8'});if(k.asymmetricKeyType!=='rsa'||k.asymmetricKeyDetails.modulusLength!==3072||k.asymmetricKeyDetails.publicExponent!==65537n)refuse();return k}
function publicPart(key){const p=createPublicKey(key),spki=p.export({format:'der',type:'spki'});return {kid:createHash('sha256').update(spki).digest('hex'),jwk:p.export({format:'jwk'})}}
function contextLabel(c){fields(c,['projectId','workerId','mailboxId','setupId','kid','email','expiresAt']);for(const k of ['projectId','workerId','mailboxId','setupId'])if(typeof c[k]!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(c[k]))refuse();if(!/^[a-f0-9]{64}$/.test(c.kid)||typeof c.email!=='string'||Buffer.byteLength(c.email)>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(c.email)||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=Date.now())refuse();return Buffer.from(`OmniraSales/strato/v1\n${c.projectId}\n${c.workerId}\n${c.setupId}\n${c.kid}`,'utf8')}
export function handle(v){
 fields(v,['action','privateKey','context','envelope'])
 if(v.action==='generate'){fields(v,['action']);const {privateKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicExponent:65537});const encoded=privateKey.export({format:'der',type:'pkcs8'}).toString('base64');if(Buffer.byteLength(encoded)>2560)refuse();return {privateKey:encoded,...publicPart(privateKey)}}
 const key=keyFrom(v.privateKey),pub=publicPart(key)
 if(v.action==='public'){fields(v,['action','privateKey']);return pub}
 if(v.action!=='open')refuse()
 const c=v.context,label=contextLabel(c),e=v.envelope;if(c.kid!==pub.kid)refuse();fields(e,['format','wrappedKey','iv','ciphertext']);if(e.format!=='sales-strato-envelope-v1')refuse()
 const aes=privateDecrypt({key,oaepHash:'sha256',oaepLabel:label,padding:constants.RSA_PKCS1_OAEP_PADDING},binary(e.wrappedKey,384,384));if(aes.length!==32)refuse()
 const encrypted=binary(e.ciphertext,17,4112),decipher=createDecipheriv('aes-256-gcm',aes,binary(e.iv,12,12));decipher.setAAD(label);decipher.setAuthTag(encrypted.subarray(-16));const plain=Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);if(plain.length>4096)refuse()
 const credential=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));fields(credential,['email','password']);if(credential.email!==c.email||typeof credential.password!=='string'||credential.password.includes('\0')||Buffer.byteLength(credential.password)<1||Buffer.byteLength(credential.password)>2048)refuse()
 return credential
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let bytes=0,chunks=[]
 try{for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>16384)refuse();chunks.push(chunk)}const result=handle(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));process.stdout.write(JSON.stringify(result))}
 catch{process.stdout.write('{"error":"CRYPTO_REFUSED"}');process.exitCode=1}
}
