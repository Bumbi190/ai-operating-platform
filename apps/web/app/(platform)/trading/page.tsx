/**
 * /trading — Omnira Trading System · Atlas Market View.
 *
 * Auth: enforced by the (platform) layout, which redirects to /login without a
 * session. The page carries no server data at all: Stage 1 renders deterministic
 * fixtures built in the client from a pure, seeded function, so there is nothing
 * here to scope, no query to authorize, and no provider to reach.
 *
 * SCOPE — the Trading project is DEVELOPMENT / READ ONLY.
 *
 * There is no execution provider connected, no market-data provider connected,
 * and no order path anywhere in this build. The Level 1 adapter contract that
 * Fas 2 will implement has fifteen methods and zero order methods; none of them
 * is implemented yet either. Nothing on this page can send anything anywhere.
 */

import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AtlasMarketView } from '@/components/platform/trading/AtlasMarketView'
import { OSPage } from '@/components/platform/os'

export const metadata: Metadata = {
  title: 'Trading · Atlas Market View · Omnira',
}

export default function TradingPage() {
  return (
    <OSPage density="comfortable">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Trading · Live & Paper-workspace</p>
          <p className="text-xs text-slate-400">
            Atlas Market View är fortfarande utvecklings-/observationsläge med syntetiska fixtures.
            Ingen broker, paperorder eller liveorder är aktiv.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/trading/backtest-data"
            className="rounded-lg border border-teal-500/60 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-teal-200 hover:bg-teal-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
          >
            Backtest · Riktiga historiska candles →
          </Link>
          <Link
            href="/trading/backtest-lab"
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
          >
            Syntetisk design-demo
          </Link>
        </div>
      </div>
      <AtlasMarketView />
    </OSPage>
  )
}
