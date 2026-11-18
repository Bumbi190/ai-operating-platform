import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Building2, ExternalLink, Monitor, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

export const dynamic = 'force-dynamic'

/** The Office launcher uses a local Windows protocol, not a remote browser app. */
export default async function OrganizationOfficePage() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const scope = await resolveOrganizationReadScope(
    session as Parameters<typeof resolveOrganizationReadScope>[0],
    createAdminClient(),
    user.id,
  )
  if (!scope.role.active) notFound()
  if (scope.role.role === 'owner') redirect('/atlas/office')
  if (scope.role.role !== 'collaborator') notFound()

  return <main className="mx-auto w-full max-w-5xl px-5 py-10 text-white sm:px-8">
    <Link href="/organization/atlas" className="text-sm text-cyan-200">← Tillbaka till Atlas</Link>
    <header className="mb-8 mt-9">
      <div className="flex items-center gap-3 text-cyan-300"><Building2 size={26} /><span className="text-xs font-semibold uppercase tracking-[0.22em]">OMNIRA OS / 3D</span></div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Omnira Office</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
        Du har tillgång till Omniras kontorsöversikt och projektens arbetsinformation. Ägarens slutgodkännanden, agentanslutningar och administrativa funktioner är fortfarande skyddade.
      </p>
    </header>
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl border border-cyan-400/25 bg-cyan-950/25 p-6">
        <Monitor size={22} className="text-cyan-300" />
        <h2 className="mt-3 text-lg font-semibold">Omnira i webbläsaren</h2>
        <p className="mt-3 text-sm text-slate-300">Se samma Atlas vNext-översikt med organisationens projekt och status, i skrivskyddat läge.</p>
        <Link href="/organization/atlas" className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-cyan-400/40 bg-cyan-600/25 px-4 py-2 font-medium text-cyan-100">Öppna Omnira-översikten</Link>
      </section>
      <section className="rounded-2xl border border-slate-600/60 bg-slate-900/50 p-6">
        <Building2 size={22} className="text-indigo-300" />
        <h2 className="mt-3 text-lg font-semibold">Omnira Office – Unreal</h2>
        <p className="mt-3 text-sm text-slate-300">Den lokala 3D-världen kan öppnas på en Windows-dator där Unreal-kontoret och Omnira Office-startaren redan är installerade.</p>
        <a href="omnira-office://open" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-600/25 px-4 py-2 font-medium text-indigo-100">
          Öppna lokalt Office <ExternalLink size={17} />
        </a>
        <p className="mt-4 text-xs text-slate-400">Det här är en lokal startlänk, inte en fjärranslutning till ägarens dator. Agentkoppling och kontorsparning är inte tillgängliga för samarbetspartnern.</p>
      </section>
    </div>
    <p className="mt-8 flex gap-2 text-sm text-slate-300"><ShieldCheck size={19} className="text-emerald-300" /> Alla beslut och behörighetsändringar ligger fortsatt hos Omniras ägare.</p>
  </main>
}
