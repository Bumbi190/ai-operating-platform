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
import { createClient } from '@supabase/supabase-js'
import { isAnthropicModel, isOpenAIModel, isImageModel } from './models'
import { buildStylePrefix } from './style-governance'
import { buildVisionQaPrompt } from './golden-checklist'
import { logLlmCost, logImageCost } from '@/lib/cost/track'

// ── Juni-referensbilder för konsekvent karaktärsstil ─────────────────────────
// Alla referensbilder ligger i run-images/references/juni/ i Supabase Storage.
// URL-basen byggs från NEXT_PUBLIC_SUPABASE_URL så att den fungerar i alla miljöer.
const JUNI_REF_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/run-images/references/juni`
  : null

/**
 * Hämtar en referensbild från Supabase Storage och returnerar den som Buffer.
 * Returnerar null om hämtningen misslyckas (t.ex. om bilden saknas).
 */
async function fetchReferenceBuffer(filename: string): Promise<Buffer | null> {
  if (!JUNI_REF_BASE) return null
  const url = `${JUNI_REF_BASE}/${filename}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[ImageGen] Referensbild saknas (${res.status}): ${url}`)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    console.warn(`[ImageGen] Kunde inte hämta referensbild: ${url}`, err)
    return null
  }
}

/**
 * Genererar en bild MED Juni-referensbild via openai.images.edit().
 * Modellen får referensbilden som visuell guide för karaktärsstil och proportioner.
 * Faller tillbaka till null om referenshämtningen misslyckas.
 */
async function generateWithReference(
  finalPrompt: string,
  size: '1024x1024' | '1024x1536',
  label: string,
  refFilename: string,
  maxRetries = 3,
): Promise<{ b64_json?: string | null } | null> {
  const refBuffer = await fetchReferenceBuffer(refFilename)
  if (!refBuffer) return null

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ImageGen] ${label} — referens: ${refFilename}, försök ${attempt}`)
      const refFile = await toFile(refBuffer, 'reference.png', { type: 'image/png' })
      const res = await openai.images.edit({
        model: 'gpt-image-1',
        image: refFile,
        prompt: finalPrompt,
        n: 1,
        size,
      } as any) // size-typen är mer begränsad i edit() än generate()
      return res.data?.[0] ?? null
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      const isRateLimit = status === 429 || String(err?.message).includes('rate limit') || String(err?.message).includes('Rate limit')
      if (isRateLimit && attempt < maxRetries) {
        const waitMs = 15_000 * attempt
        console.warn(`[ImageGen] Rate limit på ${label} — väntar ${waitMs / 1000}s`)
        await sleep(waitMs)
      } else {
        console.warn(`[ImageGen] Referensgenerering misslyckades för ${label} (försök ${attempt}): ${err?.message}`)
        return null // faller tillbaka till generate() utan referens
      }
    }
  }
  return null
}

// Admin Supabase client for storage uploads (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
  prompt: string,
  aspectRatio: 'ASPECT_1_1' | 'ASPECT_2_3',
  label: string,
  maxRetries = 3,
): Promise<string | null> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) {
    console.warn('[Ideogram] IDEOGRAM_API_KEY saknas — faller tillbaka till gpt-image-1')
    return null
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Ideogram] ${label} — försök ${attempt}/${maxRetries}, aspect=${aspectRatio}`)

      const res = await fetch('https://api.ideogram.ai/generate', {
        method: 'POST',
        signal: AbortSignal.timeout(90_000), // 90s timeout — hänger annars för evigt
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_request: {
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
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        if (res.status === 429 && attempt < maxRetries) {
          const waitMs = 20_000 * attempt
          console.warn(`[Ideogram] Rate limit (429) på ${label} — väntar ${waitMs / 1000}s`)
          await sleep(waitMs)
          continue
        }
        throw new Error(`Ideogram API ${res.status}: ${errText.slice(0, 300)}`)
      }

      const json: IdeogramResponse = await res.json()
      const imageUrl = json.data?.[0]?.url
      const isSafe = json.data?.[0]?.is_image_safe ?? true

      if (!imageUrl) throw new Error('Inget URL returnerades från Ideogram')
      if (!isSafe) {
        console.warn(`[Ideogram] ${label}: is_image_safe=false — hoppar över`)
        return null
      }

      console.log(`[Ideogram] ✅ ${label} genererad: ${imageUrl.slice(0, 80)}...`)
      return imageUrl
    } catch (err: any) {
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
  anthropic: Anthropic,
): Promise<QaResult> {
  try {
    const prompt = buildVisionQaPrompt(mode)
    // SDK 0.36.x stöder inte URL-källa direkt — ladda ned till base64
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`QA: kunde inte hämta bild (HTTP ${imgRes.status})`)
    const imgBuffer = await imgRes.arrayBuffer()
    const imgB64 = Buffer.from(imgBuffer).toString('base64')
    const contentType = (imgRes.headers.get('content-type') ?? 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

    const response = await anthropic.messages.create({
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
    // QA-fel ska aldrig blockera bildgenerering — logga och godkänn
    console.warn('[QA] Vision QA misslyckades, godkänner bild automatiskt:', err)
    return { pass: true, score: -1, reason: 'QA unavailable', raw: '' }
  }
}

export interface RunStepInput {
  systemPrompt: string
  userMessage: string
  model: string
  maxTokens?: number
  temperature?: number
  /** Used by image steps to name files in Storage */
  runId?: string
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

  if (isAnthropicModel(model)) {
    return runAnthropicStep(input, onChunk, start)
  }

  if (isImageModel(model)) {
    return runImageStep(input, start)
  }

  if (isOpenAIModel(model)) {
    return runOpenAIStep(input, onChunk, start)
  }

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

  if (onChunk) {
    const stream = await anthropic.messages.stream({
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
    const response = await anthropic.messages.create({
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

  void logLlmCost(model, { tokensIn: inputTokens, tokensOut: outputTokens }, {
    projectId: input.cost?.projectId ?? null,
    agent: input.cost?.agent,
    operation: input.cost?.operation,
    runId: input.runId,
  })

  return { content: fullContent, tokensIn: inputTokens, tokensOut: outputTokens, durationMs: Date.now() - start }
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

  if (onChunk) {
    const stream = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? ''
      if (text) {
        fullContent += text
        onChunk(text)
      }
    }
  } else {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })
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

  return { content: fullContent, tokensIn: inputTokens, tokensOut: outputTokens, durationMs: Date.now() - start }
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
    const { error } = await supabaseAdmin.storage
      .from('run-images')
      .upload(path, buffer, { contentType: 'image/png', upsert: true })

    if (error) {
      console.error('Storage upload error:', error.message)
      return null
    }

    const { data } = supabaseAdmin.storage.from('run-images').getPublicUrl(path)
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
        const res = await openai.images.generate({
          model: 'gpt-image-1',
          prompt: finalPrompt,
          n: 1,
          size,
        })
        return res.data?.[0]
      } catch (err: any) {
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
          ? await generateWithIdeogram(sagaPrompt, 'ASPECT_2_3', `saga bild ${i + 1}`)
          : null

        if (ideogramUrl && runId) {
          // Download Ideogram's temporary URL and upload to permanent Supabase storage
          const storageUrl = await downloadAndUploadUrl(ideogramUrl, runId, i, 'saga')
          if (storageUrl) {
            // ── Vision QA gate ────────────────────────────────────────────────
            const qa = await runVisionQa(storageUrl, 'saga', anthropic)
            if (qa.pass) {
              console.log(`[QA PASS] saga-${i + 1} score=${qa.score}`)
              urls.push(storageUrl)
              consecutiveFailures = 0
              continue
            }
            // FAIL → retry once
            console.warn(`[QA FAIL] saga-${i + 1} score=${qa.score} reason="${qa.reason}"`)
            const retryUrl = await generateWithIdeogram(sagaPrompt, 'ASPECT_2_3', `saga bild ${i + 1} retry`)
            const retryStorageUrl = retryUrl ? await downloadAndUploadUrl(retryUrl, runId, i, 'saga') : null
            if (retryStorageUrl) {
              const qa2 = await runVisionQa(retryStorageUrl, 'saga', anthropic)
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
        imageData = await generateWithReference(sagaGptPrompt, '1024x1024', `saga bild ${i + 1}`, sagaRef)
          ?? await generateWithRetry(sagaGptPrompt, '1024x1536', `saga bild ${i + 1} (utan ref)`)

      } else if (isActivityMode) {
        // ── Ideogram v3 — flat cartoon square illustration ────────────────────
        // Scene fills top 65% — bottom 35% is soft pastel gradient for text overlay in PDF.
        const activityPrompt = `${buildStylePrefix('activity')} ${NOVA_DESC}. ${PLING_DESC}. ${NO_TEXT}. Scene: ${prompt}`

        const ideogramUrl = runId
          ? await generateWithIdeogram(activityPrompt, 'ASPECT_1_1', `aktivitet bild ${i + 1}`)
          : null

        if (ideogramUrl && runId) {
          const storageUrl = await downloadAndUploadUrl(ideogramUrl, runId, i, 'aktivitet')
          if (storageUrl) {
            // ── Vision QA gate ────────────────────────────────────────────────
            const qa = await runVisionQa(storageUrl, 'activity', anthropic)
            if (qa.pass) {
              console.log(`[QA PASS] activity-${i + 1} score=${qa.score}`)
              urls.push(storageUrl)
              consecutiveFailures = 0
              continue
            }
            // FAIL → retry once
            console.warn(`[QA FAIL] activity-${i + 1} score=${qa.score} reason="${qa.reason}"`)
            const retryUrl = await generateWithIdeogram(activityPrompt, 'ASPECT_1_1', `aktivitet bild ${i + 1} retry`)
            const retryStorageUrl = retryUrl ? await downloadAndUploadUrl(retryUrl, runId, i, 'aktivitet') : null
            if (retryStorageUrl) {
              const qa2 = await runVisionQa(retryStorageUrl, 'activity', anthropic)
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
        imageData = await generateWithReference(aktGptPrompt, '1024x1024', `aktivitet bild ${i + 1}`, aktRef)
          ?? await generateWithRetry(aktGptPrompt, '1024x1024', `aktivitet bild ${i + 1} (utan ref)`)

      } else {
        const coloringPrompt = `Use the reference image as a strict style and character guide. Generate a NEW coloring book page — same line art style, same character designs for Nova and Pling — but showing a completely new scene. CRITICAL COLORING BOOK RULES: Black and white line art ONLY. Pure white background. Clean bold outlines. Absolutely NO filled-in areas, NO shading, NO gray tones, NO solid black fills anywhere. ALL regions — including Nova's hair, dark clothing, robot body — must be left as white space with outlines only, ready to be colored in by a child. ${NO_TEXT}. Characters — ${NOVA_DESC} (draw OUTLINES ONLY — do NOT fill in any area including hair). ${PLING_DESC} (draw OUTLINES ONLY — do NOT fill in any area). New scene: ${prompt} Simple cute cartoon style, printable coloring page quality.`
        const imgRef = `image-${i + 1}.png`
        imageData = await generateWithReference(coloringPrompt, '1024x1024', `färgläggning bild ${i + 1}`, imgRef)
          ?? await generateWithRetry(coloringPrompt, '1024x1024', `färgläggning bild ${i + 1} (utan ref)`)
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

  // Cost Intelligence — saga/activity körs primärt via Ideogram, omslag/färgläggning via gpt-image-1.
  void logImageCost(
    urls.length,
    (isSagaMode || isActivityMode) ? 'ideogram' : 'openai',
    {
      projectId: input.cost?.projectId ?? null,
      agent: input.cost?.agent ?? 'Image Director',
      operation: input.cost?.operation ?? 'Generate Image',
      runId: input.runId,
    },
  )

  return {
    content: JSON.stringify({ urls, errors: errors.length ? errors : undefined }),
    tokensIn: 0,
    tokensOut: 0,
    durationMs: Date.now() - start,
  }
}
