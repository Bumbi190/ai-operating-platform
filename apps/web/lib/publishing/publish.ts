/**
 * lib/publishing/publish.ts
 *
 * Generic, destination-agnostic entrypoints. Resolve a destination by key via the
 * registry and call it with code-aware retry.
 *
 * Retry policy mirrors lib/media/retry.ts but is contract-aware: PublishError with
 * retryable=false (validation errors like category_not_found) never retries; transient
 * transport/DB faults retry with bounded backoff. Retries are safe because the RPC is
 * idempotent on external_id.
 */

import { getDestination } from './registry'
import { PublishError, type PublishPayload, type PublishSuccess, type UnpublishSuccess } from './types'

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

async function withPublishRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const permanent = err instanceof PublishError && !err.retryable
      if (permanent || attempt === MAX_ATTEMPTS - 1) break
      const delay = BASE_DELAY_MS * Math.pow(3, attempt) + Math.random() * 200
      console.warn(
        `[publishing] ${label} attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ` +
          `${err instanceof Error ? err.message : String(err)}. Retrying in ${Math.round(delay)}ms.`,
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

export function publishArticle(
  destinationKey: string,
  payload: PublishPayload,
): Promise<PublishSuccess> {
  const dest = getDestination(destinationKey)
  return withPublishRetry(`publish:${destinationKey}:${payload.external_id}`, () => dest.publish(payload))
}

export function unpublishArticle(
  destinationKey: string,
  externalId: string,
): Promise<UnpublishSuccess> {
  const dest = getDestination(destinationKey)
  return withPublishRetry(`unpublish:${destinationKey}:${externalId}`, () => dest.unpublish(externalId))
}
