import * as React from 'react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CommunicationsOverview } from '@/lib/handlarborsen/communications-overview'

const number = (value: number | null) =>
  value === null ? 'Ej tillgängligt' : new Intl.NumberFormat('sv-SE').format(value)

function observed(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Tidpunkt ej tillgänglig'
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm',
  }).format(new Date(value))
}

function Count({ label, value, note }: { label: string; value: number | null; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
    <dt className="text-sm text-slate-300">{label}</dt>
    <dd className="mt-2 text-3xl font-semibold text-white" data-available={value !== null}>
      {number(value)}
    </dd>
    <p className="mt-2 text-xs leading-relaxed text-slate-400">{note}</p>
  </div>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
    <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
    {children}
  </section>
}

const processLabels: Record<string, string> = {
  awaiting_review: 'Inväntar granskning i processen',
  queued: 'Köad', running: 'Bearbetas', needs_input: 'Behöver underlag',
  failed: 'Misslyckad', reconciling: 'Avstämning pågår', cancelled: 'Avbruten',
}
const approvalLabels: Record<string, string> = {
  approved: 'Godkänt utkast', pending: 'Inväntar godkännande',
  rejected: 'Avslaget', returned: 'Återsänt', expired: 'Utgånget',
  cancelled: 'Avbrutet', superseded: 'Ersatt',
  no_current_draft: 'Inget aktuellt utkast', no_approval: 'Inget godkännande',
}
const sendLabels: Record<string, string> = {
  smtp_accepted: 'Accepterat av SMTP (ej leverans)',
  queued: 'Köat', claimed: 'Reserverat', dispatching: 'Sändning pågår',
  failed_before_send: 'Misslyckat före sändning',
  delivery_unknown: 'Leverans okänd',
  cancelled: 'Avbrutet', no_send_job: 'Inget skickajobb',
  no_current_draft: 'Inget aktuellt utkast',
}

export function HandlarborsenCommunications({
  projectSlug, view,
}: {
  projectSlug: string
  view: CommunicationsOverview
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-100 sm:px-6">
      <header className="space-y-3">
        <Link href={'/projects/' + encodeURIComponent(projectSlug)}
          className="inline-flex text-sm text-sky-300 hover:underline">
          Tillbaka till Handlarbörsen
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Kommunikation</h1>
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-300">Endast läsning</span>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
          En gemensam statusvy över Handlarbörsens befintliga inkorg, AI-svar och uppföljningsregler.
          Vyn kan inte läsa mejltexter, godkänna utkast, ändra kontakter eller skicka mejl.
        </p>
      </header>

      <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.08] p-4 text-sm text-amber-100" role="note">
        CRM-flaggorna <strong>confirmed</strong> och <strong>suppressed</strong> kan överlappa.
        Ett godkänt svarsutkast innebär inte utskickstillstånd. SMTP-acceptans är aldrig bevis på mottagarleverans.
      </div>

      <Panel title="Läget just nu">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Count label="Synkade inkorgsmeddelanden" value={view.inboxMessages}
            note="Lagrade meddelandeposter, inte olästa mejl. Ingen brödtext visas." />
          <Count label="Anslutna postlådor" value={view.mailboxConnections}
            note="Antal registrerade anslutningar, inte en garanti för aktuell IMAP-anslutning." />
          <Count label="Aktuella AI-svarsutkast" value={view.currentDrafts}
            note="Enbart aktuella revisioner; historiska utkast räknas separat." />
          <Count label="Reply-jobb: awaiting_review" value={view.awaitingReview}
            note="Processstatus, inte själva utkastets godkännandestatus." />
          <Count label="Aktuella godkända utkast" value={view.approvedCurrentDrafts}
            note="Redaktionellt godkännande, inte nytt tillstånd att kontakta mottagare." />
          <Count label="SMTP-acceptans på aktuellt utkast" value={view.smtpAcceptedCurrentDrafts}
            note="Servern accepterade ett skickajobb. Ingen leverans eller läsning är bekräftad." />
        </dl>
      </Panel>

      <Panel title="Svarskedjan – olika statusdimensioner">
        {view.stages === null ? (
          <p role="status" className="text-sm text-amber-200">Svarskedjan kunde inte läsas. Inga statusar antas vara noll.</p>
        ) : view.stages.length === 0 ? (
          <p className="text-sm text-slate-300">Inga reply-jobb finns registrerade i den lästa källan.</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden" aria-label="Svarskedjans statusar på mobil">
              {view.stages.map((stage) => (
                <dl key={[stage.replyJobStatus, stage.currentApprovalStatus, stage.currentSendStatus].join(':')}
                  className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
                    <dt className="text-xs font-semibold text-slate-400">Antal</dt>
                    <dd className="font-semibold tabular-nums text-white">{number(stage.count)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Bearbetning</dt>
                    <dd className="mt-1 text-sm text-white">{processLabels[stage.replyJobStatus] ?? 'Okänd processstatus'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Godkännande</dt>
                    <dd className="mt-1 text-sm text-white">{approvalLabels[stage.currentApprovalStatus] ?? 'Okänd godkännandestatus'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">SMTP-koppling</dt>
                    <dd className="mt-1 text-sm text-white">{sendLabels[stage.currentSendStatus] ?? 'Okänd SMTP-status'}</dd>
                  </div>
                </dl>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">Grupperad processstatus, godkännande och kopplat SMTP-jobb</caption>
              <thead className="border-b border-white/15 text-slate-400">
                <tr><th scope="col" className="py-3 pr-4">Bearbetning</th><th scope="col" className="py-3 pr-4">Godkännande</th>
                  <th scope="col" className="py-3 pr-4">SMTP-koppling</th><th scope="col" className="py-3 text-right">Antal</th></tr>
              </thead>
              <tbody>
                {view.stages.map((stage) => <tr key={[stage.replyJobStatus, stage.currentApprovalStatus, stage.currentSendStatus].join(':')}
                  className="border-b border-white/10">
                  <td className="py-3 pr-4">{processLabels[stage.replyJobStatus] ?? 'Okänd processstatus'}</td>
                  <td className="py-3 pr-4">{approvalLabels[stage.currentApprovalStatus] ?? 'Okänd godkännandestatus'}</td>
                  <td className="py-3 pr-4">{sendLabels[stage.currentSendStatus] ?? 'Okänd SMTP-status'}</td>
                  <td className="py-3 text-right tabular-nums">{number(stage.count)}</td>
                </tr>)}
              </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-slate-400">Svarskedjan är en separat läsning med upp till 200 metadataobjekt per källa. Tidigare revisioner blandas inte ihop med det aktuella utkastet.</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sändpolicy och leverans">
          {view.policy === null ? (
            <p className="text-sm text-amber-200">Sändpolicy kunde inte verifieras.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt>Registrerade policies</dt><dd>{number(view.policy.total)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Aktiverade och ej utgångna</dt><dd>{number(view.policy.enabledUnexpired)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Aktiverade men utgångna</dt><dd>{number(view.policy.enabledButExpired)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Inaktiva</dt><dd>{number(view.policy.disabled)}</dd></div>
            </dl>
          )}
          <p className="mt-4 text-sm text-amber-100">Den här vyn ger aldrig sändbehörighet, inte ens om en policy skulle vara giltig. Mottagarleverans är inte verifierad.</p>
        </Panel>

        <Panel title="Uppföljningar">
          {view.timing === null ? (
            <p className="text-sm text-slate-300">Ingen verifierbar aktuell timingregel att visa.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt>Minsta väntetid</dt>
                <dd>{view.timing.minWaitSeconds % 86400 === 0
                  ? view.timing.minWaitSeconds / 86400 + ' dygn'
                  : view.timing.minWaitSeconds + ' sekunder'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Högsta antal påminnelser</dt><dd>{view.timing.maxReminders}</dd></div>
            </dl>
          )}
          <p className="mt-4 text-sm text-slate-300">Registrerade säljjobb: <strong>{number(view.salesJobs)}</strong>. Detta mått är inte antalet påminnelser som faktiskt har skickats.</p>
          <p className="mt-2 text-xs text-slate-400">Timingregeln är konfiguration, inte bevis på behörighet eller att en uppföljning är planerad.</p>
        </Panel>
      </div>

      <Panel title="Kontaktspärrar">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Count label="Lagrade kontakter" value={view.contacts} note="CRM-poster, inte godkända mottagare." />
          <Count label="Suppressed" value={view.suppressedContacts} note="Spärrmarkering – inga automatiska utskick härifrån." />
          <Count label="Confirmed" value={view.confirmedContacts} note="Bekräftad metadata, inte samtycke eller sändrätt." />
          <Count label="Excluded" value={view.excludedContacts} note="Kan överlappa andra kontaktflaggor." />
        </dl>
      </Panel>

      <footer className="space-y-2 border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-400">
        <p>Inkorg/CRM observerat: {observed(view.salesObservedAt)}.
          Svarsstatus observerad: {observed(view.replyObservedAt)}.</p>
        <p>Datakällor: befintliga <code>handlarborsen_sales_overview</code> och <code>handlarborsen_reply_lifecycle</code>.
          De läser olika tabeller vid olika tidpunkter, inte ett atomärt ögonblicksfoto. Uppdatera sidan för en ny läsning.</p>
        <p>För granskning av individuella mejl och AI-svar behövs det separata, behörighetsstyrda arbetsflödet.
          Ingen ny sändmotor, import eller automatisk uppföljning aktiveras här.</p>
      </footer>
    </main>
  )
}
