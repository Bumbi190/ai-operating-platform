import 'server-only'
import {createHmac, timingSafeEqual} from 'node:crypto'
import type {ProspectCompany} from './types'
import type {BuildPrincipal} from '../types'
import {WebsiteBuildError} from '../store'
import {validateProspectContent} from './validation'

/** Purpose-separated HMAC, never an Auth token. Prevents browser-authored SCB provenance. */
function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update('omnira:prospect:scb:v1\0').update(payload).digest('base64url')
}
export function issueSearchReceipt(company: ProspectCompany, principal: BuildPrincipal, projectId: string, secret: string, now = Date.now()): string {
  if (!secret || secret.length < 24) throw new WebsiteBuildError('DISCOVERY_SOURCE_NOT_CONFIGURED',503)
  const payload = Buffer.from(JSON.stringify({company,userId:principal.userId,projectId,expiresAt:now+30*60*1000})).toString('base64url')
  return payload + '.' + mac(payload,secret)
}
export function readSearchReceipt(token: unknown, principal: BuildPrincipal, projectId: string, secret: string, now = Date.now()): ProspectCompany {
  if (!secret || secret.length < 24 || typeof token !== 'string' || token.length > 6000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT')
  const [payload, signature] = token.split('.'), expected = mac(payload, secret)
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT')
  let result
  try {result=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))} catch {throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT')}
  if (result.userId !== principal.userId || result.projectId !== projectId || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= now || result.expiresAt > now+30*60*1000) throw new WebsiteBuildError('SOURCE_RECEIPT_EXPIRED',409)
  return validateProspectContent({version:1,company:result.company,website:null,capture:null,improvements:[],design:null,build:null,demo:null}).company
}
