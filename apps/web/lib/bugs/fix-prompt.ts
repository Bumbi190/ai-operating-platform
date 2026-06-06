/**
 * lib/bugs/fix-prompt.ts
 *
 * Bygger en färdig, klistra-in-bar fix-prompt från ett fynd. REN MALL — ingen
 * LLM, ingen kostnad. Den valfria "Förbättra med AI"-knappen (senare PR) kör
 * Claude på just denna text, men bara när användaren klickar.
 *
 * Sista raden speglar projektreglerna (rotorsak först, isolering, inga
 * orelaterade filer, build/test före commit) så chatten startar rätt.
 */

export interface FixPromptInput {
  projectName?: string | null
  domain?: string | null
  title: string
  status?: string | null        // t.ex. ERROR / WARNING / "failed run"
  message?: string | null
  area?: string | null
  repro?: string | null
  detectedAt?: string | Date | null
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return new Date().toISOString().slice(0, 10)
  const dt = typeof d === 'string' ? new Date(d) : d
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toISOString().slice(0, 10)
}

export function buildFixPrompt(input: FixPromptInput): string {
  const project = input.projectName ?? 'Okänt projekt'
  const domain = input.domain ? ` (${input.domain})` : ''
  const status = input.status ? ` — status ${String(input.status).toUpperCase()}` : ''
  const lines: string[] = [
    `Projekt: ${project}${domain}`,
    `Upptäckt ${fmtDate(input.detectedAt)}: "${input.title}"${status}`,
  ]
  if (input.message) lines.push(`Symptom: ${input.message}`)
  if (input.area)    lines.push(`Sannolikt område: ${input.area}`)
  lines.push(`Repro: ${input.repro ?? 'okänt — börja med att återskapa felet.'}`)
  lines.push('')
  lines.push(
    'Uppgift: hitta rotorsaken innan fix föreslås, håll per-profil-/per-projekt-isolering, ' +
    'ändra inga orelaterade filer, kör build/test före commit.',
  )
  return lines.join('\n')
}
