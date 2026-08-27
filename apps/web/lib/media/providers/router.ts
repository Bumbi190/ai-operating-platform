/**
 * lib/media/providers/router.ts — the Provider Router.
 *
 * The layer that keeps Atlas from ever naming a vendor. Callers ask for a
 * CAPABILITY ("something that can make a video") or for an explicit provider id;
 * they never import `muapi.ts`, and nothing above this file mentions MuAPI. That
 * is the whole point of the layer: when Higgsfield or OpenArt is added, the
 * change is a registry entry here and nothing upstream moves.
 *
 * WHY ROUTING IS DELIBERATELY DUMB TODAY. With exactly one registered provider
 * there is no selection problem, and a scoring heuristic written now would be
 * tuned against a single candidate — it would encode MuAPI's quirks as if they
 * were general rules, then have to be unlearned when the second provider makes
 * the trade-off real. So `resolveProviderFor` picks the first registered
 * provider that (a) declares the capability and (b) is currently executable,
 * and the cost/quality/latency trade-off is left for the Media Orchestrator,
 * which is the layer that will actually have preferences.
 *
 * REGISTRATION IS NOT ACTIVATION. A registered provider whose gate refuses is
 * still listed by `describeMediaProviders()` — an operator needs to see that
 * MuAPI exists and is disabled, which is different from MuAPI not existing.
 * Routing, however, skips it: `resolveProviderFor` only returns providers that
 * could actually run.
 */

import { MediaProviderError } from './errors'
import { MuapiProvider } from './muapi'
import type {
  MediaCapability,
  MediaProvider,
  MediaProviderId,
  MediaProviderStatus,
} from './types'

export interface MediaProviderFactory {
  (): MediaProvider
}

/**
 * Every provider Omnira knows how to construct.
 *
 * Higgsfield and OpenArt are named in `MediaProviderId` but absent here on
 * purpose: the type says they are planned, the registry says they are not
 * built. Registering a stub that throws would make `describeMediaProviders()`
 * report two providers that cannot be configured, which is worse than silence.
 */
const REGISTRY: Partial<Record<MediaProviderId, MediaProviderFactory>> = {
  muapi: () => new MuapiProvider(),
}

/** Ids with a working factory, in routing-preference order. */
export function registeredProviderIds(): MediaProviderId[] {
  return Object.keys(REGISTRY) as MediaProviderId[]
}

/** Construct a provider by id. Throws for an unregistered id. */
export function getMediaProvider(id: MediaProviderId): MediaProvider {
  const factory = REGISTRY[id]
  if (!factory) {
    throw new MediaProviderError({
      code: 'MEDIA_CAPABILITY_UNSUPPORTED',
      message: `No media provider is registered under "${id}".`,
      provider: null,
      retryable: false,
    })
  }
  return factory()
}

/**
 * Status for every registered provider. Never touches the network, so it is
 * safe to render on a dashboard or return from a status route regardless of
 * whether anything is configured.
 */
export function describeMediaProviders(): MediaProviderStatus[] {
  return registeredProviderIds().map(id => getMediaProvider(id).describe())
}

/**
 * The routing decision: the first provider that declares `capability` AND is
 * currently permitted to execute. Returns null rather than throwing, so a
 * caller can distinguish "nothing available" from "the call failed" — those
 * need different handling and an exception conflates them.
 */
export function resolveProviderFor(capability: MediaCapability): MediaProvider | null {
  for (const id of registeredProviderIds()) {
    const provider = getMediaProvider(id)
    if (!provider.capabilities.includes(capability)) continue
    if (!provider.describe().executionAllowed) continue
    return provider
  }
  return null
}

/**
 * Throwing form, carrying WHY nothing was available.
 *
 * The distinction the message preserves: a capability nobody implements is a
 * roadmap gap, while a capability that exists but is gated off is a
 * configuration state an operator can change. Collapsing both into "no provider
 * available" sends people to the wrong fix.
 */
export function requireProviderFor(capability: MediaCapability): MediaProvider {
  const provider = resolveProviderFor(capability)
  if (provider) return provider

  const declaring = registeredProviderIds()
    .map(getMediaProvider)
    .filter(p => p.capabilities.includes(capability))

  if (declaring.length === 0) {
    throw new MediaProviderError({
      code: 'MEDIA_CAPABILITY_UNSUPPORTED',
      message: `No registered media provider implements "${capability}".`,
      provider: null,
      retryable: false,
    })
  }

  const reasons = declaring
    .map(p => `${p.id}: ${p.describe().blockedReason ?? 'blocked'}`)
    .join('; ')

  throw new MediaProviderError({
    code: 'MEDIA_EXECUTION_DISABLED',
    message: `"${capability}" is implemented but no provider may execute — ${reasons}`,
    provider: null,
    retryable: false,
  })
}
