/** Curated public evidence supplied for this slice; no runtime I/O or live-offer claims. */
export type EvidenceId = 'battery-vdn-2025' | 'guaranteed-bid-2022' | 'trading-support-2022'
type Evidence = Readonly<{
  id: EvidenceId; url: string; published: string; label: string; observation: string;
  idea: string; category: 'Utforska efter pilot' | 'Pilotintervju'; hypothesis: string;
}>
export const DOSSIER_DATE = '2026-10-12'
export const EVIDENCE: readonly Evidence[] = Object.freeze([
  Object.freeze({
    id: 'battery-vdn-2025' as const,
    url: 'https://handlarbudet.se/nyheter/nya-varudeklarationen-batteritester-och-servicehistorik/',
    published: '2025-10-21', label: 'Batteridata och varudeklaration',
    observation: 'En publicerad nyhet beskriver batterihälsa (SoH), VDN, testintyg och servicehistorik för elbilar.',
    idea: 'Efterfråga elbils-batteridata hos piloter', category: 'Utforska efter pilot' as const,
    hypothesis: 'Fråga pilothandlare vilken batteridata de behöver och validera efterfrågan innan ni betalar för API:er.',
  }),
  Object.freeze({
    id: 'guaranteed-bid-2022' as const,
    url: 'https://handlarbudet.se/nyheter/handlarbudet-infor-garanterat-bud-bindande-pris-inom-30-minuter/',
    published: '2022-05-27', label: 'Annons om garanterat bud inom 30 minuter',
    observation: 'En nyhet från 2022 annonserade ett garanterat, bindande bud inom 30 minuter. Det belägger inte ett aktuellt erbjudande.',
    idea: 'Undersök behovet av snabb värdeindikering', category: 'Pilotintervju' as const,
    hypothesis: 'Fråga pilothandlare när en snabb värdeindikering hjälper dem. Lova inget garanterat bud.',
  }),
  Object.freeze({
    id: 'trading-support-2022' as const,
    url: 'https://handlarbudet.se/nyheter/vi-lanserar-handlarbudet-trading-support/',
    published: '2022-02-04', label: 'Lansering av trading och support',
    observation: 'En nyhet från 2022 beskrev lanseringen av en trading- och supportfunktion. Dagens bemanning eller tjänst är inte verifierad.',
    idea: 'Mät var handlare fastnar under affärsavslut', category: 'Pilotintervju' as const,
    hypothesis: 'Undersök hinder vid affärsavslut i pilotintervjuer. Pröva om snabbare mänsklig support hjälper innan något automatiseras.',
  }),
])
export const ROBOTS_URL = 'https://handlarbudet.se/robots.txt'
export const USER_AGENT = 'OmniraCompetitorCheck/1.0 (manual public-source metadata check; read-only)'
export type SourceStatus = 'metadata_checked' | 'robots_denied' | 'redirect_refused' | 'http_error'
  | 'invalid_content_type' | 'too_large' | 'metadata_missing' | 'fetch_failed'
export type SourceCheck = Readonly<{ id: EvidenceId; status: SourceStatus; title: string | null; checked_at: string }>
export type PublicScan = Readonly<{ checked_at: string; sources: readonly SourceCheck[] }>
export const STATUS_LABELS: Readonly<Record<SourceStatus, string>> = Object.freeze({
  metadata_checked: 'Tillgänglig HTML och titel kontrollerade', robots_denied: 'Ej hämtad: robots kunde inte godkänna kontrollen',
  redirect_refused: 'Omdirigering nekad', http_error: 'HTTP-fel', invalid_content_type: 'Fel innehållstyp',
  too_large: 'Svar över storleksgränsen', metadata_missing: 'Säker titelmetadata saknas', fetch_failed: 'Hämtning misslyckades eller tog för lång tid',
})
export function summarizeScan(scan: PublicScan) {
  const checked = scan.sources.filter(source => source.status === 'metadata_checked').length
  return { checked, failed: scan.sources.length - checked }
}

function pathOctets(value: string): string {
  return value.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => {
    const character = String.fromCharCode(parseInt(hex, 16))
    return /[a-z0-9._~-]/i.test(character) ? character : `%${hex.toUpperCase()}`
  })
}

// Greedy wildcard matching avoids evaluating untrusted robots rules as regexes.
function matchesRule(pattern: string, path: string, anchored: boolean): boolean {
  const glob = anchored ? pattern : `${pattern}*`
  let p = 0, s = 0, star = -1, retry = 0
  while (s < path.length) {
    if (glob[p] === '*') { star = p++; retry = s }
    else if (glob[p] === path[s]) { p++; s++ }
    else if (star >= 0) { p = star + 1; s = ++retry }
    else return false
  }
  while (glob[p] === '*') p++
  return p === glob.length
}

/** RFC-style groups, longest match, wildcard/end anchor and allow ties. Unknown/malformed policy denies. */
export function robotsAllows(text: string, path: string): boolean {
  type Rule = { allow: boolean; path: string }
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let group: (typeof groups)[number] | null = null
  let hasDirectives = false
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!match) return false
    const key = match[1].toLowerCase(), value = match[2].trim()
    if (key === 'user-agent') {
      if (!value || !/^(?:\*|[a-z0-9_-]+(?:\/[\d.]+)?)$/i.test(value)) return false
      if (!group || hasDirectives) {
        group = { agents: [], rules: [] }; groups.push(group); hasDirectives = false
      }
      group.agents.push(value.toLowerCase())
    } else if (key === 'allow' || key === 'disallow') {
      if (!group) return false
      hasDirectives = true
      if (!value) continue
      if (!value.startsWith('/') || /\s/.test(value)) return false
      group.rules.push({ allow: key === 'allow', path: pathOctets(value) })
    } else {
      if (group) hasDirectives = true
    }
  }
  const token = 'omniracompetitorcheck'
  const specificity = (agents: string[]) => Math.max(-1, ...agents.map(agent => agent === '*' ? 0 : token.includes(agent) ? agent.length : -1))
  const bestGroup = Math.max(-1, ...groups.map(g => specificity(g.agents)))
  if (bestGroup < 0) return false
  let bestLength = -1, allowed = true
  for (const rule of groups.filter(g => specificity(g.agents) === bestGroup).flatMap(g => g.rules)) {
    const anchored = rule.path.endsWith('$')
    const pattern = anchored ? rule.path.slice(0, -1) : rule.path
    if (!matchesRule(pattern, pathOctets(path), anchored)) continue
    const length = pattern.replace(/\*/g, '').length
    if (length > bestLength) { bestLength = length; allowed = rule.allow }
    else if (length === bestLength && rule.allow) allowed = true
  }
  return allowed
}

/** Extract only a short title; HTML is never trusted, executed, or retained. */
export function normalizeTitle(html: string): string | null {
  const inert = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(inert)?.[1]
  if (!title) return null
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', hellip: '…',
  }
  const plain = title.replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|rsquo|lsquo|hellip);/gi, (_, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? ' '
    const code = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' '
  }).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[kontaktuppgift borttagen]')
    .replace(/(?:\+\d[\d ()-]{6,}\d|\b0\d[\d ()-]{6,}\d\b)/g, '[kontaktuppgift borttagen]')
    .replace(/\s+/g, ' ').trim().slice(0, 160)
  return plain || null
}
