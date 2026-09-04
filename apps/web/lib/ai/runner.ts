/**
 * AI Runner — executes a single workflow step by calling the LLM.
 *
 * Supported:
 * - Anthropic Claude (text)
 * - OpenAI GPT (text)
 * - OpenAI gpt-image-1 (covers + coloring pages)
 * - Ideogram v3 (saga + activity illustrations — flat cartoon style)
 *
 * IMAGE ROUTING STRATEGY:
 *   COVER_ILLUSTRATIONS    → gpt-image-1  (text-in-image capability)
 *   SAGA_ILLUSTRATIONS     → Ideogram v3  (flat cartoon native style)
 *   ACTIVITY_ILLUSTRATIONS → Ideogram v3  (flat cartoon native style)
 *   default (coloring)     → gpt-image-1  (B&W line art, works well)
 *
 * If IDEOGRAM_API_KEY is not set, saga/activity fall back to gpt-image-1.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI, { toFile } from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAnthropicModel, isOpenAIModel, isImageModel } from './models'
import { buildStylePrefix } from './style-governance'
import { buildVisionQaPrompt } from './golden-checklist'
import { logLlmCost } from '@/lib/cost/track'
import { getAnthropic } from '@/lib/ai/anthropic'
import {
  isExecutionGovernanceControlFlow,
  composeAbortSignals,
  type RunBoundAuthority, type AbortReason,
} from '@/lib/governance/execution-signal'
import {
  openAIChatCompletion, openAIImageEdit, openAIImageGenerate,
} from '@/lib/ai/openai-client'
import { generateIdeogramLegacy, IdeogramHttpError } from '@/lib/media/image-client'
import { generationMayAlreadyHaveDispatched } from '@/lib/media/orchestrator/retry-authority'
import { PLATFORM_COMPAT_PROJECT, type ProjectRef } from '@/lib/cost/governed-spend'
import type { ExecutionContract } from '@/lib/governance/execution-stop'

// ── Juni-referensbilder för konsekvent karaktärsstil ─────────────────────────
// Alla referensbilder ligger i run-images/references/juni/ i Supabase Storage.
// URL-basen byggs från NEXT_PUBLIC_SUPABASE_URL så att den fungerar i alla miljöer.
const JUNI_REF_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/run-images/references/juni`
  : null

/**
 * En OBLIGATORISK referensbild kunde inte hämtas eller validerades inte.
 *
 * Egen klass av samma skäl som `IdeogramHttpError`: felet måste gå att skilja
 * från ett generellt genereringsfel, både i tester och vid felsökning. Det är
 * en vanlig `Error` — samma catch i bildloopen fångar den, samma `errors[]`
 * rapporterar den. Inget nytt felsystem införs.
 */
export class MissingReferenceError extends Error {
  readonly referenceName: string

  constructor(referenceName: string, reason: string) {
    super(`Obligatorisk referensbild "${referenceName}" kunde inte användas: ${reason}`)
    this.name = 'MissingReferenceError'
    this.referenceName = referenceName
  }
}

/**
 * Referensen fanns, men den REFERENSBUNDNA genereringen gick inte att slutföra.
 *
 * Skild från `MissingReferenceError` därför att orsakerna kräver olika åtgärd:
 * den ena betyder "referensen saknas i lagringen", den andra "leverantören
 * klarade inte begäran". Utfallet är däremot detsamma och det är hela poängen —
 * båda kastar, ingendera faller tillbaka på obunden generering.
 */
export class ReferenceGenerationError extends Error {
  readonly referenceName: string

  constructor(referenceName: string, reason: string) {
    super(`Referensbunden generering med "${referenceName}" misslyckades: ${reason}`)
    this.name = 'ReferenceGenerationError'
    this.referenceName = referenceName
  }
}

/**
 * Endast ett enkelt filnamn. Ingen sökväg, ingen traversering, inget schema.
 *
 * Namnen byggs idag av anroparen (`saga-${i + 1}.png`), men de är en PARAMETER,
 * och ett namn som når URL-konkatenering nedan är i praktiken en URL-del. Om ett
 * framtida anrop skickar vidare något modell- eller användargenererat skulle
 * `../` eller ett absolut schema annars kunna peka om hämtningen. Validering här
 * gör regeln oberoende av vem som råkar anropa funktionen.
 */
const SAFE_REFERENCE_NAME = /^[A-Za-z0-9._-]+$/

/**
 * Hämtar en OBLIGATORISK referensbild från Supabase Storage.
 *
 * ── ÄNDRAT BETEENDE ────────────────────────────────────────────────────────
 * Returnerade tidigare `null` vid fel, vilket lät anroparen fortsätta generera
 * UTAN referensen. Kastar nu i stället. Se `generateWithReference`.
 *
 * Anledningen till att felet kastas HÄR och inte returneras som null: det är på
 * den här nivån den faktiska orsaken är känd (saknad env, HTTP-status,
 * nätverksfel). Ett `null` uppåt skulle tvinga anroparen att gissa varför.
 */
async function fetchReferenceBuffer(filename: string): Promise<Buffer> {
  if (!SAFE_REFERENCE_NAME.test(filename)) {
    throw new MissingReferenceError(filename, 'ogiltigt referensnamn')
  }
  if (!JUNI_REF_BASE) {
    throw new MissingReferenceError(filename, 'NEXT_PUBLIC_SUPABASE_URL saknas')
  }

  const url = `${JUNI_REF_BASE}/${filename}`
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new MissingReferenceError(filename, `hämtningen misslyckades (${msg})`)
  }

  if (!res.ok) {
    throw new MissingReferenceError(filename, `HTTP ${res.status}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength === 0) {
    // En tom fil är inte en referens. Utan den här kontrollen skulle en
    // trasig/tom uppladdning ta sig förbi som en giltig referens och ge
    // exakt den obundna generering som felet handlar om.
    throw new MissingReferenceError(filename, 'referensbilden är tom (0 byte)')
  }
  return buffer
}

/**
 * Genererar en bild MED Juni-referensbild via openai.images.edit().
 * Modellen får referensbilden som visuell guide för karaktärsstil och proportioner.
 *
 * ── LÅST KONTRAKT: EN OBLIGATORISK REFERENS FÅR ALDRIG FALLA BORT ──────────
 * Funktionen returnerar en bild som faktiskt genererades MED referensen, eller
 * kastar. Det finns inget tredje utfall, och returtypen är därför inte längre
 * nullbar — `?? någotAnnat` går inte att skriva mot den.
 *
 * Alla dessa lägen kastar, och det är avsiktligt att de behandlas lika:
 *
 *   • referensen gick inte att hämta          → MissingReferenceError
 *   • referensen validerade inte (tom, namn)  → MissingReferenceError
 *   • leverantörsanropet misslyckades         → ReferenceGenerationError
 *   • leverantören svarade utan bilddata      → ReferenceGenerationError
 *   • alla försök slut                        → ReferenceGenerationError
 *
 * VARFÖR ÄVEN LEVERANTÖRSFEL KASTAR. Tidigare returnerades `null` här, och
 * anroparen läste det som "prova något annat" — `?? generateWithRetry(...)`,
 * ett NYTT betalt anrop UTAN referens, med en prompt som fortfarande beordrade
 * strikt användning av en referensbild som inte bifogades. Kravet försvann
 * alltså tyst i exakt det läge då det var som svårast att upptäcka. En framtida
 * orkestrering får gärna försöka igen mot en ANNAN leverantör som också
 * uppfyller referenskravet — men kravet självt får aldrig tas bort.
 *
 * Vad som INTE ändras: `isCoverMode` har aldrig haft en referens (uttryckligt
 * "Ingen referensbild" i koden) och rör inte den här funktionen. Ideogram-vägen
 * i saga/aktivitet är också promptbaserad utan referens och är oförändrad —
 * den har sin egen vision-QA-grind.
 *
 * Kastet fångas av bildloopens befintliga try/catch, hamnar i `errors[]` och
 * räknas mot `consecutiveFailures`. Inga nya felvägar, ingen ny policy.
 */
async function generateWithReference(
  project: ProjectRef,
  execution: ExecutionContract,
  finalPrompt: string,
  size: '1024x1024' | '1024x1536',
  label: string,
  refFilename: string,
  maxRetries = 3,
  /**
   * G3C-3C-A. Threaded through the RETRY LOOP so every attempt enters its own
   * physical-request watch — one watcher around the batch would be exactly the
   * wrong lifetime.
   */
  authority?: RunBoundAuthority,
  /** Caller abort, composed with authority inside the adapter. */
  callerSignal?: AbortSignal,
  /** D2: every retry attempt is its own physical flight, and all of them count. */
  onFlight?: (f: { readonly authorityUnavailable: boolean } | undefined) => void,
): Promise<{ b64_json?: string | null }> {
  // Kastar MissingReferenceError. Ligger FÖRE varje provider-anrop, alltså
  // före den styrda spend-gränsen — ingen reservation hinner göras, och det
  // finns därmed heller ingenting att släppa.
  const refBuffer = await fetchReferenceBuffer(refFilename)

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ImageGen] ${label} — referens: ${refFilename}, försök ${attempt}`)
      const refFile = await toFile(refBuffer, 'reference.png', { type: 'image/png' })
      const res = await openAIImageEdit(
        { project, execution, operation: 'Generate Image (reference)', agent: 'Image Director', authority, onFlight },
        {
          model: 'gpt-image-1',
          image: refFile,
          prompt: finalPrompt,
          n: 1,
          size,
        } as any, // size-typen är mer begränsad i edit() än generate()
        { signal: callerSignal },
      )

      // Ett 2xx utan användbar bild är inte en lyckad referensbunden
      // generering. Returnerades det som `null` skulle anroparen inte kunna
      // skilja det från "prova något annat" — och "något annat" var det
      // obundna anropet. Kastas i stället, som varje annat fel här.
      const image = res.data?.[0]
      if (!image || (!image.b64_json && !image.url)) {
        throw new ReferenceGenerationError(
          refFilename,
          `leverantören svarade utan bilddata (${label})`,
        )
      }
      return image
    } catch (err: any) {
      // A LOOP IS AN AUTOMATIC DISPATCH ACTOR. It may repeat a paid generation
      // only when the failure PROVES none happened. The adapters now say which
      // case they are in, so this reads their answer instead of retrying
      // everything. A 429 and a provably-undispatched failure are unaffected —
      // neither is a possible side effect, so the branches below still run.
      // ── G3C-3C-A · E3 · GOVERNANCE CONTROL FLOW LEAVES UNCHANGED ─────────
      // Asked BEFORE the rate-limit branch, the reference wrapping and the
      // errors[] aggregation below. A stop, a cancellation, a lost claim or an
      // in-flight abort is not a provider defect: retrying one re-dispatches
      // work governance just stopped, and wrapping one hides which authority
      // spoke. One predicate, asked once, at every such boundary.
      if (isExecutionGovernanceControlFlow(err)) throw err
      if (generationMayAlreadyHaveDispatched(err)) throw err
      lastError = err
      const status = err?.status ?? err?.response?.status
      const isRateLimit = status === 429 || String(err?.message).includes('rate limit') || String(err?.message).includes('Rate limit')
      if (isRateLimit && attempt < maxRetries) {
        const waitMs = 15_000 * attempt
        console.warn(`[ImageGen] Rate limit på ${label} — väntar ${waitMs / 1000}s`)
        await sleep(waitMs)
        continue
      }
      // INGEN fallback. Felet kastas vidare oförändrat när det redan är ett
      // referensfel, annars inslaget så att orsaken syns i errors[].
      console.warn(`[ImageGen] Referensgenerering misslyckades för ${label} (försök ${attempt}): ${err?.message}`)
      throw err instanceof ReferenceGenerationError || err instanceof MissingReferenceError
        ? err
        : new ReferenceGenerationError(refFilename, String(err?.message ?? err))
    }
  }

  // Alla försök slut (endast nåbart via rate-limit-slingan ovan).
  throw new ReferenceGenerationError(
    refFilename,
    `alla ${maxRetries} försök misslyckades (${label}): ${String((lastError as any)?.message ?? lastError)}`,
  )
}

// Admin Supabase client for storage uploads (bypasses RLS).
// Lazily initialized via lib/supabase/admin — module-scope createClient()
// crashed `next build` ("supabaseUrl is required") during page-data
// collection in environments without Supabase env vars.
let _supabaseAdmin: ReturnType<typeof createAdminClient> | null = null
function getSupabaseAdmin() {
  _supabaseAdmin ??= createAdminClient()
  return _supabaseAdmin
}

/**
 * Provider clients are constructed per call by the governed boundary, which
 * needs the project and operation this run is charged to. `input.cost` already
 * carries both, so the attribution a run declares is the attribution the
 * reservation uses.
 */
function runProject(cost?: { projectId?: string | null }): ProjectRef {
  return cost?.projectId ? { projectId: cost.projectId } : PLATFORM_COMPAT_PROJECT
}


// ── Ideogram v3 — flat cartoon illustration model ────────────────────────────
// Used for saga and activity illustrations where flat cartoon style is critical.
// Falls back to gpt-image-1 if IDEOGRAM_API_KEY is not set.

interface IdeogramResponse {
  data: Array<{
    url: string
    is_image_safe: boolean
    seed?: number
    resolution?: string
  }>
}

/**
 * Generates an image using Ideogram v3 API and returns a temporary URL.
 * The caller is responsible for downloading and uploading to permanent storage.
 */
async function generateWithIdeogram(
  project: ProjectRef,
  execution: ExecutionContract,
  prompt: string,
  aspectRatio: 'ASPECT_1_1' | 'ASPECT_2_3',
  label: string,
  maxRetries = 3,
  /**
   * G3C-3C-A · E2. Ideogram is a physical provider call inside a RUN_BOUND
   * image step, and each retry attempt is its own physical request. Threaded so
   * every attempt is admitted, watched and aggregated like the OpenAI ones.
   */
  authority?: RunBoundAuthority,
  callerSignal?: AbortSignal,
  onFlight?: (f: { readonly authorityUnavailable: boolean; readonly abortReason: AbortReason | null }) => void,
): Promise<string | null> {
  if (!process.env.IDEOGRAM_API_KEY) {
    console.warn('[Ideogram] IDEOGRAM_API_KEY saknas — faller tillbaka till gpt-image-1')
    return null
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Ideogram] ${label} — försök ${attempt}/${maxRetries}, aspect=${aspectRatio}`)

      let first
      // ── G3C-3C-A · F4 · THE OUTER COMPOSITION OWNS ITS OWN LISTENERS ─────
      // This used to be built inline and its disposer thrown away, so every
      // attempt left a listener attached to the caller's signal and to the
      // timeout. The adapter disposes ITS composition; it cannot dispose one
      // it was never handed. Each layer cleans up after itself.
      const outerSignal = composeAbortSignals([AbortSignal.timeout(90_000), callerSignal])
      try {
        first = await generateIdeogramLegacy(
          { project, execution, operation: 'Generate Image', agent: 'Image Director',
            authority, onFlight },
          {
            prompt,
            model: 'V_3',
            aspect_ratio: aspectRatio,
            // DESIGN = clean flat vector-like output, confirmed valid across Ideogram V_2/V_3.
            // Do NOT use ILLUSTRATION — not confirmed valid for V_3.
            // Do NOT use REALISTIC/RENDER_3D — would reproduce the same cinematic problem.
            style_type: 'DESIGN',
            magic_prompt_option: 'OFF',
            num_images: 1,
          },
          // The 90s bound is kept; governance composes with it inside the
          // adapter rather than replacing it.
          { signal: outerSignal.signal },
        )
      } catch (httpErr: any) {
        // E3: same rule for the Ideogram attempt loop — a governance stop must
        // not be slept on and retried as if it were a rate limit.
        if (isExecutionGovernanceControlFlow(httpErr)) throw httpErr
        // Same 429 backoff as before; the boundary released the reservation, so
        // waiting here does not hold headroom that the retry will need.
        const status = httpErr?.status ?? httpErr?.cause?.status
        if (status === 429 && attempt < maxRetries) {
          const waitMs = 20_000 * attempt
          console.warn(`[Ideogram] Rate limit (429) på ${label} — väntar ${waitMs / 1000}s`)
          await sleep(waitMs)
          continue
        }
        throw httpErr
      } finally {
        // Disposed once this physical attempt has ended, whatever ended it:
        // success, refusal, governance abort, timeout or caller abort. A retry
        // builds a fresh composition, because a retry is a fresh request.
        outerSignal.dispose()
      }

      const imageUrl = first?.url
      const isSafe = first?.is_image_safe ?? true

      if (!imageUrl) throw new Error('Inget URL returnerades från Ideogram')
      if (!isSafe) {
        console.warn(`[Ideogram] ${label}: is_image_safe=false — hoppar över`)
        return null
      }

      console.log(`[Ideogram] ✅ ${label} genererad: ${imageUrl.slice(0, 80)}...`)
      return imageUrl
    } catch (err: any) {
      // A LOOP IS AN AUTOMATIC DISPATCH ACTOR. It may repeat a paid generation
      // only when the failure PROVES none happened. The adapters now say which
      // case they are in, so this reads their answer instead of retrying
      // everything. A 429 and a provably-undispatched failure are unaffected —
      // neither is a possible side effect, so the branches below still run.
      // ── G3C-3C-A · E3 · GOVERNANCE CONTROL FLOW LEAVES UNCHANGED ─────────
      // Asked BEFORE the rate-limit branch, the reference wrapping and the
      // errors[] aggregation below. A stop, a cancellation, a lost claim or an
      // in-flight abort is not a provider defect: retrying one re-dispatches
      // work governance just stopped, and wrapping one hides which authority
      // spoke. One predicate, asked once, at every such boundary.
      if (isExecutionGovernanceControlFlow(err)) throw err
      if (generationMayAlreadyHaveDispatched(err)) throw err
      const isLast = attempt === maxRetries
      if (!isLast) {
        console.warn(`[Ideogram] ${label} försök ${attempt} misslyckades: ${err.message} — försöker igen`)
        await sleep(10_000)
      } else {
        console.error(`[Ideogram] ❌ ${label} misslyckades slutgiltigt: ${err.message}`)
        return null
      }
    }
  }
  return null
}

/**
 * Downloads an image from a URL and uploads it to Supabase Storage.
 * Used to persist temporary Ideogram URLs as permanent storage URLs.
 */
async function downloadAndUploadUrl(
  imageUrl: string,
  runId: string,
  index: number,
  prefix: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) }) // 60s timeout
    if (!res.ok) throw new Error(`HTTP ${res.status} vid nedladdning av ${imageUrl.slice(0, 80)}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    return await uploadToStorage(buffer, runId, index, prefix)
  } catch (err) {
    console.error('[ImageGen] Kunde inte ladda ner/ladda upp bild:', err)
    return null
  }
}

// ─── Vision QA Gate ──────────────────────────────────────────────────────────

type QaMode = 'saga' | 'activity' | 'cover' | 'coloring'

interface QaResult {
  pass: boolean
  score: number
  reason: string
  raw: string
}

/**
 * Runs a lightweight Vision QA check on a generated image URL.
 * Uses claude-haiku-4-5 for speed and cost efficiency.
 * Returns PASS/FAIL with score and one-line reason.
 */
async function runVisionQa(
  imageUrl: string,
  mode: QaMode,
  project: ProjectRef,
  execution: ExecutionContract,
  /**
   * G3C-3C-A · E2. Vision QA is an Anthropic physical call inside a RUN_BOUND
   * image step. It ran with the contract stop gate and nothing else, so a
   * cancellation during QA was invisible and the loop continued to the next
   * image. Same seam as every other claimed physical call.
   */
  authority?: RunBoundAuthority,
  callerSignal?: AbortSignal,
  onFlight?: (f: PhysicalFlightView | undefined) => void,
): Promise<QaResult> {
  try {
    const prompt = buildVisionQaPrompt(mode)
    // SDK 0.36.x stöder inte URL-källa direkt — ladda ned till base64
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`QA: kunde inte hämta bild (HTTP ${imgRes.status})`)
    const imgBuffer = await imgRes.arrayBuffer()
    const imgB64 = Buffer.from(imgBuffer).toString('base64')
    const contentType = (imgRes.headers.get('content-type') ?? 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

    const response = await getAnthropic({
      project, execution, agent: 'Vision QA', operation: 'Vision QA',
      authority, signal: callerSignal, onFlight,
    }).messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: contentType, data: imgB64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    const pass = raw.startsWith('PASS')
    const scoreMatch = raw.match(/Score:\s*(\d+)\/10/)
    const reasonMatch = raw.match(/Reason:\s*(.+)/)
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0
    const reason = reasonMatch ? reasonMatch[1].trim() : raw

    return { pass, score, reason, raw }
  } catch (err) {
    // ── G3C-3C-A · E3 · GOVERNANCE IS NOT A QA DEFECT ────────────────────────
    // The auto-pass below is right for what it was written for: a flaky vision
    // call must not block an image that is probably fine. It is exactly wrong
    // for governance — a cancellation would be swallowed into `pass: true`, the
    // image accepted, and the loop would continue to the next one.
    if (isExecutionGovernanceControlFlow(err)) throw err
    // QA-fel ska aldrig blockera bildgenerering — logga och godkänn
    console.warn('[QA] Vision QA misslyckades, godkänner bild automatiskt:', err)
    return { pass: true, score: -1, reason: 'QA unavailable', raw: '' }
  }
}

export interface RunStepInput {
  /** REQUIRED execution classification, propagated to the paid boundary. */
  execution: ExecutionContract
  systemPrompt: string
  userMessage: string
  model: string
  maxTokens?: number
  temperature?: number
  /** Used by image steps to name files in Storage */
  runId?: string
  /**
   * G3C-3C-A. Who owns this physical request, so an in-flight cancel, stop or
   * claim rotation can abort the socket.
   *
   * Deliberately NOT derived from `runId`: that field exists for cost
   * attribution and has been carried for years by callers holding no claim at
   * all. A runId without a claimId is not ownership, so RUN_BOUND must be
   * passed explicitly by whoever actually holds the claim.
   */
  authority?: RunBoundAuthority
  /** Caller/request-disconnect signal. Composed with governance, never replaced. */
  signal?: AbortSignal
  /**
   * Override number of images to generate. Defaults to 16 for saga mode, 5 otherwise.
   * Set to 1 in preview/test workflows to reduce cost.
   */
  maxImages?: number
  /**
   * Cost Intelligence — taggar kostnaden med projekt/agent/operation.
   * projectId null = plattformsglobal. Skickas alltid (även null) så att
   * icke-media-anrop inte felaktigt hamnar på media-projektet.
   */
  cost?: { projectId?: string | null; agent?: string; operation?: string }
}

export interface RunStepResult {
  content: string      // text response OR image URL(s) as JSON
  tokensIn: number
  tokensOut: number
  durationMs: number
  /**
   * G3C-3C-A · D2. TRUE when a RUN_BOUND physical request in this step reported
   * that authority became unreadable while it was in flight.
   *
   * It is not a failure and not a refusal: the provider answered, and
   * `content` is that answer. It means the execution owner must RE-ESTABLISH
   * canonical authority before doing anything execution-bearing with the
   * result — a retry, a context write, the next step. Between the boundary
   * check and now there is a window nobody observed, and a cancellation could
   * have become durable inside it.
   *
   * Deliberately a boolean, not a watcher: nothing below the runner should be
   * holding provider-layer objects.
   */
  authorityRefreshRequired: boolean
}

/** One in-flight physical request's live authority state, as the runner sees it. */
type FlightHandle = { readonly authorityUnavailable: boolean }
/** What an adapter hands back through `onFlight`. */
type PhysicalFlightView = { readonly authorityUnavailable: boolean; readonly abortReason: AbortReason | null }

/**
 * Collects the flights of every physical request in one step.
 *
 * Read LATE and never cached: `authorityUnavailable` is a LIVE getter that can
 * turn true long after the handle returned, so copying it at dispatch time
 * would answer for a request that had barely begun. Sticky by construction —
 * a later successful request does not erase an earlier unobserved window,
 * because nothing in a step re-establishes authority between calls.
 */
function flightCollector(authority: RunBoundAuthority | undefined) {
  const seen: FlightHandle[] = []
  return {
    onFlight: (f: FlightHandle | undefined) => { if (f) seen.push(f) },
    // RUN_BOUND only: re-establishment means the claimed-run checkpoint, and a
    // CONTRACT_ONLY call has no run to re-check. Its stop authority is the
    // spend boundary's to own.
    required: () => Boolean(authority) && seen.some(f => f.authorityUnavailable),
  }
}

export type OnChunk = (chunk: string) => void

/**
 * Run a single LLM step. Returns the full response.
 * Optional `onChunk` callback receives streaming tokens for SSE.
 */
export async function runStep(
  input: RunStepInput,
  onChunk?: OnChunk,
): Promise<RunStepResult> {
  const start = Date.now()
  const { model } = input

  // ── G3C-3C-A · NO WATCHER HERE, DELIBERATELY ───────────────────────────────
  // `runStep` is NOT one physical request. An image step alone can contain
  // several generations, an application retry loop, a reference edit and a
  // Vision QA call — wrapping it would give one watcher a lifetime spanning many
  // requests plus the non-network work between them, which is not what
  // "physical-request-scoped" means.
  //
  // The authority descriptor threads DOWN to the governed adapters instead, and
  // each opens a watch around exactly one raw SDK call. Absence of a descriptor
  // is not "unwatched": the adapter derives CONTRACT_ONLY from the execution
  // contract, so stop observation reaches every sanctioned call.
  if (isAnthropicModel(model)) return runAnthropicStep(input, onChunk, start)
  if (isImageModel(model))     return runImageStep(input, start)
  if (isOpenAIModel(model))    return runOpenAIStep(input, onChunk, start)
  throw new Error(`Model "${model}" not yet supported. Add routing in lib/ai/runner.ts`)
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function runAnthropicStep(
  input: RunStepInput,
  onChunk: OnChunk | undefined,
  start: number,
): Promise<RunStepResult> {
  const { systemPrompt, userMessage, model, maxTokens = 4000, temperature = 0.7 } = input

  let fullContent = ''
  let inputTokens = 0
  let outputTokens = 0

  // ── G3C-3C-A · F2 · TERMINATION IS OBSERVED BY ITERATING, NOT BY A HANDLE ──
  // This function used to also return a `settled` promise from
  // `onStreamSettled`, and `runStep` discarded it — authority metadata that
  // production threw away, the same shape as the `streamFlight` variable that
  // was assigned and never read.
  //
  // It is unnecessary now, not merely unused: the governed adapter classifies
  // the failure inside the stream's own iterator, so the `for await` below
  // receives the governance outcome directly, and `finalMessage()` after it
  // observes real termination before this step is declared complete.
  const flights = flightCollector(input.authority)

  if (onChunk) {
    const stream = await getAnthropic({
      project: runProject(input.cost), execution: input.execution, operation: input.cost?.operation ?? 'messages.stream',
      agent: input.cost?.agent, runId: input.runId,
      // G3C-3C-A: RUN_BOUND when a claim owns this; undefined ⇒ the adapter
      // derives CONTRACT_ONLY. The caller signal composes, never replaces.
      authority: input.authority, signal: input.signal,
      onFlight: flights.onFlight,
    }).messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        fullContent += event.delta.text
        onChunk(event.delta.text)
      }
    }

    const finalMsg = await stream.finalMessage()
    inputTokens = finalMsg.usage.input_tokens
    outputTokens = finalMsg.usage.output_tokens
  } else {
    const response = await getAnthropic({
      project: runProject(input.cost), execution: input.execution, operation: input.cost?.operation ?? 'messages.create',
      agent: input.cost?.agent, runId: input.runId,
      authority: input.authority, signal: input.signal,
      onFlight: flights.onFlight,
    }).messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    fullContent = block.type === 'text' ? block.text : ''
    inputTokens = response.usage.input_tokens
    outputTokens = response.usage.output_tokens
  }

  // cost_events is written inside the governed Anthropic boundary from the real
  // usage on the response; logging again here would double-count the call.

  // Read HERE: the stream has been iterated to completion and its final message
  // awaited above, so a latch that appeared mid-stream is visible.
  return {
    content: fullContent, tokensIn: inputTokens, tokensOut: outputTokens,
    durationMs: Date.now() - start, authorityRefreshRequired: flights.required(),
  }
}

// ─── OpenAI text ─────────────────────────────────────────────────────────────

async function runOpenAIStep(
  input: RunStepInput,
  onChunk: OnChunk | undefined,
  start: number,
): Promise<RunStepResult> {
  const { systemPrompt, userMessage, model, maxTokens = 4000, temperature = 0.7 } = input

  let fullContent = ''
  let inputTokens = 0
  let outputTokens = 0
  const flights = flightCollector(input.authority)

  if (onChunk) {
    const stream = await openAIChatCompletion(
      { project: runProject(input.cost), execution: input.execution, operation: input.cost?.operation ?? 'chat.completions',
        agent: input.cost?.agent, runId: input.runId, authority: input.authority,
        onFlight: flights.onFlight },
      {
        model,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      },
      // The caller's signal is COMPOSED with in-flight authority inside
      // the adapter; passing only one of the two would discard the other.
      { signal: input.signal },
    )

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? ''
      if (text) {
        fullContent += text
        onChunk(text)
      }
    }
  } else {
    const response = await openAIChatCompletion(
      { project: runProject(input.cost), execution: input.execution, operation: input.cost?.operation ?? 'chat.completions',
        agent: input.cost?.agent, runId: input.runId, authority: input.authority,
        onFlight: flights.onFlight },
      {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      },
      { signal: input.signal },
    )
    fullContent = response.choices[0]?.message?.content ?? ''
    inputTokens = response.usage?.prompt_tokens ?? 0
    outputTokens = response.usage?.completion_tokens ?? 0
  }

  void logLlmCost(model, { tokensIn: inputTokens, tokensOut: outputTokens }, {
    projectId: input.cost?.projectId ?? null,
    agent: input.cost?.agent,
    operation: input.cost?.operation,
    runId: input.runId,
  })

  // The streaming branch above iterates to exhaustion before reaching here, so
  // a latch that appeared mid-stream is already visible.
  return { content: fullContent, tokensIn: inputTokens, tokensOut: outputTokens,
           durationMs: Date.now() - start, authorityRefreshRequired: flights.required() }
}

// ─── DALL-E image generation ──────────────────────────────────────────────────

/**
 * Upload a PNG buffer to Supabase Storage and return the public URL.
 * Falls back to null if upload fails (image is skipped rather than blocking).
 */
async function uploadToStorage(
  buffer: Buffer,
  runId: string,
  index: number,
  prefix = 'image',
): Promise<string | null> {
  try {
    const path = `runs/${runId}/${prefix}-${index}.png`
    const { error } = await getSupabaseAdmin().storage
      .from('run-images')
      .upload(path, buffer, { contentType: 'image/png', upsert: true })

    if (error) {
      console.error('Storage upload error:', error.message)
      return null
    }

    const { data } = getSupabaseAdmin().storage.from('run-images').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error('Storage upload exception:', err)
    return null
  }
}

async function runImageStep(
  input: RunStepInput,
  start: number,
): Promise<RunStepResult> {
  const { userMessage, runId, systemPrompt } = input
  // D2: an image step is MANY physical requests — a retry loop per image, plus
  // reference edits. Every one of them is collected; a later success does not
  // erase an earlier unobserved window, because nothing here re-establishes
  // authority between attempts.
  const flights = flightCollector(input.authority)
  console.log(`[ImageGen] Startar bildgenerering. runId=${runId} systemPromptFlags=${systemPrompt?.slice(0, 80)}`)

  // Detect mode from system prompt flags:
  // - "COVER_ILLUSTRATIONS"    → bright cartoon cover WITH title text baked in (1024x1536), up to 2, prefix: omslag
  // - "SAGA_ILLUSTRATIONS"     → bright cartoon portrait (1024x1536), up to 16, prefix: saga
  // - "ACTIVITY_ILLUSTRATIONS" → bright cartoon square (1024x1024), up to 5,  prefix: aktivitet
  // - default                  → B&W coloring book (1024x1024), up to 5,         prefix: image
  const isCoverMode    = systemPrompt?.includes('COVER_ILLUSTRATIONS') ?? false
  const isSagaMode     = !isCoverMode && (systemPrompt?.includes('SAGA_ILLUSTRATIONS') ?? false)
  const isActivityMode = !isCoverMode && !isSagaMode && (systemPrompt?.includes('ACTIVITY_ILLUSTRATIONS') ?? false)
  // Use caller-supplied maxImages if provided; fall back to per-mode defaults
  const maxImages = input.maxImages ?? (isCoverMode ? 2 : isSagaMode ? 16 : 5)

  // userMessage should contain the image prompt (or JSON array of prompts)
  // Strip markdown code fences if the agent wrapped the JSON in ```json ... ```
  let rawMessage = userMessage.trim()
  const fenceMatch = rawMessage.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  if (fenceMatch) {
    rawMessage = fenceMatch[1].trim()
    console.log(`[ImageGen] Stripped markdown code fences from prompt input`)
  }

  let prompts: string[] = []
  try {
    const parsed = JSON.parse(rawMessage)
    prompts = Array.isArray(parsed) ? parsed : [parsed.prompt ?? rawMessage]
  } catch {
    // If JSON parse still fails, use the raw message as a single prompt
    console.warn(`[ImageGen] Kunde inte parsa JSON från prompt-input, använder hela meddelandet som en prompt. Börjar med: ${rawMessage.slice(0, 100)}`)
    prompts = [rawMessage]
  }

  const urls: string[] = []
  const errors: string[] = []

  /** Vänta ms millisekunder */
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  /**
   * Generera en bild med automatisk retry vid rate limit (429).
   * gpt-image-1 tillåter ca 5 req/min på standard-tier — vi väntar 15s vid 429.
   */
  async function generateWithRetry(
    finalPrompt: string,
    size: '1024x1024' | '1024x1536',
    label: string,
    maxRetries = 3,
  ): Promise<{ b64_json?: string | null; url?: string | null } | undefined> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ImageGen] ${label} — försök ${attempt}`)
        const res = await openAIImageGenerate(
          { project: runProject(input.cost), execution: input.execution, operation: input.cost?.operation ?? 'Generate Image',
            agent: input.cost?.agent ?? 'Image Director', runId: input.runId, authority: input.authority,
            onFlight: flights.onFlight },
          { model: 'gpt-image-1', prompt: finalPrompt, n: 1, size },
          { signal: input.signal },
        )
        return res.data?.[0]
      } catch (err: any) {
        // A LOOP IS AN AUTOMATIC DISPATCH ACTOR. It may repeat a paid generation
        // only when the failure PROVES none happened. The adapters now say which
        // case they are in, so this reads their answer instead of retrying
        // everything. A 429 and a provably-undispatched failure are unaffected —
        // neither is a possible side effect, so the branches below still run.
        // ── G3C-3C-A · E3 · GOVERNANCE CONTROL FLOW LEAVES UNCHANGED ─────────
      // Asked BEFORE the rate-limit branch, the reference wrapping and the
      // errors[] aggregation below. A stop, a cancellation, a lost claim or an
      // in-flight abort is not a provider defect: retrying one re-dispatches
      // work governance just stopped, and wrapping one hides which authority
      // spoke. One predicate, asked once, at every such boundary.
      if (isExecutionGovernanceControlFlow(err)) throw err
      if (generationMayAlreadyHaveDispatched(err)) throw err
        const status = err?.status ?? err?.response?.status
        const isRateLimit = status === 429 || String(err?.message).includes('rate limit') || String(err?.message).includes('Rate limit')
        if (isRateLimit && attempt < maxRetries) {
          const waitMs = 15_000 * attempt // 15s, 30s, 45s
          console.warn(`[ImageGen] Rate limit på ${label} — väntar ${waitMs / 1000}s innan retry ${attempt + 1}/${maxRetries}`)
          await sleep(waitMs)
        } else {
          throw err // Kasta vidare om inte rate limit eller om max retries nåtts
        }
      }
    }
  }

  // Fail-fast: om 3 bilder i rad misslyckas avbryter vi steget direkt
  // för att inte slösa API-krediter på ett redan trasigt steg.
  let consecutiveFailures = 0
  const MAX_CONSECUTIVE_FAILURES = 3

  for (let i = 0; i < Math.min(prompts.length, maxImages); i++) {
    const prompt = prompts[i]

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[ImageGen] ${MAX_CONSECUTIVE_FAILURES} på rad misslyckades — avbryter steget för att spara kostnader.`)
      errors.push(`Avbrutet efter ${MAX_CONSECUTIVE_FAILURES} på rad misslyckades`)
      break
    }

    // Paus mellan bilderna för att undvika rate limiting (gpt-image-1: ~5 req/min)
    if (i > 0) await sleep(3_000)

    try {
      let imageData: { b64_json?: string | null; url?: string | null } | undefined

      // Shared character description used in all modes
      // Based on canonical character reference images provided by the creator.
      const NOVA_DESC = `Nova: a cheerful girl, approximately 8 years old, warm light-brown skin, large expressive dark brown eyes, dark brown hair pulled back in a ponytail with a bright pink headband. Her default outfit is a blue polo/collared shirt, pink pleated skirt and pink shoes — she may wear simple color or accessory variations that fit the scene's activity (e.g. an apron, rain jacket, hat, or rolled-up sleeves), but NEVER wings, capes, crowns, masks, tutus, fairy costumes, or anything that changes her body silhouette or adds fantasy elements to her appearance. She always keeps the same face, ponytail and pink headband`
      const PLING_DESC = `Pling: a small friendly humanoid robot with teal-blue metallic coloring. CRITICAL SIZE: Pling is clearly and noticeably MUCH SHORTER than Nova — roughly half her height, like a small child compared to an older child. CRITICAL shape: Pling has a distinct rounded dome/helmet-shaped head (like a bowl) with a dark oval face panel showing two large glowing blue circular eyes and a curved smile line, small rounded ear-panels on the sides of the head, and a thin antenna on top with a small pink ball at the tip. Separate cylindrical torso with a large bright YELLOW HEART symbol on the chest. Jointed arms ending in rounded blue hands. Jointed legs with rounded blue feet. Pling may wear theme-appropriate accessories or costume elements that fit the scene, but must always keep the same head shape, face panel, antenna and yellow heart. IMPORTANT: Pling is a humanoid robot with a clear head, neck, torso, arms and legs — NOT a sphere or bowling ball, NOT boxy or rectangular. Pling is SMALL and COMPACT, never the same height as Nova`
      const NO_TEXT = `IMPORTANT: absolutely NO text, words, letters, numbers, labels, signs, speech bubbles, captions, or written language anywhere in the image`

      if (isCoverMode) {
        // Omslagsbild: ljus flat cartoon med titel inbakad i bilden.
        // Ingen referensbild — vi ber modellen generera texten direkt i illustrationen.
        const coverPrompt = `${buildStylePrefix('cover')} ${NOVA_DESC}. ${PLING_DESC}. ${prompt}. IMPORTANT: render the specified title text prominently IN the illustration using large bold bubbly cartoon lettering — the text must be visually part of the artwork, not a separate element.`
        imageData = await generateWithRetry(coverPrompt, '1024x1536', `omslagsbild ${i + 1}`)

      } else if (isSagaMode) {
        // ── Ideogram v3 — flat cartoon portrait illustration ──────────────────
        // Ideogram's ILLUSTRATION style natively renders flat cartoon children's book
        // style without needing to fight the model's rendering bias.
        // Fallback: gpt-image-1 with reference image if Ideogram API key is missing.
        const sagaPrompt = `${buildStylePrefix('saga')} ${NOVA_DESC}. ${PLING_DESC}. ${NO_TEXT}. Scene: ${prompt}`

        const ideogramUrl = runId
          ? await generateWithIdeogram(runProject(input.cost), input.execution, sagaPrompt, 'ASPECT_2_3', `saga bild ${i + 1}`, 3, input.authority, input.signal, flights.onFlight)
          : null

        if (ideogramUrl && runId) {
          // Download Ideogram's temporary URL and upload to permanent Supabase storage
          const storageUrl = await downloadAndUploadUrl(ideogramUrl, runId, i, 'saga')
          if (storageUrl) {
            // ── Vision QA gate ────────────────────────────────────────────────
            const qa = await runVisionQa(storageUrl, 'saga', runProject(input.cost), input.execution, input.authority, input.signal, flights.onFlight)
            if (qa.pass) {
              console.log(`[QA PASS] saga-${i + 1} score=${qa.score}`)
              urls.push(storageUrl)
              consecutiveFailures = 0
              continue
            }
            // FAIL → retry once
            console.warn(`[QA FAIL] saga-${i + 1} score=${qa.score} reason="${qa.reason}"`)
            const retryUrl = await generateWithIdeogram(runProject(input.cost), input.execution, sagaPrompt, 'ASPECT_2_3', `saga bild ${i + 1} retry`, 3, input.authority, input.signal, flights.onFlight)
            const retryStorageUrl = retryUrl ? await downloadAndUploadUrl(retryUrl, runId, i, 'saga') : null
            if (retryStorageUrl) {
              const qa2 = await runVisionQa(retryStorageUrl, 'saga', runProject(input.cost), input.execution, input.authority, input.signal, flights.onFlight)
              if (qa2.pass) {
                console.log(`[QA PASS] saga-${i + 1} (retry) score=${qa2.score}`)
              } else {
                console.warn(`[QA FAIL] saga-${i + 1} (retry) score=${qa2.score} — behåller bästa bild`)
              }
              urls.push(retryStorageUrl)
            } else {
              urls.push(storageUrl) // behåll original om retry misslyckades
            }
            consecutiveFailures = 0
            continue
          }
        }

        // Fallback: gpt-image-1 with reference (when Ideogram is unavailable)
        console.log(`[ImageGen] Saga bild ${i + 1} — faller tillbaka till gpt-image-1`)
        const sagaGptPrompt = `Use the reference image as a strict style and character guide. Generate a NEW children's book illustration — same art style, same character designs — but showing a completely new scene. Bright flat cartoon children's book illustration, vibrant saturated colors, clean bold shapes, cheerful warm tones. ${NO_TEXT}. ${NOVA_DESC}. ${PLING_DESC}. New scene: ${prompt}`
        const sagaRef = `saga-${i + 1}.png`
        // Referensbunden. Ingen `?? generateWithRetry(... utan ref)`: prompten
        // ovan beordrar strikt användning av referensbilden, och det obundna
        // anropet bifogade ingen — det bad modellen följa en bild den inte fick.
        // Misslyckas det här kastas det och bilden hoppas över.
        imageData = await generateWithReference(runProject(input.cost), input.execution, sagaGptPrompt, '1024x1024', `saga bild ${i + 1}`, sagaRef, 3, input.authority, input.signal, flights.onFlight)

      } else if (isActivityMode) {
        // ── Ideogram v3 — flat cartoon square illustration ────────────────────
        // Scene fills top 65% — bottom 35% is soft pastel gradient for text overlay in PDF.
        const activityPrompt = `${buildStylePrefix('activity')} ${NOVA_DESC}. ${PLING_DESC}. ${NO_TEXT}. Scene: ${prompt}`

        const ideogramUrl = runId
          ? await generateWithIdeogram(runProject(input.cost), input.execution, activityPrompt, 'ASPECT_1_1', `aktivitet bild ${i + 1}`, 3, input.authority, input.signal, flights.onFlight)
          : null

        if (ideogramUrl && runId) {
          const storageUrl = await downloadAndUploadUrl(ideogramUrl, runId, i, 'aktivitet')
          if (storageUrl) {
            // ── Vision QA gate ────────────────────────────────────────────────
            const qa = await runVisionQa(storageUrl, 'activity', runProject(input.cost), input.execution, input.authority, input.signal, flights.onFlight)
            if (qa.pass) {
              console.log(`[QA PASS] activity-${i + 1} score=${qa.score}`)
              urls.push(storageUrl)
              consecutiveFailures = 0
              continue
            }
            // FAIL → retry once
            console.warn(`[QA FAIL] activity-${i + 1} score=${qa.score} reason="${qa.reason}"`)
            const retryUrl = await generateWithIdeogram(runProject(input.cost), input.execution, activityPrompt, 'ASPECT_1_1', `aktivitet bild ${i + 1} retry`, 3, input.authority, input.signal, flights.onFlight)
            const retryStorageUrl = retryUrl ? await downloadAndUploadUrl(retryUrl, runId, i, 'aktivitet') : null
            if (retryStorageUrl) {
              const qa2 = await runVisionQa(retryStorageUrl, 'activity', runProject(input.cost), input.execution, input.authority, input.signal, flights.onFlight)
              if (qa2.pass) {
                console.log(`[QA PASS] activity-${i + 1} (retry) score=${qa2.score}`)
              } else {
                console.warn(`[QA FAIL] activity-${i + 1} (retry) score=${qa2.score} — behåller bästa bild`)
              }
              urls.push(retryStorageUrl)
            } else {
              urls.push(storageUrl)
            }
            consecutiveFailures = 0
            continue
          }
        }

        // Fallback: gpt-image-1 with reference
        console.log(`[ImageGen] Aktivitet bild ${i + 1} — faller tillbaka till gpt-image-1`)
        const aktGptPrompt = `Use the reference image as a strict style and character guide. Generate a NEW activity card illustration — same art style, same character designs — but showing a completely new activity scene. Bright flat cartoon children's book style, vibrant full color. ${NO_TEXT}. The illustrated scene fills the TOP 65% of the image. The BOTTOM 35% must be a completely empty soft white-to-light-pastel gradient with no characters, objects, or details — leave it blank for text overlay. ${NOVA_DESC}. ${PLING_DESC}. New scene: ${prompt}`
        const aktRef = `aktivitet-${i + 1}.png`
        // Referensbunden — se kommentaren i saga-grenen.
        imageData = await generateWithReference(runProject(input.cost), input.execution, aktGptPrompt, '1024x1024', `aktivitet bild ${i + 1}`, aktRef, 3, input.authority, input.signal, flights.onFlight)

      } else {
        const coloringPrompt = `Use the reference image as a strict style and character guide. Generate a NEW coloring book page — same line art style, same character designs for Nova and Pling — but showing a completely new scene. CRITICAL COLORING BOOK RULES: Black and white line art ONLY. Pure white background. Clean bold outlines. Absolutely NO filled-in areas, NO shading, NO gray tones, NO solid black fills anywhere. ALL regions — including Nova's hair, dark clothing, robot body — must be left as white space with outlines only, ready to be colored in by a child. ${NO_TEXT}. Characters — ${NOVA_DESC} (draw OUTLINES ONLY — do NOT fill in any area including hair). ${PLING_DESC} (draw OUTLINES ONLY — do NOT fill in any area). New scene: ${prompt} Simple cute cartoon style, printable coloring page quality.`
        const imgRef = `image-${i + 1}.png`
        // Referensbunden — och till skillnad från saga/aktivitet finns här ingen
        // Ideogram-väg alls, så detta är hela genereringen för färgläggningssidor.
        imageData = await generateWithReference(runProject(input.cost), input.execution, coloringPrompt, '1024x1024', `färgläggning bild ${i + 1}`, imgRef, 3, input.authority, input.signal, flights.onFlight)
      }

      // gpt-image-1 returnerar b64_json — ladda upp till Storage för permanent URL
      if (imageData?.b64_json) {
        const buffer = Buffer.from(imageData.b64_json, 'base64')
        const storagePrefix = isCoverMode ? 'omslag' : isSagaMode ? 'saga' : isActivityMode ? 'aktivitet' : 'image'
        const storageUrl = runId ? await uploadToStorage(buffer, runId, i, storagePrefix) : null
        urls.push(storageUrl ?? `data:image/png;base64,${imageData.b64_json}`)
        consecutiveFailures = 0  // Lyckad bild — nollställ räknaren
      } else if (imageData?.url) {
        urls.push(imageData.url)
        consecutiveFailures = 0  // Lyckad bild — nollställ räknaren
      } else {
        consecutiveFailures++
        errors.push(`Bild ${i + 1}: inget bilddata returnerades`)
      }
    } catch (err) {
      // ── G3C-3C-A · D1 · A GOVERNANCE REFUSAL IS NOT AN IMAGE FAILURE ───────
      // This catch collects per-image failures into `errors[]` and moves on to
      // the next prompt — correct for a provider fault, catastrophic for a
      // refusal. Swallowed here, a durable cancellation would become a string
      // in a results array: the loop would re-admit image 2, 3, … (each refused
      // and each swallowed), return "successfully", and the executor would
      // persist context for a run that governance had already stopped.
      //
      // The in-flight abort is the same class and gets the same answer: a
      // cancellation that killed image 3's socket must not let image 4 start.
      // Both leave the step immediately, for their owner to settle.
      if (isExecutionGovernanceControlFlow(err)) throw err
      consecutiveFailures++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ImageGen] ❌ Bild ${i + 1} misslyckades slutgiltigt:`, err)
      console.error(`[ImageGen] Prompt (100 tecken): ${String(prompt).slice(0, 100)}`)
      errors.push(`Bild ${i + 1} misslyckades: ${msg}`)
    }
  }

  // Log summary
  console.log(`[ImageGen] Klart: ${urls.length} bilder OK, ${errors.length} fel`)
  if (errors.length) console.error('[ImageGen] Fel:', errors)

  // Cost Intelligence is written per image inside the governed image boundary,
  // where the provider that was actually used is known. The old batch write
  // guessed the provider from the mode and would now double-count.

  return {
    content: JSON.stringify({ urls, errors: errors.length ? errors : undefined }),
    tokensIn: 0,
    tokensOut: 0,
    durationMs: Date.now() - start,
    authorityRefreshRequired: flights.required(),
  }
}
