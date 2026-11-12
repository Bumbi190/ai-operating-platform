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
            Bes&ouml;k kontoret med din karakt&auml;r, Nova, Pling och projektkontoren.
            &Ouml;ppna den aktuella Unreal-v&auml;rlden i ett eget f&ouml;nster p&aring; din dator.
          </p>
          <a
            href="omnira-office://open"
            aria-describedby="unreal-office-help"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-600/25 px-4 py-2 font-medium text-indigo-100 transition hover:bg-indigo-600/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300"
          >
            &Ouml;ppna Unreal Office <ExternalLink size={17} aria-hidden="true" />
          </a>
          <p id="unreal-office-help" className="mt-4 text-xs leading-relaxed text-slate-400">
            Kr&auml;ver Windows-datorn d&auml;r Office och den lokala Office-startaren &auml;r installerade.
            Webbl&auml;saren kan fr&aring;ga om du vill &ouml;ppna Omnira Office.
            &Auml;r kontoret redan &ouml;ppet &aring;teranv&auml;nds det f&ouml;nstret.
          </p>
          <details className="mt-4 text-xs leading-relaxed text-slate-400">
            <summary className="cursor-pointer text-indigo-200">Om Office inte &ouml;ppnas</summary>
            <p className="mt-2">
              Till&aring;t &ouml;ppningen om webbl&auml;saren fr&aring;gar. Du kan &auml;ven starta
              genv&auml;gen &quot;Omnira Office - Besok Nova i Unreal&quot; p&aring; skrivbordet.
              P&aring; en annan dator beh&ouml;ver Office och startaren installeras f&ouml;rst.
            </p>
          </details>
        </section>
      </div>
    </main>
  )
}
