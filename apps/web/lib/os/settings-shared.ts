/**
 * Inställningar — the client-safe half of the contract.
 *
 * Vocabulary, labels and the outcome mappers. `lib/os/settings.ts` is `server-only`
 * because it reaches the session, the operator predicate, the database and the
 * environment, so anything a component needs at runtime lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, the operator predicate,
 * environment reads — and any credential value. Nothing in this contract can carry a
 * token: no type below has a field for one.
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
 * How a project's bound external account was established (social_account_bindings).
 * `provider_attested`: a platform answered with the account for the credential, live.
 * `runtime_evidence`: bound from verified runtime observations (owner decision 1A)
 * until the next live verification upgrades it.
 */
export type AccountVerification = 'provider_attested' | 'runtime_evidence'

export const VERIFICATION_LABELS: Record<AccountVerification, string> = {
  provider_attested: 'Verifierat av plattformen',
  runtime_evidence: 'Bundet från verifierad runtime-evidens',
}

/** What each platform calls the account a credential belongs to. */
export const ACCOUNT_NOUNS: Record<ChannelId, string> = {
  instagram: 'Konto',
  facebook: 'Sida',
  youtube: 'Kanal',
}

/** The name a platform has not given yet — said instead of guessed. */
export const UNATTESTED_NAMES: Record<ChannelId, string> = {
  instagram: 'användarnamn ej verifierat ännu',
  facebook: 'sidnamn ej verifierat ännu',
  youtube: 'kanaltitel ej verifierad',
}

/** Where a channel's credential is — metadata only, never the credential. */
export type CredentialState =
  | 'stored'                    // platform_tokens holds this project's credential
  | 'missing'                   // nothing stored for this project
  | 'environment_transitional'  // YouTube (Y1): the platform's Vercel credential, bound to this project only
  | 'environment_incomplete'    // YouTube (Y1): bound, but the Vercel OAuth variables are incomplete
  | 'not_available'             // YouTube for every other project: not connectable yet
  | 'unreadable'                // the read failed — which is not "missing"

export const CREDENTIAL_STATE_LABELS: Record<CredentialState, string> = {
  stored: 'Sparad i Omnira',
  missing: 'Saknas',
  environment_transitional: 'I Vercel (övergång)',
  environment_incomplete: 'Ofullständig i Vercel',
  not_available: 'Kan inte kopplas ännu',
  unreadable: 'Kunde inte läsas',
}

/**
 * `social_credential_health.status` as the daily verification writes it, plus the two
 * answers the surface needs when there is nothing to report: no row at all, and a
 * status this vocabulary does not know.
 */
export type CredentialHealthStatus =
  | 'ok' | 'warning' | 'expired' | 'account_mismatch' | 'binding_blocked' | 'credential_missing' | 'verification_failed'
  | 'unknown' | 'unchecked'

export const HEALTH_LABELS: Record<CredentialHealthStatus, string> = {
  ok: 'Giltig vid senaste kontroll',
  warning: 'Löper ut inom 14 dagar',
  expired: 'Ogiltig eller utgången',
  account_mismatch: 'Tillhör inte projektets konto',
  binding_blocked: 'Kontobindningen är spärrad',
  credential_missing: 'Credential saknas',
  verification_failed: 'Kunde inte verifieras',
  unknown: 'Okänd status',
  unchecked: 'Ingen kontroll registrerad',
}

export const BINDING_ACTION_LABELS: Record<string, string> = {
  matched: 'samma konto',
  created: 'konto kopplat',
  rebound: 'konto bytt',
}

/**
 * Whether this session passes the check both credential routes make first: the
 * canonical platform-operator predicate. Ownership needs no flag here — every project
 * the surface shows is one this session owns, and each route re-checks ownership of
 * the project it is given. A capability, never an authority.
 */
export type ReplacementCapability = { allowed: true } | { allowed: false; reason: 'operator_required' }

export const CAPABILITY_NOTES: Record<'operator_required', string> = {
  operator_required:
    'Operatörsbehörighet krävs. Projektens konton och status visas, men en credential kan bara läggas till, ersättas eller verifieras av plattformsoperatören.',
}

/** The one write path for a project's Instagram or Facebook credential. */
export const CREDENTIAL_ENDPOINT = '/api/media/token'

/** Ask the platform, now, whether a project's credential is still its bound account. */
export const VERIFY_ENDPOINT = '/api/media/social-accounts/verify'

/** The route refuses anything shorter; the form does not send it. */
export const MIN_TOKEN_LENGTH = 50

/** A Facebook page id as the route accepts it. */
export const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** The owner's statement of how this account signs in (Settings S1). */
export const ACCOUNT_SIGN_IN_METHOD = 'E-post och lösenord · magisk länk som reserv'

/**
 * The existing password flow. `/update-password` serves a signed-in session as
 * well as a recovery link (its own doc: updateUser() works on any authenticated
 * session), and middleware lets it through. Settings adds no password logic.
 */
export const ACCOUNT_PASSWORD_HREF: string | null = '/update-password'

export const PROJECT_SCOPE_NOTE =
  'Varje projekt har sina egna konton. En credential sparas bara för projektet den läggs till under, och bara om plattformen bekräftar att den tillhör projektets kopplade konto. Ett konto kan bara tillhöra ett projekt.'

export const CHANNEL_STATUS_NOTE =
  'Status kommer från kontobindningen, lagrad metadata och den dagliga verifieringen (06:15 UTC). Inget token läses eller visas här.'

export const REPLACEMENT_LOG_NOTE =
  'Ersättningar revisionsloggas sedan den 14 september 2026. Ersättningar före det finns inte i loggen.'

export const YOUTUBE_NOTE =
  'Övergång: projektets YouTube-kanal publicerar med OAuth-uppgifter som hanteras i Vercel och bara får användas för just den här kanalbindningen. De kan inte ändras här.'

export const YOUTUBE_UNAVAILABLE_NOTE =
  'YouTube kan inte kopplas till det här projektet ännu. Projektspecifika YouTube-credentials med verifierad kanal är nästa steg — tills dess publiceras inget på YouTube för projektet.'

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
  /** The account the platform attested and how it was bound, on a completed replacement. */
  account: { id: string; label: string | null; bindingAction: string | null } | null
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
  const rawAccount = p.account && typeof p.account === 'object' ? p.account as Record<string, unknown> : null
  const account = rawAccount && typeof rawAccount.id === 'string' && rawAccount.id
    ? {
        id: rawAccount.id,
        label: typeof rawAccount.label === 'string' && rawAccount.label ? rawAccount.label : null,
        bindingAction: typeof rawAccount.binding_action === 'string' ? rawAccount.binding_action : null,
      }
    : null
  const outcome = (kind: ReplacementOutcomeKind, message: string): ReplacementOutcome => ({
    kind, message, operationId,
    facebook: kind === 'replaced' ? facebook : null,
    account: kind === 'replaced' ? account : null,
  })

  if (httpStatus >= 200 && httpStatus < 300 && p.ok === true) {
    return outcome('replaced', operationId
      ? 'Credentialn är sparad för projektets bekräftade konto och ersättningen är revisionsloggad.'
      : 'Credentialn är sparad för projektets bekräftade konto.')
  }
  if (p.replaced === true) {
    return outcome('incident', said ?? 'Tokenet ersattes, men revisionsloggen kunde inte slutföras.')
  }
  if (httpStatus === 401) return outcome('refused', 'Sessionen är inte längre giltig. Logga in igen.')
  if (httpStatus === 403) {
    return outcome('refused', p.denied === 'platform_operator_required'
      ? 'Nekad: ersättning kräver plattformsoperatörens behörighet.'
      : 'Nekad: du äger inte projektet.')
  }
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 409) return outcome('refused', said ?? 'Förfrågan nekades.')
  if (httpStatus === 503) return outcome('failed', said ?? 'Ersättningen kunde inte genomföras just nu. Inget har sparats.')
  return outcome('failed', said ?? 'Tokenet kunde inte ersättas.')
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification outcome
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationOutcomeKind = 'confirmed' | 'unconfirmed' | 'refused' | 'failed'

export interface VerificationOutcome {
  kind: VerificationOutcomeKind
  message: string
}

/** Map the verification route's answer to what the operator is told. Confirmed only when the platform confirmed. */
export function verificationOutcome(httpStatus: number, payload: unknown): VerificationOutcome {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const account = p.account && typeof p.account === 'object' ? p.account as Record<string, unknown> : {}
  const name = typeof account.label === 'string' && account.label ? account.label
    : typeof account.id === 'string' ? account.id : null
  const said = typeof p.error === 'string' && p.error.trim() ? p.error.trim() : null
  const status = typeof p.status === 'string' ? p.status as CredentialHealthStatus : null

  if (httpStatus === 200 && p.ok === true && p.identity_verified === true) {
    return { kind: 'confirmed', message: name ? `Bekräftat av plattformen: ${name}.` : 'Bekräftat av plattformen.' }
  }
  if (httpStatus === 200 && p.ok === true) {
    return { kind: 'unconfirmed', message: 'Credentialn fungerar, men plattformen lät inte kontot läsas just nu.' }
  }
  if (httpStatus === 200) {
    return { kind: 'refused', message: status && HEALTH_LABELS[status] ? `${HEALTH_LABELS[status]}.` : 'Kontot kunde inte bekräftas.' }
  }
  if (httpStatus === 401) return { kind: 'refused', message: 'Sessionen är inte längre giltig. Logga in igen.' }
  if (httpStatus === 403) return { kind: 'refused', message: 'Nekad: verifiering kräver plattformsoperatörens behörighet och att du äger projektet.' }
  if (httpStatus === 400 || httpStatus === 404) return { kind: 'refused', message: said ?? 'Förfrågan nekades.' }
  if (httpStatus === 503) return { kind: 'failed', message: said ?? 'Plattformen kunde inte nås just nu. Försök igen.' }
  return { kind: 'failed', message: said ?? 'Verifieringen kunde inte genomföras.' }
}
