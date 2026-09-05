/**
 * lib/workflows/story/anthropic-provider.ts — one implementation of the
 * provider-neutral story seam.
 *
 * ── IT OWNS NOTHING BUT THE WORDS ───────────────────────────────────────────
 * The model is asked for a title and a list of pages. It is not asked for, and
 * cannot supply, the instance, the month, the brief hash, the contract version,
 * the character references, the workflow state, the provenance or the spend
 * identity. Every one of those is supplied locally and re-imposed during
 * normalisation, because a provider that could name its own brief hash could
 * claim to have satisfied requirements it never saw.
 *
 * ── THE SPEND BOUNDARY IS HERE, BY DECLARATION ──────────────────────────────
 * `generate_monthly_story` declares `trusted_adapter` ownership, so the executor
 * takes no reservation and this call's boundary is the only one. The run's
 * execution identity is forwarded as `idempotencyKey`, which is what makes that
 * single reservation belong to one intent rather than to one call — the whole
 * point of Phase 2B-2.6.
 *
 * Nothing here re-implements billing classification. `getAnthropic` already
 * raises `ProviderNotDispatchedError` from its own `provablyNotBilled`, and the
 * governed boundary releases on it; duplicating that judgement is the Phase 5B-1
 * defect and is deliberately absent.
 */

import 'server-only'

import { getAnthropic } from '@/lib/ai/anthropic'
import type { ExecutionContract } from '@/lib/governance/execution-stop'
import type { StoryPromptContract } from './prompt'
import type { StoryTextProvider } from './provider'

/**
 * The model, from the closed map. Not configurable by a caller and not read from
 * the environment: which model writes the product is a policy decision, and an
 * env override would move it outside review.
 */
export const STORY_MODEL = 'claude-sonnet-4-6' as const

/** Generous enough for 18 pages of Swedish, bounded so the estimate is real. */
export const STORY_MAX_TOKENS = 4096

export interface AnthropicStoryProviderInput {
  readonly projectId: string
  readonly execution: ExecutionContract
  /** The run's execution identity. Becomes the single reservation's key. */
  readonly idempotencyKey: string
  readonly runId: string
  /**
   * Called at the exact instant a request may leave this machine, and never
   * otherwise.
   *
   * Everything before it — the checkpoint, credential resolution, the spend
   * reservation — provably sent nothing, and a failure there is a clean refusal.
   * Everything after may have reached inference and may have been billed, and a
   * failure there is ambiguity. A caller cannot tell those apart from the outside
   * without guessing, and guessing is how a governance STOP gets recorded as a
   * call that might have cost money.
   */
  readonly onDispatch?: () => void
}

/**
 * Render the machine-readable contract as the instruction the model receives.
 *
 * Every value is interpolated from the contract; no product rule is written
 * here. The `required_rules` are named rather than restated, so a change to the
 * canonical story contract changes what is asked without editing this file.
 */
function renderInstruction(c: StoryPromptContract): string {
  return [
    `Du skriver en Familje-Stunden-saga för ${c.month_key}.`,
    `Tema: ${c.theme}.`,
    `Språk: ${c.language}. Målgrupp: barn ${c.audience.min_age}–${c.audience.max_age} år.`,
    '',
    `Sagan har exakt ${c.structure.total_pages} sidor totalt:`,
    `  ${c.structure.cover_pages} omslagssida (role "cover", sidnummer 1)`,
    `  ${c.structure.content_pages} innehållssidor (role "content")`,
    `  ${c.structure.closing_pages} avslutningssida (role "closing", sista sidan)`,
    '',
    `Varje innehållssida: ${c.content_page_sentences.target_min}–`
      + `${c.content_page_sentences.target_max} korta meningar, `
      + `aldrig fler än ${c.content_page_sentences.hard_max}.`,
    '',
    'Regler som måste följas:',
    ...c.required_rules.map(r => `  - ${r}`),
    '',
    'Karaktärerna Nova och Pling definieras av dessa kontrakt — hitta aldrig på',
    'deras utseende:',
    ...c.character_contract_refs.map(r => `  - ${r.character}: ${r.contract_path}@${r.contract_version}`),
    '',
    'Svara ENBART med JSON i exakt denna form, utan kodstaket och utan',
    'förklaring:',
    '{"title": "...", "pages": [{"page_number": 1, "role": "cover", "text": "..."}]}',
  ].join('\n')
}

/**
 * Strip a fenced code block if the model wrapped its JSON in one.
 *
 * Deliberately the ONLY forgiveness offered. Anything beyond unwrapping — adding
 * a missing page, trimming an extra one, inventing a title — would be repairing
 * structurally invalid output into apparently valid content, which is how a
 * story nobody wrote passes a validator.
 */
function unwrap(text: string): string {
  const fenced = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/)
  return (fenced ? fenced[1] : text).trim()
}

export function anthropicStoryProvider(
  input: AnthropicStoryProviderInput,
): StoryTextProvider {
  return {
    provider: 'anthropic',
    model: STORY_MODEL,

    async generate(contract: StoryPromptContract, beforeDispatch?: () => Promise<void> | void) {
      // The last chance to refuse, awaited before the irreversible call. The
      // executor's G3C-3A already ran; this covers the window since.
      if (beforeDispatch) await beforeDispatch()

      const client = getAnthropic({
        project: { projectId: input.projectId },
        execution: input.execution,
        operation: 'generate_monthly_story',
        agent: 'Saga-berättare',
        runId: input.runId,
        // THE single reservation's key. Without it this adapter would reserve
        // per call rather than per intent, which is the defect 2B-2.6 closed.
        idempotencyKey: input.idempotencyKey,
      })

      // Past this line the request is in flight, or may be.
      input.onDispatch?.()
      const message = await client.messages.create({
        model: STORY_MODEL,
        max_tokens: STORY_MAX_TOKENS,
        messages: [{ role: 'user', content: renderInstruction(contract) }],
      })

      const text = message.content
        .map(b => (b.type === 'text' ? b.text : ''))
        .join('')

      // Returned as parsed-or-raw. `normalizeStoryResponse` is the only thing
      // that decides whether this is a story, and it rejects rather than repairs.
      try {
        return JSON.parse(unwrap(text)) as unknown
      } catch {
        // Hand back what arrived. Normalisation will refuse it as not an object,
        // which is the honest outcome — inventing a shape here would hide it.
        return text
      }
    },
  }
}

