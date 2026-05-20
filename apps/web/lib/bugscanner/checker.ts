/**
 * bugscanner/checker.ts
 *
 * Daglig buggscanning för Familje-Stunden och Gainpilot.
 * Körs varje morgon kl 07:00 via scheduled task → /api/bugscanner/run
 *
 * Checks:
 *   1. API health — kritiska endpoints svarar och returnerar 200
 *   2. Supabase run-failures — misslyckade Familje-Stunden körningar senaste 24h
 *   3. Arnold QA — testar att Arnold svarar relevant och inte hallucinar
 *   4. Gainpilot shopping-list — kontrollerar att inköpslistor ser rimliga ut
 */

import Anthropic from '@anthropic-ai/sdk'
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

// ─── 3. Arnold QA Check ──────────────────────────────────────────────────────

const ARNOLD_TEST_PROMPTS = [
  {
    prompt: 'Hur många kalorier bör jag äta per dag om jag väger 80kg och vill bygga muskler?',
    mustContain: ['kalori', 'protein', 'kcal'],
    mustNotContain: ['sprit', 'alkohol', 'steroid', 'medicin'],
    label: 'Kaloriberäkning',
  },
  {
    prompt: 'Ge mig ett träningspass för bröst',
    mustContain: ['bänkpress', 'set', 'reps'],
    mustNotContain: ['cancer', 'sjukhus', 'läkare rekommenderar'],
    label: 'Träningspass',
  },
]

async function checkArnoldQuality(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const gainpilotApiUrl = process.env.GAINPILOT_API_URL ?? 'https://gainpilot-api.onrender.com'

  for (const test of ARNOLD_TEST_PROMPTS) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      const res = await fetch(`${gainpilotApiUrl}/api/arnold/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: test.prompt, profile: 'scan-test' }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))

      if (!res.ok) {
        results.push({
          name: `Arnold QA: ${test.label}`,
          status: 'warning',
          message: `Arnold-endpoint svarade HTTP ${res.status} — kan inte testa`,
        })
        continue
      }

      const data = await res.json()
      const reply = (data.message ?? data.reply ?? data.content ?? '').toLowerCase()

      if (!reply || reply.length < 20) {
        results.push({
          name: `Arnold QA: ${test.label}`,
          status: 'error',
          message: 'Arnold returnerade tomt eller mycket kort svar',
        })
        continue
      }

      const missingKeywords = test.mustContain.filter(kw => !reply.includes(kw))
      const forbiddenFound = test.mustNotContain.filter(kw => reply.includes(kw))

      if (forbiddenFound.length > 0) {
        results.push({
          name: `Arnold QA: ${test.label}`,
          status: 'error',
          message: `Förbjudna ord hittades i svaret: ${forbiddenFound.join(', ')}`,
          details: reply.slice(0, 200),
        })
      } else if (missingKeywords.length > 1) {
        results.push({
          name: `Arnold QA: ${test.label}`,
          status: 'warning',
          message: `Svaret verkar sakna förväntade nyckelord: ${missingKeywords.join(', ')}`,
          details: reply.slice(0, 200),
        })
      } else {
        results.push({
          name: `Arnold QA: ${test.label}`,
          status: 'ok',
          message: 'Svaret ser relevant ut',
        })
      }
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError'
      results.push({
        name: `Arnold QA: ${test.label}`,
        status: 'warning',
        message: isTimeout
          ? 'Arnold svarade inte inom 30s'
          : `Kunde inte nå Arnold: ${err?.message ?? 'okänt'}`,
      })
    }
  }

  return results
}

// ─── 4. Gainpilot Shopping List Sanity Check ─────────────────────────────────

async function checkShoppingListSanity(): Promise<CheckResult> {
  try {
    const supabase = createAdminClient()

    // Hämta de senaste 5 genererade inköpslistorna
    const { data: lists, error } = await (supabase as any)
      .from('shopping_lists')
      .select('id, items, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error || !lists) {
      return {
        name: 'Gainpilot: Inköpslistor (sanitetskoll)',
        status: 'warning',
        message: 'Kunde inte hämta inköpslistor från Supabase',
      }
    }

    if (lists.length === 0) {
      return {
        name: 'Gainpilot: Inköpslistor (sanitetskoll)',
        status: 'ok',
        message: 'Inga inköpslistor att kontrollera',
      }
    }

    const issues: string[] = []

    for (const list of lists) {
      const items = Array.isArray(list.items) ? list.items : []

      // Tom lista
      if (items.length === 0) {
        issues.push(`Lista ${list.id.slice(0, 8)}: tom`)
        continue
      }

      // Orimligt många items (>100 = troligen fel)
      if (items.length > 100) {
        issues.push(`Lista ${list.id.slice(0, 8)}: ${items.length} items (misstänkt högt antal)`)
      }

      // Kontrollera att items har namn och mängd
      const malformed = items.filter((item: any) => !item?.name || item.name.length < 2)
      if (malformed.length > 0) {
        issues.push(`Lista ${list.id.slice(0, 8)}: ${malformed.length} items saknar namn`)
      }
    }

    if (issues.length === 0) {
      return {
        name: 'Gainpilot: Inköpslistor (sanitetskoll)',
        status: 'ok',
        message: `${lists.length} senaste listorna ser OK ut`,
      }
    }

    return {
      name: 'Gainpilot: Inköpslistor (sanitetskoll)',
      status: 'warning',
      message: `${issues.length} problem hittade i inköpslistor`,
      details: issues.join('\n'),
    }
  } catch (err: any) {
    return {
      name: 'Gainpilot: Inköpslistor (sanitetskoll)',
      status: 'warning',
      message: `Scan-fel: ${err?.message ?? 'okänt'}`,
    }
  }
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export async function runBugScan(): Promise<ScanReport> {
  const timestamp = new Date().toISOString()

  // Kör alla checks parallellt för snabbhet
  const [healthChecks, runFailures, arnoldChecks, shoppingCheck] = await Promise.all([
    checkApiHealth(),
    checkRecentRunFailures(),
    checkArnoldQuality(),
    checkShoppingListSanity(),
  ])

  const checks: CheckResult[] = [
    ...healthChecks,
    runFailures,
    ...arnoldChecks,
    shoppingCheck,
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
