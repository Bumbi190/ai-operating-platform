/**
 * Backtest Lab v2: presentation guards for authored trade markers only.
 * No assertion here claims detected strategies, fills or financial results.
 */
import { describe, expect, it } from 'vitest'
import { APPROVED_FIXTURE_DEMO_HTML as html } from '@/lib/backtest-lab/approved-fixture-demo'

const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? ''
const fixtureJson = html.match(/<script id="fixture" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
if (!fixtureJson) throw new Error('Missing explicitly-authored fixture')
const data = JSON.parse(fixtureJson)

describe('Backtest Lab v2 – trade explanations, chronology and sandbox', () => {
  it('has a keyboard/screen-reader accessible current-trade explanation and three lifecycle stages', () => {
    for (const token of ['id="tradeLive"', 'aria-live="polite"',
      'id="tradeState"', 'id="tradeDetail"', 'id="tradeCase"',
      'id="stageSignal"', 'id="stageEntry"', 'id="stageExit"',
      'id="liveEntry"', 'id="liveStop"', 'id="liveTarget"']) expect(html).toContain(token)
  })

  it('visually distinguishes entry, stop, target and ambiguous exit', () => {
    for (const label of ['LONG IN', 'TP HIT', 'SL HIT', 'OSÄKERT', 'Target-zon', 'Stop-zon'])
      expect(html).toContain(label)
    expect(html).toContain('rgba(101,221,187,.16)')
    expect(html).toContain('rgba(247,112,143,.15)')
  })

  it('does not display an entry or price levels before the authored entry candle', () => {
    expect(script).toContain('if(t.entryIndex>n)continue')
    expect(script).toContain('if(t.entryIndex>n)continue')
    expect(script).toContain("n>=t.entryIndex?t.entryPrice:'—'")
    expect(script).toContain("n>=t.entryIndex?t.stopPrice+' / '+t.targetPrice:'—'")
    expect(script).toContain("const observed=t&&n>=t.entryIndex")
  })

  it('does not display exit markers until the authored exit candle', () => {
    expect(script).toContain('if(t.exitIndex===null||t.exitIndex>n)continue')
    expect(script).toContain('if(n<t.exitIndex)')
    expect(script).toContain("t.status==='TARGET'")
  })

  it('distinguishes unknown intrabar outcome from a win or loss', () => {
    expect(script).toContain('OSÄKERT UTFALL')
    expect(script).toContain('Ingen vinst eller förlust bokförs')
    expect(data.trades[2].status).toBe('AMBIGUOUS_INTRABAR')
    expect(data.trades[2].rMultiple).toBeNull()
  })

  it('preserves identical authored candles and non-canonical performance data', () => {
    expect(data.bars).toHaveLength(45)
    expect(data.trades).toHaveLength(3)
    expect(data.metrics.unresolvedTrades).toBe(1)
    expect(data.metrics.netKnownR).toBe(0.5)
    expect(data.marketData).toBe('SYNTHETIC')
    expect(data.tradeExecutionPermitted).toBe(false)
    expect(data.usesCanonicalLiquidityManipulation).toBe(false)
  })

  it('adds no network access or new external script dependencies', () => {
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i)
    expect(html).not.toMatch(/<link[^>]*href=["']https?:/i)
    expect(script).not.toMatch(/\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|process\.env/)
    expect(script).toContain('updateTradeStory()')
  })

  it('supports reduced-motion accessibility and explicit color-independent markers', () => {
    expect(html).toContain('prefers-reduced-motion:no-preference')
    expect(html).toContain('1. SIGNAL')
    expect(html).toContain('2. ENTRY')
    expect(html).toContain('3. EXIT')
    expect(html).toContain('LIVE')
  })
})
