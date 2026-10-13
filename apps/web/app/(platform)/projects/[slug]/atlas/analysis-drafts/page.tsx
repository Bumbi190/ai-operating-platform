import { notFound, redirect } from 'next/navigation'
import { listAnalysisDrafts } from '@/lib/atlas/project-analytics/analysis-draft-service'
import { AnalysisDraftHistory } from '@/components/platform/vnext/AnalysisDraftHistory'
export const dynamic = 'force-dynamic'
export default async function Page({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { cursor?: string | string[] }
}) {
  const cursor = searchParams.cursor
  if (Array.isArray(cursor)) notFound()
  const result = await listAnalysisDrafts(params.slug, cursor ?? null)
  if ('status' in result) {
    if (result.status === 'no_session') redirect('/login')
    if (result.status === 'not_found') notFound()
    return (
      <main className="p-6">
        <h1>Sparade analysutkast</h1>
        <p role="alert">Historiken kunde inte läsas. Försök igen senare.</p>
        <a href={'/projects/' + encodeURIComponent(params.slug)}>Till projektet</a>
      </main>
    )
  }
  return (
    <main className="p-4 md:p-6">
      <a href={'/projects/' + encodeURIComponent(params.slug)}>Till projektet</a>
      <h1 className="mt-4 text-2xl font-semibold">Sparade analysutkast</h1>
      <p>Sparat underlag och manuella kontroller för projektet.</p>
      <AnalysisDraftHistory slug={params.slug} {...result} />
    </main>
  )
}
