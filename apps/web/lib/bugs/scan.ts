/**
 * lib/bugs/scan.ts
 *
 * Orchestratorn — kör den dagliga "tyst-fel"-scannen projekt för projekt.
 *
 *   1. Läser registret (getScanners).
 *   2. Anropar varje projekts EGNA bugscanner-endpoint med dess egna secret
 *      (per-projekt-isolering — Omnira korsar aldrig in i annan DB).
 *   3. Normaliserar de tre olika svarsformaten till {name, status, message}.
 *   4. Diffar mot förra körningen → is_new (nytt/förvärrat fynd).
 *   5. Bygger gratis fix-prompt-mall för nya icke-OK-fynd.
 *   6. Sparar bugscan_runs + bugscan_findings. INGEN LLM, INGET mail (daglig
 *      scan matar bara panelen — push/akut-mail hanteras separat av reportBug).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getScanners, type ScannerTarget } from './registry'
import { buildFixPrompt } from './fix-prompt'
import type { FindingStatus } from './types'

const FETCH_TIMEOUT_MS = 15_000

interface NormalizedCheck {
  name: string
  status: FindingStatus
  message: string
}

interface ProjectResult {
  target: ScannerTarget
  domain: string
  checks: NormalizedCheck[]
  ok: number
  warning: number
  error: number
  reachError?: string
}

function domainOf(url: string): string {
  try { return new URL(url).host } catch { return url }
}

/**
 * Normaliserar en enskild check från valfritt av de tre scanner-formaten:
 *   AOP:       { name, status:'ok'|'warning'|'error', message }
 *   Gainpilot: { name, ok:bool, level:'info'|'warning'|'error', message }
 *   Familje:   { name, ok:bool, detail }
 */
function normalizeCheck(c: any): NormalizedCheck {
  const name = String(c?.name ?? 'okänd check')
  let status: FindingStatus
  if (typeof c?.status === 'string') {
    status = (['ok', 'warning', 'error'].includes(c.status) ? c.status : 'warning') as FindingStatus
  } else if (typeof c?.ok === 'boolean') {
    status = c.ok ? 'ok' : (c.level === 'warning' ? 'warning' : 'error')
  } else {
    status = 'warning'
  }
  const message = String(c?.message ?? c?.detail ?? '')
  return { name, status, message }
}

function extractChecks(data: any): NormalizedCheck[] {
  const raw = Array.isArray(data?.checks) ? data.checks : []
  return raw.map(normalizeCheck)
}

async function scanOne(target: ScannerTarget): Promise<ProjectResult> {
  const domain = domainOf(target.scannerUrl)
  const base: ProjectResult = { target, domain, checks: [], ok: 0, warning: 0, error: 0 }
  try {
    const secret = target.secretEnvKey ? process.env[target.secretEnvKey] : undefined
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(target.scannerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (!res.ok) {
      return { ...base, reachError: `HTTP ${res.status} från scanner` }
    }
    const data = await res.json()
    const checks = extractChecks(data)
    return {
      ...base,
      checks,
      ok: checks.filter(c => c.status === 'ok').length,
      warning: checks.filter(c => c.status === 'warning').length,
      error: checks.filter(c => c.status === 'error').length,
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError'
    return { ...base, reachError: isTimeout ? 'Timeout — scanner svarade inte' : `Nätverksfel: ${err?.message ?? 'okänt'}` }
  }
}

export interface ScanAllResult {
  runId: string
  ok: number
  warnings: number
  errors: number
  newCount: number
  perProject: Record<string, { ok: number; warning: number; error: number; reachError?: string }>
}

export async function runScanAll(): Promise<ScanAllResult> {
  const db: any = createAdminClient()
  const targets = await getScanners(db)

  // 1–3. Kör alla scanners parallellt + normalisera.
  const results = await Promise.all(targets.map(scanOne))

  // 4. Diff mot senaste föregående körning: bygg karta projekt|check → status.
  const prevMap = new Map<string, FindingStatus>()
  try {
    const { data: prevRun } = await db
      .from('bugscan_runs')
      .select('id')
      .order('started_at', { ascending: false })
      .limit(1)
    const prevId = prevRun?.[0]?.id
    if (prevId) {
      const { data: prevFindings } = await db
        .from('bugscan_findings')
        .select('project_name, check_name, status')
        .eq('run_id', prevId)
      for (const f of prevFindings ?? []) {
        prevMap.set(`${f.project_name}|${f.check_name}`, f.status as FindingStatus)
      }
    }
  } catch { /* första körningen: ingen historik att diffa mot */ }

  // 5. Skapa körningsrad.
  const totals = results.reduce(
    (a, r) => ({ ok: a.ok + r.ok, warning: a.warning + r.warning, error: a.error + r.error }),
    { ok: 0, warning: 0, error: 0 },
  )
  const summary: Record<string, any> = {}
  for (const r of results) {
    summary[r.target.label] = { ok: r.ok, warning: r.warning, error: r.error, ...(r.reachError ? { reachError: r.reachError } : {}) }
  }

  const { data: runRow } = await db
    .from('bugscan_runs')
    .insert({
      finished_at: new Date().toISOString(),
      ok: totals.ok, warnings: totals.warning, errors: totals.error,
      summary,
    })
    .select('id')
    .single()
  const runId = runRow?.id as string

  // 6. Bygg findings (+ is_new + fix_prompt för nya icke-OK).
  let newCount = 0
  const findingRows: any[] = []
  for (const r of results) {
    // Oåtkomlig scanner = ett eget error-fynd.
    const checks: NormalizedCheck[] = r.reachError
      ? [{ name: 'Scanner nåbar', status: 'error', message: r.reachError }]
      : r.checks
    for (const c of checks) {
      const key = `${r.target.label}|${c.name}`
      const prev = prevMap.get(key)
      const isNew = c.status !== 'ok' && prev !== c.status
      if (isNew) newCount++
      findingRows.push({
        run_id: runId,
        project_id: r.target.projectId,
        project_name: r.target.label,
        check_name: c.name,
        status: c.status,
        message: c.message,
        is_new: isNew,
        fix_prompt: isNew
          ? buildFixPrompt({
              projectName: r.target.label,
              domain: r.domain,
              title: c.name,
              status: c.status,
              message: c.message,
            })
          : null,
      })
    }
  }
  if (findingRows.length > 0) {
    await db.from('bugscan_findings').insert(findingRows)
  }

  return {
    runId,
    ok: totals.ok,
    warnings: totals.warning,
    errors: totals.error,
    newCount,
    perProject: summary,
  }
}
