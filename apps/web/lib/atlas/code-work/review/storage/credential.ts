import 'server-only'
import {createHash,randomBytes} from 'node:crypto'
import type {ReviewRole} from '../types'
import type {ReviewRoleCredential} from './types'
const validId=(s:string)=>/^[A-Za-z0-9_.:-]{1,128}$/.test(s)
export function hashReviewRoleCredential(workId:string,role:ReviewRole,sessionId:string,credential:unknown):string|null{
 if(!validId(workId)||!validId(sessionId)||!['atlas','worker','reviewer'].includes(role)||!credential||typeof credential!=='object'||Array.isArray(credential))return null
 const v=credential as Record<string,unknown>
 if(Object.keys(v).join(',')!=='token'||typeof v.token!=='string'||!/^acr1\.[A-Za-z0-9_-]{43}$/.test(v.token))return null
 const raw=v.token.slice(5)
 if(Buffer.from(raw,'base64url').toString('base64url')!==raw)return null
 return createHash('sha256').update(JSON.stringify(['atlas.review_role_credential.v1',workId,role,sessionId,v.token])).digest('hex')
}
export function issueReviewRoleCredential(workId:string,role:ReviewRole,sessionId:string,random:(n:number)=>Buffer=randomBytes):{credential:ReviewRoleCredential;tokenHash:string}{
 const data=random(32);if(!Buffer.isBuffer(data)||data.length!==32)throw Error('invalid_review_entropy')
 const credential={token:'acr1.'+data.toString('base64url')},tokenHash=hashReviewRoleCredential(workId,role,sessionId,credential)
 if(!tokenHash)throw Error('invalid_review_identity')
 return{credential,tokenHash}
}
