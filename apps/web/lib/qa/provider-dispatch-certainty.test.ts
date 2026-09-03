/**
 * lib/qa/provider-dispatch-certainty.test.ts — the repo-wide invariant.
 *
 * ── THE CLAIM THIS GUARDS ──────────────────────────────────────────────────
 * `ProviderNotDispatchedError` is a POSITIVE claim: the adapter can prove the
 * provider operation was never created, so `withGovernedSpend` may hand the
 * budget back and a caller may repeat the operation.
 *
 * It must never mean merely "fetch threw". A socket reset or a fired deadline
 * proves nothing, and claiming it there costs twice: budget released for work
 * that may have been billed, and a retry that buys the same thing again.
 *
 * ── WHY A STRUCTURAL GUARD AND NOT ONLY BEHAVIOURAL TESTS ──────────────────
 * The defect was written four separate times, in four adapters, by copying the
 * nearest example. Behavioural tests catch it only where someone thought to
 * write one; this catches the SHAPE, everywhere, including in an adapter that
 * does not exist yet.
 *
 * The rule is deliberately narrow: a `catch` that raises
 * `ProviderNotDispatchedError` must have consulted an approved classifier
 * FIRST. It says nothing about status-code branches, which are a different
 * (and already correct) judgement.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/** The classifiers that may license a not-dispatched claim. Closed list. */
const APPROVED_CLASSIFIERS = [
  // Proves the request never left the machine. `lib/media/job/dispatch.ts`.
  'classifyTransportFailure',
  // Proves the VENDOR answered and did no work (4xx). Same module.
  'statusProvesNotCreated',
  // The SDK-status equivalent, used by the Anthropic/OpenAI clients.
  'provablyNotBilled',
  // The media governed-dispatch adapter's own classifier. It does not judge
  // transport itself — it READS the `dispatchObservation` the provider adapter
  // already set from `classifyTransportFailure`, so a claim it licenses is
  // licensed transitively by the first entry on this list.
  'classifyProviderDispatchFailure',
] as const

function runtimeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (entry === 'qa' || entry === 'node_modules' || entry === '__tests__') continue
      runtimeFiles(rel, acc)
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
    acc.push(rel)
  }
  return acc
}

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/**
 * Every `catch` block that raises a not-dispatched claim, with the text of that
 * block. Deliberately block-scoped: a classifier called elsewhere in the file
 * does not license a claim made in a catch that ignored it.
 */
function notDispatchedCatchBlocks(body: string): string[] {
  const out: string[] = []
  const re = /catch\s*\([^)]*\)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < body.length && depth > 0) {
      if (body[i] === '{') depth++
      else if (body[i] === '}') depth--
      i++
    }
    const block = body.slice(m.index, i)
    if (block.includes('new ProviderNotDispatchedError')) out.push(block)
  }
  return out
}

const licensed = (block: string) =>
  APPROVED_CLASSIFIERS.some(c => block.includes(c))

describe('a not-dispatched claim is always licensed by a classifier', () => {
  const files = [...runtimeFiles('lib'), ...runtimeFiles('app')]

  it('scans a non-trivial amount of runtime source', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('every catch that claims NOT DISPATCHED consulted an approved classifier', () => {
    const offenders: string[] = []
    for (const rel of files) {
      for (const block of notDispatchedCatchBlocks(code(readFileSync(join(ROOT, rel), 'utf8')))) {
        if (!licensed(block)) offenders.push(rel)
      }
    }
    expect(offenders, 'a catch claims the provider was not billed without proving it').toEqual([])
  })

  it('the claim IS made somewhere — the scan is not vacuously empty', () => {
    const claimants = files.filter(rel =>
      notDispatchedCatchBlocks(code(readFileSync(join(ROOT, rel), 'utf8'))).length > 0)
    // Ideogram (×2), ElevenLabs (×2), OpenAI speech, Anthropic, OpenAI SDK,
    // and the governed media dispatch adapter all make it — legitimately.
    expect(claimants.length).toBeGreaterThanOrEqual(4)
  })

  it('REGRESSION — the guard detects an unlicensed claim', () => {
    const planted = code(`
      try { res = await fetch(url) } catch (e) {
        throw new ProviderNotDispatchedError('never reached the provider', e)
      }
    `)
    const blocks = notDispatchedCatchBlocks(planted)
    expect(blocks.length).toBe(1)
    expect(licensed(blocks[0])).toBe(false)
  })

  it('REGRESSION — a licensed claim passes', () => {
    const ok = code(`
      try { res = await fetch(url) } catch (e) {
        const verdict = classifyTransportFailure(e)
        if (verdict.sent === false) throw new ProviderNotDispatchedError('nope', e)
        throw new ProviderDispatchUnknownError({ provider: 'x', observation: 'response_lost', detail: '' })
      }
    `)
    expect(licensed(notDispatchedCatchBlocks(ok)[0])).toBe(true)
  })

  it('the approved list is exactly the four real classifiers', () => {
    expect([...APPROVED_CLASSIFIERS].sort()).toEqual([
      'classifyProviderDispatchFailure', 'classifyTransportFailure',
      'provablyNotBilled', 'statusProvesNotCreated',
    ])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TASK 11 — what every consumer of the ambiguity does with it
// ═════════════════════════════════════════════════════════════════════════════

describe('no consumer of ProviderDispatchUnknownError weakens it', () => {
  const files = [...runtimeFiles('lib'), ...runtimeFiles('app')]
  const consumers = files.filter(rel =>
    code(readFileSync(join(ROOT, rel), 'utf8')).includes('ProviderDispatchUnknownError'))

  it('there are consumers to audit', () => {
    expect(consumers.length).toBeGreaterThan(0)
  })

  it('none converts the ambiguity into a not-dispatched claim', () => {
    // The one forbidden translation: it would release budget and re-authorise a
    // repeat, which is the whole defect running backwards.
    for (const rel of consumers) {
      const body = code(readFileSync(join(ROOT, rel), 'utf8'))
      for (const block of notDispatchedCatchBlocks(body)) {
        expect(block, `${rel} downgrades an ambiguity to not-dispatched`)
          .not.toMatch(/instanceof\s+ProviderDispatchUnknownError[\s\S]{0,200}new ProviderNotDispatchedError/)
      }
    }
  })

  it('none releases spend on it', () => {
    for (const rel of consumers) {
      const body = code(readFileSync(join(ROOT, rel), 'utf8'))
      if (!/releaseSpend\s*\(/.test(body)) continue
      // `governed-spend.ts` releases ONLY for ProviderNotDispatchedError; no
      // other module may pair a release with the ambiguity type.
      expect(rel, `${rel} pairs releaseSpend with the ambiguity type`)
        .toBe('lib/cost/governed-spend.ts')
    }
  })

  it('governed-spend releases only for the not-dispatched claim', () => {
    const body = code(readFileSync(join(ROOT, 'lib/cost/governed-spend.ts'), 'utf8'))
    expect(body).toMatch(/instanceof ProviderNotDispatchedError/)
    expect(body).not.toMatch(/ProviderDispatchUnknownError/)
  })

  /** A call to something that creates a paid media side effect. */
  const GENERATION = /generateNewsImages?\(|generateVoiceover\(|generateIdeogramV3\(|generateIdeogramLegacy\(|openAIImageEdit\(|openAIImageGenerate\(|orchestrateImageGeneration\(|generateSoundEffect\(/
  const AUTHORITY = /dispatchedGenerationIsNotRetryable|generationMayAlreadyHaveDispatched/

  /** Balance from `open` at `from`, returning the enclosing span. */
  function span(body: string, from: number, open: string, close: string): string {
    const start = body.indexOf(open, from)
    if (start < 0) return ''
    let depth = 0, i = start
    while (i < body.length) {
      if (body[i] === open) depth++
      else if (body[i] === close) { depth--; if (depth === 0) return body.slice(start, i + 1) }
      i++
    }
    return body.slice(start)
  }

  /**
   * Every retry SCOPE in the repository that encloses a generation call.
   *
   * Scoped to the call, not the file. Three routes legitimately retry only
   * `claude.messages.create` while ALSO calling `generateVoiceover` elsewhere in
   * the same handler — a file-level rule flags those, which would have been a
   * false positive teaching the next reader to widen the guard.
   */
  function generationRetryScopes(body: string): string[] {
    const out: string[] = []
    for (const m of body.matchAll(/withRetry\s*\(/g)) {
      const call = span(body, m.index!, '(', ')')
      if (GENERATION.test(call)) out.push(call)
    }
    for (const m of body.matchAll(/for \(let attempt[^)]*\)\s*\{/g)) {
      const loop = span(body, m.index! + m[0].length - 1, '{', '}')
      if (GENERATION.test(loop)) out.push(loop)
    }
    return out
  }

  it('every retry scope around a generation carries the authority', () => {
    const offenders: string[] = []
    let scopes = 0
    for (const rel of files) {
      const body = code(readFileSync(join(ROOT, rel), 'utf8'))
      for (const scope of generationRetryScopes(body)) {
        scopes++
        if (!AUTHORITY.test(scope)) offenders.push(rel)
      }
    }
    // Non-vacuous: the repo really does retry generations in several places.
    expect(scopes).toBeGreaterThanOrEqual(6)
    expect(offenders, 'a retry scope repeats a paid generation without proving non-dispatch').toEqual([])
  })

  it('a retry over LLM TEXT ONLY is correctly NOT flagged', () => {
    // The shape three cron/pipeline routes actually have. It must not require
    // the authority, or the guard becomes noise and gets widened away.
    const llmOnly = code(`
      const res = await withRetry(() => claude.messages.create({ model: 'x' }))
      const voice = await generateVoiceover(text, execution)
    `)
    expect(generationRetryScopes(llmOnly)).toEqual([])
  })

  it('REGRESSION — the scope rule detects an unguarded generation retry', () => {
    const bad = code(`
      const urls = await withRetry(() => generateNewsImages(t, s, 3, execution),
        { attempts: 2, label: 'images' })
    `)
    const scopes = generationRetryScopes(bad)
    expect(scopes.length).toBe(1)
    expect(AUTHORITY.test(scopes[0])).toBe(false)
  })

  it('REGRESSION — a guarded generation retry passes', () => {
    const good = code(`
      const urls = await withRetry(() => generateNewsImages(t, s, 3, execution),
        { attempts: 2, isPermanent: dispatchedGenerationIsNotRetryable() })
    `)
    expect(AUTHORITY.test(generationRetryScopes(good)[0])).toBe(true)
  })

  it('REGRESSION — a hand-rolled loop around a generation is detected', () => {
    const loop = code(`
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try { return await openAIImageGenerate(ctx, params) } catch (err) { continue }
      }
    `)
    const scopes = generationRetryScopes(loop)
    expect(scopes.length).toBe(1)
    expect(AUTHORITY.test(scopes[0])).toBe(false)
  })
})
