/**
 * bugscanner/checker.ts
 *
 * Daglig buggscanning för Familje-Stunden och Gainpilot.
 * Körs varje morgon kl 07:00 via scheduled task → /api/bugscanner/run
 *
 * Checks:
 *   1. API health — kritiska endpoints svarar och returnerar 200
 *   2. Supabase run-failures — misslyckade Familje-Stunden körningar senaste 24h
 *
 * OBS: Arnold-kvalitet och Gainpilots inköpslistor scannas av Gainpilots EGEN
 * bugscanner (gainpilot.se/api/bugscanner), inifrån dess egen Supabase och auth.
 * AOP ska inte duplicera de checkarna eller nå in i Gainpilots databas/endpoints
 * — det bröt mot per-projekt-isoleringen och gav falska varningar.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  details?: string
}

export interface ScanReport {
  timestamp: string
  checks: CheckResult[]
  summary: {
    ok: number
    warnings: number
    errors: number
    hasIssues: boolean
  }
}

// ─── 1. API Health Checks ────────────────────────────────────────────────────

const HEALTH_ENDPOINTS: { name: string; url: string; expectedStatus?: number }[] = [
  {
    name: 'Familje-Stunden: /api/projects',
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/projects`,
  },
  {
    name: 'Familje-Stunden: /api/runs (POST endpoint exists)',
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/runs`,
    expectedStatus: 405, // GET returnerar 405, men det bevisar att servern svarar
  },
  {
    name: 'Gainpilot API: /health',
    url: `${process.env.GAINPILOT_API_URL ?? 'https://gainpilot-api.onrender.com'}/health`,
  },
  {
    name: 'Gainpilot Web: startsida',
    url: 'https://www.gainpilot.se',
  },
]

async function checkApiHealth(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (const endpoint of HEALTH_ENDPOINTS) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(endpoint.url, {
        method: 'GET',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))

      const expectedStatus = endpoint.expectedStatus ?? 200
      const ok = res.status === expectedStatus || res.status === 200 || res.status === 401 // 401 = auth required = server lives

      results.push({
        name: endpoint.name,
        status: ok ? 'ok' : 'error',
        message: ok
          ? `Svarar OK (HTTP ${res.status})`
          : `Oväntat svar: HTTP ${res.status}`,
      })
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError'
      results.push({
        name: endpoint.name,
        status: 'error',
        message: isTimeout ? 'Timeout efter 10s — servern svarar inte' : `Nätverksfel: ${err?.message ?? 'okänt fel'}`,
      })
    }
  }

  return results
}

// ─── 2. Supabase Run Failures ─────────────────────────────────────────────────

async function checkRecentRunFailures(): Promise<CheckResult> {
  try {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: failedRuns, error } = await (supabase as any)
      .from('runs')
      .select('id, workflow_id, status, error, started_at')
      .eq('status', 'failed')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(10)

    if (error) {
      return {
        name: 'Familje-Stunden: Misslyckade körningar (24h)',
        status: 'warning',
        message: `Kunde inte hämta körningar: ${error.message}`,
      }
    }

    const count = failedRuns?.length ?? 0

    if (count === 0) {
      return {
        name: 'Familje-Stunden: Misslyckade körningar (24h)',
        status: 'ok',
        message: 'Inga misslyckade körningar senaste 24h',
      }
    }

    const details = failedRuns
      .map((r: any) => `• ${r.id.slice(0, 8)}… — ${r.error ?? 'ingen felbeskrivning'}`)
      .join('\n')

    return {
      name: 'Familje-Stunden: Misslyckade körningar (24h)',
      status: count >= 3 ? 'error' : 'warning',
      message: `${count} misslyckad${count > 1 ? 'e' : ''} körning${count > 1 ? 'ar' : ''} senaste 24h`,
      details,
    }
  } catch (err: any) {
    return {
      name: 'Familje-Stunden: Misslyckade körningar (24h)',
      status: 'warning',
      message: `Scan-fel: ${err?.message ?? 'okänt'}`,
    }
  }
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export async function runBugScan(): Promise<ScanReport> {
  const timestamp = new Date().toISOString()

  // Kör alla checks parallellt för snabbhet
  const [healthChecks, runFailures] = await Promise.all([
    checkApiHealth(),
    checkRecentRunFailures(),
  ])

  const checks: CheckResult[] = [
    ...healthChecks,
    runFailures,
  ]

  const ok = checks.filter(c => c.status === 'ok').length
  const warnings = checks.filter(c => c.status === 'warning').length
  const errors = checks.filter(c => c.status === 'error').length

  return {
    timestamp,
    checks,
    summary: { ok, warnings, errors, hasIssues: warnings > 0 || errors > 0 },
  }
}
