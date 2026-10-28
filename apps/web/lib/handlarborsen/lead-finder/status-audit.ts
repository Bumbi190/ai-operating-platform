import { csvField, parseCsv, parseLegalOrgnr, validateSnapshot } from './offline-vetting'

/**
 * Offline correction of a previously saved SCB legal-entity status review.
 * The source files may be retained for audit, but the corrected output never
 * contains SCB jurform=10 (physical person), contact data, or outreach approval.
 * All five codebooks are from a completed authenticated read, not guessed.
 */
export class StatusAuditError extends Error {
  constructor(readonly reason: string) {
    super('SCB status audit refused: ' + reason)
    this.name = 'StatusAuditError'
  }
}
function fail(message: string): never { throw new StatusAuditError(message) }
const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
export const STATUS_AUDIT_COLUMNS = [
  'legalCompanyName','orgnr','city','sni','scbStatusCode','scbStatusClass','scbStatusLabel',
  'legalFormCode','legalFormClass','legalFormLabel','reklamCode','reklamLabel',
  'epostCode','epostLabel','telefonCode','telefonLabel','marketingReview',
  'legalIdentityReview','sourceDate','manual_review_only','NOT_CONTACTABLE','historyCoverage',
] as const
const TABLES = ['ftgstatkoder','jurformkoder','epostsparrtypkoder','reklamsparrtypkoder','telefonsparrtypkoder'] as const
type Table = typeof TABLES[number]
type Books = Record<Table, Map<string,string>>

/** Remove combining accents so source encoding and visual typography never alter decisions. */
export const folded = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase()
const VERIFIED: Record<'reklam'|'epost'|'telefon', Record<string,{ description:string; restricted:boolean }>> = {
  reklam: {
    '1': { description:'tar emot reklam',restricted:false },
    '2': { description:'har fransagt sig reklam',restricted:true },
  },
  epost: {
    '1': { description:'ej epostsparrat',restricted:false },
    '2': { description:'epostsparrat',restricted:true },
  },
  telefon: {
    '1': { description:'ej telefonnummersparrat',restricted:false },
    '2': { description:'telefonnummersparr telemarketing',restricted:true },
    '3': { description:'nix-telefon',restricted:true },
  },
}
const CHANNEL: Record<keyof typeof VERIFIED, Table> = {
  reklam: 'reklamsparrtypkoder', epost: 'epostsparrtypkoder', telefon: 'telefonsparrtypkoder',
}
const noUnsafeText = (s: unknown, field: string, limit=240): string => {
  if (typeof s !== 'string') fail('not a string: '+field)
  if (s.length > limit || /[\u0000-\u001f\u007f]/.test(s) || /@|https?:\/\//i.test(s)) fail('unsafe '+field)
  return s.trim()
}

export function parseCodebooks(input: unknown): Books {
  if (!obj(input)) fail('codebooks not an object')
  if (Object.keys(input).sort().join('|') !== [...TABLES].sort().join('|')) fail('codebook set is incomplete')
  const result = {} as Books
  for (const table of TABLES) {
    const raw = input[table]
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 500) fail('invalid '+table)
    const map = new Map<string,string>()
    for (const item of raw) {
      if (!obj(item) || Object.keys(item).sort().join(',') !== 'klartext,kod') fail('schema '+table)
      const code = item.kod
      if (typeof code !== 'string' || !/^[0-9A-Za-z]{1,4}$/.test(code) || map.has(code)) fail('code '+table)
      const label = noUnsafeText(item.klartext, table, 180)
      if (!label) fail('empty label '+table)
      map.set(code,label)
    }
    result[table] = map
  }
  if (folded(result.jurformkoder.get('10') ?? '') !== 'fysiska personer') fail('physical-person code 10 not independently verified')
  for (const [channel, expected] of Object.entries(VERIFIED) as [keyof typeof VERIFIED,Record<string,{description:string;restricted:boolean}>][]) {
    const map = result[CHANNEL[channel]]
    for (const [code, definition] of Object.entries(expected)) {
      if (folded(map.get(code) ?? '') !== definition.description) fail('SCB '+channel+' code '+code+' meaning not verified')
    }
  }
  return result
}

export interface CleanCompany {
  legalCompanyName: string
  orgnr: string
  city: string
  sni: string
  scbStatusCode: string
  scbStatusClass: 'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL'|'NOT_ACTIVE_PER_SCB'
  legalFormCode: string
  legalFormLabel: string
  reklamCode: string
  epostCode: string
  telefonCode: string
  marketingReview: 'RESTRICTION_MANUAL_REVIEW'|'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION'
  priorContactReview: 'KNOWN_PRIOR_CONTACT'|'NO_MATCH_IN_PARTIAL_HISTORY'
  legalIdentityReview: 'JE_IDENTITY_CONFIRMED'
  manual_review_only: 'true'
  NOT_CONTACTABLE: 'true'
  historyCoverage: 'PARTIAL'
}
export interface StatusAuditResult {
  kind: 'handlarborsen_status_audit_offline_v1'
  sourceRows: number
  excludedPhysicalPersons: number
  reviewed: CleanCompany[]
  summary: {
    sourceRows: number; reviewedLegalEntities: number; excludedPhysicalPersons:number
    activePerScb: number; notActivePerScb: number; scbRestrictionRows: number
    emailRestricted: number; reklamRestricted: number; phoneRestricted: number
    knownPriorContacts: number; unknownPriorContacts: number
    outreachReady: 0; contactability:'BLOCKED_PENDING_VERIFICATION'
    sourceCoverage:'PARTIAL'; sourceStatus:'OFFLINE_CORRECTED_FROM_SCB_CODEBOOKS'
  }
}

export function auditStatusFile(rawCsv: string, rawCodebooks: unknown, rawSourceSummary: unknown, rawSnapshot:unknown):StatusAuditResult {
  const books=parseCodebooks(rawCodebooks)
  const known=validateSnapshot(rawSnapshot)
  if(!obj(rawSourceSummary) || rawSourceSummary.status !== 'ok_local_review_only' ||
    rawSourceSummary.contactDataKept !== false || rawSourceSummary.personalApiKeyStored !== false ||
    rawSourceSummary.historyCoverage !== 'PARTIAL' || rawSourceSummary.approvedLeads !== 0 ||
    rawSourceSummary.outreachReady !== 0 || rawSourceSummary.codeTableCount !== 5 ||
    rawSourceSummary.jeRequestsMade !== 90 || rawSourceSummary.recordsWritten !== 90) fail('source run summary not verified')
  const parsed=parseCsv(rawCsv)
  const header=parsed.shift()
  if(!header) fail('no CSV header')
  if(header.join('|') !== STATUS_AUDIT_COLUMNS.join('|')) fail('status CSV schema not expected')
  if(parsed.length !== 90) fail('expected exactly 90 prior verified records')
  const seen=new Set<string>()
  const oldEntries=new Map(known.entries.filter(e=>e.matchKind==='exact_orgnr' && e.orgnr).map(e=>[e.orgnr!,e]))
  const reviewed:CleanCompany[]=[]
  let excludedPhysicalPersons=0, emailRestricted=0, reklamRestricted=0, phoneRestricted=0
  for(const row of parsed){
    if(row.length!==header.length) fail('CSV row length')
    const raw=Object.fromEntries(header.map((h,i)=>[h,row[i]]))
    for(const col of STATUS_AUDIT_COLUMNS) noUnsafeText(raw[col],col)
    if(raw.manual_review_only!=='true' || raw.NOT_CONTACTABLE!=='true' || raw.historyCoverage!=='PARTIAL') fail('unsafe contactability claim')
    const orgnr=parseLegalOrgnr(raw.orgnr)
    if(seen.has(orgnr)) fail('duplicate orgnr')
    seen.add(orgnr)
    if(!books.jurformkoder.has(raw.legalFormCode) || !books.ftgstatkoder.has(raw.scbStatusCode)) fail('unverified company codes')
    if(folded(raw.legalFormLabel)!==folded(books.jurformkoder.get(raw.legalFormCode)!)) fail('jurform label mismatch')
    if(folded(raw.scbStatusLabel)!==folded(books.ftgstatkoder.get(raw.scbStatusCode)!)) fail('status label mismatch')
    if(raw.legalFormCode==='10'){
      // Strict privacy boundary: physical-person name/orgnr never enters a report.
      excludedPhysicalPersons++
      continue
    }
    if(!['1','0','9'].includes(raw.scbStatusCode)) fail('unexpected activity status')
    const active=raw.scbStatusCode==='1'
    if(raw.scbStatusClass !== (active?'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL':'NOT_ACTIVE_PER_SCB')) fail('inconsistent status classification')
    if(raw.legalIdentityReview!=='JE_IDENTITY_CONFIRMED') fail('identity not verified')
    if(!/^\d{2}\.\d{3}(;\d{2}\.\d{3})*$/.test(raw.sni)) fail('invalid SNI')
    const codes = { reklam:raw.reklamCode,epost:raw.epostCode,telefon:raw.telefonCode }
    let restriction=false
    for(const channel of Object.keys(codes) as (keyof typeof VERIFIED)[]){
      const code=codes[channel], def=VERIFIED[channel][code]
      const actual=books[CHANNEL[channel]].get(code)
      if(!def || !actual || folded(actual)!==def.description) fail('unknown or modified channel restriction code')
      const observedLabel=raw[channel+'Label']
      if(typeof observedLabel!=='string' || folded(observedLabel)!==folded(actual)) fail('CSV marketing label differs from codebook')
      if(def.restricted){
        restriction=true
        if(channel==='epost') emailRestricted++
        else if(channel==='reklam') reklamRestricted++
        else phoneRestricted++
      }
    }
    reviewed.push({
      legalCompanyName:raw.legalCompanyName,orgnr,city:raw.city,sni:raw.sni,
      scbStatusCode:raw.scbStatusCode,
      scbStatusClass: active?'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL':'NOT_ACTIVE_PER_SCB',
      legalFormCode:raw.legalFormCode,legalFormLabel:raw.legalFormLabel,
      reklamCode:codes.reklam,epostCode:codes.epost,telefonCode:codes.telefon,
      marketingReview: restriction?'RESTRICTION_MANUAL_REVIEW':'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION',
      priorContactReview:oldEntries.has(orgnr)?'KNOWN_PRIOR_CONTACT':'NO_MATCH_IN_PARTIAL_HISTORY',
      legalIdentityReview:'JE_IDENTITY_CONFIRMED',
      manual_review_only:'true',NOT_CONTACTABLE:'true',historyCoverage:'PARTIAL',
    })
  }
  if(seen.size!==90 || excludedPhysicalPersons<0 || reviewed.length!==90-excludedPhysicalPersons) fail('incomplete audit')
  const count=(p:(r:CleanCompany)=>boolean)=>reviewed.filter(p).length
  return {
    kind:'handlarborsen_status_audit_offline_v1',
    sourceRows:90,excludedPhysicalPersons,reviewed,
    summary:{
      sourceRows:90,reviewedLegalEntities:reviewed.length,excludedPhysicalPersons,
      activePerScb:count(r=>r.scbStatusCode==='1'),
      notActivePerScb:count(r=>r.scbStatusCode==='0'||r.scbStatusCode==='9'),
      scbRestrictionRows:count(r=>r.marketingReview==='RESTRICTION_MANUAL_REVIEW'),
      emailRestricted,reklamRestricted,phoneRestricted,
      knownPriorContacts:count(r=>r.priorContactReview==='KNOWN_PRIOR_CONTACT'),
      unknownPriorContacts:count(r=>r.priorContactReview==='NO_MATCH_IN_PARTIAL_HISTORY'),
      outreachReady:0,contactability:'BLOCKED_PENDING_VERIFICATION',
      sourceCoverage:'PARTIAL',sourceStatus:'OFFLINE_CORRECTED_FROM_SCB_CODEBOOKS',
    },
  }
}

export const STATUS_AUDIT_EXPORT_COLUMNS = [
  'legalCompanyName','orgnr','city','sni','scbStatusCode','scbStatusClass',
  'legalFormCode','legalFormLabel','reklamCode','epostCode','telefonCode',
  'marketingReview','priorContactReview','legalIdentityReview',
  'manual_review_only','NOT_CONTACTABLE','historyCoverage',
] as const
export function renderAuditedCsv(results:StatusAuditResult):string {
  return [STATUS_AUDIT_EXPORT_COLUMNS.join(','),
    ...results.reviewed.map(r=> STATUS_AUDIT_EXPORT_COLUMNS.map(c=>csvField(String(r[c]))).join(',')),
  ].join('\r\n')+'\r\n'
}
