import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {encryptionKey} from './config'
import {HiggsfieldError,type PayloadContext,type SealedPayload} from './types'

function aad(c:PayloadContext):Buffer {return Buffer.from(JSON.stringify(['higgsfield',1,c.projectId,c.recordKind,c.recordId]))}
export function sealProviderPayload(context:PayloadContext,value:unknown):SealedPayload {
 const key=encryptionKey(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv)
 cipher.setAAD(aad(context))
 const bytes=Buffer.from(JSON.stringify(value))
 if(bytes.length>131072) throw new HiggsfieldError('invalid_response')
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()])
 return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}
}
export function openProviderPayload(context:PayloadContext,envelope:unknown):unknown {
 const key=encryptionKey()
 try {
  const e=envelope as SealedPayload
  if(!e||e.v!==1||typeof e.iv!=='string'||typeof e.tag!=='string'||typeof e.ciphertext!=='string'||e.ciphertext.length>180000) throw Error()
  const iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64')
  if(iv.length!==12||tag.length!==16) throw Error()
  const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(context));cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(e.ciphertext,'base64')),cipher.final()]).toString('utf8'))
 } catch {throw new HiggsfieldError('invalid_response')}
}
