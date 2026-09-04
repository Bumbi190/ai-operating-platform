/**
 * lib/workflows/story/hash.ts — what an Editor is approving, reduced to 32 bytes.
 *
 * The hash covers the SEMANTIC story and nothing else. Provenance is excluded on
 * purpose and the exclusion is the design:
 *
 *   • a model upgrade that produces byte-identical prose must not invalidate an
 *     approval — the Editor approved the words;
 *   • `created_at`, the run id and the database id must never reach it, because
 *     an approval that changes meaning when a row is re-read is not an approval.
 *
 * Uses the repository's single canonicalizer, as `computeDefHash` and
 * `computeMonthlyBriefHash` do. Two canonicalizers over the same data are two
 * answers waiting to disagree.
 */

import { createHash } from 'crypto'
import { canonicalJson } from '@/lib/atlas/mission/binding'
import type { StoryV1 } from './types'

/**
 * The exact payload that is hashed.
 *
 * Field order is irrelevant (canonicalJson sorts), but the SET is not: adding a
 * field here changes every existing story's identity, so it is a schema-version
 * decision rather than an edit.
 */
export function storyContentPayload(story: StoryV1): Record<string, unknown> {
  return {
    schema: story.schema,
    version: story.version,
    workflow_instance_id: story.workflow_instance_id,
    month_key: story.month_key,
    generated_from_brief_hash: story.generated_from_brief_hash,
    story_contract_version: story.story_contract_version,
    character_contract_refs: [...story.character_contract_refs]
      .map(r => ({ character: r.character, contract_path: r.contract_path,
                   contract_version: r.contract_version }))
      .sort((a, b) => a.character.localeCompare(b.character)),
    title: story.title,
    // Page ORDER is meaning. Sorted by number so a provider returning them out
    // of order cannot produce a different identity for the same book.
    pages: [...story.pages]
      .sort((a, b) => a.page_number - b.page_number)
      .map(p => ({ page_number: p.page_number, role: p.role, text: p.text })),
  }
}

/** The story's identity. */
export function computeStoryContentHash(story: StoryV1): string {
  return createHash('sha256').update(canonicalJson(storyContentPayload(story))).digest('hex')
}
