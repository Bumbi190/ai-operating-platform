import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadSystemHealth } from '@/lib/os/system-health'
import { SystemHealth, SystemHealthLoading } from '@/components/platform/vnext/SystemHealth'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { SystemLegacy } from './SystemLegacy'

/**
 * `/system` — Systemhälsa.
 *
 * vNext renders the operator's system surface: what each source says, what needs
 * attention, and the one place the execution stops live. `?ui=legacy` renders
 * the previous body, moved verbatim into `SystemLegacy`.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use. Both branches resolve
 * the operator's scope the same way — the loader through `resolveProjectAccess`,
 * which answers null when that scope cannot be resolved, and a scope that cannot
 * be resolved is a redirect rather than a page full of zeroes.
 */
export const dynamic = 'force-dynamic'

export default async function SystemPage() {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <SystemLegacy />

  return (
    <Suspense fallback={<SystemHealthLoading />}>
      <LoadedSystemHealth />
    </Suspense>
  )
}

async function LoadedSystemHealth() {
  const model = await loadSystemHealth()
  if (!model) redirect('/login')
  return <SystemHealth model={model} />
}
