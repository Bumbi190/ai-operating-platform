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
import type { Metadata } from 'next'
import { AtlasMarketView } from '@/components/platform/trading/AtlasMarketView'
import { OSPage } from '@/components/platform/os'

export const metadata: Metadata = {
  title: 'Trading · Atlas Market View · Omnira',
}

export default function TradingPage() {
  return (
    <OSPage density="comfortable">
      <AtlasMarketView />
    </OSPage>
  )
}
