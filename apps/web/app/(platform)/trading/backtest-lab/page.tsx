/**
 * /trading/backtest-lab – authenticated synthetic fixture review workspace.
 *
 * Parent (platform) layout enforces login. All data are author-created, not
 * actual CME data or evaluated Liquidity Manipulation strategy signals.
 * This route adds zero providers, server actions, API calls or order controls.
 *
 * The approved standalone HTML is isolated with an opaque sandboxed origin;
 * no allow-same-origin, top-navigation, forms or popups capability is granted.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { APPROVED_FIXTURE_DEMO_HTML } from '@/lib/backtest-lab/approved-fixture-demo'

export const metadata: Metadata = {
  title: 'Backtest Lab · Syntetisk demo · Omnira',
  description: 'Inloggad forskningsvy med påhittad replay. Inga riktiga handelsresultat.',
}

export default function SyntheticBacktestLabPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-3 pb-5 pt-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/trading"
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
        >
          ← Tillbaka till Trading
        </Link>
        <span className="rounded-full border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-200">
          SYNTETISK TESTMILJÖ · EJ RIKTIG BACKTEST
        </span>
      </div>
      <iframe
        title="Omnira Backtest Lab – syntetisk interaktiv replay"
        srcDoc={APPROVED_FIXTURE_DEMO_HTML}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full rounded-2xl border border-slate-700 bg-[#080d17]"
        style={{ height: 'max(880px, 84vh)' }}
        data-testid="synthetic-backtest-lab-frame"
      />
      <p className="text-xs leading-5 text-slate-400">
        Detta är samma interaktiva demodesign som granskats i mobil. Alla
        testaffärer är författade i förväg. Verkliga NQ/ES-priser, licenser,
        godkända mönsterregler och oberoende resultatutvärdering saknas.
      </p>
    </main>
  )
}
