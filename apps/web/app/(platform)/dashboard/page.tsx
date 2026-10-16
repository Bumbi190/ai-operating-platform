import { redirect } from 'next/navigation'
import { loadOverviewModel } from '@/lib/overview/view-model'
import { OverviewDashboard } from '@/components/platform/overview/OverviewDashboard'
export default async function DashboardPage({
  searchParams
}: {
  searchParams: { period?: string }
}): Promise<JSX.Element> {
  const model = await loadOverviewModel(searchParams.period === '30' ? 30 : 7)
  if (!model) redirect('/login')
  return <OverviewDashboard model={model} />
}
