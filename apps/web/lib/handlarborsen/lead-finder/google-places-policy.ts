/**
 * Google Places is DISABLED BY DEFAULT and has no client in this module.
 * This file only encodes the policy so any future adapter has to pass it:
 *
 *  - long-term storage is limited to Place IDs; names, addresses, phones,
 *    ratings and photos from Places must not be persisted (re-fetch instead);
 *  - Places results must not feed permanent marketing lists;
 *  - EEA terms, attribution, quota and billing must be verified legally first.
 */

export const PLACES_ENABLE_FLAG = 'HB_LEADFINDER_GOOGLE_PLACES_ENABLED'

export class PlacesDisabledError extends Error {
  constructor(reason: string) {
    super(`Google Places is disabled: ${reason}`)
    this.name = 'PlacesDisabledError'
  }
}

/** Needs BOTH the flag and an explicit legal sign-off flag; billing is never enabled here. */
export function assertPlacesAllowed(env: Record<string, string | undefined> = process.env): never {
  if (env[PLACES_ENABLE_FLAG] !== 'true') throw new PlacesDisabledError('feature flag off')
  throw new PlacesDisabledError('no adapter implemented; legal verification pending')
}

export interface StorablePlaceRef {
  placeId: string
}

/** The only shape that may be persisted from Places. Drops everything else. */
export function toStorablePlaceRef(raw: { placeId?: unknown } & Record<string, unknown>): StorablePlaceRef | null {
  return typeof raw.placeId === 'string' && /^[A-Za-z0-9_-]{10,}$/.test(raw.placeId) ? { placeId: raw.placeId } : null
}
