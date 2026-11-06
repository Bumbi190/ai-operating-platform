import Link from 'next/link'
import { ArrowLeft, Building2, ExternalLink, Monitor } from 'lucide-react'

/** A web page must never invoke an arbitrary local shell command. */
export default function OmniraOfficePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 text-white sm:px-8">
      <Link href="/atlas" className="inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-cyan-100">
        <ArrowLeft size={16} aria-hidden="true" /> Tillbaka till Atlas
      </Link>
      <header className="mb-8 mt-9">
        <div className="flex items-center gap-3 text-cyan-300">
          <Building2 size={26} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[0.22em]">Omnira OS / 3D</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Omnira Office</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
          Din ursprungliga kontorsv&auml;rld &auml;r bevarad. Unreal-versionen utvecklas parallellt
          som en mer realistisk spelv&auml;rld. V&auml;lj vilken milj&ouml; du vill &ouml;ppna.
        </p>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-cyan-400/25 bg-cyan-950/25 p-6">
          <div className="flex items-center gap-2">
            <Monitor size={20} className="text-cyan-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Klassiska HQ</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Din tidigare webbaserade 3D-v&auml;rld med Atlas, Pling och projektkontoren.
            &Ouml;ppnas fr&aring;n datorn d&auml;r den lokala HQ-servern k&ouml;rs.
          </p>
          <a
            href="http://127.0.0.1:4180/atlas/campus-preview"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-600/25 px-4 py-2 font-medium text-cyan-100 transition hover:bg-cyan-600/40"
          >
            &Ouml;ppna gamla 3D-v&auml;rlden <ExternalLink size={17} aria-hidden="true" />
          </a>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Fungerar bara p&aring; din dator med HQ-servern ig&aring;ng.
            Om det inte fungerar, starta genv&auml;gen &quot;Starta Omnira HQ&quot; lokalt.
          </p>
        </section>
        <section className="rounded-2xl border border-slate-600/60 bg-slate-900/50 p-6">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-indigo-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Omnira Office - Unreal</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Den nya Unreal-v&auml;rlden med din karakt&auml;r, Pling, Nova och reggaebaren.
            V0.82 &auml;r fortfarande under utveckling.
          </p>
          <p className="mt-6 rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
            Starta tills vidare via v0.82-startfilen p&aring; datorn.
            Direkt&ouml;ppning via Nova Desktop byggs separat.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            En webbsida startar inte lokala program direkt. Det kr&auml;ver en betrodd desktopkoppling.
          </p>
        </section>
      </div>
    </main>
  )
}
