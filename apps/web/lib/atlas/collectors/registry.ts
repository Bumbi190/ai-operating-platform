/**
 * lib/atlas/collectors/registry.ts — Collector registry.
 *
 * All collector instances are registered here. Routes and cron handlers
 * look up collectors by ID. Import side-effects register collectors on module
 * load — collectors self-register by being imported.
 *
 * Naming convention: "{source}.{metric_type}"
 *   stripe.revenue    → StripeRevenueCollector
 *   social.account    → SocialAccountCollector
 *   supabase.platform → SupabasePlatformCollector (Phase 3)
 */

import type { BaseCollector } from './types'
import { StripeRevenueCollector } from './stripe-revenue'
import { SocialAccountCollector } from './social-account'

const _registry: Record<string, BaseCollector> = {}

function register(collector: BaseCollector): void {
  if (_registry[collector.id]) {
    throw new Error(`[collector-registry] Duplicate collector id: "${collector.id}"`)
  }
  _registry[collector.id] = collector
}

// ── Register all collectors ───────────────────────────────────────────────────
register(new StripeRevenueCollector())
register(new SocialAccountCollector())
// Phase 3: register(new SupabasePlatformCollector())

// ── Public API ────────────────────────────────────────────────────────────────

export function getCollector(id: string): BaseCollector | null {
  return _registry[id] ?? null
}

export function allCollectors(): BaseCollector[] {
  return Object.values(_registry)
}

export const COLLECTOR_REGISTRY = _registry
