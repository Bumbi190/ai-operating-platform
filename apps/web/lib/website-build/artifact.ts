import { createHash } from 'node:crypto'
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import JSZip from 'jszip'
import { escapeHtml, scriptJson, websiteCsp, WEBSITE_RUNTIME, renderPreviewDocument } from './preview-runtime'
import { WEBSITE_BUILD_LIMITS, type WebsiteArtifact, type WebsiteBehavior, type WebsiteDraft } from './types'

export class WebsiteArtifactError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'WebsiteArtifactError' }
}
function fail(code: string): never { throw new WebsiteArtifactError(code) }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_OBJECT')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number = WEBSITE_BUILD_LIMITS.artifactBytes): string {
  if (typeof value !== 'string' || value.length > max) fail('INVALID_TEXT')
  return value
}
const SAFE_KEY = /^[a-z][a-z0-9-]{0,49}$/
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/
const TAGS = new Set('a abbr address article aside b blockquote br button caption code col colgroup dd del details dfn div dl dt em figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label legend li main mark nav ol optgroup option p pre progress q s section select small span strong sub summary sup table tbody td textarea th thead time tr u ul fieldset'.split(' '))
const ATTRS = new Set('id class title role lang dir hidden tabindex style href src alt width height loading decoding type name value placeholder required disabled checked selected multiple readonly autocomplete min max step minlength maxlength rows cols for datetime open colspan rowspan scope start reversed contenteditable'.split(' '))
type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
function isElement(node: Node): node is Element { return 'tagName' in node }

function validateMarkup(html: string, pageKeys: Set<string>): { html: string; ids: Set<string>; forms: boolean } {
  const fragment = parseFragment(html)
  const ids = new Set<string>()
  const anchorTargets: string[] = []
  let forms = false
  const walk = (nodes: Node[], depth: number): void => {
    if (depth > 100) fail('MARKUP_TOO_DEEP')
    for (const node of nodes) {
      if (!isElement(node)) continue
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !TAGS.has(node.tagName)) fail('UNSUPPORTED_ELEMENT')
      if (node.tagName === 'form') forms = true
      for (const attr of node.attrs) {
        if (attr.namespace || attr.prefix || !(ATTRS.has(attr.name) || /^(aria|data)-[a-z0-9-]+$/.test(attr.name))) fail('UNSUPPORTED_ATTRIBUTE')
        if (attr.name === 'id') {
          if (!SAFE_ID.test(attr.value) || ids.has(attr.value)) fail('INVALID_OR_DUPLICATE_ID')
          ids.add(attr.value)
        }
        if (attr.name === 'href') {
          if (node.tagName !== 'a') fail('INVALID_LINK')
          if (attr.value.startsWith('#') && SAFE_ID.test(attr.value.slice(1))) anchorTargets.push(attr.value.slice(1))
          else {
            const match = attr.value.match(/^([a-z][a-z0-9-]{0,49})\.html(?:#([A-Za-z][A-Za-z0-9_-]{0,79}))?$/)
            if (!match || !pageKeys.has(match[1])) fail('INVALID_LINK')
          }
        }
        if (attr.name === 'src') {
          if (node.tagName !== 'img' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(attr.value)) fail('INVALID_IMAGE')
        }
      }
      walk(node.childNodes, depth + 1)
    }
  }
  walk(fragment.childNodes, 0)
  if (anchorTargets.some(id => !ids.has(id))) fail('MISSING_ANCHOR')
  if (forms) {
    // Inert preview-only forms clearly name the missing delivery integration.
    const note = parseFragment('<p role="note">Formuläret behöver en ansluten mottagare innan det kan skicka meddelanden.</p>')
    fragment.childNodes.push(...note.childNodes)
  }
  return { html: serialize(fragment), ids, forms }
}
function validateBehaviors(value: unknown, ids: Set<string>): WebsiteBehavior[] {
  if (!Array.isArray(value) || value.length > WEBSITE_BUILD_LIMITS.behaviorsPerPage) fail('INVALID_BEHAVIORS')
  const triggers = new Set<string>()
  return value.map(raw => {
    const item = record(raw)
    if (!['toggle', 'tabs', 'accordion'].includes(String(item.kind)) || typeof item.triggerId !== 'string' || !ids.has(item.triggerId) || triggers.has(item.triggerId)) fail('INVALID_BEHAVIOR')
    triggers.add(item.triggerId)
    if (!Array.isArray(item.targetIds) || !item.targetIds.length || item.targetIds.length > 64 || item.targetIds.some(id => typeof id !== 'string' || !ids.has(id)) || new Set(item.targetIds).size !== item.targetIds.length) fail('INVALID_BEHAVIOR_TARGET')
    if (item.kind === 'tabs' && (typeof item.groupId !== 'string' || !SAFE_ID.test(item.groupId))) fail('INVALID_TAB_GROUP')
    return { kind: item.kind as WebsiteBehavior['kind'], triggerId: item.triggerId, targetIds: item.targetIds as string[], ...(item.kind === 'tabs' ? { groupId: item.groupId as string } : {}) }
  })
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'
  return JSON.stringify(value)
}
function artifactHash(artifact: Omit<WebsiteArtifact, 'sha256'>): string { return createHash('sha256').update(canonical(artifact), 'utf8').digest('hex') }
export function assertWebsiteArtifact(artifact: WebsiteArtifact): void {
  const { sha256, ...payload } = artifact
  if (Buffer.byteLength(canonical(artifact), 'utf8') > WEBSITE_BUILD_LIMITS.artifactBytes) fail('ARTIFACT_TOO_LARGE')
  if (artifact.format !== 'static-website.v1' || sha256 !== artifactHash(payload)) fail('ARTIFACT_HASH_MISMATCH')
  if (!artifact.files.length || artifact.files.some(f => !(SAFE_KEY.test(f.path.replace(/\.html$/, '')) && f.path.endsWith('.html')) && f.path !== 'website.js')) fail('INVALID_ARTIFACT_FILE')
}
export function compileWebsiteArtifact(input: unknown): WebsiteArtifact {
  if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > WEBSITE_BUILD_LIMITS.artifactBytes) fail('ARTIFACT_TOO_LARGE')
  const draft = record(input)
  if (draft.format !== 'static-website.v1') fail('INVALID_FORMAT')
  const title = text(draft.title, 200)
  if (!title.trim() || !Array.isArray(draft.pages) || !draft.pages.length || draft.pages.length > WEBSITE_BUILD_LIMITS.pages) fail('INVALID_PAGES')
  const sharedCss = draft.css === undefined ? '' : text(draft.css)
  const rawPages = draft.pages.map(record)
  const keys = rawPages.map(p => text(p.key, 50))
  if (keys.some(k => !SAFE_KEY.test(k)) || new Set(keys).size !== keys.length || !keys.includes('index')) fail('INVALID_PAGE_KEY')
  const pageKeys = new Set(keys)
  let forms = false
  const scriptHash = createHash('sha256').update(WEBSITE_RUNTIME).digest('base64')
  const pages = rawPages.map(page => {
    const pageTitle = text(page.title, 200)
    const markup = validateMarkup(text(page.bodyHtml), pageKeys)
    forms ||= markup.forms
    const behaviors = validateBehaviors(page.behaviors, markup.ids)
    const css = ((sharedCss ? sharedCss + '\n' : '') + (page.css === undefined && draft.css !== undefined ? '' : text(page.css))).replace(/</g, '\\3c ')
    const config = scriptJson({ behaviors, pages: keys })
    const html = `<!doctype html><html lang="sv"><head><meta http-equiv="Content-Security-Policy" content="${escapeHtml(websiteCsp(`'sha256-${scriptHash}'`))}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pageTitle || title)}</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}img{max-width:100%;height:auto}${css}</style></head><body>${markup.html}<script type="application/json" id="__atlas_config">${config}</script><script id="__atlas_runtime">${WEBSITE_RUNTIME}</script></body></html>`
    return { key: text(page.key), title: pageTitle, html }
  })
  const payload = { format: 'static-website.v1' as const, pages, files: [...pages.map(p => ({ path: `${p.key}.html`, content: p.html })), { path: 'website.js', content: WEBSITE_RUNTIME }], integrationNeeds: forms ? ['form_delivery'] : [] }
  const artifact = { ...payload, sha256: artifactHash(payload) }
  assertWebsiteArtifact(artifact)
  return artifact
}
export function makePreviewDocument(artifact: WebsiteArtifact, pageKey: string, channelToken: string): string {
  assertWebsiteArtifact(artifact)
  if (!artifact.pages.some(p => p.key === pageKey)) fail('PREVIEW_PAGE_NOT_FOUND')
  return renderPreviewDocument(artifact, pageKey, channelToken)
}
export async function exportWebsiteZip(artifact: WebsiteArtifact): Promise<Uint8Array> {
  assertWebsiteArtifact(artifact)
  const zip = new JSZip()
  for (const file of artifact.files) zip.file(file.path, file.content, { date: new Date('2000-01-01T00:00:00Z') })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
