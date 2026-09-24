/**
 * SDF-1C2 — response ordering for the claim handshake.
 *
 * The canonical signed request counter is the ordering primitive: the server accepts counters
 * strictly in order, so a response to request N was produced BEFORE a response to request
 * N+1. A late response from an earlier request (for example the ORIGINAL claim response
 * arriving after a recovery response) must never replace state obtained from a newer one.
 * Recovery rotates the credential, so the older token is already dead; accepting it would
 * make the broker hold an unusable token.
 *
 * Rule: newer broker request counter wins; an older (or equal) delayed response is refused.
 * A response may also never move a handle to a different claim.
 */

export interface ClaimHandle {
  /** Signed request counter of the request whose response produced this handle. */
  requestCounter: number
  workId: string
  claimId: string
  fence: number
  leaseUntil: string
  /** RAW credential. Keep in memory only; never log or persist. */
  claimToken: string
}

export type OfferOutcome = 'accepted' | 'stale' | 'rejected'

export class ClaimHandleTracker {
  private current: ClaimHandle | null = null

  get handle(): Readonly<ClaimHandle> | null { return this.current }

  offer(candidate: ClaimHandle): OfferOutcome {
    if (!this.current) { this.current = { ...candidate }; return 'accepted' }
    if (candidate.workId !== this.current.workId || candidate.claimId !== this.current.claimId
        || candidate.fence !== this.current.fence) return 'rejected'
    if (candidate.requestCounter <= this.current.requestCounter) return 'stale'
    this.current = { ...candidate }
    return 'accepted'
  }
}
