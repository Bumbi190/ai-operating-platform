import { describe, expect, it } from 'vitest'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import {
  assessMarketingCode, buildCodebook, classifyFtgStat, classifyLegalForm, evaluateScbCompany, parseLegalOrgnr, SCB_STATUS_POLICY_SOURCES,
  ScbCodebookError, type Codebooks,
} from '@/lib/handlarborsen/lead-finder/scb-status-policy'

const ORG = withCheckDigit('556700001')
const PERSON = withCheckDigit('810101123') // 3rd digit 0 -> personnummer shape
const LABELS = [
  { kod: 0, klartext: 'Ingen spärr' },
  { kod: 1, klartext: 'Spärr mot reklam' },
  { kod: 2, klartext: 'Särskild markering' },
  { kod: 3, klartext: 'Nej tack till reklam' },
]
const books = (): Codebooks => ({
  ftgStat: buildCodebook('ftgStat', [{ kod: '1', klartext: 'Aktiv' }, { kod: '0', klartext: 'Aldrig aktiv' }, { kod: '9', klartext: 'Inaktiv' }]),
  jurform: buildCodebook('jurform', [{ kod: '49', klartext: 'Aktiebolag' }, { kod: '31', klartext: 'Handelsbolag' }]),
  reklamSparrTyp: buildCodebook('reklamSparrTyp', LABELS),
  epostSparrTyp: buildCodebook('epostSparrTyp', LABELS),
  telefonSparrTyp: buildCodebook('telefonSparrTyp', LABELS),
})
const je = (extra: Record<string, unknown> = {}) => ({
  peOrgNr: ORG, orgNr: ORG, namn: 'Syntetisk Bil AB', ftgStat: '1', jurform: '49', reklamSparrTyp: 0, telefonSparrTyp: 0, epostSparrTyp: 0, ...extra,
})
// null = "no code tables fetched" (undefined would trigger the default parameter).
const run = (extra: Record<string, unknown> = {}, codebooks: Codebooks | null = books()) =>
  evaluateScbCompany({ expectedOrgnr: ORG, expectedLegalName: 'Syntetisk Bil AB', je: je(extra), codebooks: codebooks ?? undefined })

describe('scb-status-policy: ftgStat', () => {
  it('maps documented codes conservatively', () => {
    expect(classifyFtgStat('1').class).toBe('ACTIVE_PER_SCB')
    expect(classifyFtgStat('0').class).toBe('NOT_ACTIVE_PER_SCB')
    expect(classifyFtgStat('9').class).toBe('NOT_ACTIVE_PER_SCB')
  })
  it('unknown, numeric or missing is UNKNOWN_NEEDS_REVIEW', () => {
    for (const v of ['2', 'X', '', undefined, null, 1, {}]) expect(classifyFtgStat(v).class).toBe('UNKNOWN_NEEDS_REVIEW')
  })
  it('active-per-SCB still needs a review warning and is never contactable', () => {
    const r = run()
    expect(r.ok && r.status.class).toBe('ACTIVE_PER_SCB')
    expect(r.ok && r.warnings).toContain('ACTIVE_PER_SCB_IS_NOT_PROOF_OF_DEALER_OR_PERMISSION')
  })
})

describe('scb-status-policy: jurform', () => {
  it('maps only documented codes', () => {
    expect(classifyLegalForm('49').class).toBe('AB')
    expect(classifyLegalForm('31').class).toBe('HB_KB')
    expect(classifyLegalForm('96').class).toBe('FOREIGN_LEGAL_ENTITY')
    expect(classifyLegalForm('99').class).toBe('UNRESOLVED')
  })
  it('flags other codes and never labels them sole proprietor', () => {
    const f = classifyLegalForm('10')
    expect(f.class).toBe('OTHER_NEEDS_REVIEW')
    expect(f.label).toBeNull()
    expect(JSON.stringify(classifyLegalForm('10')).toLowerCase()).not.toMatch(/enskild|sole/)
    expect(classifyLegalForm(undefined).class).toBe('MISSING_NEEDS_REVIEW')
  })
  it('takes labels from a verified codebook when present', () => {
    expect(classifyLegalForm('10', buildCodebook('jurform', [{ kod: '10', klartext: 'Testform' }])).label).toBe('Testform')
  })
  it('review flags for 96, 99 and unknown forms', () => {
    for (const j of ['96', '99', undefined]) {
      const r = run({ jurform: j })
      expect(r.ok && r.needsReview).toBe(true)
      expect(r.ok && r.warnings.some((w) => w.startsWith('LEGAL_FORM_'))).toBe(true)
    }
  })
})

describe('scb-status-policy: codebooks', () => {
  it('requires exact {kod,klartext} rows with the right code type', () => {
    expect(() => buildCodebook('epostSparrTyp', [{ kod: '1', klartext: 'x' }])).toThrow(ScbCodebookError)
    expect(() => buildCodebook('ftgStat', [{ kod: 1, klartext: 'x' }])).toThrow(ScbCodebookError)
    expect(() => buildCodebook('ftgStat', [{ kod: '1', klartext: 'x', extra: 1 }])).toThrow(ScbCodebookError)
    expect(() => buildCodebook('ftgStat', [{ kod: '1' }])).toThrow(ScbCodebookError)
    expect(() => buildCodebook('ftgStat', [])).toThrow(ScbCodebookError)
    expect(() => buildCodebook('ftgStat', {})).toThrow(ScbCodebookError)
    expect(() => buildCodebook('reklamSparrTyp', [{ kod: 1, klartext: 'a' }, { kod: 1, klartext: 'b' }])).toThrow(ScbCodebookError)
    expect(() => buildCodebook('reklamSparrTyp', [{ kod: 1.5, klartext: 'a' }])).toThrow(ScbCodebookError)
  })
  it('sanitizes labels', () => {
    expect(buildCodebook('epostSparrTyp', [{ kod: 4, klartext: ' a\u0000b\n c ' }]).get('4')).toBe('a b c')
  })
})

describe('scb-status-policy: per-channel marketing codes', () => {
  it('uses each channel\'s own table (same code, different meaning)', () => {
    const codebooks: Codebooks = {
      reklamSparrTyp: buildCodebook('reklamSparrTyp', [{ kod: 1, klartext: 'Spärr mot reklam' }]),
      epostSparrTyp: buildCodebook('epostSparrTyp', [{ kod: 1, klartext: 'Okänd typ A' }]),
      telefonSparrTyp: buildCodebook('telefonSparrTyp', [{ kod: 1, klartext: 'Ingen spärr' }]),
    }
    const r = run({ reklamSparrTyp: 1, epostSparrTyp: 1, telefonSparrTyp: 1 }, codebooks)
    expect(r.ok && r.marketing.post.signal).toBe('OBJECTION_SIGNAL')
    expect(r.ok && r.marketing.email.signal).toBe('UNKNOWN')
    expect(r.ok && r.marketing.phone.signal).toBe('NO_OBJECTION_SIGNAL_NOT_PERMISSION')
    expect(r.ok && r.marketing.post.label).toBe('Spärr mot reklam')
  })
  it('does not apply the combined Reklam semantics (11/12/13, 21/22/23) without a table', () => {
    for (const c of [11, 12, 13, 21, 22, 23]) {
      const a = assessMarketingCode('post', c, undefined)
      expect(a.signal).toBe('CODEBOOK_NOT_VERIFIED')
      expect(a.label).toBeNull()
      expect(a.code).toBe(c)
    }
  })
  it('code missing from the table is UNKNOWN, never clear', () => {
    expect(assessMarketingCode('email', 77, buildCodebook('epostSparrTyp', LABELS)).signal).toBe('UNKNOWN')
  })
  it('missing and malformed fields are MISSING / UNKNOWN', () => {
    expect(assessMarketingCode('phone', undefined, undefined).signal).toBe('MISSING')
    expect(assessMarketingCode('phone', null, undefined).signal).toBe('MISSING')
    for (const v of ['1', 1.2, -1, 1000, {}, NaN]) expect(assessMarketingCode('phone', v, undefined).signal).toBe('UNKNOWN')
  })
  it('objection labels (incl. negations) warn; ambiguous labels are UNKNOWN', () => {
    const b = buildCodebook('reklamSparrTyp', [
      { kod: 1, klartext: 'Spärr mot direktreklam' }, { kod: 2, klartext: 'Ej reklam' }, { kod: 3, klartext: 'Avstår' }, { kod: 4, klartext: 'Särskild markering' },
    ])
    expect(assessMarketingCode('post', 1, b).signal).toBe('OBJECTION_SIGNAL')
    expect(assessMarketingCode('post', 2, b).signal).toBe('OBJECTION_SIGNAL')
    expect(assessMarketingCode('post', 3, b).signal).toBe('OBJECTION_SIGNAL')
    expect(assessMarketingCode('post', 4, b).signal).toBe('UNKNOWN')
  })
  it('an objection produces a channel warning', () => {
    const r = run({ reklamSparrTyp: 1, epostSparrTyp: 3, telefonSparrTyp: 0 })
    expect(r.ok && r.warnings).toEqual(expect.arrayContaining(['MARKETING_OBJECTION_POST', 'MARKETING_OBJECTION_EMAIL']))
    expect(r.ok && r.warnings).not.toContain('MARKETING_OBJECTION_PHONE')
  })
  it('flags every channel as not verified when code tables are absent', () => {
    const r = run({}, null)
    expect(r.ok && r.warnings).toEqual(expect.arrayContaining(['MARKETING_CODEBOOK_NOT_VERIFIED_POST', 'MARKETING_CODEBOOK_NOT_VERIFIED_EMAIL', 'MARKETING_CODEBOOK_NOT_VERIFIED_PHONE']))
    expect(r.ok && r.needsReview).toBe(true)
  })
  it('classifies the authenticated 2026-10-27 SCB channel codebooks correctly', () => {
    const codebooks: Codebooks = {
      reklamSparrTyp: buildCodebook('reklamSparrTyp', [
        { kod: 1, klartext: 'Tar emot reklam' }, { kod: 2, klartext: 'Har frånsagt sig reklam' },
      ]),
      epostSparrTyp: buildCodebook('epostSparrTyp', [
        { kod: 1, klartext: 'Ej epostspärrat' }, { kod: 2, klartext: 'Epostspärrat' },
      ]),
      telefonSparrTyp: buildCodebook('telefonSparrTyp', [
        { kod: 1, klartext: 'Ej telefonnummerspärrat' }, { kod: 2, klartext: 'Telefonnummerspärr telemarketing' }, { kod: 3, klartext: 'Nix-telefon' },
      ]),
    }
    for (const channel of ['post','email','phone'] as const) {
      const book=codebooks[channel==='post'?'reklamSparrTyp':channel==='email'?'epostSparrTyp':'telefonSparrTyp']
      expect(assessMarketingCode(channel,1,book).signal).toBe('NO_OBJECTION_SIGNAL_NOT_PERMISSION')
      expect(assessMarketingCode(channel,2,book).signal).toBe('OBJECTION_SIGNAL')
    }
    expect(assessMarketingCode('phone',3,codebooks.telefonSparrTyp).signal).toBe('OBJECTION_SIGNAL')
    const r=run({ reklamSparrTyp:2,epostSparrTyp:2,telefonSparrTyp:2 },codebooks)
    expect(r.ok && r.warnings).toEqual(expect.arrayContaining([
      'MARKETING_OBJECTION_POST','MARKETING_OBJECTION_EMAIL','MARKETING_OBJECTION_PHONE',
    ]))
    expect(r.ok && r.outreachReady).toBe(false)
    const changed=buildCodebook('epostSparrTyp',[{kod:2,klartext:'Okänd ny etikett'}])
    expect(assessMarketingCode('email',2,changed).signal).toBe('UNKNOWN')
  })
  it('no objection in all three channels is still not contactable', () => {
    const r = run()
    expect(r.ok && r.marketing.post.signal).toBe('NO_OBJECTION_SIGNAL_NOT_PERMISSION')
    expect(r.ok && r.outreachReady).toBe(false)
    expect(r.ok && r.contactability).toBe('BLOCKED_PENDING_VERIFICATION')
  })
})

describe('scb-status-policy: identity', () => {
  it('validates 10-digit Luhn legal orgnr; accepts hyphen and 16-prefix', () => {
    expect(parseLegalOrgnr(ORG)).toEqual({ ok: true, orgnr: ORG })
    expect(parseLegalOrgnr(`${ORG.slice(0, 6)}-${ORG.slice(6)}`)).toEqual({ ok: true, orgnr: ORG })
    expect(parseLegalOrgnr(`16${ORG}`)).toEqual({ ok: true, orgnr: ORG })
    const bad = ORG.slice(0, 9) + ((Number(ORG[9]) + 1) % 10)
    expect(parseLegalOrgnr(bad)).toEqual({ ok: false, reason: 'bad_checksum' })
    for (const v of ['123', '', null, 5560000000 as unknown, '12345678901234']) expect(parseLegalOrgnr(v).ok).toBe(false)
  })
  it('rejects personnummer-shaped numbers (sole proprietors) as input and as response', () => {
    expect(parseLegalOrgnr(PERSON)).toEqual({ ok: false, reason: 'personal_or_unsupported_orgnr' })
    expect(parseLegalOrgnr(`16${PERSON}`).ok).toBe(false)
    const asExpected = evaluateScbCompany({ expectedOrgnr: PERSON, je: je() })
    expect(asExpected.ok).toBe(false)
    const asResponse = evaluateScbCompany({ expectedOrgnr: ORG, je: je({ peOrgNr: PERSON, orgNr: undefined }) })
    expect(asResponse).toMatchObject({ ok: false, reason: 'personal_or_unsupported_orgnr' })
  })
  it('rejects a mismatching JE identifier', () => {
    const other = withCheckDigit('556700002')
    expect(run({ peOrgNr: other, orgNr: other })).toMatchObject({ ok: false, reason: 'orgnr_mismatch' })
    expect(run({ orgNr: other })).toMatchObject({ ok: false, reason: 'orgnr_mismatch' })
  })
  it('rejects missing identifier and non-objects', () => {
    expect(run({ peOrgNr: undefined, orgNr: undefined })).toMatchObject({ ok: false, reason: 'identifier_missing' })
    for (const bad of [null, 'x', 5, [], undefined]) {
      expect(evaluateScbCompany({ expectedOrgnr: ORG, je: bad })).toMatchObject({ ok: false, reason: 'not_an_object' })
    }
  })
  it('flags a changed legal name for review instead of rejecting', () => {
    const r = run({ namn: 'Nytt Namn AB' })
    expect(r.ok).toBe(true)
    expect(r.ok && r.warnings).toContain('LEGAL_NAME_CHANGED_REVIEW')
    expect(r.ok && r.needsReview).toBe(true)
  })
})

describe('scb-status-policy: privacy and fail-closed invariants', () => {
  const PII = { epost: 'a@b.se', email: 'a@b.se', telefon: '+46701234567', tel: '070123', postAdress: { gata: 'Storgatan 1' }, kontakt: 'Anna Andersson' }
  it('drops contact / unknown fields and never serializes them', () => {
    const r = run(PII)
    const s = JSON.stringify(r)
    expect(r.ok).toBe(true)
    for (const needle of ['a@b.se', '+4670', '070123', 'Storgatan', 'Anna', '@']) expect(s).not.toContain(needle)
  })
  it('every outcome — ok, rejected, any input — is manual-review-only, not outreach-ready, blocked', () => {
    const outcomes = [
      run(), run({ ftgStat: '9' }), run({ ftgStat: undefined }), run({}, undefined), run({ peOrgNr: undefined, orgNr: undefined }),
      evaluateScbCompany({ expectedOrgnr: 'x', je: null }),
    ]
    for (const o of outcomes) {
      expect(o.manualReviewOnly).toBe(true)
      expect(o.outreachReady).toBe(false)
      expect(o.contactability).toBe('BLOCKED_PENDING_VERIFICATION')
    }
  })
  it('never serialises a physical person from SCB jurform 10', () => {
    const r = run({ jurform:'10',namn:'Syntetiskt personnamn' })
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.reason).toBe('physical_person_jurform')
    expect(JSON.stringify(r)).not.toContain('Syntetiskt personnamn')
    expect(JSON.stringify(r)).not.toContain(ORG)
    expect(r.outreachReady).toBe(false)
  })
  it('a best-case record (active AB, no objection anywhere) is still blocked with an explicit warning', () => {
    const r = run()
    expect(r.ok && r.status.class).toBe('ACTIVE_PER_SCB')
    expect(r.ok && r.legalForm.class).toBe('AB')
    expect(r.ok && r.warnings).toContain('ACTIVE_PER_SCB_IS_NOT_PROOF_OF_DEALER_OR_PERMISSION')
    expect(r.ok && r.outreachReady).toBe(false)
  })
  it('malformed marketing values never become clear', () => {
    const r = run({ reklamSparrTyp: '0', epostSparrTyp: null, telefonSparrTyp: 0.5 })
    expect(r.ok && r.marketing.post.signal).toBe('UNKNOWN')
    expect(r.ok && r.marketing.email.signal).toBe('MISSING')
    expect(r.ok && r.marketing.phone.signal).toBe('UNKNOWN')
  })
  it('carries explicit source scope and official URLs', () => {
    expect(SCB_STATUS_POLICY_SOURCES.variableDescription).toBe('https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/variabelbeskrivning/')
    expect(SCB_STATUS_POLICY_SOURCES.imyDirectMarketing).toBe('https://www.imy.se/privatperson/dataskydd/dina-rattigheter/att-gora-invandningar/')
    const r = run()
    expect(r.ok && r.source.scope).toMatch(/legal entities only/)
  })
})
