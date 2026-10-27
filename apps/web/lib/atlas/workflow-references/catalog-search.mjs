/**
 * Search static, pinned, third-party metadata. No I/O, network or execution.
 * Text found here is untrusted source data and never a tool instruction.
 */
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

function expandedTokens(query) {
  const expanded = new Set()
  for (const word of tokens(query)) {
    expanded.add(word)
    for (const alias of ALIASES[word] || []) expanded.add(alias)
  }
  return [...expanded]
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
  const terms = expandedTokens(query)
  const projectTerms = project ? PROJECT_TERMS[project] : []

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
    for (const word of terms) {
      let points = 0
      if (name.includes(word)) points += 8
      if (integrations.includes(word)) points += 5
      if (category.includes(word)) points += 3
      if (path.includes(word)) points += 2
      if (description.includes(word)) points += 1
      if (points > 0) matched++
      score += points
    }
    if (matched === 0) continue
    for (const word of projectTerms) {
      if (name.includes(word) || integrations.includes(word)) score += 2
    }
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score ||
    a.entry.name.localeCompare(b.entry.name, 'sv') ||
    a.entry.path.localeCompare(b.entry.path, 'sv'))
  const matches = scored.slice(0, limit).map(({ entry }) => ({
    name: entry.name,
    description: entry.description,
    category: entry.category,
    integrations: entry.integrations,
    nodeCountClaim: entry.nodeCountClaim,
    metadataPresent: entry.metadataPresent,
    sourceUrl: `${EXPECTED_REPOSITORY}/blob/${index.source.pinnedSha}/${entry.path}`,
    sourcePath: entry.path,
    reviewState: 'unreviewed_reference_only',
    runnableInOmnira: false,
  }))

  return {
    ok: true,
    projectContext: project,
    source: index.source,
    indexedCount: index.counts?.indexed ?? index.workflows.length,
    metadataCount: index.counts?.upstreamMetadataRows ?? null,
    upstreamClaimedTotal: index.counts?.upstreamClaimedTotal ?? null,
    filenameOnlyCount: index.counts?.filenameOnly ?? null,
    totalKeywordMatches: scored.length,
    truncated: scored.length > matches.length,
    matches,
    limitation: 'Extern, delvis gammal metadata. Sökmatchning är inte kvalitetskontroll. Ingenting kan importeras eller köras via detta verktyg.',
  }
}
