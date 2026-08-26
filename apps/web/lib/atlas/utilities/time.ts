/**
 * lib/atlas/utilities/time.ts — what time it actually is.
 *
 * Atlas could not answer "vad är klockan i USA?" and the reason was not routing.
 * The only timestamp anywhere in its prompt was `new Date().toLocaleString('sv-SE')`
 * — a bare wall clock with no zone attached. No TZ is configured anywhere in the
 * repository, so on Vercel that string is UTC wearing Swedish formatting: about
 * two hours wrong for Stockholm, and silently so. Atlas was left choosing between
 * reading a mislabelled number and guessing from training data. Both are wrong.
 *
 * So every value this module produces carries its IANA zone, and every offset is
 * derived from `Intl` at the given instant rather than stored. That is what makes
 * DST correct without anyone maintaining a table: Europe/Stockholm is +01:00 in
 * January and +02:00 in July because the platform says so, not because we wrote
 * it down.
 *
 * PURE AND OFFLINE. The instant is always passed in, never read from the clock
 * here, which is what lets tests freeze time instead of asserting against the
 * real current second. No network, no time API, no model involvement in the
 * actual number.
 */

/** Where the operator is. The default when no location is named. */
export const ATLAS_HOME_TIMEZONE = 'Europe/Stockholm'

export interface ZoneTime {
  /** IANA zone the value was rendered in. Always present, never implied. */
  timeZone: string
  /** What to call it out loud — "Stockholm", "Eastern". */
  label: string
  /** HH:MM, 24-hour. */
  time: string
  /** YYYY-MM-DD in that zone, which is not always the same calendar day. */
  date: string
  /** Swedish weekday, in that zone. */
  weekday: string
  /** Derived from Intl at this instant — so DST is handled, not assumed. */
  utcOffset: string
}

export type TimeLookup =
  | { status: 'ok'; zones: ZoneTime[]; utc: string }
  | { status: 'unknown_location'; requested: string; supported: string[] }
  | { status: 'invalid_timezone'; requested: string }

export interface TimeQuery {
  /** A place or country in the operator's words. */
  location?: string | null
  /** An exact IANA zone. Wins over `location` when both are given. */
  timezone?: string | null
}

/**
 * The four continental US zones.
 *
 * Alaska and Hawaii are deliberately absent. Atlas speaks these answers aloud,
 * and four zones is already a long sentence; six makes it a recital for two
 * zones that between them hold about 0.5% of the population. Both remain
 * reachable by name — "vad är klockan i Honolulu" resolves through the city
 * map — so nothing is lost except noise in the common case.
 */
const US_ZONES: ReadonlyArray<{ timeZone: string; label: string }> = [
  { timeZone: 'America/New_York',    label: 'Eastern' },
  { timeZone: 'America/Chicago',     label: 'Central' },
  { timeZone: 'America/Denver',      label: 'Mountain' },
  { timeZone: 'America/Los_Angeles', label: 'Pacific' },
]

/**
 * A deliberately small, high-confidence map.
 *
 * This is not a gazetteer and must not grow into one. Every entry here is a
 * place the operator plausibly asks about, with exactly one defensible zone.
 * Anything absent degrades to `unknown_location` — Atlas saying it does not
 * know which zone is meant beats Atlas inventing one.
 */
const CITY_ZONES: ReadonlyArray<{ match: readonly string[]; timeZone: string; label: string }> = [
  { match: ['sverige', 'sweden', 'stockholm', 'göteborg', 'malmö'], timeZone: 'Europe/Stockholm', label: 'Stockholm' },
  { match: ['new york', 'nyc', 'newyork'],                          timeZone: 'America/New_York', label: 'New York' },
  { match: ['los angeles', 'la', 'san francisco', 'kalifornien', 'california'], timeZone: 'America/Los_Angeles', label: 'Los Angeles' },
  { match: ['chicago'],                                             timeZone: 'America/Chicago', label: 'Chicago' },
  { match: ['denver'],                                              timeZone: 'America/Denver', label: 'Denver' },
  { match: ['honolulu', 'hawaii'],                                  timeZone: 'Pacific/Honolulu', label: 'Honolulu' },
  { match: ['anchorage', 'alaska'],                                 timeZone: 'America/Anchorage', label: 'Anchorage' },
  { match: ['london', 'storbritannien', 'england', 'uk'],           timeZone: 'Europe/London', label: 'London' },
  { match: ['paris', 'frankrike', 'france'],                        timeZone: 'Europe/Paris', label: 'Paris' },
  { match: ['berlin', 'tyskland', 'germany'],                       timeZone: 'Europe/Berlin', label: 'Berlin' },
  { match: ['oslo', 'norge', 'norway'],                             timeZone: 'Europe/Oslo', label: 'Oslo' },
  { match: ['köpenhamn', 'copenhagen', 'danmark', 'denmark'],       timeZone: 'Europe/Copenhagen', label: 'Köpenhamn' },
  { match: ['helsingfors', 'helsinki', 'finland'],                  timeZone: 'Europe/Helsinki', label: 'Helsingfors' },
  { match: ['tokyo', 'japan'],                                      timeZone: 'Asia/Tokyo', label: 'Tokyo' },
  { match: ['sydney', 'australien', 'australia'],                   timeZone: 'Australia/Sydney', label: 'Sydney' },
  { match: ['indien', 'india', 'mumbai', 'delhi'],                  timeZone: 'Asia/Kolkata', label: 'Indien' },
]

/** Phrases that mean "the United States" rather than one American city. */
const US_COUNTRY_TERMS = ['usa', 'u.s.a', 'u.s.', 'united states', 'amerika', 'america', 'staterna'] as const

/** True only when the platform recognises the zone. Cheap, and the only check needed. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function offsetFor(instant: Date, timeZone: string): string {
  // `longOffset` yields "GMT+02:00" — the platform's answer for THIS instant,
  // which is exactly what makes DST a non-issue.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(instant)
  const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  return raw.replace('GMT', '') || '+00:00'
}

/** Render one instant in one zone. Pure: same inputs, same output, forever. */
export function formatZoneTime(instant: Date, timeZone: string, label?: string): ZoneTime {
  const time = new Intl.DateTimeFormat('sv-SE', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(instant)
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant)
  const weekday = new Intl.DateTimeFormat('sv-SE', { timeZone, weekday: 'long' }).format(instant)

  return { timeZone, label: label ?? timeZone, time, date, weekday, utcOffset: offsetFor(instant, timeZone) }
}

/** Normalise operator phrasing enough to match, without pretending to parse language. */
function normalise(value: string): string {
  return value.toLowerCase().trim().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim()
}

function looksLikeUnitedStates(query: string): boolean {
  const q = normalise(query)
  return US_COUNTRY_TERMS.some(term => q === term || q.includes(term))
}

function cityZoneFor(query: string): { timeZone: string; label: string } | null {
  const q = normalise(query)
  for (const entry of CITY_ZONES) {
    // Longest match first inside each entry so "new york" beats a stray "york".
    for (const m of [...entry.match].sort((a, b) => b.length - a.length)) {
      if (q === m || q.includes(m)) return { timeZone: entry.timeZone, label: entry.label }
    }
  }
  return null
}

/** Every location string the map currently answers for, for a safe failure message. */
export function supportedLocations(): string[] {
  return [...new Set([...CITY_ZONES.map(e => e.label), 'USA'])].sort()
}

/**
 * The one entry point. `now` is required so time is an input, not a hidden
 * dependency — tests freeze it, the route passes the real instant.
 */
export function currentTimeFor(query: TimeQuery, now: Date): TimeLookup {
  const utc = now.toISOString()

  // An explicit zone is the operator being precise; honour it over any guessing.
  const tz = query.timezone?.trim()
  if (tz) {
    if (!isValidTimeZone(tz)) return { status: 'invalid_timezone', requested: tz }
    return { status: 'ok', zones: [formatZoneTime(now, tz)], utc }
  }

  const location = query.location?.trim()
  if (!location) {
    return { status: 'ok', zones: [formatZoneTime(now, ATLAS_HOME_TIMEZONE, 'Stockholm')], utc }
  }

  // Country before city: "USA" is not a place with a clock.
  if (looksLikeUnitedStates(location)) {
    return { status: 'ok', zones: US_ZONES.map(z => formatZoneTime(now, z.timeZone, z.label)), utc }
  }

  const city = cityZoneFor(location)
  if (city) return { status: 'ok', zones: [formatZoneTime(now, city.timeZone, city.label)], utc }

  // Refusing beats inventing a timezone.
  return { status: 'unknown_location', requested: location, supported: supportedLocations() }
}

/**
 * The line Atlas carries in its prompt.
 *
 * Both halves matter: the operator's local time is what a question about "nu"
 * means, and the UTC instant is what makes the value checkable rather than
 * another unlabelled wall clock.
 */
export function renderCurrentInstant(now: Date): string {
  const home = formatZoneTime(now, ATLAS_HOME_TIMEZONE, 'Stockholm')
  return `\n\n[NU — ${home.weekday} ${home.date} ${home.time} ${ATLAS_HOME_TIMEZONE} (UTC${home.utcOffset}) · instant ${now.toISOString()}]`
}
