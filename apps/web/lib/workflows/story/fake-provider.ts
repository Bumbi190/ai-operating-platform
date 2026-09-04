/**
 * lib/workflows/story/fake-provider.ts — a text provider that can fail in every
 * way that matters, and cost nothing.
 *
 * The dangerous cases are the ones a real model will not produce on request:
 * a response lost after the remote may have accepted, and a confirmed answer
 * followed by a local persistence failure. No API key reproduces those on
 * demand. A switch does, every time, in a unit test.
 *
 * Zero network, zero credentials, zero credits — asserted by a guard.
 */

import type { StoryPromptContract } from './prompt'
import type { StoryTextProvider } from './provider'
import { ProviderNotDispatchedError } from '@/lib/cost/governed-spend'

export const FAKE_STORY_PROVIDER = 'fake' as const
export const FAKE_STORY_MODEL = 'deterministic-story-1' as const

export const FAKE_STORY_SCENARIOS = [
  'valid',
  'malformed_json',
  'wrong_page_count',
  'empty_title',
  'too_many_sentences',
  'remote_rejected',
  'not_dispatched',
  'ambiguous_dispatch',
  'confirmed_then_persistence_failure',
] as const

export type FakeStoryScenario = (typeof FAKE_STORY_SCENARIOS)[number]

/** The remote answered, and its answer was no. Nothing applied, nothing billed. */
export class FakeRemoteRejectedError extends Error {
  constructor() { super('the provider rejected the request'); this.name = 'FakeRemoteRejectedError' }
}

/** The answer was lost. We do NOT know whether the remote acted. */
export class FakeAmbiguousDispatchError extends Error {
  constructor() { super('the response was lost'); this.name = 'FakeAmbiguousDispatchError' }
}

/** Build a story document that satisfies the contract it was given. */
function validDocument(c: StoryPromptContract, opts: { sentences?: number } = {}) {
  const total = c.structure.total_pages
  const sentences = opts.sentences ?? 2
  const body = Array.from({ length: sentences }, (_, i) => `Mening ${i + 1}.`).join(' ')
  return {
    title: `${c.theme} med Nova och Pling`,
    pages: Array.from({ length: total }, (_, i) => {
      const n = i + 1
      const role = n === 1 ? 'cover' : n === total ? 'closing' : 'content'
      return { page_number: n, role, text: role === 'content' ? body : `${c.theme}.` }
    }),
  }
}

/**
 * A provider whose behaviour is chosen, not observed.
 *
 * The scenario is a construction parameter rather than something a prompt can
 * request — the fake must not become a channel through which a caller steers
 * generation, since that is precisely what the real seam forbids.
 */
export function fakeStoryProvider(scenario: FakeStoryScenario): StoryTextProvider {
  return {
    provider: FAKE_STORY_PROVIDER,
    model: FAKE_STORY_MODEL,
    async generate(contract, beforeDispatch) {
      // Refuse BEFORE anything notional leaves: the one case that provably
      // never reached a remote, and therefore the only one that may release.
      if (scenario === 'not_dispatched') {
        throw new ProviderNotDispatchedError(
          'the request was refused locally and never sent', FAKE_STORY_PROVIDER)
      }
      if (beforeDispatch) await beforeDispatch()

      switch (scenario) {
        case 'valid':
          return validDocument(contract)
        case 'malformed_json':
          return 'this is not a story object'
        case 'wrong_page_count': {
          const doc = validDocument(contract)
          return { ...doc, pages: doc.pages.slice(0, contract.structure.total_pages - 1) }
        }
        case 'empty_title':
          return { ...validDocument(contract), title: '   ' }
        case 'too_many_sentences':
          return validDocument(contract, { sentences: contract.content_page_sentences.hard_max + 1 })
        case 'remote_rejected':
          throw new FakeRemoteRejectedError()
        case 'ambiguous_dispatch':
          throw new FakeAmbiguousDispatchError()
        case 'confirmed_then_persistence_failure':
          // The document is real and the remote is done. Whatever fails next
          // fails AFTER the effect, which is the caller's problem to classify.
          return validDocument(contract)
        default:
          return validDocument(contract)
      }
    },
  }
}
