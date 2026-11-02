import { luhnValid } from './identity'
import type { ScbRegisterRecord } from './types'

/** Synthetic data only. No real companies, numbers or people. */
export function withCheckDigit(base9: string): string {
  for (let d = 0; d <= 9; d++) if (luhnValid(base9 + d)) return base9 + d
  throw new Error('unreachable')
}

export const ORG = {
  alpha: withCheckDigit('556000001'),
  beta: withCheckDigit('556000002'),
  gamma: withCheckDigit('556000003'),
  declined: withCheckDigit('556000004'),
  pilot: withCheckDigit('556000005'),
  suppressed: withCheckDigit('556000006'),
  wholesaleOutside: withCheckDigit('556000007'),
  inactive: withCheckDigit('556000008'),
  wrongSegment: withCheckDigit('556000009'),
  sole: withCheckDigit('850101123'),
}

const base = { sniCodes: ['47.811'], countyCode: '12', active: true }

export const FIXTURE_RECORDS: ScbRegisterRecord[] = [
  { ...base, orgnr: ORG.alpha, name: 'Testbil Alfa AB', cfar: '1001', legalForm: 'Aktiebolag', city: 'Malmö' },
  // Second workplace of the same legal entity — must fold into one candidate.
  { ...base, orgnr: ORG.alpha, name: 'Testbil Alfa AB', cfar: '1002', legalForm: 'Aktiebolag', city: 'Lund' },
  // Exact repeat of a workplace (pagination overlap) — must be skipped.
  { ...base, orgnr: ORG.alpha, name: 'Testbil Alfa AB', cfar: '1002', legalForm: 'Aktiebolag', city: 'Lund' },
  { ...base, orgnr: ORG.beta, name: 'Bilhuset Beta Aktiebolag', cfar: '2001', legalForm: 'Aktiebolag', city: 'Helsingborg' },
  { ...base, orgnr: ORG.gamma, name: 'Gamma Bil & Motor HB', cfar: '3001', legalForm: 'Handelsbolag', city: 'Ystad' },
  { ...base, orgnr: ORG.declined, name: 'Delta Bilar AB', cfar: '4001', legalForm: 'Aktiebolag' },
  { ...base, orgnr: ORG.pilot, name: 'Epsilon Bil AB', cfar: '5001', legalForm: 'Aktiebolag' },
  { ...base, orgnr: ORG.suppressed, name: 'Zeta Fordon AB', cfar: '6001', legalForm: 'Aktiebolag' },
  { ...base, orgnr: ORG.wholesaleOutside, name: 'Eta Partihandel AB', cfar: '7001', sniCodes: ['46.711'], countyCode: '01' },
  { ...base, orgnr: ORG.inactive, name: 'Theta Bil AB', cfar: '8001', active: false },
  { ...base, orgnr: ORG.wrongSegment, name: 'Iota Frisör AB', cfar: '9001', sniCodes: ['96.021'] },
  { ...base, orgnr: ORG.sole, name: 'Kalle Testsson', cfar: '9101', legalForm: 'Enskild firma' },
  { ...base, orgnr: '123', name: 'Ogiltig AB' },
]
