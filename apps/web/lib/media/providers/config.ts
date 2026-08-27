/**
 * lib/media/providers/config.ts — MuAPI configuration resolution.
 *
 * THE ONE RULE THIS FILE ENFORCES: production is entered by an explicit human
 * decision, never by the state of the environment. In particular, the presence
 * of a production key is NOT an input to mode selection. That is the mistake
 * this file is shaped to make impossible — "a prod key is set, so we must mean
 * production" is exactly how a sandbox integration starts billing.
 *
 * Concretely, `resolveMuapiMode()` reads `MUAPI_MODE` and nothing else. It does
 * not look at which credentials exist. A missing credential makes the resolved
 * mode UNCONFIGURED (a refusal, surfaced by the gate); it never silently
 * promotes or demotes the mode to one whose key happens to be present.
 *
 * SECOND RULE: no credential ever leaves this module. `resolveMuapiConfig()`
 * returns a config WITHOUT the key; the key is reachable only through
 * `resolveMuapiCredential()`, which the adapter calls at the moment it builds a
 * request header. Nothing here logs, serializes, or returns a key for display,
 * and `describe()`-style callers get `configured: boolean` instead.
 *
 * Defaults, when the environment says nothing at all:
 *   enabled = false, mode = 'test', productionEnabled = false.
 */

import type { MediaProviderMode } from './types'

/**
 * A read-only view of an environment. Deliberately looser than
 * `NodeJS.ProcessEnv` — these functions only ever READ string values, and
 * requiring the full ProcessEnv shape would force every test to construct
 * `NODE_ENV` and friends just to assert on one MuAPI variable.
 */
export type EnvSource = Record<string, string | undefined>

// ── Environment variable names ───────────────────────────────────────────────
// Named as constants so tests and docs reference the same strings the code
// reads, and a rename cannot leave a doc or a guard test behind.

export const MUAPI_ENV = {
  enabled: 'MUAPI_ENABLED',
  mode: 'MUAPI_MODE',
  testKey: 'MUAPI_TEST_API_KEY',
  prodKey: 'MUAPI_PROD_API_KEY',
  /** The SECOND switch production needs. `MUAPI_MODE=production` alone is not enough. */
  productionEnabled: 'MUAPI_PRODUCTION_ENABLED',
  baseUrl: 'MUAPI_BASE_URL',
} as const

export const MUAPI_DEFAULT_BASE_URL = 'https://api.muapi.ai'

/**
 * Boolean flag reading, matching `lib/atlas/view-context.ts` — `'1'` or
 * `'true'` enable, everything else (unset, `'0'`, `'false'`, typos) disables.
 * Fail-closed by construction: only two exact strings can ever turn a flag on.
 */
function flagEnabled(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

/**
 * The resolved configuration MINUS the credential.
 *
 * `hasCredential` is a boolean on purpose. Every caller that wants to know
 * "can we run?" needs exactly that, and handing them the key so they can test
 * it for emptiness is how keys end up in log lines.
 */
export interface MuapiConfig {
  /** `MUAPI_ENABLED`. False by default. */
  enabled: boolean
  /** Resolved from `MUAPI_MODE` alone. Never inferred from credentials. */
  mode: MediaProviderMode
  /** Whether the mode's OWN credential is present. No cross-mode fallback. */
  hasCredential: boolean
  /** `MUAPI_PRODUCTION_ENABLED` — the explicit second switch. */
  productionEnabled: boolean
  baseUrl: string
}

/**
 * Resolve the mode from `MUAPI_MODE` and `MUAPI_ENABLED` only.
 *
 * `MUAPI_ENABLED` is the master switch: off means `disabled`, whatever
 * `MUAPI_MODE` says. This ordering matters — it means shipping
 * `MUAPI_MODE=production` into an environment cannot do anything on its own,
 * so the dangerous value is inert unless someone ALSO flips the master switch
 * AND the production switch. Three deliberate acts, not one.
 *
 * An unrecognised `MUAPI_MODE` resolves to `test`, never to `production`:
 * a typo must degrade toward the harmless state.
 */
export function resolveMuapiMode(env: EnvSource = process.env): MediaProviderMode {
  if (!flagEnabled(env[MUAPI_ENV.enabled])) return 'disabled'
  const raw = (env[MUAPI_ENV.mode] ?? '').trim().toLowerCase()
  if (raw === 'production') return 'production'
  return 'test'
}

/**
 * Which env var holds the credential for a given mode.
 *
 * Deliberately total over the two runnable modes and deliberately NULL for
 * `disabled`: a disabled provider has no credential to select, and returning
 * the test key "just in case" would make the disabled state depend on config
 * that the disabled state is supposed to ignore.
 */
export function credentialEnvNameFor(mode: MediaProviderMode): string | null {
  if (mode === 'test') return MUAPI_ENV.testKey
  if (mode === 'production') return MUAPI_ENV.prodKey
  return null
}

/**
 * The full config, credential excluded.
 *
 * Note what is NOT here: any branch that reads a key in order to decide a mode.
 * `hasCredential` is computed AFTER the mode is already fixed.
 */
export function resolveMuapiConfig(env: EnvSource = process.env): MuapiConfig {
  const mode = resolveMuapiMode(env)
  const credEnv = credentialEnvNameFor(mode)
  const hasCredential = credEnv !== null && (env[credEnv] ?? '').trim().length > 0

  return {
    enabled: flagEnabled(env[MUAPI_ENV.enabled]),
    mode,
    hasCredential,
    productionEnabled: flagEnabled(env[MUAPI_ENV.productionEnabled]),
    baseUrl: (env[MUAPI_ENV.baseUrl] ?? '').trim() || MUAPI_DEFAULT_BASE_URL,
  }
}

/**
 * The credential for the CURRENT mode, or null.
 *
 * The only function in Omnira that returns a MuAPI key. It returns the key for
 * the resolved mode and no other — asking in test mode can never yield the
 * production key, which is the property that makes "test can't spend" true
 * rather than merely intended.
 *
 * Callers must use the return value to build a request header and must not
 * store, log, or return it. The adapter is the only caller.
 */
export function resolveMuapiCredential(env: EnvSource = process.env): string | null {
  const mode = resolveMuapiMode(env)
  const credEnv = credentialEnvNameFor(mode)
  if (!credEnv) return null
  const value = (env[credEnv] ?? '').trim()
  return value.length > 0 ? value : null
}
