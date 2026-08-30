/**
 * lib/atlas/knowledge/projection/secret-scan.ts — hard credential gate.
 *
 * Pure, no I/O. Detects credential SHAPES and reports pattern names only. A
 * matched value is never returned, never logged, and never stored on a result —
 * a leak detector that echoes the leak is worse than none.
 *
 * ── SECRETS ARE PROHIBITED. PRIVATE MATERIAL IS NOT. ─────────────────────────
 * This is a narrow gate on purpose. Real credentials (keys, tokens, private
 * keys, connection strings with passwords) make a note unpublishable and, once
 * the publisher exists, will fail the whole publication.
 *
 * PII, customer information and business-confidential material are NOT blocked
 * here. Supporting private business knowledge is the point of the system;
 * a broad PII blocker would make legitimate Knowledge unpublishable. Those are
 * governed by classification instead — see eligibility.ts.
 */

export interface SecretFinding {
  /** Human-readable pattern name. Never the matched text. */
  pattern: string
  /** How many times the shape appeared. Never the values. */
  count: number
}

interface ShapeRule {
  name: string
  re: RegExp
  /** Optional guard rejecting known-benign matches. */
  accept?: (match: string) => boolean
}

/**
 * A long base64-ish blob is a plausible secret — but a bare SHA-256 or a git
 * commit id is pure hex, and Knowledge notes legitimately quote those
 * constantly (this repo's own provenance convention is built on them). So the
 * blob rule requires at least one character outside the hex alphabet; otherwise
 * every note citing a commit would be reported as leaking a credential, and the
 * gate would be trained into noise on day one.
 */
const NOT_PURE_HEX = (m: string) => !/^[0-9a-fA-F]+$/.test(m)

const SHAPES: ShapeRule[] = [
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{20,}/g },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'PEM private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'DSN with embedded password', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g },
  { name: 'Bearer credential', re: /[Bb]earer\s+[A-Za-z0-9._~+/-]{20,}/g },
  { name: 'long opaque blob', re: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, accept: NOT_PURE_HEX },
]

/** What replaces a credential-shaped value anywhere it would otherwise be shown. */
export const SECRET_PLACEHOLDER = '[REDACTED — SECRET SHAPE DETECTED]'

/**
 * True when the text contains anything shaped like a credential.
 *
 * Detection and redaction share SHAPES deliberately: two lists would drift, and
 * the drift direction is "we detected it but printed it anyway".
 */
export function containsSecretShape(text: string): boolean {
  return SHAPES.some((shape) => {
    const matches = text.match(shape.re) ?? []
    return (shape.accept ? matches.filter(shape.accept) : matches).length > 0
  })
}

/**
 * Replace every credential-shaped substring with SECRET_PLACEHOLDER.
 *
 * The single choke point for rendering source-controlled text. A note's own
 * metadata is attacker-controlled in the only sense that matters here: whatever
 * someone pasted into it. `scanForSecretShapes` never returns matched values,
 * but a ParsedKnowledgeDocument certainly does carry source text — titles,
 * paths, diagnostics quoting rejected frontmatter — so anything rendered from a
 * candidate has to come through here.
 */
export function redactSecretShapes(text: string): string {
  let out = text
  for (const shape of SHAPES) {
    out = out.replace(shape.re, (match) =>
      (shape.accept && !shape.accept(match)) ? match : SECRET_PLACEHOLDER)
  }
  return out
}

/** Findings, deterministically ordered by pattern name. Values never included. */
export function scanForSecretShapes(content: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  for (const shape of SHAPES) {
    const matches = content.match(shape.re) ?? []
    const kept = shape.accept ? matches.filter(shape.accept) : matches
    if (kept.length > 0) findings.push({ pattern: shape.name, count: kept.length })
  }
  return findings.sort((a, b) => a.pattern.localeCompare(b.pattern))
}
