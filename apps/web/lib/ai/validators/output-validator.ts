/**
 * output-validator.ts
 *
 * Validerar output från varje workflow-steg.
 * Om valideringen misslyckas → retry med korrektionsinstruktion.
 *
 * Regler per output_key:
 *   saga            → 14–18 sidor, har MP3-MANUS-sektion
 *   sagabildprompts → giltig JSON-array med exakt 16 strängar
 *   bildprompts     → giltig JSON-array med exakt 5 strängar
 *   aktiviteter     → minst 300 tecken med 5 aktiviteter
 *   komplement      → minst 200 tecken
 *   bilder          → JSON med urls-array, minst 1 URL
 *   sagabilder      → JSON med urls-array, minst 1 URL
 */

export interface ValidationResult {
  valid: boolean
  issues: string[]
  correctionHint: string
}

// ─── Per-step validators ──────────────────────────────────────────────────────

function validateSaga(content: string): ValidationResult {
  const issues: string[] = []

  // Count story pages — matches **[Sid X]** or **Sida X** patterns
  const pageMatches = content.match(/\*\*\[Sid\s+\d+\]\*\*|\*\*Sida\s+\d+\*\*/gi) ?? []
  const pageCount = pageMatches.length

  if (pageCount < 14) {
    issues.push(`Sagan har bara ${pageCount} sidor — behöver minst 14 (helst 16)`)
  } else if (pageCount > 18) {
    issues.push(`Sagan har ${pageCount} sidor — för många, bör vara 16`)
  }

  if (!content.includes('MP3-MANUS') && !content.includes('mp3-manus') && !content.includes('MANUS')) {
    issues.push('Saknar MP3-MANUS-sektion')
  }

  if (content.length < 2000) {
    issues.push(`Sagan är för kort (${content.length} tecken) — förväntad är minst 2000`)
  }

  return {
    valid: issues.length === 0,
    issues,
    correctionHint: issues.length > 0
      ? `KORRIGERING KRÄVS: ${issues.join('; ')}. Skriv om sagan och se till att den har EXAKT 16 sidor markerade med **[Sid 1]** – **[Sid 16]** och inkluderar ## 🎙️ MP3-MANUS i slutet.`
      : '',
  }
}

function validateJsonArray(
  content: string,
  expectedLength: number,
  label: string,
): ValidationResult {
  const issues: string[] = []

  // Try to extract JSON array even if there's surrounding text
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    issues.push(`${label}: Hittade ingen JSON-array i svaret`)
    return {
      valid: false,
      issues,
      correctionHint: `KORRIGERING: Svara ENBART med ett JSON-array med ${expectedLength} strängar. Exempel: ["prompt 1", "prompt 2", ..., "prompt ${expectedLength}"]`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    issues.push(`${label}: Ogiltig JSON-syntax`)
    return {
      valid: false,
      issues,
      correctionHint: `KORRIGERING: JSON-syntaxen är ogiltig. Svara ENBART med ett JSON-array med ${expectedLength} strängar, inga kommentarer eller extra text.`,
    }
  }

  if (!Array.isArray(parsed)) {
    issues.push(`${label}: Svaret är inte en array`)
  } else if (parsed.length !== expectedLength) {
    issues.push(`${label}: Array har ${parsed.length} element — behöver exakt ${expectedLength}`)
  } else {
    // Check all elements are non-empty strings
    const emptyCount = parsed.filter((el) => typeof el !== 'string' || el.trim().length === 0).length
    if (emptyCount > 0) {
      issues.push(`${label}: ${emptyCount} element är tomma eller inte strängar`)
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    correctionHint: issues.length > 0
      ? `KORRIGERING: ${issues.join('; ')}. Svara ENBART med ett JSON-array med exakt ${expectedLength} icke-tomma strängar.`
      : '',
  }
}

function validateImageOutput(content: string, label: string): ValidationResult {
  const issues: string[] = []

  let parsed: { urls?: string[]; errors?: string[] } = {}
  try {
    parsed = JSON.parse(content)
  } catch {
    issues.push(`${label}: Ogiltig JSON i bildresultat`)
    return { valid: false, issues, correctionHint: '' }
  }

  const urls = parsed.urls ?? []
  if (urls.length === 0) {
    issues.push(`${label}: Inga bilder genererades`)
    if (parsed.errors?.length) {
      issues.push(`Fel: ${parsed.errors.slice(0, 2).join(', ')}`)
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    correctionHint: '',  // Image steps don't benefit from text correction hints
  }
}

function validateText(content: string, label: string, minLength: number): ValidationResult {
  const issues: string[] = []

  if (!content || content.trim().length < minLength) {
    issues.push(`${label}: För kort (${content?.length ?? 0} tecken, behöver minst ${minLength})`)
  }

  return {
    valid: issues.length === 0,
    issues,
    correctionHint: issues.length > 0
      ? `KORRIGERING: Svaret är för kort. Ge ett fullständigt och detaljerat svar.`
      : '',
  }
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

/**
 * Validate the output of a workflow step.
 * Returns { valid: true } for unknown output keys (no validation = pass).
 */
export function validateStepOutput(
  outputKey: string,
  content: string,
): ValidationResult {
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      issues: ['Tomt svar från agenten'],
      correctionHint: 'Agenten returnerade ett tomt svar. Försök igen.',
    }
  }

  switch (outputKey) {
    case 'saga':
      return validateSaga(content)

    case 'sagabildprompts':
      return validateJsonArray(content, 16, 'Saga-bildprompts')

    case 'bildprompts':
      return validateJsonArray(content, 5, 'Bildprompts')

    case 'aktivitetsbildprompts':
      return validateJsonArray(content, 5, 'Aktivitets-bildprompts')

    case 'bilder':
      return validateImageOutput(content, 'Färgläggningsbilder')

    case 'sagabilder':
      return validateImageOutput(content, 'Saga-illustrationer')

    case 'aktivitetsbilder':
      return validateImageOutput(content, 'Aktivitets-illustrationer')

    case 'aktiviteter':
      return validateText(content, 'Aktiviteter', 300)

    case 'komplement':
      return validateText(content, 'Komplement', 200)

    case 'tema':
      return validateText(content, 'Tema', 50)

    default:
      // No specific validation — pass through
      return { valid: true, issues: [], correctionHint: '' }
  }
}
