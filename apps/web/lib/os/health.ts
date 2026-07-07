/**
 * lib/os/health.ts
 *
 * Business Health Score (0–100) per verksamhet — Feature 4 (V3).
 *
 * Härleds ur riktiga signaler i BusinessSnapshot: aktivitet, väntande
 * godkännanden, fel, innehållsproduktion och intäkt. Heuristisk men ärlig —
 * inga påhittade siffror, bara en sammanvägning av faktiska tillstånd.
 */

import type { BusinessSnapshot } from './business'

export type HealthLabel = 'Utmärkt' | 'Stabil' | 'Behöver tillsyn' | 'Kritisk'

export interface HealthScore {
  score: number          // 0–100
  label: HealthLabel
  color: string
  /** kortfattade orsaker till poängen (för förklarbarhet) */
  factors: string[]
}

const DAY = 24 * 60 * 60 * 1000

export function businessHealth(b: BusinessSnapshot): HealthScore {
  const factors: string[] = []

  // Vilande verksamhet — inget händer. Inte kritiskt, men kräver tillsyn/uppstart.
  if (b.status === 'idle') {
    return {
      score: 45,
      label: 'Behöver tillsyn',
      color: '#fbbf24',
      factors: ['Ingen aktivitet registrerad'],
    }
  }

  let score = 100

  // Fel drar mest
  if (b.failedRuns > 0) {
    const p = Math.min(40, b.failedRuns * 20)
    score -= p
    factors.push(`${b.failedRuns} fel senaste veckan (−${p})`)
  }

  // Väntande godkännanden
  if (b.pendingApprovals > 0) {
    const p = Math.min(24, b.pendingApprovals * 8)
    score -= p
    factors.push(`${b.pendingApprovals} väntande godkännanden (−${p})`)
  }

  // Aktivitet — inga körningar på länge
  const lastMs = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
  const staleDays = lastMs ? (Date.now() - lastMs) / DAY : 999
  if (b.runs7d === 0 && staleDays > 14) {
    score -= 20
    factors.push('Ingen körning på över 14 dagar (−20)')
  }

  // Innehållsproduktion
  if (b.contentThisMonth === 0) {
    score -= 12
    factors.push('Inget innehåll producerat denna månad (−12)')
  }

  // Intäkt ger en liten lyftfaktor (men aldrig över 100)
  if (b.revenueMonthSek > 0) {
    score += 5
    factors.push('Intäkt registrerad denna månad (+5)')
  }

  if (factors.length === 0) factors.push('Allt ser bra ut')

  score = Math.max(0, Math.min(100, Math.round(score)))

  return { score, ...labelFor(score), factors }
}

function labelFor(score: number): { label: HealthLabel; color: string } {
  if (score >= 85) return { label: 'Utmärkt',         color: '#34d399' }
  if (score >= 65) return { label: 'Stabil',          color: '#a3e635' }
  if (score >= 40) return { label: 'Behöver tillsyn', color: '#fbbf24' }
  return { label: 'Kritisk', color: '#f87171' }
}
