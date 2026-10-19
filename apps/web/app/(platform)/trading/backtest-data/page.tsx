/**
 * /trading/backtest-data — local REAL OHLCV replay workspace, not an order system.
 *
 * Auth inherits the (platform) layout redirect, like /trading/backtest-lab.
 * No public JSON endpoint is added. Local files are read on the SERVER only.
 * In deployments with no OMNIRA_HISTORICAL_DATA_DIR, the view stays empty.
 */
import Link from 'next/link'
import type {Metadata} from 'next'
import {loadLocalHistoricalDay} from '@/lib/trading/historical/local-history'
import {HistoricalBacktestView} from '@/components/platform/trading/HistoricalBacktestView'

export const dynamic='force-dynamic'
export const runtime='nodejs'
export const metadata:Metadata={
  title:'Backtest · Riktig NQ/ES-historik · Omnira',
  description:'Historisk candlestick-replay i Trading. Ej live eller exekvering.',
}

export default function RealHistoricalBacktestPage(){
  const data=loadLocalHistoricalDay()
  return (
    <main className="mx-auto flex w-full max-w-[1850px] flex-col gap-3 px-3 pb-6 pt-4 sm:px-5">
      <nav aria-label="Tradinglägen" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-[#102036] p-3 text-sm">
       <Link href="/trading" className="rounded-md border border-slate-600 px-3 py-2 text-slate-200 hover:bg-slate-800">← Trading / Live & Paper (ej aktiverade)</Link>
       <span aria-current="page" className="rounded-md bg-teal-700 px-3 py-2 font-semibold text-white">Backtest · Historik</span>
       <Link href="/trading/backtest-lab" className="rounded-md border border-slate-600 px-3 py-2 text-slate-300 hover:bg-slate-800">Design-demo · Syntetisk</Link>
      </nav>
      {data.status==='READY'&&data.value
       ?<HistoricalBacktestView dataset={data.value}/>
       :<section className="rounded-2xl border border-amber-700/40 bg-[#102036] p-6">
         <h1 className="text-xl font-bold text-white">Backtest · historisk NQ/ES-graf</h1>
         <p className="mt-2 text-sm text-slate-300">
          Den här separata vyn är klar för verifierad historik men ingen fullständig lokal NQ/ES-import är tillgänglig just nu.
         </p>
         <p className="mt-2 text-xs text-amber-200">
          Status: {data.status}. Ingen automatisk API-hämtning görs när sidan öppnas. Ingen handel aktiveras.
         </p>
         <p className="mt-4 text-sm text-slate-400">
          På stationära används en privat, validerad importkatalog via miljövariabeln OMNIRA_HISTORICAL_DATA_DIR.
          Prisdata publiceras inte till Vercel eller i GitHub.
         </p>
        </section>}
    </main>
  )
}
