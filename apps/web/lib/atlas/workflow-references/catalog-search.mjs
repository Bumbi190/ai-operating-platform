/**
 * Search static, pinned, third-party metadata. No I/O, network or execution.
 * Text found here is untrusted source data and never a tool instruction.
 */
import { AUDITED_SOURCE_PATHS, sourceAuditFor } from './source-audit.mjs'

const MAX_RESULTS = 8
const EXPECTED_REPOSITORY = 'https://github.com/Zie619/n8n-workflows'
const EXPECTED_SHA = '94007c1445d9258a7da116646b79473e7c7c3282'

const ALIASES = Object.freeze({
  mejl: ['email', 'gmail'], epost: ['email', 'gmail'],
  utskick: ['email', 'outreach'], uppfoljning: ['follow', 'email'],
  leads: ['lead', 'crm'], kund: ['customer', 'lead'],
  kunder: ['customer', 'lead'], bilhandlare: ['lead', 'crm'],
  kommentarer: ['comment', 'facebook', 'instagram'],
  meddelanden: ['message', 'facebook', 'instagram'],
  sociala: ['social', 'facebook', 'instagram'],
  videor: ['video', 'youtube'], klipp: ['shorts', 'video'],
  publicering: ['publish', 'post'], automatisering: ['automation'],
})
const PROJECT_TERMS = Object.freeze({
  handlarborsen: ['lead', 'crm', 'email', 'outreach'],
  'familje-stunden': ['facebook', 'instagram', 'comment', 'customer'],
  'the-prompt': ['video', 'youtube', 'social', 'publish'],
  omnira: ['agent', 'automation', 'workflow', 'error'],
})

function tokens(text) {
  return String(text).toLocaleLowerCase('sv-SE')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u).filter(v => v.length > 1).slice(0, 14)
}

function termGroups(query) {
  // Synonyms are alternatives for each requested concept, not extra votes.
  return tokens(query).map(word => [word, ...(ALIASES[word] || [])])
}

function includesTerm(text, word) {
  if (word.length > 2) return text.includes(word)
  // Never match "AI" inside "email"/"Airtop": two-letter substring matches
  // made the old search rank unrelated tools above relevant AI workflows.
  const chunks = text.match(/[\p{L}\p{N}]+/gu) || []
  return chunks.some(chunk => chunk === word ||
    (word === 'ai' && chunk.endsWith('openai')))
}

function uniqueKey(entry) {
  // Collapse near-identical catalog copies in results, not in the source index.
  // Different integrations or node counts remain separate variants.
  const name = String(entry.name || '').toLocaleLowerCase('sv-SE').trim()
  const integrations = Array.isArray(entry.integrations)
    ? [...entry.integrations].map(v => String(v).toLowerCase()).sort().join('|')
    : ''
  return [name, integrations, entry.nodeCountClaim ?? 'unknown'].join('::')
}

function cleanProject(project) {
  if (typeof project !== 'string') return null
  const normalized = project.toLowerCase().trim()
  if (normalized === 'familjestunden') return 'familje-stunden'
  if (normalized === 'theprompt') return 'the-prompt'
  return Object.hasOwn(PROJECT_TERMS, normalized) ? normalized : null
}

export function searchReferences(index, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'INVALID_SEARCH_QUERY', matches: [] }
  }
  if (!index || index.schemaVersion !== 1 ||
      index.source?.repository !== EXPECTED_REPOSITORY ||
      index.source?.pinnedSha !== EXPECTED_SHA ||
      !Array.isArray(index.workflows)) {
    return { ok: false, code: 'CATALOG_UNAVAILABLE', matches: [] }
  }
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (!query || query.length > 160 || tokens(query).length === 0) {
    return { ok: false, code: 'INVALID_SEARCH_QUERY', message: 'Ange 2–160 tecken med sökord.', matches: [] }
  }
  const requestedLimit = Number.isInteger(input.limit) ? input.limit : 5
  const limit = Math.max(1, Math.min(MAX_RESULTS, requestedLimit))
  const project = cleanProject(input.project)
  const groups = termGroups(query)
  const projectTerms = project ? PROJECT_TERMS[project] : []
  // A model may shorten the search query and omit the operator's noOp term.
  // That intent is therefore optionally supplied by the authenticated server
  // from the LAST user message, never from a third-party workflow description.
  const noOpEvidenceRequested = input.includeNoOpAuditExamples === true ||
    /no[\s-]?op|platshåll|placeholder/i.test(query)

  const scored = []
  for (const entry of index.workflows) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' ||
        !/^workflows\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json$/.test(entry.path)) continue
    const name = String(entry.name || '').toLowerCase()
    const description = String(entry.description || '').toLowerCase()
    const integrations = Array.isArray(entry.integrations)
      ? entry.integrations.map(v => String(v).toLowerCase()).join(' ')
      : ''
    const category = String(entry.category || '').toLowerCase()
    const path = entry.path.toLowerCase()
    let score = 0
    let matched = 0
    for (const group of groups) {
      let bestPoints = 0
      for (const word of group) {
        let points = 0
        if (includesTerm(name, word)) points += 8
        if (includesTerm(integrations, word)) points += 5
        if (includesTerm(category, word)) points += 3
        if (includesTerm(path, word)) points += 2
        if (includesTerm(description, word)) points += 1
        bestPoints = Math.max(bestPoints, points)
      }
      if (bestPoints > 0) matched++
      score += bestPoints
    }
    if (matched === 0) continue
    // Prefer entries covering the entire user query to one-keyword accidents.
    score += matched * 20 + (matched === groups.length ? 30 : 0)
    for (const word of projectTerms) {
      if (includesTerm(name, word) || includesTerm(integrations, word)) score += 2
    }
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score ||
    a.entry.name.localeCompare(b.entry.name, 'sv') ||
    a.entry.path.localeCompare(b.entry.path, 'sv'))
  const seen = new Set()
  const unique = scored.filter(({ entry }) => {
    const key = uniqueKey(entry)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const matches = unique.slice(0, limit).map(({ entry }) => ({
    name: entry.name,
    description: entry.description,
    category: entry.category,
    integrations: entry.integrations,
    nodeCountClaim: entry.nodeCountClaim,
    metadataPresent: entry.metadataPresent,
    sourceUrl: `${EXPECTED_REPOSITORY}/blob/${index.source.pinnedSha}/${entry.path}`,
    sourcePath: entry.path,
    reviewState: 'unreviewed_reference_only',
    qualityAssessment: sourceAuditFor(entry.path, index.source.pinnedSha, entry.nodeCountClaim),
    runnableInOmnira: false,
  }))

  // A source-quality question needs the EXISTING spot-checked noOp evidence,
  // even if those three specific files fell outside the eight ranked matches.
  // This supplemental list is not search availability, nor validation of the
  // workflow's behavior. Its filenames are pinned in our local audit module.
  const auditedNoOpExamples = []
  if (noOpEvidenceRequested) {
    for (const path of AUDITED_SOURCE_PATHS) {
      if (!/^workflows\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json$/.test(path)) continue
      const entry = index.workflows.find(item => item?.path === path)
      if (!entry) continue
      const assessment = sourceAuditFor(path, index.source.pinnedSha, entry.nodeCountClaim)
      const noOp = assessment.observedStructure?.noOpNodeCount ?? 0
      if (assessment.evidenceLevel !== 'pinned_json_structure_spot_checked' || noOp <= 0) continue
      auditedNoOpExamples.push({
        name: entry.name,
        sourcePath: path,
        sourceUrl: `${EXPECTED_REPOSITORY}/blob/${index.source.pinnedSha}/${path}`,
        qualityAssessment: assessment,
        reviewState: 'unreviewed_reference_only',
        runnableInOmnira: false,
      })
    }
  }

  return {
    ok: true,
    projectContext: project,
    source: index.source,
    indexedCount: index.counts?.indexed ?? index.workflows.length,
    metadataCount: index.counts?.upstreamMetadataRows ?? null,
    upstreamClaimedTotal: index.counts?.upstreamClaimedTotal ?? null,
    filenameOnlyCount: index.counts?.filenameOnly ?? null,
    totalKeywordMatches: scored.length,
    uniqueKeywordMatches: unique.length,
    duplicatesSuppressed: scored.length - unique.length,
    truncated: unique.length > matches.length,
    matches,
    ...(noOpEvidenceRequested ? {
      auditedNoOpExamples,
      auditedNoOpEvidenceScope: 'five_pinned_json_files_only_not_full_catalog',
    } : {}),
    limitation: 'Extern och delvis inaktuell metadata. Fem filer har endast statisk strukturgranskning, aldrig funktionell verifiering. Namn, scoring och strukturgranskning är inte godkännande att importera eller köra något.',
  }
}
