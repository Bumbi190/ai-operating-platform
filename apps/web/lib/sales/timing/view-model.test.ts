import {it,expect} from 'vitest'
import {timingBlockerLabel,formatTimingInstant} from './view-model'
it('unknown blocker remains a review requirement',()=>expect(timingBlockerLabel('FUTURE_BLOCKER')).toBe('Underlaget behöver granskas'))
it('suppression explains why contact cannot proceed',()=>expect(timingBlockerLabel('CONTACT_SUPPRESSED')).toBe('Kontaktspärr'))
it('formats summer and winter offsets without changing source time',()=>{
 expect(formatTimingInstant('2026-10-19T06:00:00Z')).toContain('08:00')
 expect(formatTimingInstant('2026-10-19T06:00:00Z')).toContain('UTC+02:00')
 expect(formatTimingInstant('2026-11-19T06:00:00Z')).toContain('UTC+01:00')
})
it('invalid source time is visibly unknown',()=>expect(formatTimingInstant('invalid')).toBe('Okänt'))
