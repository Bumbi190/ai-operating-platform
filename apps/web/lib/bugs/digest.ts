/**
 * lib/bugs/digest.ts
 *
 * Morgon-digest till startsidan (/atlas). Hämtar:
 *   • nya fynd (is_new) från senaste scan-körningen
 *   • öppna akuta (critical) bug_reports senaste 24h
 *
 * SÄKER: all DB-åtkomst är try/catch:ad och returnerar tomt vid fel/saknade
 * tabeller (innan migrationen körts). Får ALDRIG krascha hemvyn.
 *
 * BEHÖRIGHET (Phase 9AC, closure audit #6 A6-2): detta är PLATTFORMSDIAGNOSTIK
 * — varje projekts scan-fynd och öppna akuta rapporter, lästa med
 * service-role-klienten. Samma publik som buggscannern själv (som mejlar
 * fynden till operatören), alltså bara plattformsoperatören. Funktionen kräver
 * därför operatörens verifierade resultat som argument; anroparen avgör
 * behörigheten INNAN något läses, och utan den läses ingenting.
 */

import type { PlatformOperatorOk } from '@/lib/auth/platform-operator'
import type { BugReport, BugscanFinding } from './types'

export interface MorningBugDigest {
  findings: BugscanFinding[]
  reports: BugReport[]
  runAt: string | null
}

export async function getMorningBugDigest(db: any, operator: PlatformOperatorOk): Promise<MorningBugDigest> {
  const empty: MorningBugDigest = { findings: [], reports: [], runAt: null }
  // Only a resolved platform operator reaches the reads below.
  if (operator?.ok !== true) return empty
  try {
    const { data: runRows } = await db
      .from('bugscan_runs')
      .select('id, started_at')
      .order('started_at', { ascending: false })
      .limit(1)
    const run = runRows?.[0]

    let findings: BugscanFinding[] = []
    if (run?.id) {
      const { data } = await db
        .from('bugscan_findings')
        .select('*')
        .eq('run_id', run.id)
        .eq('is_new', true)
      findings = (data ?? []) as BugscanFinding[]
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: reps } = await db
      .from('bug_reports')
      .select('*')
      .eq('status', 'open')
      .eq('severity', 'critical')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    return { findings, reports: (reps ?? []) as BugReport[], runAt: run?.started_at ?? null }
  } catch {
    return empty
  }
}
