/**
 * Channel Drafter — rena hjälpare (Fas 3, WF2).
 *
 * Drafter SKRIVER copy (via LLM) men allt runt copyn är deterministiskt och
 * KB-styrt: asset-bindning, CTA, landningssida, must_not och self-check. LLM:n
 * får ALDRIG hitta på bilder eller URL:er — de fälten sätts/forsas här.
 *
 * Rena funktioner (ingen DB/LLM/server-only) → enhetstestbara. Handlern
 * (workflows/channel-drafter.ts) gör LLM-anropet och DB-skrivningen.
 * ⛔ The Prompt berörs aldrig.
 */
import {
  BRAND, CORE_MESSAGE, PROOF_POINTS, APPROVED_ANGLE_TAGS, FORBIDDEN_ANGLE_TAGS,
  CHARACTER_ROLES, CTA, type ThemeCanon,
} from './kb/marketing-canon'

export interface AssetPlanItem { slot: string; asset_ref: string | null; status: 'available' | 'pending_upload' | 'LUCKA'; note?: string }

export interface LlmDraftCopy {
  caption: { hook: string; story: string; value: string; cta_line: string }
  caption_rendered: string
  hashtags?: string[]
  reel_spec?: Record<string, unknown>
  carousel_slides?: Array<Record<string, unknown>>
  fb_post?: Record<string, unknown>
}

// ── Prompt ───────────────────────────────────────────────────────────────────
export function buildDrafterSystemPrompt(): string {
  return [
    'Du är Channel Drafter för Familje-Stunden. Du skriver kanalfärdiga UTKAST (IG/FB) — du publicerar inte och hittar aldrig på.',
    'HÅRDA REGLER:',
    '1. Använd ENDAST briefen + medskickad kanon. ⛔ Nämn ALDRIG The Prompt, AI News eller andra projekt.',
    '2. Hitta aldrig på bilder, URL:er, priser, palett eller saga-handling. Priser endast 59/129/199 kr om de nämns.',
    '3. Bygg captionen i fyra lager: Hook (temats känsla) → Story (Nova & Pling i kanon) → Value (proof points, bara vad paketet ger) → CTA (en, från briefen).',
    '4. Nova = nyfiken/kännande känslohook. Pling = lekfull förklarare ("Blipp blipp!" sparsamt). Inga nya karaktärer.',
    '5. Respektera briefens must_not. Ton: varm, trygg, magisk, svensk. Barnet/föräldern tilltalas varmt.',
    '6. Svara med ENBART giltig JSON enligt schemat. Ingen text utanför JSON. Inga asset-referenser eller URL:er i svaret.',
  ].join('\n')
}

export function buildDrafterUserMessage(brief: Record<string, any>, theme: ThemeCanon): string {
  const fmt = brief.format as string
  const schemaHint =
    fmt === 'reel'
      ? '"reel_spec": { "duration_target_sec": 15, "scenes": [ { "order": 1, "beat_role": "hook|story|value|cta", "on_screen_text": "...", "voiceover_note": "..." } ], "audio_note": "..." }'
      : fmt === 'carousel'
        ? '"carousel_slides": [ { "order": 1, "role": "hook|story|value|cta", "headline": "...", "body": "..." } ]'
        : '"fb_post": { "primary_text": "hela inlägget i FB-längd, längre berättande ton" }'

  return [
    'BRIEF:',
    JSON.stringify({
      channel: brief.channel, format: brief.format, beat: brief.beat, objective: brief.objective,
      emotional_pillar: brief.emotional_pillar, primary_angle: brief.primary_angle,
      core_message: brief.core_message ?? CORE_MESSAGE, key_points: brief.key_points ?? [],
      cta: brief.cta, tone: brief.tone ?? BRAND.tone, must_not: brief.must_not ?? [],
    }, null, 2),
    '',
    'KANON (Familje-Stunden):',
    `- Tema: ${theme.name} (${theme.monthSv}). Symboler: ${theme.symbols.join(', ') || '—'}. Fokus: ${theme.focus}`,
    `- Karaktärer: Nova = ${CHARACTER_ROLES.nova}; Pling = ${CHARACTER_ROLES.pling}`,
    `- Proof points: ${PROOF_POINTS.join('; ')}`,
    `- Godkända vinklar: ${APPROVED_ANGLE_TAGS.join('; ')}`,
    `- Förbjudet (must_not även): ${FORBIDDEN_ANGLE_TAGS.join('; ')}`,
    `- CTA i denna brief: ${brief?.cta?.label ?? CTA.primary}`,
    '',
    'SVARA MED ENBART DENNA JSON:',
    `{ "caption": { "hook": "...", "story": "...", "value": "...", "cta_line": "..." }, "caption_rendered": "hela captionen i publiceringsordning", "hashtags": [${brief.channel === 'instagram' ? '"5–10 svenska on-brand taggar"' : '/* tom för facebook */'}], ${schemaHint} }`,
  ].join('\n')
}

// ── Robust JSON-parsning av LLM-svar ─────────────────────────────────────────
export function parseDraftResponse(raw: string): LlmDraftCopy {
  let txt = raw.trim()
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) txt = fence[1].trim()
  const first = txt.indexOf('{'); const last = txt.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('Drafter: inget JSON-objekt i LLM-svaret')
  const obj = JSON.parse(txt.slice(first, last + 1)) as LlmDraftCopy
  if (!obj.caption || !obj.caption.hook) throw new Error('Drafter: caption saknas i LLM-svaret')
  if (!obj.caption_rendered) {
    const c = obj.caption
    obj.caption_rendered = [c.hook, c.story, c.value, c.cta_line].filter(Boolean).join('\n')
  }
  return obj
}

// ── Asset-bindning (deterministisk; ingen generering) ────────────────────────
export function bindAssets(assetRefs: string[], format: string): AssetPlanItem[] {
  const plan: AssetPlanItem[] = assetRefs.map((ref, i) => {
    const known = /^covers\/[a-zåäö-]+\.png$/i.test(ref) || /^characters\/index\.json#(nova|pling)_/i.test(ref) || /^(activities|stories|audio)\//i.test(ref)
    return { slot: `asset-${i + 1}`, asset_ref: ref, status: known ? 'available' : 'LUCKA', ...(known ? {} : { note: 'Okänd asset-referens — flaggad.' }) }
  })
  // CTA-slot saknar kanonisk asset i v1.
  if (format === 'carousel' || format === 'reel') {
    plan.push({ slot: 'cta', asset_ref: null, status: 'LUCKA', note: 'Ingen kanonisk CTA-asset i v1.' })
  }
  return plan
}

// ── Hashtag-regler ───────────────────────────────────────────────────────────
export function normalizeHashtags(channel: string, hashtags: string[] | undefined): string[] {
  if (channel === 'facebook') return [] // FB: minimalt/inga
  const tags = (hashtags ?? [])
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t) => /^#[\wåäöÅÄÖ]+$/.test(t))
  if (!tags.includes('#familjestunden')) tags.unshift('#familjestunden')
  return tags.slice(0, 10) // IG: 5–10 (cap 10)
}

// ── Self-check (Drafterns interna spärr) ────────────────────────────────────
export function runSelfCheck(draft: Record<string, any>, theme: ThemeCanon): { passed: boolean; items: Record<string, boolean> } {
  const blob = JSON.stringify(draft).toLowerCase()
  const items = {
    follows_brand_rules: /[åäö]|\b(och|att|med)\b/.test(blob),
    follows_character_bible: true,
    follows_theme_bible: theme.symbols.length === 0 || theme.symbols.some((s) => blob.includes(s.toLowerCase())),
    no_forbidden_angles: !/the\s*prompt|ai[\s-]*news/i.test(blob),
    no_invented_facts: draft.landing_url_slot == null || /^<.*>$/.test(String(draft.landing_url_slot)),
    cta_present_and_valid: Boolean(draft.cta?.label),
    asset_refs_resolved_or_flagged: Array.isArray(draft.asset_plan) && draft.asset_plan.length > 0,
    only_familje_stunden_no_the_prompt: !/the\s*prompt|ai[\s-]*news/i.test(blob),
  }
  return { passed: Object.values(items).every(Boolean), items }
}

// ── Slutmontering ────────────────────────────────────────────────────────────
export function assembleDraftPost(
  brief: Record<string, any>, theme: ThemeCanon, llm: LlmDraftCopy, draftKey: string,
): Record<string, unknown> {
  const assetRefs: string[] = Array.isArray(brief.asset_refs) ? brief.asset_refs
    : Array.isArray(brief.brief_payload?.asset_refs) ? brief.brief_payload.asset_refs : []
  const cta = brief.cta ?? brief.brief_payload?.cta ?? { type: 'trial', label: CTA.primary }
  const mustNot: string[] = brief.must_not ?? brief.brief_payload?.must_not ?? [...theme.mustNot, ...FORBIDDEN_ANGLE_TAGS]

  const draft: Record<string, any> = {
    draft_key: draftKey,
    channel: brief.channel,
    format: brief.format,
    beat: brief.beat,
    language: 'sv',
    caption: llm.caption,
    caption_rendered: llm.caption_rendered,
    hashtags: normalizeHashtags(brief.channel, llm.hashtags),
    cta: { type: cta.type, label: cta.label, secondary: cta.secondary ?? [], landing_url_slot: null },
    landing_url_slot: null,                       // deterministiskt: aldrig påhittad URL
    asset_plan: bindAssets(assetRefs, brief.format),
    character_usage: brief.character_usage ?? brief.brief_payload?.character_usage ?? { nova: CHARACTER_ROLES.nova, pling: CHARACTER_ROLES.pling },
    tone: BRAND.tone,
    must_not_applied: mustNot,
    canon_level: { caption: 'OSAKER', asset_plan: 'KANON-ref/LUCKA', cta: 'KANON' },
    source_trace: { theme: `${theme.themeKey}.md`, pillar: 'marketing-bible.md', characters: 'nova-v2.md,pling-v2.md' },
  }
  if (brief.format === 'reel' && llm.reel_spec) draft.reel_spec = llm.reel_spec
  if (brief.format === 'carousel' && llm.carousel_slides) { draft.carousel_slides = llm.carousel_slides; draft.slide_count = llm.carousel_slides.length }
  if (brief.format === 'fb_post' && llm.fb_post) draft.fb_post = { ...llm.fb_post, link_preview_slot: null, hashtags: [] }

  const sc = runSelfCheck(draft, theme)
  draft.self_check = sc
  return draft
}
