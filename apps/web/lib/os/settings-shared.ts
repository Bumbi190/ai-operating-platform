/**
 * Inställningar — the client-safe half of the contract.
 *
 * Vocabulary, labels and the replacement outcome mapper. `lib/os/settings.ts` is
 * `server-only` because it reaches the session, the operator predicate, the
 * database and the environment, so anything a component needs at runtime lives
 * here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, the operator predicate,
 * environment reads — and any credential value. Nothing in this contract can
 * carry a token: no type below has a field for one.
 */

/** Whether a source could be read. An unreadable source is never rendered as empty. */
export type SectionState = 'ok' | 'error'

export type ChannelId = 'instagram' | 'facebook' | 'youtube'
export type ReplaceableChannelId = 'instagram' | 'facebook'

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
}

/**
 * Where the credential a channel publishes with comes from. Instagram and
 * Facebook mirror `getToken()`: a stored row for the default social project wins,
 * the environment variable is the fallback. YouTube's OAuth credentials exist only
 * in the environment.
 */
export type CredentialSource =
  | 'stored'             // a platform_tokens row exists for the default social project
  | 'environment'        // no stored row; the fallback environment variable is set
  | 'vercel'             // YouTube: every OAuth variable is set
  | 'vercel_incomplete'  // YouTube: some OAuth variables are set, not all
  | 'missing'            // nothing to publish with
  | 'out_of_scope'       // the default social project is not this session's to read
  | 'unreadable'         // the read failed — which is not "missing"

export const CREDENTIAL_SOURCE_LABELS: Record<CredentialSource, string> = {
  stored: 'Sparad i Omnira',
  environment: 'Miljövariabel (reserv)',
  vercel: 'Hanteras i Vercel',
  vercel_incomplete: 'Ofullständig i Vercel',
  missing: 'Saknas',
  out_of_scope: 'Utanför din behörighet',
  unreadable: 'Kunde inte läsas',
}

/**
 * `token_health.status` as the daily token check writes it, plus the two answers
 * the surface needs when there is nothing to report: no row at all, and a status
 * this vocabulary does not know.
 */
export type TokenHealthStatus = 'ok' | 'warning' | 'expired' | 'error' | 'unknown' | 'unchecked'

export const TOKEN_HEALTH_LABELS: Record<TokenHealthStatus, string> = {
  ok: 'Giltigt vid senaste kontroll',
  warning: 'Löper ut inom 14 dagar',
  expired: 'Ogiltigt, utgånget eller saknas',
  error: 'Kontrollen rapporterade fel',
  unknown: 'Okänd status',
  unchecked: 'Ingen kontroll registrerad',
}

/**
 * Whether this session would pass the two checks `POST /api/media/token` makes,
 * in the route's order: the platform operator first, then ownership of the
 * default social project. A capability, never an authority — the route re-checks.
 */
export type ReplacementCapability =
  | { allowed: true }
  | { allowed: false; reason: 'operator_required' | 'ownership_required' | 'project_missing' | 'project_unreadable' }

export const CAPABILITY_NOTES: Record<Exclude<ReplacementCapability, { allowed: true }>['reason'], string> = {
  operator_required:
    'Operatörsbehörighet krävs. Kanalernas status visas, men ett token kan bara ersättas av plattformsoperatören.',
  ownership_required:
    'Ersättning kräver att du äger projektet ai-media-automation, som kanalerna publicerar för. Status visas utan dess lagrade metadata.',
  project_missing:
    'Projektet ai-media-automation finns inte, så det finns inget mål att ersätta ett token för.',
  project_unreadable:
    'Projektet ai-media-automation kunde inte läsas, så ersättning erbjuds inte just nu. Läsfel — inte ett nekande.',
}

/** The one existing write path for a channel credential. */
export const CREDENTIAL_ENDPOINT = '/api/media/token'

/** The route refuses anything shorter; the form does not send it. */
export const MIN_TOKEN_LENGTH = 50

/** The owner's statement of how this account signs in (Settings S1). */
export const ACCOUNT_SIGN_IN_METHOD = 'E-post och lösenord · magisk länk som reserv'

/**
 * The existing password flow. `/update-password` serves a signed-in session as
 * well as a recovery link (its own doc: updateUser() works on any authenticated
 * session), and middleware lets it through. Settings adds no password logic.
 */
export const ACCOUNT_PASSWORD_HREF: string | null = '/update-password'

export const CHANNEL_STATUS_NOTE =
  'Status kommer från lagrad metadata och den dagliga token-kontrollen (06:15 UTC). Inget token läses eller visas här.'

export const REPLACEMENT_LOG_NOTE =
  'Ersättningar revisionsloggas sedan den 14 september 2026. Ersättningar före det finns inte i loggen.'

export const YOUTUBE_NOTE =
  'YouTube publicerar med OAuth-uppgifter som hanteras i Vercel. De kan inte ändras här.'

export const PLATFORM_CONFIG_NOTE =
  'Hanteras i Vercel. Omnira visar bara om en variabel är satt — aldrig dess värde.'

/** The one answer for a value that is not known. Never zero, never "ok". */
export const UNKNOWN_LABEL = 'Okänt'

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

// ─────────────────────────────────────────────────────────────────────────────
// Replacement outcome
// ─────────────────────────────────────────────────────────────────────────────

export type ReplacementOutcomeKind = 'replaced' | 'refused' | 'failed' | 'incident'

export interface ReplacementOutcome {
  kind: ReplacementOutcomeKind
  message: string
  /** The audit operation the route reported. Not a secret; ties the answer to the log. */
  operationId: string | null
  /** Facebook onboarding's three booleans, when the route returned them. */
  facebook: { exchanged: boolean; pageResolved: boolean; readInsightsOk: boolean } | null
}

export const SEND_FAILED_MESSAGE =
  'Inget svar kom fram. Läs in sidan igen för att se kanalens status — ersättningen kan ha genomförts.'

/**
 * Map the route's answer to what the operator is told. Anything but a completed
 * replacement is shown as what it was: a refusal as a refusal, a failure as a
 * failure, and a replacement whose audit record could not be completed as an
 * incident — never as a success, and never as "nothing happened".
 */
export function replacementOutcome(httpStatus: number, payload: unknown): ReplacementOutcome {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const operationId = typeof p.operation_id === 'string' && p.operation_id ? p.operation_id : null
  const said = typeof p.error === 'string' && p.error.trim() ? p.error.trim() : null
  const facebook =
    typeof p.exchanged === 'boolean' && typeof p.pageResolved === 'boolean' && typeof p.readInsightsOk === 'boolean'
      ? { exchanged: p.exchanged, pageResolved: p.pageResolved, readInsightsOk: p.readInsightsOk }
      : null
  const outcome = (kind: ReplacementOutcomeKind, message: string): ReplacementOutcome =>
    ({ kind, message, operationId, facebook: kind === 'replaced' ? facebook : null })

  if (httpStatus >= 200 && httpStatus < 300 && p.ok === true) {
    return outcome('replaced', operationId
      ? 'Tokenet är ersatt och ersättningen är revisionsloggad.'
      : 'Tokenet är ersatt.')
  }
  if (p.replaced === true) {
    return outcome('incident', said ?? 'Tokenet ersattes, men revisionsloggen kunde inte slutföras.')
  }
  if (httpStatus === 401) return outcome('refused', 'Sessionen är inte längre giltig. Logga in igen.')
  if (httpStatus === 403) {
    return outcome('refused', p.denied === 'platform_operator_required'
      ? 'Nekad: ersättning kräver plattformsoperatörens behörighet.'
      : 'Nekad: du äger inte projektet som kanalerna publicerar för.')
  }
  if (httpStatus === 400 || httpStatus === 404) return outcome('refused', said ?? 'Förfrågan nekades.')
  if (httpStatus === 503) return outcome('failed', said ?? 'Ersättningen kunde inte revisionsloggas och har inte genomförts.')
  return outcome('failed', said ?? 'Tokenet kunde inte ersättas.')
}
