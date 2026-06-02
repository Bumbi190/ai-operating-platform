/**
 * lib/atlas/opportunities.ts — Opportunity Engine (Fas 4, Feature 7: SCAFFOLD).
 *
 * Atlas SAMLAR möjligheter — inga automatiska åtgärder. Detektering är
 * konservativ och urvalsmedveten: vi påstår aldrig ett "vinnande ämne" på för
 * få inlägg. Skriver till opportunities-tabellen (status 'open'), idempotent på
 * (project_id, type, title) för öppna rader.
 *
 * Detta är grunden — fler detektorer (posting-time, format, growth) kopplas på
 * när account_snapshots och volym vuxit.
 */

import { contentScore } from './content-score'

type AnyDb = any

const MIN_TOTAL_FOR_TOPIC = 6   // min antal inlägg innan vi vågar uttala oss om ämnen
const MIN_PER_TOPIC       = 3   // min inlägg i ett ämne för att räknas

export interface DetectedOpportunity {
  projectId: string | null
  type: string
  title: string
  rationale: string
  score: number
  confidence: 'low' | 'medium' | 'high'
  evidence: unknown
}

/** Detektera möjligheter (rent, utan att skriva). */
export async function detectOpportunities(db: AnyDb, projectId?: string): Promise<DetectedOpportunity[]> {
  const out: DetectedOpportunity[] = []
  const cs = await contentScore(db, projectId)

  if (!cs.hasData) return out

  // 1) Ämne som engagerar mest — bara om vi har nog data
  const eligible = cs.byTopic.filter(t => t.posts >= MIN_PER_TOPIC)
  if (cs.sampleSize >= MIN_TOTAL_FOR_TOPIC && eligible.length >= 2) {
    const [lead, second] = eligible
    const gap = lead.avgScore - second.avgScore
    if (gap >= 10) {
      out.push({
        projectId: projectId ?? null,
        type: 'content_topic',
        title: `Ämnet "${lead.topic}" engagerar mest — luta innehållet ditåt`,
        rationale: `"${lead.topic}" har snittpoäng ${lead.avgScore} mot ${second.avgScore} för "${second.topic}" (n=${lead.posts} resp. ${second.posts}).`,
        score: Math.min(100, 50 + gap),
        confidence: cs.confidence,
        evidence: { byTopic: cs.byTopic, sampleSize: cs.sampleSize },
      })
    }
  } else {
    // Ärligt: för lite data → en "data"-möjlighet istället för en påhittad slutsats
    out.push({
      projectId: projectId ?? null,
      type: 'data',
      title: 'För lite data för ämnesinsikter — fortsätt publicera',
      rationale: `Endast ${cs.sampleSize} inlägg med insights. Vid ~${MIN_TOTAL_FOR_TOPIC}+ kan Atlas peka ut vinnande ämnen med rimlig konfidens.`,
      score: 20,
      confidence: 'low',
      evidence: { sampleSize: cs.sampleSize, byTopic: cs.byTopic },
    })
  }

  // 2) Tillväxt — kräver account_snapshots-tidsserie (kopplas på när data finns)
  try {
    const { data: snaps } = await db.from('account_snapshots')
      .select('snapshot_date, followers, platform')
      .order('snapshot_date', { ascending: true })
    if (!snaps || snaps.length < 2) {
      out.push({
        projectId: projectId ?? null,
        type: 'growth',
        title: 'Följardata börjar samlas — tillväxtinsikter kommer',
        rationale: 'account_snapshots har <2 dagar ännu. När tidsserien växer kan Atlas upptäcka accelererande/avtagande tillväxt.',
        score: 15,
        confidence: 'low',
        evidence: { snapshots: snaps?.length ?? 0 },
      })
    }
  } catch { /* tabell saknas/ej redo */ }

  return out
}

/** Detektera och lagra (idempotent på öppna rader). */
export async function detectAndStoreOpportunities(db: AnyDb, projectId?: string) {
  const detected = await detectOpportunities(db, projectId)
  let stored = 0

  // Befintliga öppna titlar → undvik dubbletter
  let openTitles = new Set<string>()
  try {
    let q = db.from('opportunities').select('title').eq('status', 'open')
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    openTitles = new Set((data ?? []).map((r: any) => r.title))
  } catch { /* ignore */ }

  for (const o of detected) {
    if (openTitles.has(o.title)) continue
    const { error } = await (db.from('opportunities') as any).insert({
      project_id: o.projectId, type: o.type, title: o.title, rationale: o.rationale,
      score: o.score, confidence: o.confidence, evidence: o.evidence, status: 'open',
    })
    if (!error) stored++
  }

  return { detected: detected.length, stored }
}

/** Läs öppna möjligheter (för Atlas/UI). Read-only. */
export async function listOpportunities(db: AnyDb, projectId?: string) {
  try {
    let q = db.from('opportunities').select('*').eq('status', 'open').order('score', { ascending: false })
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    return data ?? []
  } catch { return [] }
}
