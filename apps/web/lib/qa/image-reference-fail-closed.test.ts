/**
 * lib/qa/image-reference-fail-closed.test.ts
 *
 * Regression cover for one defect: a REQUIRED character reference that fails to
 * load used to be a warning, after which generation continued WITHOUT it.
 *
 *     imageData = await generateWithReference(…, imgRef)
 *       ?? await generateWithRetry(prompt, …, 'färgläggning bild 1 (utan ref)')
 *
 * `generateWithReference` returned `null` when the reference could not be
 * fetched, `??` fired, and `generateWithRetry` made a NEW paid call with no
 * reference attached. A request whose whole point was character consistency
 * silently became an unconstrained one — and for Familje-Stunden that is not a
 * degraded result, it is the wrong characters.
 *
 * The path had NO test coverage before this file: `h1-executor.test.ts` mocks
 * `runStep` wholesale, so nothing exercised `runImageStep`.
 *
 * ── WHAT IS DRIVEN ─────────────────────────────────────────────────────────
 * The real `runStep` → `runImageStep`, through the COLORING branch (the default
 * when no COVER/SAGA/ACTIVITY flag is present). That branch is the shortest
 * route to the defect: no Ideogram attempt, no vision QA — straight to
 * `generateWithReference ?? generateWithRetry`.
 *
 * No network, no Supabase, no provider. `fetch` is stubbed, the OpenAI client is
 * mocked, and storage is mocked. A test for this must not be able to spend.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Capture surfaces ─────────────────────────────────────────────────────────

/** Every governed provider call, in order. The heart of the proof. */
let editCalls: Array<{ prompt: string; hasImage: boolean }> = []
let generateCalls: Array<{ prompt: string }> = []

let fetchCalls: string[] = []
/** url → response. Absent means "reference missing" (HTTP 404). */
let fetchResponses: Map<string, { ok: boolean; status: number; bytes: Uint8Array }> = new Map()
let fetchShouldThrow: string | null = null

let editShouldThrow: string | null = null
let editReturnsEmpty = false
let uploadedPaths: string[] = []

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0)])

const SUPABASE_URL = 'https://sb.example'
const REF_BASE = `${SUPABASE_URL}/storage/v1/object/public/run-images/references/juni`

// ── Mocks (must precede the import of the module under test) ────────────────

vi.mock('@/lib/ai/openai-client', () => ({
  // The two governed boundaries. Both wrap withGovernedSpend in production, so
  // "was this called?" is exactly "was budget reserved and money spendable?".
  openAIImageEdit: async (_ctx: unknown, params: any) => {
    editCalls.push({ prompt: params.prompt, hasImage: Boolean(params.image) })
    if (editShouldThrow) throw new Error(editShouldThrow)
    if (editReturnsEmpty) return { data: [] }          // 2xx, no image payload
    return { data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }
  },
  openAIImageGenerate: async (_ctx: unknown, params: any) => {
    generateCalls.push({ prompt: params.prompt })
    return { data: [{ b64_json: Buffer.from(PNG).toString('base64') }] }
  },
  openAIChatCompletion: async () => ({ choices: [{ message: { content: '{}' } }] }),
  openAISpeech: async () => new Response(null),
  estimateOpenAIChatSek: async () => 0,
  estimateOpenAISpeechSek: async () => 0,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => { uploadedPaths.push(path); return { error: null } },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${SUPABASE_URL}/img/${path}` } }),
      }),
    },
  }),
}))

// Ideogram is not reached by the coloring branch, but the module is imported.
vi.mock('@/lib/media/image-client', () => ({
  generateIdeogramLegacy: async () => { throw new Error('ideogram must not be called in this suite') },
  IdeogramHttpError: class IdeogramHttpError extends Error {},
}))

vi.mock('@/lib/ai/anthropic', () => ({ getAnthropic: () => ({}) }))

vi.stubGlobal('fetch', async (input: any) => {
  const url = typeof input === 'string' ? input : String(input)
  fetchCalls.push(url)
  if (fetchShouldThrow) throw new Error(fetchShouldThrow)
  const r = fetchResponses.get(url)
  if (!r) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
  return {
    ok: r.ok,
    status: r.status,
    arrayBuffer: async () => r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength),
  }
})

// ── Module under test ────────────────────────────────────────────────────────
//
// The env var must be set BEFORE the import: `JUNI_REF_BASE` is computed once at
// module scope, so a value assigned in beforeEach would arrive too late. That is
// also why the "unconfigured" case below needs its own module instance.
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL

const { runStep, MissingReferenceError } = await import('@/lib/ai/runner')

const EXECUTION = { context: 'OPERATOR_EXECUTION', scope: { kind: 'GLOBAL_ONLY' } } as any

/** Drives the coloring branch: no COVER/SAGA/ACTIVITY flag in the system prompt. */
async function runColoringStep(promptCount = 1) {
  const prompts = Array.from({ length: promptCount }, (_, i) => `scene ${i + 1}`)
  const res = await runStep({
    execution:     EXECUTION,
    systemPrompt:  'Coloring pages for Familje-Stunden.',
    userMessage:   JSON.stringify(prompts),
    model:         'gpt-image-1',
    runId:         'run-1',
    maxImages:     promptCount,
    cost:          { projectId: null, agent: 'Image Director', operation: 'Generate Image' },
  })
  return JSON.parse(res.content) as { urls: string[]; errors?: string[] }
}

beforeEach(() => {
  editCalls = []
  generateCalls = []
  fetchCalls = []
  fetchResponses = new Map()
  fetchShouldThrow = null
  editShouldThrow = null
  editReturnsEmpty = false
  uploadedPaths = []
})

/** Make reference N resolvable. */
function withReference(n: number, bytes: Uint8Array = PNG) {
  fetchResponses.set(`${REF_BASE}/image-${n}.png`, { ok: true, status: 200, bytes })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 — the happy path still works
// ─────────────────────────────────────────────────────────────────────────────

describe('a retrievable reference still generates normally', () => {
  it('calls the reference-based provider WITH the image attached, and never the plain one', async () => {
    withReference(1)
    const out = await runColoringStep()

    expect(editCalls).toHaveLength(1)
    expect(editCalls[0].hasImage).toBe(true)          // the reference really was attached
    expect(generateCalls).toEqual([])                  // no unreferenced call at all
    expect(out.urls).toHaveLength(1)
    expect(out.errors).toBeUndefined()
    expect(uploadedPaths).toEqual(['runs/run-1/image-0.png'])
  })

  it('fetches exactly the expected reference URL', async () => {
    withReference(1)
    await runColoringStep()
    expect(fetchCalls).toEqual([`${REF_BASE}/image-1.png`])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2, 3, 4 — the defect: failure must fail closed, with no provider call
// ─────────────────────────────────────────────────────────────────────────────

describe('a required reference that cannot be retrieved fails closed', () => {
  /** Every way retrieval can fail. All must behave identically. */
  const cases: Array<[string, () => void]> = [
    ['missing (HTTP 404)',       () => { /* no fetchResponses entry */ }],
    ['server error (HTTP 500)',  () => { fetchResponses.set(`${REF_BASE}/image-1.png`, { ok: false, status: 500, bytes: PNG }) }],
    ['network failure',          () => { fetchShouldThrow = 'ECONNREFUSED' }],
    ['empty file (0 bytes)',     () => { fetchResponses.set(`${REF_BASE}/image-1.png`, { ok: true, status: 200, bytes: new Uint8Array(0) }) }],
  ]

  for (const [label, arrange] of cases) {
    it(`${label}: NO provider call of any kind, and the failure is reported`, async () => {
      arrange()
      const out = await runColoringStep()

      // THE ASSERTION THE DEFECT WAS ABOUT. Before the fix, `generateCalls`
      // held one unreferenced, billable call here.
      expect(generateCalls).toEqual([])
      expect(editCalls).toEqual([])

      // Fails according to the existing contract: no url, an entry in errors[].
      expect(out.urls).toEqual([])
      expect(out.errors).toHaveLength(1)
      expect(out.errors![0]).toMatch(/Bild 1 misslyckades/)
      expect(out.errors![0]).toMatch(/[Oo]bligatorisk referensbild/)

      // Nothing was stored either — no artifact claims to be a referenced image.
      expect(uploadedPaths).toEqual([])
    })
  }

  it('an unconfigured reference base ALSO fails closed, on a fresh module', async () => {
    // JUNI_REF_BASE is frozen at module load, so this case needs its own module
    // instance rather than a runtime env change. Worth proving separately: a
    // deploy missing NEXT_PUBLIC_SUPABASE_URL is precisely the situation where
    // every generation would have silently lost its reference.
    vi.resetModules()
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      const fresh = await import('@/lib/ai/runner')
      const res = await fresh.runStep({
        execution: EXECUTION,
        systemPrompt: 'Coloring pages for Familje-Stunden.',
        userMessage: JSON.stringify(['scene 1']),
        model: 'gpt-image-1',
        runId: 'run-1',
        maxImages: 1,
        cost: { projectId: null, agent: 'Image Director', operation: 'Generate Image' },
      })
      const out = JSON.parse(res.content) as { urls: string[]; errors?: string[] }

      expect(generateCalls).toEqual([])
      expect(editCalls).toEqual([])
      expect(fetchCalls).toEqual([])          // not even attempted
      expect(out.urls).toEqual([])
      expect(out.errors![0]).toMatch(/NEXT_PUBLIC_SUPABASE_URL saknas/)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = saved
      vi.resetModules()
    }
  })

  it('never silently substitutes a prompt-only generation', async () => {
    // The old fallback labelled itself "(utan ref)" and pushed a URL into the
    // successful set. The distinguishing property of the fix is that the caller
    // gets NO image rather than a different one.
    const out = await runColoringStep()
    expect(out.urls).toEqual([])
    expect(generateCalls.map(c => c.prompt)).toEqual([])
  })

  it('throws MissingReferenceError, naming the reference', async () => {
    // Asserted through the surfaced error text, since runImageStep catches per
    // image. The class is exported so a future caller can branch on it.
    const out = await runColoringStep()
    expect(out.errors![0]).toContain('image-1.png')
    expect(new MissingReferenceError('x.png', 'why')).toBeInstanceOf(Error)
    expect(new MissingReferenceError('x.png', 'why').name).toBe('MissingReferenceError')
  })

  it('one bad reference does not stop a later good one from generating', async () => {
    // Fail-closed must mean "this image is refused", not "the step is poisoned".
    withReference(2)
    const out = await runColoringStep(2)

    expect(out.errors).toHaveLength(1)              // image 1 refused
    expect(out.urls).toHaveLength(1)                // image 2 generated
    expect(editCalls).toHaveLength(1)
    expect(editCalls[0].hasImage).toBe(true)
    expect(generateCalls).toEqual([])               // and never unreferenced
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 — unrelated behaviour preserved
// ─────────────────────────────────────────────────────────────────────────────

describe('a constrained generation that FAILS also fails closed', () => {
  it('provider error after a successful reference → no unreferenced retry', async () => {
    // The locked contract. The reference was retrieved and honoured; the
    // provider fell over. Previously this returned null and the caller made a
    // SECOND, paid, unreferenced call. Now it throws.
    withReference(1)
    editShouldThrow = 'provider 500'

    const out = await runColoringStep()

    expect(editCalls).toHaveLength(1)      // constrained attempt happened
    expect(generateCalls).toEqual([])      // and NOTHING unreferenced followed
    expect(out.urls).toEqual([])
    expect(out.errors).toHaveLength(1)
    expect(out.errors![0]).toMatch(/Referensbunden generering/)
  })

  it('exactly ONE paid attempt: a failed constrained call triggers no second call', async () => {
    // Task 3B stated directly. openAIImageEdit and openAIImageGenerate are the
    // only two functions on this path that enter withGovernedSpend, so counting
    // them counts billable attempts.
    withReference(1)
    editShouldThrow = 'provider 500'

    await runColoringStep()

    const paidAttempts = editCalls.length + generateCalls.length
    expect(paidAttempts).toBe(1)
  })

  it('a 2xx carrying no image data → no unreferenced retry', async () => {
    // A malformed-but-successful provider response used to return null and take
    // the same fallback. It is now a ReferenceGenerationError.
    withReference(1)
    editReturnsEmpty = true

    const out = await runColoringStep()

    expect(editCalls).toHaveLength(1)
    expect(generateCalls).toEqual([])
    expect(out.urls).toEqual([])
    expect(out.errors![0]).toMatch(/utan bilddata/)
  })

  it('rate-limit retries stay INSIDE the constrained path, then fail closed', async () => {
    // Retrying the reference-constrained call is legitimate — it still carries
    // the reference. What must not happen is the retries running out and then
    // an unreferenced call being made instead.
    //
    // The backoff is 15s/30s of real time. Collapsed here rather than waited
    // out: this test is about WHICH calls happen, not how long they wait, and a
    // 45-second unit test is one nobody runs.
    const realSetTimeout = globalThis.setTimeout
    ;(globalThis as any).setTimeout = (fn: () => void) => realSetTimeout(fn, 0)
    try {
      withReference(1)
      editShouldThrow = 'rate limit exceeded'

      const out = await runColoringStep()

      expect(editCalls.length).toBeGreaterThan(1)   // retried with the reference
      expect(editCalls.every(c => c.hasImage)).toBe(true)
      expect(generateCalls).toEqual([])             // never without it
      expect(out.urls).toEqual([])
      expect(out.errors![0]).toMatch(/Referensbunden generering/)
    } finally {
      globalThis.setTimeout = realSetTimeout
    }
  })
})

describe('genuinely no-reference paths are untouched', () => {
  it('COVER mode still generates with no reference at all', async () => {
    // The one branch with an explicit, documented no-reference contract
    // ("Ingen referensbild" in runner.ts). It never calls generateWithReference,
    // so the fix must not affect it — this is the control for over-reach.
    const res = await runStep({
      execution:    EXECUTION,
      systemPrompt: 'COVER_ILLUSTRATIONS for Familje-Stunden.',
      userMessage:  JSON.stringify(['a cover scene']),
      model:        'gpt-image-1',
      runId:        'run-1',
      maxImages:    1,
      cost:         { projectId: null, agent: 'Image Director', operation: 'Generate Image' },
    })
    const out = JSON.parse(res.content) as { urls: string[]; errors?: string[] }

    expect(generateCalls).toHaveLength(1)   // the unreferenced call is CORRECT here
    expect(editCalls).toEqual([])           // and no reference call is made
    expect(fetchCalls).toEqual([])          // no reference is even looked for
    expect(out.urls).toHaveLength(1)
    expect(out.errors).toBeUndefined()
  })

  it('cover mode is unaffected by a missing reference store', async () => {
    // No fetchResponses configured at all — irrelevant to a path that needs none.
    const res = await runStep({
      execution:    EXECUTION,
      systemPrompt: 'COVER_ILLUSTRATIONS for Familje-Stunden.',
      userMessage:  JSON.stringify(['a cover scene']),
      model:        'gpt-image-1',
      runId:        'run-1',
      maxImages:    1,
      cost:         { projectId: null },
    })
    expect(JSON.parse(res.content).urls).toHaveLength(1)
  })
})

describe('every required-reference call site obeys the invariant', () => {
  // Task 4 #7. Asserted on source rather than by driving saga/activity end to
  // end: those branches need Ideogram + vision-QA mocking that proves nothing
  // extra about THIS invariant, whereas the source assertion covers all three
  // sites exactly and fails the moment one regains a fallback.
  it('no generateWithReference call is followed by an unreferenced fallback', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../ai/runner.ts', import.meta.url), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

    // Three CALL sites (the `async function` definition is excluded by the
    // `await` prefix), none followed by `?? ...generateWithRetry`.
    const sites = [...code.matchAll(/await generateWithReference\(/g)]
    expect(sites.length).toBe(3)
    expect(code).not.toMatch(/generateWithReference\([\s\S]{0,400}?\?\?[\s\S]{0,80}?generateWithRetry/)

    // And the label that marked the old escape path is gone from the code.
    expect(code).not.toContain('utan ref')
  })

  it('generateWithRetry survives only for the genuinely unreferenced branch', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../ai/runner.ts', import.meta.url), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

    // One definition + exactly one call, and that call is the cover branch.
    const calls = [...code.matchAll(/await generateWithRetry\(/g)]
    expect(calls.length).toBe(1)
    expect(code).toMatch(/imageData = await generateWithRetry\(coverPrompt/)
  })
})

describe('behaviour outside the defect is unchanged', () => {

  it('every fetched reference URL stays under the configured base', async () => {
    // Names are caller-built today, but they are a PARAMETER that lands in a
    // URL, so the name is validated regardless of who calls. This asserts the
    // observable consequence: nothing escapes the reference prefix.
    withReference(1)
    await runColoringStep()
    expect(fetchCalls).not.toEqual([])
    expect(fetchCalls.every(u => u.startsWith(`${REF_BASE}/`))).toBe(true)
    expect(fetchCalls.some(u => u.includes('..'))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 — governed spend
// ─────────────────────────────────────────────────────────────────────────────

describe('governed spend', () => {
  it('the reference is fetched BEFORE the governed boundary, so nothing is reserved', async () => {
    // openAIImageEdit/openAIImageGenerate are the only functions that call
    // withGovernedSpend on this path. Neither is invoked, so no reservation is
    // created and there is nothing to release — the failure happens strictly
    // upstream of spend rather than being refunded after it.
    await runColoringStep()
    expect(editCalls).toEqual([])
    expect(generateCalls).toEqual([])
    expect(fetchCalls).toHaveLength(1)   // only the reference fetch happened
  })

  it('spend infrastructure was not restructured by this fix', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../ai/runner.ts', import.meta.url), 'utf8')

    // The governed boundary is still reached through the same two functions,
    // and this fix added no spend concept of its own.
    expect(src).toContain('openAIImageEdit')
    expect(src).toContain('openAIImageGenerate')
    expect(src).not.toMatch(/withGovernedSpend|reserveSpend|releaseSpend|settleSpend/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Negative control — proof the suite would catch a restored fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('negative control: restoring either fallback must break the suite', () => {
  /**
   * Both escapes are reconstructed here and shown to violate the properties the
   * suite pins. Without this, a green run would only prove the current code
   * passes — not that it would notice the old behaviour returning.
   */

  it('ESCAPE 1 — null on retrieval failure, then `?? unreferenced`', async () => {
    const oldFetchReferenceBuffer = async (): Promise<Buffer | null> => {
      try {
        const res: any = await (globalThis.fetch as any)(`${REF_BASE}/image-1.png`)
        if (!res.ok) return null                       // ← the defect
        return Buffer.from(await res.arrayBuffer())
      } catch { return null }                           // ← the defect
    }
    const oldGenerateWithReference = async () => {
      const buf = await oldFetchReferenceBuffer()
      if (!buf) return null                             // ← the defect
      return { b64_json: 'x' }
    }

    // Reference unavailable (no fetchResponses entry → 404).
    const imageData = await oldGenerateWithReference()
      ?? await (async () => {
        generateCalls.push({ prompt: 'coloring prompt (utan ref)' })
        return { b64_json: 'y' }
      })()

    expect(imageData).not.toBeNull()
    expect(generateCalls).toHaveLength(1)               // an UNREFERENCED paid call

    // Which is exactly what the real suite forbids:
    expect(() => expect(generateCalls).toEqual([])).toThrow()
  })

  it('ESCAPE 2 — null on constrained-generation failure, then `?? unreferenced`', async () => {
    // The escape this amendment closes. The reference loaded fine; the provider
    // failed; the old code returned null and paid for a second, unreferenced
    // generation.
    withReference(1)

    const oldGenerateWithReference = async () => {
      const res: any = await (globalThis.fetch as any)(`${REF_BASE}/image-1.png`)
      const buf = Buffer.from(await res.arrayBuffer())
      expect(buf.byteLength).toBeGreaterThan(0)         // reference WAS available
      try {
        editCalls.push({ prompt: 'constrained', hasImage: true })
        throw new Error('provider 500')                 // constrained call fails
      } catch {
        return null                                     // ← the defect
      }
    }

    const imageData = await oldGenerateWithReference()
      ?? await (async () => {
        generateCalls.push({ prompt: 'coloring prompt (utan ref)' })
        return { b64_json: 'y' }
      })()

    expect(imageData).not.toBeNull()
    expect(editCalls).toHaveLength(1)
    expect(generateCalls).toHaveLength(1)               // the second, unreferenced call

    // The suite's invariants both fail against it:
    expect(() => expect(generateCalls).toEqual([])).toThrow()
    expect(() => expect(editCalls.length + generateCalls.length).toBe(1)).toThrow()
  })

  it('the real implementation refuses BOTH scenarios', async () => {
    // Same two arrangements, run against the real code path.
    const missing = await runColoringStep()                     // no reference
    expect(missing.urls).toEqual([])
    expect(generateCalls).toEqual([])

    editCalls = []; generateCalls = []
    withReference(1)
    editShouldThrow = 'provider 500'
    const failed = await runColoringStep()                      // constrained failure
    expect(failed.urls).toEqual([])
    expect(generateCalls).toEqual([])
    expect(editCalls).toHaveLength(1)
  })
})
