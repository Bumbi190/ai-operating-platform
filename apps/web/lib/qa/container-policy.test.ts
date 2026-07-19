/**
 * Containerbeslut — ren beslutslogik, incident 2026-07-19.
 *
 * Den här matrisen är den enskilt farligaste logiken i publiceringsflödet:
 * fel beslut ger antingen en evigt förgiftad container (incidentens grundorsak)
 * eller dubbelpublicering. Därför testas den isolerat, utan mockar.
 */
import { describe, it, expect } from 'vitest'
import {
  decideContainerAction,
  containerAgeHours,
  CONTAINER_MAX_AGE_H,
} from '@/lib/media/container-policy'

describe('decideContainerAction', () => {
  it('färsk FINISHED/IN_PROGRESS → återanvänds', () => {
    expect(decideContainerAction('FINISHED', 1)).toEqual({ action: 'reuse' })
    expect(decideContainerAction('IN_PROGRESS', 19.9)).toEqual({ action: 'reuse' })
  })

  it('EXPIRED / ERROR / NOT_FOUND / UNKNOWN → ny container', () => {
    for (const s of ['EXPIRED', 'ERROR', 'NOT_FOUND', 'UNKNOWN'] as const) {
      expect(decideContainerAction(s, 1).action, s).toBe('recreate')
    }
  })

  it('för gammal men publicerbar status → ny container', () => {
    expect(decideContainerAction('FINISHED', CONTAINER_MAX_AGE_H).action).toBe('recreate')
    expect(decideContainerAction('FINISHED', 24.3).action).toBe('recreate')      // incidentens läge
    expect(decideContainerAction('IN_PROGRESS', Infinity).action).toBe('recreate')
  })

  it('PUBLISHED → ALLTID recover, aldrig recreate — oavsett ålder', () => {
    // Detta är skyddet mot dubbelpublicering. Om ålderskontrollen hade körts
    // före statuskontrollen skulle en gammal, redan publicerad container ha
    // gett en ny container och en andra publicering av samma video.
    expect(decideContainerAction('PUBLISHED', 1).action).toBe('recover')
    expect(decideContainerAction('PUBLISHED', 999).action).toBe('recover')
    expect(decideContainerAction('PUBLISHED', Infinity).action).toBe('recover')
  })

  it('varje recreate/recover bär en läsbar orsak', () => {
    const d = decideContainerAction('EXPIRED', 1)
    expect(d.action === 'recreate' && d.reason.length).toBeGreaterThan(0)
  })
})

describe('containerAgeHours', () => {
  const now = new Date('2026-07-19T18:00:00Z').getTime()

  it('räknar ut ålder i timmar', () => {
    expect(containerAgeHours('2026-07-19T16:00:00Z', now)).toBeCloseTo(2, 5)
    // Containern i incidenten: skapad 2026-07-18 17:45, använd 2026-07-19 18:00
    expect(containerAgeHours('2026-07-18T17:45:00Z', now)).toBeCloseTo(24.25, 2)
  })

  it('saknad eller ogiltig tidsstämpel → Infinity (behandlas som för gammal)', () => {
    expect(containerAgeHours(null, now)).toBe(Infinity)
    expect(containerAgeHours(undefined, now)).toBe(Infinity)
    expect(containerAgeHours('inte ett datum', now)).toBe(Infinity)
  })
})
