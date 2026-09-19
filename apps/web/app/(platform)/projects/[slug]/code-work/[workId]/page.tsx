import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { readOperatorCodeWorkDetail } from '@/lib/atlas/code-work/control-plane/operator-read'
import { CodeWorkDetail } from '@/components/platform/vnext/CodeWorkDetail'

export const dynamic = 'force-dynamic'

export default async function CodeWorkDetailPage({
  params,
}: {
  params: { slug: string; workId: string }
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()
  const result = await readOperatorCodeWorkDetail({
    id: project.id,
    name: project.name,
    slug: project.slug,
    color: project.color,
  }, params.workId)
  if (result.status === 'not_permitted' || result.status === 'no_principal') notFound()
  if (!result.model) {
    return (
      <main role="alert" className="p-6 text-sm text-zinc-400">
        Kodarbetskontrollplanet kunde inte läsas säkert. Ingen åtgärd är tillgänglig.
      </main>
    )
  }
  return <CodeWorkDetail model={result.model} />
}
