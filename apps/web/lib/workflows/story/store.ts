/**
 * lib/workflows/story/store.ts — reading and writing an immutable story.
 *
 * The store has exactly two verbs: insert a candidate, and supersede one. There
 * is no update, because an Editor's approval names a content hash and a story
 * whose content can change is a story no approval can bind to.
 *
 * Identical regeneration is a DEDUPE, not a conflict: the same instance and the
 * same bytes are the same story, so the existing row is returned rather than a
 * second one created. Different bytes are a different story with its own
 * identity, and the previous row is retained.
 */

import 'server-only'

import { computeStoryContentHash } from './hash'
import type { StoredStory, StoryProvenance, StoryStatus, StoryV1 } from './types'

// any: the Supabase client in this project has no generated DB types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

export interface PersistStoryInput {
  readonly story: StoryV1
  readonly provider: string
  readonly model: string
  readonly promptContractVersion: string
  readonly runId: string | null
}

export type PersistStoryResult =
  | { created: true; stored: StoredStory }
  /** The same bytes already exist for this instance. Not an error. */
  | { created: false; stored: StoredStory }

function rowToStored(row: Record<string, unknown>): StoredStory {
  return {
    id: String(row.id),
    story: row.story as StoryV1,
    story_content_hash: String(row.story_content_hash),
    status: String(row.status) as StoryStatus,
    provenance: {
      provider: String(row.provider),
      model: String(row.model),
      prompt_contract_version: String(row.prompt_contract_version),
      run_id: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
      created_at: String(row.created_at),
      revision_number: Number(row.revision_number),
    } satisfies StoryProvenance,
  }
}

/**
 * Persist one candidate story.
 *
 * The hash is computed HERE, from the story, rather than accepted from a caller.
 * A caller-supplied identity would let a bug — or a provider — file one story
 * under another's name, and every later approval would bind the wrong bytes.
 */
export async function persistStory(
  db: AnyDb, input: PersistStoryInput,
): Promise<PersistStoryResult> {
  const hash = computeStoryContentHash(input.story)

  const { data: existing } = await db.from('workflow_stories')
    .select('*')
    .eq('workflow_instance_id', input.story.workflow_instance_id)
    .eq('story_content_hash', hash)
    .maybeSingle()
  if (existing) return { created: false, stored: rowToStored(existing) }

  // Revision is audit metadata: it counts attempts for a human reading the
  // history. It is never identity — two revisions with the same bytes would
  // have collided on the unique index above and never reached here.
  const { count } = await db.from('workflow_stories')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_instance_id', input.story.workflow_instance_id)

  const { data, error } = await db.from('workflow_stories').insert({
    workflow_instance_id: input.story.workflow_instance_id,
    month_key: input.story.month_key,
    story_content_hash: hash,
    generated_from_brief_hash: input.story.generated_from_brief_hash,
    story_contract_version: input.story.story_contract_version,
    story: input.story,
    provider: input.provider,
    model: input.model,
    prompt_contract_version: input.promptContractVersion,
    run_id: input.runId,
    revision_number: (count ?? 0) + 1,
    status: 'candidate',
  }).select('*').single()

  if (error) throw new Error(`persistStory: ${error.message}`)
  return { created: true, stored: rowToStored(data) }
}

/** One story by its exact identity. The only lookup a consumer should bind to. */
export async function readStoryByHash(
  db: AnyDb, instanceId: string, contentHash: string,
): Promise<StoredStory | null> {
  const { data } = await db.from('workflow_stories').select('*')
    .eq('workflow_instance_id', instanceId)
    .eq('story_content_hash', contentHash).maybeSingle()
  return data ? rowToStored(data) : null
}

/**
 * The full history, newest first.
 *
 * Deliberately NOT a `readLatestStory`. A "latest" accessor is the shortcut that
 * lets a downstream consumer act on a story nobody approved: the approved hash
 * and the newest row are different questions, and the moment one function
 * answers both, a regeneration silently inherits an approval. Consumers bind to
 * a hash; this exists for audit and for showing a human what happened.
 */
export async function listStories(db: AnyDb, instanceId: string): Promise<StoredStory[]> {
  const { data } = await db.from('workflow_stories').select('*')
    .eq('workflow_instance_id', instanceId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(rowToStored)
}

/** Mark a candidate superseded. Content is untouched; the row is retained. */
export async function supersedeStory(
  db: AnyDb, instanceId: string, contentHash: string,
): Promise<void> {
  const { error } = await db.from('workflow_stories')
    .update({ status: 'superseded' })
    .eq('workflow_instance_id', instanceId)
    .eq('story_content_hash', contentHash)
  if (error) throw new Error(`supersedeStory: ${error.message}`)
}
