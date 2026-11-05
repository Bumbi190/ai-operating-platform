/**
 * lib/article/factcheck/reviewer.ts
 *
 * Model half of the FactCheck gate, plus the one-shot reviser. Both go through
 * the governed `getAnthropic` boundary (budget reservation, stop authority,
 * cost ledger) with the same provider and model family the Article Writer
 * already uses — no new AI service.
 *
 * Output is forced through a tool schema and is still treated as untrusted:
 * contract.ts validates every sentence and every quote before it counts.
 */

import { getAnthropic } from '@/lib/ai/anthropic'
import { calculateCost } from '@/lib/ai/pricing'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'
import type { ExecutionContract } from '@/lib/governance/execution-stop'
import { MAX_CLAIMS } from './contract'
import type { CheckedClaim, SourceSnapshot } from './types'

export const FACTCHECK_MODEL = 'claude-sonnet-4-6'
const REVIEW_TOOL = 'submit_factcheck'
const REVISE_TOOL = 'submit_revision'
/** Per-source characters shown to the reviewer. Quotes are verified against the full snapshot. */
const SOURCE_CHARS_FOR_REVIEW = 14_000

export const FACTCHECK_SYSTEM_PROMPT = `You are the fact-check desk of "The Prompt", an AI-news publication.
You receive a draft article (HEADLINE, LEDE and BODY) and SOURCE SNAPSHOTS that were fetched independently of the writer.
Your job is verification, not editing.

1. Extract every checkable factual claim in the article: names, organisations, products, versions,
   numbers, prices, dates, quotes, launches, availability, legal/regulatory facts, causal statements
   presented as fact. Skip sentences that are clearly marked opinion or interpretation
   ("this suggests", "the likely play is") unless they smuggle in a new fact.
   The HEADLINE and every LEDE sentence are published too and are ALWAYS checked: list each of them
   as a claim, always with importance "central", even if the body repeats it.
   COVERAGE IS CHECKED IN CODE: every body sentence that contains a number, amount, percentage,
   quotation, date/weekday, or an event verb (announced, launched, released, raised, acquired, said,
   reported, according to, costs, available, ...) MUST appear in your list. Any such sentence you omit
   is automatically treated as an unsupported CENTRAL claim and blocks publication.
2. For each claim copy the WHOLE sentence it appears in (headline, lede or body) EXACTLY, character
   for character (not a fragment of it).
3. Mark importance "central" if the story would be wrong or misleading without it; else "supporting".
4. Judge it ONLY against the snapshots — not your memory:
   - supported: a snapshot states it. Give at least one exact quote (12-400 chars, copied verbatim).
   - contradicted: a snapshot states something incompatible. Quote it.
   - uncertain: the snapshots are ambiguous, partial, or only imply it.
   - unsupported: no snapshot says it (even if you believe it is true).
5. Never invent quotes, sources or source ids. A quote that is not verbatim in the snapshot is rejected
   automatically and the claim counts as unsupported.
Call ${REVIEW_TOOL} exactly once.`

function sourcesBlock(sources: readonly SourceSnapshot[]): string {
  return sources.map((s) =>
    `<source id="${s.id}" kind="${s.kind}" publisher="${s.publisherGroup}" url="${s.url}">\n` +
    `${s.title}\n\n${s.text.slice(0, SOURCE_CHARS_FOR_REVIEW)}\n</source>`).join('\n\n')
}

export interface ReviewCallResult {
  /** Raw tool input `claims` array; validated by contract.ts, not here. */
  claims: unknown
  model: string
  costUsd: number
}

export interface ReviewArgs {
  execution: ExecutionContract
  title: string
  summary: string
  body: string
  sources: readonly SourceSnapshot[]
}

export async function reviewClaims(args: ReviewArgs): Promise<ReviewCallResult> {
  const claude = getAnthropic({
    project: MEDIA_PIPELINE_PROJECT, execution: args.execution,
    agent: 'Article FactCheck', operation: 'Verify Article Claims',
  })
  const response = await claude.messages.create({
    model: FACTCHECK_MODEL,
    // Coverage is enforced, so the reviewer must be able to list every checkable sentence.
    max_tokens: 9000,
    temperature: 0,
    system: FACTCHECK_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `SOURCE SNAPSHOTS\n${sourcesBlock(args.sources)}\n\n` +
        `HEADLINE\n${args.title}\n\nLEDE\n${args.summary}\n\nBODY\n${args.body}`,
    }],
    tools: [{
      name: REVIEW_TOOL,
      description: 'Submit the claim-by-claim verification.',
      input_schema: {
        type: 'object',
        properties: {
          claims: {
            type: 'array',
            maxItems: MAX_CLAIMS,
            items: {
              type: 'object',
              properties: {
                sentence: { type: 'string', description: 'The exact headline, lede or body sentence containing the claim.' },
                claim: { type: 'string', description: 'The claim restated atomically.' },
                importance: { type: 'string', enum: ['central', 'supporting'] },
                verdict: { type: 'string', enum: ['supported', 'contradicted', 'uncertain', 'unsupported'] },
                evidence: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      sourceId: { type: 'string' },
                      exactQuote: { type: 'string' },
                    },
                    required: ['sourceId', 'exactQuote'],
                  },
                },
                note: { type: 'string', description: 'One short sentence explaining the verdict.' },
              },
              required: ['sentence', 'claim', 'importance', 'verdict', 'evidence', 'note'],
            },
          },
        },
        required: ['claims'],
      },
    }],
    tool_choice: { type: 'tool', name: REVIEW_TOOL },
  })
  const tool = response.content.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; input: { claims?: unknown } } | undefined
  return {
    claims: tool?.input?.claims ?? null,
    model: FACTCHECK_MODEL,
    costUsd: calculateCost(FACTCHECK_MODEL, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0),
  }
}

export const REVISE_SYSTEM_PROMPT = `You are the copy chief of "The Prompt". A fact-check found sentences in the
article (headline, lede or body) that are not supported by the sources. Revise the article so that EVERY flagged
sentence is either:
- corrected to match what the sources actually say (only using facts present in the sources), or
- clearly qualified (e.g. "X reports, but has not confirmed, that…"), or
- removed.
Do not add any new fact, number, name, date or quote that is not in the sources. Keep everything that was
not flagged as close to the original as possible, keep Markdown and structure, and keep the source attribution.
If the flagged claims are the core of the story and cannot be corrected, still return the best honest version.
Call ${REVISE_TOOL} exactly once.`

export interface ReviseArgs {
  execution: ExecutionContract
  title: string
  summary: string
  body: string
  flagged: readonly CheckedClaim[]
  sources: readonly SourceSnapshot[]
}

export interface ReviseResult { title: string; summary: string; body: string; model: string; costUsd: number }

export async function reviseFlaggedClaims(args: ReviseArgs): Promise<ReviseResult> {
  const claude = getAnthropic({
    project: MEDIA_PIPELINE_PROJECT, execution: args.execution,
    agent: 'Article FactCheck', operation: 'Revise Unverified Claims',
  })
  const flaggedList = args.flagged.map((c) =>
    `- [${c.field}/${c.verdict}/${c.importance}] "${c.sentence}" — ${c.note || c.claim}`).join('\n')
  const response = await claude.messages.create({
    model: FACTCHECK_MODEL,
    max_tokens: 4000,
    temperature: 0,
    system: REVISE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `SOURCE SNAPSHOTS\n${sourcesBlock(args.sources)}\n\nFLAGGED SENTENCES\n${flaggedList}\n\n` +
        `ARTICLE\nTitle: ${args.title}\nSummary: ${args.summary}\n\n${args.body}`,
    }],
    tools: [{
      name: REVISE_TOOL,
      description: 'Submit the revised article.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['title', 'summary', 'body'],
      },
    }],
    tool_choice: { type: 'tool', name: REVISE_TOOL },
  })
  const tool = response.content.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; input: { title?: unknown; summary?: unknown; body?: unknown } } | undefined
  const body = typeof tool?.input?.body === 'string' ? tool.input.body.trim() : ''
  if (!body) throw new Error('[factcheck] reviser returned no body')
  return {
    title: typeof tool?.input?.title === 'string' && tool.input.title.trim() ? tool.input.title.trim() : args.title,
    summary: typeof tool?.input?.summary === 'string' && tool.input.summary.trim() ? tool.input.summary.trim() : args.summary,
    body,
    model: FACTCHECK_MODEL,
    costUsd: calculateCost(FACTCHECK_MODEL, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0),
  }
}
