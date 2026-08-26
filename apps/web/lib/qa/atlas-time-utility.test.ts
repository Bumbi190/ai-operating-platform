/**
 * Atlas time foundation.
 *
 * Atlas could not answer "vad är klockan i USA?", and the cause was not routing:
 * the only timestamp in its prompt was an unlabelled wall clock rendered in the
 * server's timezone. It had nothing true to read, so it either guessed from
 * training data or misread UTC as Swedish time.
 *
 * These tests pin the properties that make an answer trustworthy: every value
 * carries its zone, every offset comes from `Intl` at the given instant rather
 * than from a table, an unknown place refuses instead of inventing, and the
 * instant is an argument so the assertions are exact rather than approximate.
 *
 * Deterministic and offline: no clock is read here, no network is touched.
 */

import { describe, expect, it } from 'vitest'
import {
  ATLAS_HOME_TIMEZONE,
  currentTimeFor,
  formatZoneTime,
  isValidTimeZone,
  renderCurrentInstant,
  supportedLocations,
} from '@/lib/atlas/utilities/time'

// 2026-08-26T12:34:56Z — summer, so northern-hemisphere DST is in force.
const SUMMER = new Date('2026-08-26T12:34:56.000Z')
// 2026-01-15T12:34:56Z — winter, so it is not.
const WINTER = new Date('2026-01-15T12:34:56.000Z')

describe('Atlas time · zones are named, never implied', () => {
  it('resolves Sweden through Europe/Stockholm', () => {
    const r = currentTimeFor({ location: 'Sverige' }, SUMMER)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.zones).toHaveLength(1)
    expect(r.zones[0].timeZone).toBe('Europe/Stockholm')
    expect(r.zones[0].time).toBe('14:34')      // 12:34Z + 2h CEST
    expect(r.zones[0].date).toBe('2026-08-26')
  })

  it('resolves New York through America/New_York', () => {
    const r = currentTimeFor({ location: 'New York' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones[0].timeZone).toBe('America/New_York')
    expect(r.zones[0].time).toBe('08:34')      // 12:34Z − 4h EDT
  })

  it('resolves Los Angeles through America/Los_Angeles', () => {
    const r = currentTimeFor({ location: 'Los Angeles' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones[0].timeZone).toBe('America/Los_Angeles')
    expect(r.zones[0].time).toBe('05:34')      // 12:34Z − 7h PDT
  })

  it('defaults to the operator own zone when no location is given', () => {
    const r = currentTimeFor({}, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones[0].timeZone).toBe(ATLAS_HOME_TIMEZONE)
  })

  it('lets an explicit IANA zone win over a location', () => {
    const r = currentTimeFor({ location: 'Sverige', timezone: 'Asia/Tokyo' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones[0].timeZone).toBe('Asia/Tokyo')
    expect(r.zones[0].time).toBe('21:34')      // 12:34Z + 9h, no DST in Japan
  })
})

describe('Atlas time · the United States is not one clock', () => {
  it('returns the four continental zones', () => {
    const r = currentTimeFor({ location: 'USA' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones.map(z => z.timeZone)).toEqual([
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    ])
    expect(r.zones.map(z => z.label)).toEqual(['Eastern', 'Central', 'Mountain', 'Pacific'])
  })

  it('gives each zone its own real time rather than one offset applied four ways', () => {
    const r = currentTimeFor({ location: 'Vad är klockan i USA' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones.map(z => z.time)).toEqual(['08:34', '07:34', '06:34', '05:34'])
  })

  it('recognises the country however the operator says it', () => {
    for (const phrase of ['USA', 'usa', 'i USA?', 'United States', 'Amerika']) {
      const r = currentTimeFor({ location: phrase }, SUMMER)
      if (r.status !== 'ok') throw new Error(`expected ok for ${phrase}`)
      expect(r.zones).toHaveLength(4)
    }
  })

  it('still answers a single US city by name', () => {
    // Alaska and Hawaii are left out of the country answer, not out of the map.
    const r = currentTimeFor({ location: 'Honolulu' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones).toHaveLength(1)
    expect(r.zones[0].timeZone).toBe('Pacific/Honolulu')
  })
})

describe('Atlas time · DST comes from Intl, not from a table', () => {
  it('moves Stockholm between +02:00 and +01:00 with the season', () => {
    expect(formatZoneTime(SUMMER, 'Europe/Stockholm').utcOffset).toBe('+02:00')
    expect(formatZoneTime(WINTER, 'Europe/Stockholm').utcOffset).toBe('+01:00')
  })

  it('moves New York between -04:00 and -05:00 with the season', () => {
    expect(formatZoneTime(SUMMER, 'America/New_York').utcOffset).toBe('-04:00')
    expect(formatZoneTime(WINTER, 'America/New_York').utcOffset).toBe('-05:00')
  })

  it('leaves a zone without DST alone', () => {
    expect(formatZoneTime(SUMMER, 'Asia/Tokyo').utcOffset).toBe('+09:00')
    expect(formatZoneTime(WINTER, 'Asia/Tokyo').utcOffset).toBe('+09:00')
  })

  it('gives US zones their winter offsets too', () => {
    const r = currentTimeFor({ location: 'USA' }, WINTER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones.map(z => z.utcOffset)).toEqual(['-05:00', '-06:00', '-07:00', '-08:00'])
  })
})

describe('Atlas time · the date comes from the same instant', () => {
  it('reports the date in the requested zone', () => {
    const r = currentTimeFor({ location: 'Sverige' }, SUMMER)
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.zones[0].date).toBe('2026-08-26')
    expect(r.zones[0].weekday).toBe('onsdag')
  })

  it('crosses the date line correctly rather than assuming one calendar day', () => {
    // 23:30Z is already tomorrow in Tokyo and still today in Los Angeles.
    const lateEvening = new Date('2026-08-26T23:30:00.000Z')
    expect(formatZoneTime(lateEvening, 'Asia/Tokyo').date).toBe('2026-08-27')
    expect(formatZoneTime(lateEvening, 'America/Los_Angeles').date).toBe('2026-08-26')
  })
})

describe('Atlas time · refuses rather than invents', () => {
  it('reports an unknown location instead of guessing a zone', () => {
    const r = currentTimeFor({ location: 'Ankeborg' }, SUMMER)
    expect(r.status).toBe('unknown_location')
    if (r.status !== 'unknown_location') return
    expect(r.requested).toBe('Ankeborg')
    expect(r.supported.length).toBeGreaterThan(0)
  })

  it('reports a malformed IANA zone instead of falling back silently', () => {
    const r = currentTimeFor({ timezone: 'Mars/Olympus_Mons' }, SUMMER)
    expect(r.status).toBe('invalid_timezone')
    if (r.status !== 'invalid_timezone') return
    expect(r.requested).toBe('Mars/Olympus_Mons')
  })

  it('validates zones through the platform', () => {
    expect(isValidTimeZone('Europe/Stockholm')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })

  it('names what it does support so the refusal is useful', () => {
    expect(supportedLocations()).toContain('USA')
    expect(supportedLocations()).toContain('Stockholm')
  })
})

describe('Atlas time · the prompt instant is unambiguous', () => {
  it('carries the zone, the offset and the raw instant', () => {
    const block = renderCurrentInstant(SUMMER)
    expect(block).toContain('Europe/Stockholm')
    expect(block).toContain('14:34')
    expect(block).toContain('2026-08-26')
    expect(block).toContain('UTC+02:00')
    expect(block).toContain('2026-08-26T12:34:56.000Z')
  })

  it('is a pure function of the instant', () => {
    expect(renderCurrentInstant(SUMMER)).toBe(renderCurrentInstant(SUMMER))
    expect(renderCurrentInstant(SUMMER)).not.toBe(renderCurrentInstant(WINTER))
  })
})

describe('Atlas time · stays offline and side-effect free', () => {
  it('never reaches the network', () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => { throw new Error('time utility must not use the network') }) as typeof fetch
    try {
      expect(currentTimeFor({ location: 'USA' }, SUMMER).status).toBe('ok')
      expect(renderCurrentInstant(SUMMER)).toContain('Europe/Stockholm')
    } finally {
      globalThis.fetch = original
    }
  })

  it('does not read the ambient clock', () => {
    // Same frozen instant twice, with real time passing in between.
    const a = currentTimeFor({ location: 'Sverige' }, SUMMER)
    const b = currentTimeFor({ location: 'Sverige' }, SUMMER)
    expect(a).toEqual(b)
  })
})
