import { EVIDENCE, type EvidenceId, type SourceStatus } from './handlarborsen-competitors'

export type CompetitorObservation = Readonly<{
  source_id: EvidenceId; observed_on: string; checked_at: string;
  status: SourceStatus; title: string | null
}>
export type CompetitorHistory =
  | { status: 'not_permitted' | 'read_failed' }
  | { status: 'ok'; observations: readonly CompetitorObservation[] }

/** Only consecutive saved observations qualify; a failed check interrupts comparison. */
export function compareTitleHistory(observations: readonly CompetitorObservation[]) {
  const changes: { source_id: EvidenceId; from: string; to: string }[] = []
  for (const source of EVIDENCE) {
    const rows = observations.filter(row => row.source_id === source.id)
      .slice().sort((a, b) => a.observed_on.localeCompare(b.observed_on))
    for (let i = 1; i < rows.length; i++) {
      const before = rows[i - 1], after = rows[i]
      if (before.observed_on < after.observed_on && before.status === 'metadata_checked'
        && after.status === 'metadata_checked' && before.title && after.title && before.title !== after.title) {
        changes.push({ source_id: source.id, from: before.observed_on, to: after.observed_on })
      }
    }
  }
  return changes
}
