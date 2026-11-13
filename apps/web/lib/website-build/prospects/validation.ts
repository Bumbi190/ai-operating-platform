import {createHash} from 'node:crypto'
import {WebsiteBuildError, validateBuildUuid} from '../store'
import type {ProspectContent, ProspectImprovement, ProspectReadiness} from './types'

const hash = /^[a-f0-9]{64}$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function fail(): never {throw new WebsiteBuildError('INVALID_PROSPECT')}
export function object(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const result = value as Record<string, any>
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(result, key))) fail()
  return result
}
function text(value: unknown, max: number, empty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail()
}
function date(value: unknown) {if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail()}
function digest(value: unknown) {if (typeof value !== 'string' || !hash.test(value)) fail()}
function id(value: unknown) {if (typeof value !== 'string' || !uuid.test(value)) fail()}
function list(value: unknown, min: number, max: number): any[] {if (!Array.isArray(value) || value.length < min || value.length > max) fail(); return value}
// JSONB does not preserve object-key order. Keep revision and design bindings stable
// after database round trips while preserving the meaningful order of arrays.
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
}
export function publicWebsiteUrl(value: unknown): string {
  text(value, 2048)
  let url: URL
  try {url = new URL(value as string)} catch {fail()}
  if (!['https:', 'http:'].includes(url!.protocol) || url!.username || url!.password || url!.port || url!.hash || !url!.hostname.includes('.') || /[\[\]:]/.test(url!.hostname) || /^\d+(\.\d+){3}$/.test(url!.hostname) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(url!.hostname)) fail()
  return url!.href
}
export function validateImprovements(value: unknown, content: Pick<ProspectContent, 'capture'>): ProspectImprovement[] {
  const items = list(value, 0, 3)
  if (items.length && (items.length !== 3 || !content.capture)) fail()
  const observations = new Set(content.capture?.observations.map(o => o.id) ?? [])
  const ids = new Set<string>()
  for (const raw of items) {
    const item = object(raw, ['id','title','observationIds','proposal','verification','concept'])
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(item.id) || ids.has(item.id)) fail()
    ids.add(item.id); text(item.title, 160); text(item.proposal, 1200); text(item.verification, 800)
    const refs = list(item.observationIds, 1, 8)
    if (new Set(refs).size !== refs.length || refs.some(ref => !observations.has(ref))) fail()
    const concept = object(item.concept, ['heading','body']); text(concept.heading, 100); text(concept.body, 360)
  }
  return items as ProspectImprovement[]
}
/** Canonical JSON data only. Authority and all external receipts are supplied by server actions. */
export function validateProspectContent(value: unknown): ProspectContent {
  if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > 65536) fail()
  const o = object(value, ['version','company','website','capture','improvements','design','build','demo'])
  if (o.version !== 1) fail()
  const c = object(o.company, ['source','sourceId','sourceUrl','retrievedAt','name','branchName','orgnr','cfar','city','municipalityCode','sniCodes','restricted','inactive'])
  if (c.source !== 'scb' || !/^\d{10}$/.test(c.orgnr) || !/^\d{1,20}$/.test(c.cfar) || c.sourceId !== 'scb/' + c.cfar || !/^\d{4}$/.test(c.municipalityCode)) fail()
  if (c.sourceUrl !== 'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/' || typeof c.restricted !== 'boolean' || typeof c.inactive !== 'boolean') fail()
  text(c.name, 200); text(c.branchName, 200, true); if (c.city !== null) text(c.city, 120)
  date(c.retrievedAt)
  if (list(c.sniCodes, 1, 2).some(s => !['47.811','46.711'].includes(s))) fail()
  if (o.website !== null) {
    const w = object(o.website, ['url','verifiedAt','verifiedBy','method'])
    if (publicWebsiteUrl(w.url) !== w.url || w.method !== 'operator') fail()
    date(w.verifiedAt); id(w.verifiedBy)
  }
  if (o.capture !== null) {
    if (!o.website) fail()
    const capture = object(o.capture, ['id','sourceUrl','finalUrl','capturedAt','engine','images','observations','warnings'])
    id(capture.id); date(capture.capturedAt)
    if (capture.engine !== 'playwright' || capture.sourceUrl !== o.website.url) fail()
    publicWebsiteUrl(capture.finalUrl)
    const images = list(capture.images, 2, 2), viewports = new Set<string>()
    for (const raw of images) {
      const image = object(raw, ['viewport','width','height','assetId','sha256'])
      if (!['desktop','mobile'].includes(image.viewport) || viewports.has(image.viewport) || image.width !== (image.viewport === 'desktop' ? 1440 : 390) || !Number.isInteger(image.height) || image.height < 1 || image.height > 6000) fail()
      viewports.add(image.viewport); id(image.assetId); digest(image.sha256)
    }
    const observations = list(capture.observations, 1, 64), observationIds = new Set<string>()
    for (const raw of observations) {
      const observation = object(raw, ['id','viewport','kind','description','selector','value'])
      if (!/^[a-z][a-z0-9-]{0,59}$/.test(observation.id) || observationIds.has(observation.id) || !viewports.has(observation.viewport)) fail()
      observationIds.add(observation.id); text(observation.kind, 64); text(observation.description, 1000); text(observation.selector, 300, true); text(observation.value, 2000, true)
    }
    list(capture.warnings, 0, 12).forEach(w => text(w, 500))
  }
  validateImprovements(o.improvements, o as ProspectContent)
  if (o.design !== null) {
    if (o.improvements.length !== 3) fail()
    const d = object(o.design, ['projectId','planId','revisionId','sha256','conversationId','inputSha256'])
    for (const k of ['projectId','planId','revisionId','conversationId']) id(d[k])
    digest(d.sha256); digest(d.inputSha256)
    if (d.inputSha256 !== prospectInputHash(o as ProspectContent)) fail()
  }
  if (o.build !== null) {
    if (!o.design) fail()
    const b = object(o.build, ['sessionId','revisionId','sha256','planRevisionId','mockupId','mockupSha256'])
    for (const k of ['sessionId','revisionId','planRevisionId','mockupId']) id(b[k])
    digest(b.sha256); digest(b.mockupSha256)
    if (b.planRevisionId !== o.design.revisionId) fail()
  }
  if (o.demo !== null) {
    if (!o.build) fail()
    const d = object(o.demo, ['url','publisher','exportSha256','artifactSha256','checkedAt','desktopWidth','mobileWidth','mobileOverflow','desktopOverflow'])
    const url = new URL(publicWebsiteUrl(d.url))
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.pathname !== '/' || url.search || d.publisher !== 'vercel' || d.artifactSha256 !== o.build.sha256 || d.desktopWidth !== 1440 || d.mobileWidth !== 390 || d.mobileOverflow !== false || d.desktopOverflow !== false) fail()
    digest(d.exportSha256); digest(d.artifactSha256); date(d.checkedAt)
  }
  return JSON.parse(canonicalJson(o)) as ProspectContent
}
export function prospectInputHash(content: Pick<ProspectContent, 'company' | 'website' | 'capture' | 'improvements'>): string {
  return createHash('sha256').update(canonicalJson({company:content.company,website:content.website,capture:content.capture,improvements:content.improvements})).digest('hex')
}
export function prospectHash(content: ProspectContent): string {return createHash('sha256').update(JSON.stringify(validateProspectContent(content))).digest('hex')}
export function prospectReadiness(content: ProspectContent): ProspectReadiness {
  const missing: string[] = []
  if (content.company.inactive) missing.push('SCB har inte bekräftat att företaget är aktivt.')
  if (!content.website) missing.push('Bekräfta företagets aktuella webbadress.')
  if (!content.capture) missing.push('Spara nulägesbilder och observationer för mobil och dator.')
  if (content.improvements.length !== 3) missing.push('Granska exakt tre förbättringar med stöd i observationerna.')
  if (!content.design) missing.push('Ta fram och granska en företagsspecifik mockup.')
  if (!content.build) missing.push('Bygg konceptstartsidan från den godkända mockupen.')
  if (!content.demo) missing.push('Publicera och verifiera demolänken efter separat godkännande.')
  return {ready: missing.length === 0, missing}
}
export function assertProspectRef(projectId: unknown, prospectId?: unknown) {validateBuildUuid(projectId); if (prospectId !== undefined) validateBuildUuid(prospectId)}
