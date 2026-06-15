/**
 * lib/article/photo-editor.ts — Hero Image V2 Commit C.
 *
 * The Photo Editor Agent. Does editorial REASONING, not prompt engineering.
 * Runs in shadow mode in Phase 1: produces a structured EditorBrief that is
 * persisted alongside generated articles. NO rendered image generation
 * behavior changes from this module's output yet — that's Phase 2.
 *
 * The agent reasons through three questions before committing the brief:
 *   1. What is the story? (one sentence, no jargon)
 *   2. What is the tension? (one sentence — irony / conflict / stakes)
 *   3. What would a publication in the lineage of Bloomberg, FT, The Economist,
 *      Wired, Reuters, or MIT Technology Review actually put on the cover?
 *
 * The agent then commits the brief via a forced tool call. Forced tool_use is
 * the only Anthropic-supported way to guarantee structured output for
 * claude-sonnet-4-6 in this codebase (assistant prefill was tried and
 * rejected with 400 invalid_request_error; see writer.ts comment).
 */

import { Anthropic } from '@anthropic-ai/sdk'
import { logLlmCost } from '@/lib/cost/track'

export const PHOTO_EDITOR_MODEL = 'claude-sonnet-4-6'
const SUBMIT_BRIEF_TOOL = 'submit_brief'
const BODY_EXCERPT_CHARS = 1800

export const EDITORIAL_STYLES = [
  'Bloomberg',
  'Financial Times',
  'Economist',
  'MIT Technology Review',
  'Wired',
  'Reuters',
] as const

export type EditorialStyle = (typeof EDITORIAL_STYLES)[number]

export interface PhotoEditorInput {
  title: string
  summary: string | null
  body: string | null
  category: string | null
  tags: string[]
}

export interface EditorBrief {
  /** One sentence, no jargon: what is the article actually about? */
  story: string
  /** The editorial tension expressed as a short visual idea (irony, conflict, stakes). */
  visual_metaphor: string
  /** A specific cover-image concept anchored to a real subject. Editor language, not AI-image-prompt language. */
  shot: string
  /** Specific visual clichés to avoid for THIS story (additions to the standing banlist). */
  avoid: string[]
  /** Primary editorial visual lineage, picked intentionally based on category. */
  editorial_style: EditorialStyle
}

/**
 * Hard banlist — passed into the system prompt as a NON-negotiable constraint,
 * not a soft preference. If the model's first instinct is any of these, the
 * system prompt instructs it to reset and choose an editorial-photography
 * direction instead.
 */
export const ANTI_STOCK_BANLIST = [
  'server racks',
  'server rooms',
  'data centers',
  'computer screens',
  'source code',
  'glowing brains',
  'digital neurons',
  'holograms',
  'cyberpunk cities',
  'floating UI panels',
  'blue AI energy',
  'abstract network nodes',
] as const

/**
 * Category → editorial-style guidance. The model picks ONE primary style. If
 * the category isn't mapped, the model falls back to Wired (the consumer-AI
 * default per Phase 1 spec).
 */
export const CATEGORY_STYLE_GUIDANCE: Record<string, string> = {
  business: 'Bloomberg or Financial Times — boardroom artifacts, conference tables, executive environments in silhouette, printed financial documents under restrained light.',
  policy: 'Economist or Reuters — government buildings at dusk, hearing rooms, printed regulatory orders on official desks, courtroom restraint, documentary archive aesthetic.',
  research: 'MIT Technology Review — actual lab benches (NOT server rooms), whiteboards with handwriting, printed papers, prototypes on workbenches, researcher in silhouette.',
  models: 'Wired — environmental portraits of the people building or using the system, symbolic objects from the story, the actual office where the work happens.',
  tools: 'Wired — developer-as-craftsperson (NOT generic IDE screens), the physical workspace, the artifacts of building.',
  news: 'Wired — the specific event\'s location-as-character, the actual moment, documentary still-life of the artifacts mentioned.',
}

function categoryGuidance(category: string | null): string {
  const c = category?.toLowerCase()
  if (c && CATEGORY_STYLE_GUIDANCE[c]) return CATEGORY_STYLE_GUIDANCE[c]
  return CATEGORY_STYLE_GUIDANCE.news
}

const SYSTEM_PROMPT = `You are a senior photo editor for a print magazine in the lineage of Bloomberg Businessweek, The Financial Times, The Economist, Wired, Reuters and MIT Technology Review. You commission ONE image per cover.

Your job is NOT to write image prompts. Your job is EDITORIAL REASONING. You think like a magazine editor: what is this story really about, what is the tension that makes it worth covering, and what would a publication of record actually put on the cover.

Reason in plain English through these three questions BEFORE committing the brief:
  1. What is the story? (one sentence, no jargon)
  2. What is the tension? (one sentence — the irony, conflict, or stakes that earns this article a cover)
  3. What would a magazine editor in this lineage put on the cover? (the specific image concept, anchored to a real subject from the actual reporting)

Then call the submit_brief tool with your structured output.

EDITORIAL STYLE GUIDANCE — pick ONE primary style. Map intentionally based on category:
  • business → Bloomberg or Financial Times
  • policy   → Economist or Reuters
  • research → MIT Technology Review
  • models / tools / news (default "Consumer AI" bucket) → Wired

HARD CONSTRAINT — never reach for these visual clichés. If your first instinct is any of these, reset and choose an editorial-photography direction instead:
  ${ANTI_STOCK_BANLIST.map((c) => '  - ' + c).join('\n')}

DEFAULT REACH FOR INSTEAD:
  - Environmental portraits (subject from behind or in silhouette — never frontal faces)
  - Symbolic objects shot beautifully (one specific item, dramatic light)
  - Location-as-character (the building, the room, the place where the story happened)
  - Still-life with editorial restraint (artifacts on a real surface)
  - Archival photography aesthetic / documentary moment

THE "shot" FIELD must describe one specific physical scene a real photographer could capture — a real person silhouetted in a real environment, a printed document on a real desk, a building exterior at a specific time of day. Editor's language to a photographer, NOT AI-image-prompt language. Do not write "cinematic lighting" or "digital art" or "photorealistic" — those phrases mean you have defaulted to AI aesthetics. Write like you are commissioning a real photographer to shoot a real scene.

THE "avoid" FIELD must list story-specific clichés (additions to the standing banlist above), not generic warnings. Example for an AI-agents story: ["network-of-glowing-nodes visualizations", "any depiction of agents as humanoid robots"].`

function buildUserPrompt(input: PhotoEditorInput): string {
  const body = (input.body ?? '').slice(0, BODY_EXCERPT_CHARS)
  const tags = input.tags.length ? input.tags.join(', ') : '(none)'
  return `Brief this cover for me.

TITLE
${input.title}

CATEGORY
${input.category ?? '(unspecified — treat as Consumer AI)'}

EDITORIAL STYLE GUIDANCE FOR THIS CATEGORY
${categoryGuidance(input.category)}

TAGS
${tags}

SUMMARY / DEK
${input.summary ?? '(none)'}

BODY (excerpt — for tension and subject anchors)
"""
${body}
"""

Reason through the three questions, then call submit_brief.`
}

function findToolUse(content: unknown): { input: unknown } | undefined {
  if (!Array.isArray(content)) return undefined
  for (const b of content) {
    if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'tool_use') {
      return b as { input: unknown }
    }
  }
  return undefined
}

/**
 * Run the Photo Editor Agent. Throws if Anthropic rejects the call or the
 * model fails to emit a submit_brief tool_use block. Callers (the shadow
 * integration in lib/article/hero-image.ts) MUST handle these errors so that
 * brief failures do not block image generation.
 */
export async function runPhotoEditor(input: PhotoEditorInput): Promise<EditorBrief> {
  const claude = new Anthropic()
  const response = await claude.messages.create({
    model: PHOTO_EDITOR_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    tools: [
      {
        name: SUBMIT_BRIEF_TOOL,
        description:
          'Submit the editorial brief for this article cover. Editorial reasoning, not an image prompt.',
        input_schema: {
          type: 'object',
          properties: {
            story: {
              type: 'string',
              description: 'One sentence, no jargon: what is this article about?',
            },
            visual_metaphor: {
              type: 'string',
              description:
                'The editorial tension expressed as a short visual idea (one short phrase).',
            },
            shot: {
              type: 'string',
              description:
                'A specific cover-image concept anchored to a real physical subject. Editor language briefing a real photographer — NOT AI-image-prompt language. No "cinematic lighting", "digital art", "photorealistic" phrasing.',
            },
            avoid: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Story-specific visual clichés to avoid (additions to the standing banlist).',
            },
            editorial_style: {
              type: 'string',
              enum: [...EDITORIAL_STYLES],
              description:
                'Primary editorial visual lineage, picked intentionally based on the article category.',
            },
          },
          required: ['story', 'visual_metaphor', 'shot', 'avoid', 'editorial_style'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: SUBMIT_BRIEF_TOOL },
  })

  // Log cost for visibility during shadow eval. Non-blocking.
  void logLlmCost(PHOTO_EDITOR_MODEL, response.usage, {
    agent: 'Photo Editor',
    operation: 'Generate Editor Brief',
  })

  const toolUse = findToolUse(response.content)
  if (!toolUse) {
    throw new Error('[photo-editor] model response missing submit_brief tool_use block')
  }
  const raw = toolUse.input as Partial<EditorBrief> | null | undefined
  if (
    !raw ||
    typeof raw.story !== 'string' ||
    typeof raw.visual_metaphor !== 'string' ||
    typeof raw.shot !== 'string' ||
    !Array.isArray(raw.avoid) ||
    typeof raw.editorial_style !== 'string'
  ) {
    throw new Error('[photo-editor] submit_brief input failed shape validation')
  }
  return {
    story: raw.story.trim(),
    visual_metaphor: raw.visual_metaphor.trim(),
    shot: raw.shot.trim(),
    avoid: raw.avoid.filter((s): s is string => typeof s === 'string').map((s) => s.trim()),
    editorial_style: raw.editorial_style as EditorialStyle,
  }
}
