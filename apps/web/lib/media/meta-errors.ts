/**
 * meta-errors.ts — strukturerad felhantering för Meta Graph API (Instagram + Facebook).
 *
 * Bakgrund (incident 2026-07-19): publiceringen failade med enbart texten
 * "An unknown error occurred" respektive "Fatal". Båda är Metas generiska
 * `error.message`; den faktiska betydelsen ligger i `code`, `error_subcode` och
 * `fbtrace_id` — fält som den gamla koden kastade bort med
 * `data.error?.message ?? ...`. Utan dem gick det inte att avgöra om felet var
 * transient (försök igen) eller permanent (sluta försöka, gå till granskning).
 *
 * SÄKERHET: ingenting i den här modulen får någonsin exponera access tokens.
 * `redactSecrets()` körs på all text som kan hamna i loggar, felmeddelanden,
 * DB-kolumner eller alert-mail. Tokens skickas som Authorization-header (aldrig
 * som query-parameter) av anroparen, men redaktionen finns kvar som andra
 * försvarslinje ifall en URL ändå läcker in i ett felmeddelande.
 */

// ─── Redaktion ────────────────────────────────────────────────────────────────

/**
 * Tar bort access tokens och andra hemligheter ur en textsträng.
 * Täcker: access_token=... i query/body, Bearer-headers, och fristående
 * Meta-tokenliteraler (EAA…/IGA…) som råkat hamna i en sträng.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/(access_token=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[REDACTED]')
    .replace(/\b(EAA|IGA|IGQ)[A-Za-z0-9._\-]{20,}/g, '[REDACTED_TOKEN]')
}

/** Redigerar rekursivt alla strängvärden i ett objekt. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as unknown as T
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|secret|authorization|password/i.test(k) ? '[REDACTED]' : redactDeep(v)
    }
    return out as unknown as T
  }
  return value
}

// ─── Typer ────────────────────────────────────────────────────────────────────

export interface MetaErrorPayload {
  message?:        string
  type?:           string
  code?:           number
  error_subcode?:  number
  fbtrace_id?:     string
  error_user_msg?: string
}

/**
 * Meta-felkoder som ALLTID är transienta — det är meningsfullt att försöka igen
 * med backoff. Källa: Graph API "Error Codes" + Content Publishing-dokumentationen.
 */
const TRANSIENT_CODES = new Set([
  -1,   // "Fatal" — Metas internfel. Sågs i denna incident kl. 18:00.
  1,    // "An unknown error occurred". Sågs i denna incident kl. 08:00.
  2,    // Tillfälligt API-fel / tjänsten nere
  4,    // Application request limit reached
  17,   // User request limit reached
  32,   // Page request limit reached
  341,  // Application limit reached
  368,  // Temporarily blocked
  613,  // Rate limit
])

/**
 * Permanenta koder — nya försök kan inte lyckas utan mänsklig åtgärd.
 */
const PERMANENT_CODES = new Set([
  10,   // Permission denied
  190,  // Invalid/expired OAuth access token
  200,  // Permissions error
  803,  // Objektet finns inte / fel typ
])

/**
 * Permanenta subkoder i Content Publishing API. Dessa betyder att just DEN här
 * containern eller mediefilen är obrukbar — ett nytt försök mot samma container
 * kan aldrig lyckas.
 */
const PERMANENT_SUBCODES = new Set([
  2207001, // Okänt fel vid mediebearbetning
  2207003, // Kunde inte hämta media från video_url
  2207004, // Media inte nedladdningsbar
  2207005, // Ogiltigt medieformat
  2207006, // Media-ID hittades inte
  2207008, // Container har redan publicerats
  2207009, // Ogiltiga bilddimensioner
  2207020, // Container expired
  2207023, // Okänt uppladdningsfel
  2207026, // Videoformat stöds inte
  2207032, // Skapande av container misslyckades permanent
  2207050, // Videofilen är korrupt
  2207053, // Container i ERROR-state
])

// ─── Felklass ─────────────────────────────────────────────────────────────────

export class MetaApiError extends Error {
  readonly httpStatus:      number
  readonly code?:           number
  readonly subcode?:        number
  readonly fbtraceId?:      string
  readonly metaType?:       string
  readonly endpoint:        string
  readonly containerStatus?: string

  constructor(opts: {
    message:          string
    httpStatus:       number
    code?:            number
    subcode?:         number
    fbtraceId?:       string
    metaType?:        string
    endpoint:         string
    containerStatus?: string
  }) {
    // Meddelandet redigeras redan i konstruktorn — allt som fångar felet och
    // loggar `err.message` är därmed automatiskt tokenfritt.
    super(redactSecrets(opts.message))
    this.name            = 'MetaApiError'
    this.httpStatus      = opts.httpStatus
    this.code            = opts.code
    this.subcode         = opts.subcode
    this.fbtraceId       = opts.fbtraceId
    this.metaType        = opts.metaType
    this.endpoint        = opts.endpoint
    this.containerStatus = opts.containerStatus
  }

  /**
   * Ska anropet INTE försökas igen?
   *
   * Ordning spelar roll: explicita subkoder och koder vinner över HTTP-status,
   * eftersom Meta returnerar 400 för både "ogiltig token" (permanent) och
   * "rate limit" (transient).
   */
  get permanent(): boolean {
    if (this.subcode !== undefined && PERMANENT_SUBCODES.has(this.subcode)) return true
    if (this.code    !== undefined && PERMANENT_CODES.has(this.code))       return true
    if (this.code    !== undefined && TRANSIENT_CODES.has(this.code))       return false
    if (this.httpStatus === 429)                                            return false
    if (this.httpStatus >= 500)                                             return false
    if (this.httpStatus >= 400)                                             return true
    return false
  }

  /** Strukturerad, tokenfri representation för loggar, DB och alerts. */
  toLogObject(): Record<string, unknown> {
    return redactDeep({
      endpoint:        this.endpoint,
      httpStatus:      this.httpStatus,
      message:         this.message,
      code:            this.code ?? null,
      subcode:         this.subcode ?? null,
      type:            this.metaType ?? null,
      fbtraceId:       this.fbtraceId ?? null,
      containerStatus: this.containerStatus ?? null,
      permanent:       this.permanent,
    })
  }

  /** Enradig sammanfattning — det som hamnar i publish_failed_reason. */
  toSummary(): string {
    const bits = [
      `${this.message}`,
      `http=${this.httpStatus}`,
      this.code    !== undefined ? `code=${this.code}`       : null,
      this.subcode !== undefined ? `subcode=${this.subcode}` : null,
      this.fbtraceId              ? `trace=${this.fbtraceId}` : null,
      this.containerStatus        ? `container=${this.containerStatus}` : null,
      this.permanent ? 'permanent' : 'transient',
    ].filter(Boolean)
    return redactSecrets(bits.join(' | '))
  }
}

// ─── Parsning ─────────────────────────────────────────────────────────────────

/**
 * Bygger ett MetaApiError ur ett Graph API-svar.
 * `endpoint` är en etikett (t.ex. 'media_publish') — aldrig en URL, så att
 * inga query-parametrar kan följa med in i loggarna.
 */
export function toMetaApiError(
  endpoint:   string,
  httpStatus: number,
  body:       { error?: MetaErrorPayload } | null | undefined,
  fallback    = 'Meta API-anrop misslyckades',
): MetaApiError {
  const e = body?.error
  return new MetaApiError({
    message:    e?.error_user_msg ?? e?.message ?? `${fallback} (${httpStatus})`,
    httpStatus,
    code:       e?.code,
    subcode:    e?.error_subcode,
    fbtraceId:  e?.fbtrace_id,
    metaType:   e?.type,
    endpoint,
  })
}

/** Nätverks-/timeoutfel är alltid transienta. */
export function toNetworkError(endpoint: string, err: unknown): MetaApiError {
  const msg = err instanceof Error ? err.message : String(err)
  return new MetaApiError({
    message:    `Nätverksfel mot Meta: ${msg}`,
    httpStatus: 0,
    endpoint,
  })
}

/** Hjälpare: är ett godtyckligt fel permanent? Okända fel behandlas som transienta. */
export function isPermanentError(err: unknown): boolean {
  return err instanceof MetaApiError ? err.permanent : false
}

/** Hjälpare: tokenfri sammanfattning av ett godtyckligt fel. */
export function errorSummary(err: unknown): string {
  if (err instanceof MetaApiError) return err.toSummary()
  return redactSecrets(err instanceof Error ? err.message : String(err))
}
