/**
 * Browser-safe SCB report primitives: no Node APIs, secrets, I/O or network.
 * Server and browser use the SAME exact CSV column contract, but all import
 * authorization, the approved digest and writes stay on the server.
 */
export const STATUS_AUDIT_EXPORT_COLUMNS = [
  'legalCompanyName','orgnr','city','sni','scbStatusCode','scbStatusClass',
  'legalFormCode','legalFormLabel','reklamCode','epostCode','telefonCode',
  'marketingReview','priorContactReview','legalIdentityReview',
  'manual_review_only','NOT_CONTACTABLE','historyCoverage',
] as const

/** Strict RFC-style CSV reader with no dependencies or uncontrolled recovery. */
export function parseReviewCsv(text: string): string[][] {
  if (typeof text !== 'string' || text.length > 350_000) throw new Error('csv_invalid')
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let cellStarted = false
  let closedQuote = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ }
        else { inQuotes = false; closedQuote = true }
      } else cell += ch
      continue
    }
    if (ch === '"') {
      if (cell !== '' || cellStarted) throw new Error('csv_invalid')
      inQuotes = true; cellStarted = true; closedQuote = false
    } else if (ch === ',') {
      row.push(cell); cell = ''; cellStarted = false; closedQuote = false
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''; cellStarted = false; closedQuote = false
      if (!(row.length === 1 && row[0] === '')) rows.push(row)
      row = []
    } else {
      if (closedQuote) throw new Error('csv_invalid')
      cell += ch
    }
  }
  if (inQuotes) throw new Error('csv_invalid')
  if (cell !== '' || cellStarted || row.length > 0) {
    row.push(cell)
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
  }
  return rows
}

function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[i])
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9 }
    sum += n
  }
  return sum % 10 === 0
}

/**
 * Only the 10-digit number of a LEGAL entity. A Luhn-valid person-shaped ID
 * is rejected, not masked and passed to a user interface.
 */
export function parseReviewLegalOrgnr(raw: string): string {
  if (!/^\d{10}$/.test(raw) || Number(raw[2]) < 2 || !luhnValid(raw)) throw new Error('orgnr_invalid')
  const month = Number(raw.slice(2, 4))
  const day = Number(raw.slice(4, 6))
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) throw new Error('orgnr_invalid')
  return raw
}
