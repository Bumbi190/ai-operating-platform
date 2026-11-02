import { SCB_LIVE_SEARCH_APPROVED } from './readiness'
import { requireScbApiKey, SCB_LIMITS, ScbHttpError, ScbKeyMissingError } from './scb-source'
import type { ScbPage, ScbPageFetcher } from './scb-source'
import type { ScbRegisterRecord } from './types'

/**
 * Server-only SCB AFR page fetcher. Built strictly from the official OpenAPI
 * (saved 2026-10-27, "SCB:s allmänna företagsregister API", version v1):
 *
 *   GET {base}/v{v}/arbetsstallen/naringsgren/{naringsgrenKod}?limit&cursorId   -> { pagination, arbetsstallen[] }
 *   GET {base}/v{v}/juridiskaenheter/naringsgren/{naringsgrenKod}?limit&cursorId -> { pagination, jes[] }
 *   Auth: header `X-API-Key`. Errors: application/problem+json (400/401/404/429/500/503).
 *
 * The spec has no `servers` block, so the base URL is configuration
 * (`SCB_API_BASE_URL`), never a guessed default. Live requests stay disabled
 * (`SCB_LIVE_SEARCH_APPROVED`) unless a `fetchImpl` is injected, as in tests.
 */

export type ScbSource = 'arbetsstallen' | 'juridiskaenheter'

const COLLECTION_KEY: Record<ScbSource, 'arbetsstallen' | 'jes'> = {
  arbetsstallen: 'arbetsstallen',
  juridiskaenheter: 'jes',
}

const MAX_INT32 = 2_147_483_647
const MAX_RETRY_AFTER_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000

export class ScbContractError extends Error {
  constructor(message: string) {
    super(`SCB response violated the OpenAPI contract: ${message}`)
    this.name = 'ScbContractError'
  }
}

export class ScbNetworkError extends Error {
  constructor() {
    // Deliberately no cause/URL: the request carries the API key header.
    super('SCB request failed before a response was received')
    this.name = 'ScbNetworkError'
  }
}

export class ScbLiveSearchDisabledError extends Error {
  constructor() {
    super('SCB live search is disabled until explicitly approved')
    this.name = 'ScbLiveSearchDisabledError'
  }
}

/** Digits-only SNI, e.g. "47.811" / "47 811" -> "47811". Null unless 2–5 digits. */
export function sniToScbCode(input: string | null | undefined): string | null {
  const digits = (input ?? '').replace(/[\s.]/g, '')
  return /^\d{2,5}$/.test(digits) ? digits : null
}

/** SCB digits -> our dotted form ("47811" -> "47.811"). Null for anything that is not 2–5 digits. */
export function normalizeSni(input: string | number | null | undefined): string | null {
  const code = sniToScbCode(input == null ? null : String(input))
  if (!code) return null
  return code.length > 2 ? `${code.slice(0, 2)}.${code.slice(2)}` : code
}

/** County code as two digits ("1" / "01" -> "01"). Names or other shapes are not guessed at. */
function normalizeCounty(input: unknown): string | null {
  const s = typeof input === 'string' ? input.trim() : typeof input === 'number' ? String(input) : ''
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function sniCodesOf(primary: unknown): string[] {
  if (!isObject(primary)) return []
  const sni = normalizeSni(str(primary.naringsgren))
  return sni ? [sni] : []
}

/** AE (`aePartialData`) -> record. `aeStat` semantics are not documented, so `active` stays undefined. */
export function mapWorkplace(raw: unknown): ScbRegisterRecord {
  if (!isObject(raw)) throw new ScbContractError('arbetsstallen item is not an object')
  const address = isObject(raw.belagenhetsadress) ? raw.belagenhetsadress : {}
  return {
    orgnr: str(raw.peOrgNr) ?? '',
    name: str(raw.ben) ?? '',
    cfar: typeof raw.cfarNr === 'number' && Number.isInteger(raw.cfarNr) ? String(raw.cfarNr) : null,
    legalForm: null,
    sniCodes: sniCodesOf(raw.primarNaringsgren),
    countyCode: normalizeCounty(address.lan),
    municipalityCode: str(address.kommun),
    city: str(address.bPostOrt),
  }
}

/** JE (`jePartialData`) -> record. County comes from `lanSate`; JEs have no CFAR. */
export function mapLegalEntity(raw: unknown): ScbRegisterRecord {
  if (!isObject(raw)) throw new ScbContractError('jes item is not an object')
  const post = isObject(raw.postAdress) ? raw.postAdress : {}
  return {
    orgnr: str(raw.peOrgNr) ?? str(raw.orgNr) ?? '',
    name: str(raw.namn) ?? '',
    cfar: null,
    legalForm: str(raw.jurform),
    sniCodes: sniCodesOf(raw.primarNaringsgren),
    countyCode: normalizeCounty(raw.lanSate),
    municipalityCode: str(raw.kommunSate),
    city: str(post.postOrt),
  }
}

/** Validates `cursorPaginationResponseData` and the collection; returns our page. */
export function parseScbPage(source: ScbSource, body: unknown, requestedCursor: number | null): ScbPage {
  if (!isObject(body)) throw new ScbContractError('body is not an object')
  const collection = body[COLLECTION_KEY[source]]
  if (!Array.isArray(collection)) throw new ScbContractError(`"${COLLECTION_KEY[source]}" is not an array`)
  const pagination = body.pagination
  if (!isObject(pagination)) throw new ScbContractError('"pagination" is missing')
  if (typeof pagination.hasMore !== 'boolean') throw new ScbContractError('"pagination.hasMore" is not a boolean')

  const mapper = source === 'arbetsstallen' ? mapWorkplace : mapLegalEntity
  const rows = collection.map(mapper)
  if (!pagination.hasMore) return { rows, nextCursor: null }

  const next = pagination.nextCursorId
  if (typeof next !== 'number' || !Number.isInteger(next) || next < 0 || next > MAX_INT32) {
    throw new ScbContractError('"pagination.nextCursorId" is not a valid int32 while hasMore is true')
  }
  if (requestedCursor !== null && next === requestedCursor) {
    throw new ScbContractError('"pagination.nextCursorId" did not advance')
  }
  return { rows, nextCursor: String(next) }
}

function parseCursor(cursor: string | null): number | null {
  if (cursor === null) return null
  if (!/^\d{1,10}$/.test(cursor) || Number(cursor) > MAX_INT32) throw new RangeError('cursor must be an int32 cursorId')
  return Number(cursor)
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(Math.ceil(seconds * 1000), MAX_RETRY_AFTER_MS)
}

export interface ScbClientConfig {
  source: ScbSource
  /** Näringsgren as dotted or digit-only SNI; sent as digits. */
  sni: string
  /** Origin of the SCB AFR API, e.g. from `SCB_API_BASE_URL`. Must be https. */
  baseUrl: string
  /** Path version segment `v{v}`; the spec's current version is "1". */
  version?: string
  /** Defaults to `requireScbApiKey()`. */
  apiKey?: string
  /** Injected in tests. Without it, the live gate must be open. */
  fetchImpl?: typeof fetch
}

export const SCB_LIVE_HOST = 'apiafr.scb.se'

/**
 * The real client sends the server-only X-API-Key, so a config mistake must not be able to
 * point it at another host. Only the bare origin https://apiafr.scb.se is accepted.
 */
export function assertScbLiveBaseUrl(baseUrl: string): void {
  let u: URL
  try {
    u = new URL(baseUrl)
  } catch {
    throw new RangeError('baseUrl must be an absolute URL')
  }
  if (
    u.protocol !== 'https:' || u.hostname !== SCB_LIVE_HOST || u.port !== '' ||
    u.username !== '' || u.password !== '' || u.pathname !== '/' ||
    u.search !== '' || u.hash !== '' || /[?#]/.test(baseUrl)
  ) {
    throw new RangeError(`baseUrl must be exactly https://${SCB_LIVE_HOST}`)
  }
}

export function createScbPageFetcher(config: ScbClientConfig): ScbPageFetcher {
  if (!config.fetchImpl && !SCB_LIVE_SEARCH_APPROVED) throw new ScbLiveSearchDisabledError()
  if (!config.fetchImpl) assertScbLiveBaseUrl(config.baseUrl)
  const apiKey = config.apiKey === undefined ? requireScbApiKey() : config.apiKey.trim()
  if (!apiKey) throw new ScbKeyMissingError()
  const code = sniToScbCode(config.sni)
  if (!code) throw new RangeError('sni must be 2–5 digits')
  const version = config.version ?? '1'
  if (!/^\d+$/.test(version)) throw new RangeError('version must be numeric')
  let origin: URL
  try {
    origin = new URL(config.baseUrl)
  } catch {
    throw new RangeError('baseUrl must be an absolute URL')
  }
  if (origin.protocol !== 'https:') throw new RangeError('baseUrl must be https')
  const doFetch = config.fetchImpl ?? fetch

  return async ({ cursor, pageSize }) => {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > SCB_LIMITS.maxPageSize) {
      throw new RangeError(`pageSize must be an integer 1–${SCB_LIMITS.maxPageSize}`)
    }
    const cursorId = parseCursor(cursor)
    const url = new URL(`/v${version}/${config.source}/naringsgren/${code}`, origin)
    url.searchParams.set('limit', String(pageSize))
    if (cursorId !== null) url.searchParams.set('cursorId', String(cursorId))

    let res: Response
    try {
      res = await doFetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new ScbNetworkError()
    }
    if (!res.ok) throw new ScbHttpError(res.status, retryAfterMs(res.headers.get('retry-after')))

    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new ScbContractError('body is not valid JSON')
    }
    return parseScbPage(config.source, body, cursorId)
  }
}
