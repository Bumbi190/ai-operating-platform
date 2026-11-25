/**
 * Read-only Atlas Control Center preview.
 * Reuses the established owner-scoped overview model. Does not create,
 * approve, publish or trigger workflows and does not access provider secrets.
 */
import { redirect } from 'next/navigation'
import { loadOverviewModel } from '@/lib/overview/view-model'
import { AtlasControlCenter } from '@/components/platform/control-center/AtlasControlCenter'

export const dynamic = 'force-dynamic'

export default async function AtlasControlCenterPage({
  searchParams,
}: {
  searchParams: { period?: string }
}): Promise<JSX.Element> {
  const model = await loadOverviewModel(searchParams.period === '30' ? 30 : 7)
  if (!model) redirect('/login')
  return <AtlasControlCenter model={model} />
}
