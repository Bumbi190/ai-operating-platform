/**
 * Atlas Creative P17: presentational, read-only, unmounted review preview.
 * Do NOT enable controls based on props, user-supplied data or model output.
 * Activation and approval routes are deliberately not part of this component.
 */
import type { CreativeReviewPreview } from '@/lib/media/creative-queue/review-preview.mjs'

export function CreativeEnrollmentReviewPreview({ preview }: {
  preview: CreativeReviewPreview
}) {
  return (
    <section aria-labelledby="creative-review-title"
      className="rounded-xl border border-slate-700 bg-slate-950 p-5 text-slate-100">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
          Atlas · Kreativa verktyg
        </p>
        <h2 id="creative-review-title" className="mt-1 text-lg font-semibold">
          Granska registrering av mediaarbetare
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Registreringen väntar på mänsklig granskning. Ingen redigering
          eller publicering är aktiverad.
        </p>
      </header>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">Arbetare</dt>
          <dd className="mt-1 break-all font-medium">{preview.workerId}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Status</dt>
          <dd className="mt-1 font-medium">Väntar på granskning</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-400">Begäran</dt>
          <dd className="mt-1 break-all font-mono text-xs">{preview.enrollmentId}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-400">Projekt som begäran gäller</dt>
          <dd className="mt-1">
            <ul className="space-y-1">
              {preview.projectIds.map(id => (
                <li key={id} className="break-all font-mono text-xs">{id}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-400">Publik nyckels SHA-256</dt>
          <dd className="mt-1 break-all font-mono text-xs">{preview.keySha256}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-400">Verifierat bevis SHA-256</dt>
          <dd className="mt-1 break-all font-mono text-xs">{preview.proofSha256}</dd>
        </div>
      </dl>
      <p className="mt-5 rounded-md border border-amber-700/50 bg-amber-950/30 p-3 text-sm">
        Förhandsgranskning: ett godkännande här skulle endast registrera
        ett granskningsbeslut. Det får aldrig starta Windows-kontot,
        utföra redigering eller publicera ett resultat.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled aria-disabled="true"
          className="cursor-not-allowed rounded-md bg-slate-600 px-4 py-2 text-sm opacity-60">
          Godkänn registrering (ej aktivt)
        </button>
        <button type="button" disabled aria-disabled="true"
          className="cursor-not-allowed rounded-md border border-slate-500 px-4 py-2 text-sm opacity-60">
          Neka registrering (ej aktivt)
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-400" role="status">
        Beslut är avstängda tills operatörsbehörighet, projektägande,
        signeringsnyckel och skyddat serveranrop har granskats.
      </p>
    </section>
  )
}
