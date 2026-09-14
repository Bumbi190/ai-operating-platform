/**
 * GET /api/media/cron/token-health
 *
 * Daglig verifiering (06:15 UTC, cron omnira_token_health) av VARJE projekts bundna
 * sociala credentials. Project-scoped social credentials (2026-09-14):
 *   - varje aktiv kontobindning kontrolleras med SITT projekts credential
 *     (lib/media/credential-health.ts → lib/media/social-credentials.ts): plattformen
 *     tillfrågas vilket konto credentialn är, och svaret jämförs med bindningen;
 *   - resultatet skrivs per (projekt, plattform) till social_credential_health med
 *     stängda statuskoder — aldrig leverantörstext;
 *   - svarar plattformen med bindningens konto uppgraderas bindningen till
 *     provider_attested, med det namn plattformen gav (Instagram-användarnamn,
 *     Facebook-sidnamn, YouTube-kanaltitel);
 *   - token_health (nycklad på plattform, utan projekt) skrivs inte längre.
 * Larmar via mail, med projektets namn, INNAN en credential går ut eller när den
 * slutar fungera.
 *
 * Utgångsmodeller:
 *   - Instagram: long-lived, expires_at i platform_tokens → exakt dagräkning.
 *   - Facebook:  sid-token → normalt ingen utgång; giltigheten bevisas av plattformens svar.
 *   - YouTube:   refresh-token (Y1, Vercel) → giltig/ogiltig; kanalen när scope räcker.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listActiveBindings } from '@/lib/media/social-bindings'
import {
  BROKEN_HEALTH,
  verifyBindingHealth,
  writeCredentialHealth,
  type CredentialHealthStatus,
} from '@/lib/media/credential-health'
import { sendTokenExpiryWarning } from '@/lib/media/alert'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const THRESHOLDS = [0, 3, 7, 14]   // strängast först

const BROKEN_NOTE: Partial<Record<CredentialHealthStatus, string>> = {
  expired: 'ogiltigt eller utgånget',
  account_mismatch: 'tillhör inte projektets verifierade konto',
  binding_blocked: 'kontobindningen är spärrad',
  credential_missing: 'credential saknas för det kopplade kontot',
}

// Minsta tröskel som daysLeft fallit under (eller null om >14).
function thresholdFor(daysLeft: number | null): number | null {
  if (daysLeft === null) return null
  for (const t of THRESHOLDS) if (daysLeft <= t) return t
  return null
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const nowIso = new Date().toISOString()

  const bindings = await listActiveBindings()
  if (!bindings.ok) {
    return NextResponse.json({ ranAt: nowIso, error: 'bindings_unreadable' }, { status: 500 })
  }

  const projectIds = [...new Set(bindings.bindings.map(b => b.projectId))]
  const names  = new Map<string, string>()
  const warned = new Map<string, number | null>()
  if (projectIds.length > 0) {
    const [{ data: projects }, { data: previous }] = await Promise.all([
      db.from('projects').select('id, name').in('id', projectIds),
      (db as any).from('social_credential_health').select('project_id, platform, last_warned_threshold').in('project_id', projectIds),
    ])
    for (const p of (projects ?? []) as Array<{ id: string; name: string }>) names.set(p.id, p.name)
    for (const h of (previous ?? []) as Array<{ project_id: string; platform: string; last_warned_threshold: number | null }>) {
      warned.set(`${h.project_id}:${h.platform}`, h.last_warned_threshold ?? null)
    }
  }

  const results: Array<Record<string, unknown>> = []

  for (const binding of bindings.bindings) {
    const projectName = names.get(binding.projectId) ?? 'Okänt projekt'
    const verdict = await verifyBindingHealth(binding)

    // Larma: när en person måste agera (varje körning), vid ny/strängare tröskel, eller
    // dagligen vid ≤3 dagar. En tillfälligt misslyckad kontroll larmar inte och nollställer inget.
    const t = thresholdFor(verdict.daysLeft)
    const prevWarned = warned.get(`${binding.projectId}:${binding.platform}`) ?? null
    let nextWarned = prevWarned
    if (BROKEN_HEALTH.has(verdict.status)) {
      try {
        await sendTokenExpiryWarning(projectName, binding.platform, verdict.daysLeft ?? 0,
          verdict.expiresAt?.toISOString() ?? BROKEN_NOTE[verdict.status] ?? verdict.status)
      } catch { /* non-blocking */ }
      nextWarned = 0
    } else if (t !== null && (prevWarned === null || t < prevWarned || t <= 3)) {
      try {
        await sendTokenExpiryWarning(projectName, binding.platform, verdict.daysLeft ?? t, verdict.expiresAt?.toISOString() ?? 'okänt')
      } catch { /* non-blocking */ }
      nextWarned = t
    } else if (t === null && verdict.status !== 'verification_failed') {
      nextWarned = null   // återställ när credentialn är frisk igen (>14 d)
    }

    const recorded = await writeCredentialHealth(binding, verdict, nowIso, nextWarned, db)

    results.push({
      project_id: binding.projectId,
      platform: binding.platform,
      status: verdict.status,
      identity_verified: verdict.identityVerified,
      recorded,
    })
  }

  return NextResponse.json({ ranAt: nowIso, results })
}
