import { createHash } from 'node:crypto'

/**
 * Identity helpers. Pure, no I/O.
 *
 * Swedish organisation numbers are 10 digits with a Luhn check digit. SCB and
 * other registers sometimes prefix legal entities with "16" (12 digits). A
 * sole proprietor's orgnr is the owner's personnummer, so those are treated as
 * PERSON DATA: never stored or shown raw, only as a hash + masked form.
 */

export function normalizeOrgnr(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(digits)) return null
  if (digits.length === 12 && digits.startsWith('16')) digits = digits.slice(2)
  if (digits.length !== 10) return null
  return luhnValid(digits) ? digits : null
}

export function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[i])
    if (i % 2 === 0) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/**
 * Personnummer shape: 3rd–4th digit is a month (01–12) and 5th–6th a day
 * (01–31). Legal entities have a third digit >= 2 by SCB convention, so this
 * cannot match an AB.
 */
export function looksLikePersonnummer(orgnr: string): boolean {
  const month = Number(orgnr.slice(2, 4))
  const day = Number(orgnr.slice(4, 6))
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

export function hashIdentity(value: string, salt = 'hb-leadfinder-v1'): string {
  return createHash('sha256').update(`${salt}:${value}`).digest('hex')
}

export function maskOrgnr(orgnr: string): string {
  return `${orgnr.slice(0, 2)}****${orgnr.slice(-2)}`
}

const LEGAL_SUFFIX = /\b(aktiebolag|ab|hb|kb|handelsbolag|kommanditbolag|ekonomisk forening|ek for|enskild firma)\b/g

/** Lower-cased, diacritics (except å/ä/ö folded to a/a/o) and legal suffixes stripped. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' och ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
}
