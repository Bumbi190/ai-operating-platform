import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MemoryView, MemoryViewLoading } from '@/components/platform/vnext/MemoryView'
import { loadMemoryView } from '@/lib/os/memory'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { MemoryLegacy } from './MemoryLegacy'

/**
 * `/memory` — Minne.
 *
 * vNext is a read-only view over public.platform_memory and a separately named
 * public.content_feedback history. It is not an Atlas M4 inventory. An explicit
 * `?project=<slug>` is required before either project-bound helper runs.
 *
 * `?ui=legacy` renders the previous page body. The legacy branch returns before
 * the new read model is called, so rollback preserves the old first-project and
 * write-control behaviour without paying for or depending on vNext reads.
 */
export const dynamic = 'force-dynamic'

export default async function MemoryPage({
  searchParams,
}: {
  searchParams?: { project?: string | string[] }
}) {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <MemoryLegacy />

  const raw = searchParams?.project
  const projectSlug = Array.isArray(raw) ? raw[0] ?? null : raw ?? null

  return (
    <Suspense fallback={<MemoryViewLoading />}>
      <LoadedMemory projectSlug={projectSlug} />
    </Suspense>
  )
}

async function LoadedMemory(
  { projectSlug }: { projectSlug: string | null } = { projectSlug: null },
) {
  const model = await loadMemoryView({ projectSlug })
  if (!model) redirect('/login')
  return <MemoryView key={model.selectedProject?.id ?? model.state} model={model} />
}
