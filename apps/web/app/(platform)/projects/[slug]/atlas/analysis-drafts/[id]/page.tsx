import { notFound, redirect } from 'next/navigation'
import { getAnalysisDraft } from '@/lib/atlas/project-analytics/analysis-draft-service'
import { AnalysisDraftHistory } from '@/components/platform/vnext/AnalysisDraftHistory'
export const dynamic = 'force-dynamic'
export default async function Page({ params }: { params: { slug: string; id: string } }) {
  const result = await getAnalysisDraft(params.slug, params.id)
  const root = '/projects/' + encodeURIComponent(params.slug) + '/atlas/analysis-drafts'
  if ('status' in result) {
    if (result.status === 'no_session') redirect('/login')
    if (result.status === 'not_found') notFound()
    return (
      <main className="p-6">
        <h1>Analysutkast</h1>
        <p role="alert">Analysutkastet kunde inte läsas. Försök igen senare.</p>
        <a href={root}>Till sparade analysutkast</a>
      </main>
    )
  }
  return (
    <main className="p-4 md:p-6">
      <a href={root}>Till sparade analysutkast</a>
      <h1 className="mt-4 text-2xl font-semibold">Sparat analysutkast</h1>
      <AnalysisDraftHistory slug={params.slug} items={[result]} nextCursor={null} />
    </main>
  )
}
