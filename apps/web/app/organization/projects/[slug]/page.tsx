import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadOrganizationProjectCommandCenter } from '@/lib/os/organization-command-center-reader'
import { ProjectCommandCenter } from '@/components/platform/vnext/ProjectCommandCenter'

export const dynamic = 'force-dynamic'

export default async function OrganizationProjectPage({ params }: { params: { slug: string } }) {
  const model = await loadOrganizationProjectCommandCenter(params.slug)
  if (!model) notFound()
  return (
    <main className="min-h-screen bg-[#0b1424] text-slate-50">
      <nav className="px-6 pt-7">
        <Link href="/organization" className="text-sm text-sky-300">← Alla projekt</Link>
      </nav>
      {/* All existing owner form controls are disabled by the browser, not just hidden.
          The service-side data model is also stripped of links and file URLs. */}
      <fieldset disabled className="m-0 min-w-0 border-0 p-0" aria-label="Projekt i bevakningsläge">
        <ProjectCommandCenter model={model} />
      </fieldset>
    </main>
  )
}
