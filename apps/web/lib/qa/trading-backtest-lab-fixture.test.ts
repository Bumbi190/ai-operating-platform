/**
 * Backtest Lab – no bridge from a scripted fixture to execution authority.
 * Kept in lib/qa so it is discovered by the normal Omnira Vitest runner.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APPROVED_FIXTURE_DEMO_HTML } from '@/lib/backtest-lab/approved-fixture-demo'

const APP_ROOT = resolve(import.meta.dirname, '../..')
const page = readFileSync(resolve(APP_ROOT, 'app/(platform)/trading/backtest-lab/page.tsx'), 'utf8')
const tradingPage = readFileSync(resolve(APP_ROOT, 'app/(platform)/trading/page.tsx'), 'utf8')
const layout = readFileSync(resolve(APP_ROOT, 'app/(platform)/layout.tsx'), 'utf8')
const scriptData = /<script id="fixture" type="application\/json">([\s\S]+?)<\/script>/.exec(APPROVED_FIXTURE_DEMO_HTML)
if (!scriptData) throw new Error('Approved fixture JSON must exist')
const fixture = JSON.parse(scriptData[1])

describe('isolated trading Backtest Lab – authenticated, fixture-only', () => {
  it('does not publish the HTML as a public static asset', () => {
    expect(page).toContain('APPROVED_FIXTURE_DEMO_HTML')
    expect(page).toContain('srcDoc={APPROVED_FIXTURE_DEMO_HTML}')
    expect(page).not.toMatch(/src=["']\/backtest/)
    expect(page).not.toContain("public/")
  })

  it('inherits the real platform auth layout', () => {
    expect(layout).toContain('supabase.auth.getUser()')
    expect(layout).toContain("redirect('/login')")
    expect(page).toContain('SYNTETISK TESTMILJÖ')
  })

  it('isolates the iframe script without same-origin, popups, forms or navigation', () => {
    const attributes = /<iframe[\s\S]*?sandbox="([^"]+)"/.exec(page)
    expect(attributes?.[1]).toBe('allow-scripts')
    expect(attributes?.[1]).not.toMatch(/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/)
    expect(page).toContain('referrerPolicy="no-referrer"')
  })

  it('makes the demo accessible from Trading without replacing AtlasMarketView', () => {
    expect(tradingPage).toContain('href="/trading/backtest-lab"')
    expect(tradingPage).toContain('<AtlasMarketView />')
  })

  it('embeds only explicitly synthetic preauthored market and trade fixtures', () => {
    expect(fixture.policy).toBe('SYNTHETIC_DEMONSTRATION_ONLY')
    expect(fixture.marketData).toBe('SYNTHETIC')
    expect(fixture.usesCanonicalLiquidityManipulation).toBe(false)
    expect(fixture.tradeExecutionPermitted).toBe(false)
    expect(fixture.feesAndSlippage).toBe('NOT_MODELLED')
    expect(fixture.bars).toHaveLength(45)
    expect(fixture.trades.map((trade: { status: string }) => trade.status)).toEqual([
      'TARGET', 'STOP', 'AMBIGUOUS_INTRABAR',
    ])
  })

  it('never promotes ambiguous intrabar fills to profits', () => {
    expect(fixture.trades[2].rMultiple).toBeNull()
    expect(fixture.metrics.unresolvedTrades).toBe(1)
    expect(fixture.metrics.determinateTrades).toBe(2)
    expect(fixture.metrics.financialNetUSD).toBeNull()
  })

  it('runs without external scripts, URLs or API dependencies', () => {
    expect(APPROVED_FIXTURE_DEMO_HTML).not.toMatch(/<script[^>]+src=/i)
    expect(APPROVED_FIXTURE_DEMO_HTML).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(APPROVED_FIXTURE_DEMO_HTML).not.toMatch(/\bfetch\s*\(/)
    expect(APPROVED_FIXTURE_DEMO_HTML).not.toMatch(/\bWebSocket\b/)
    expect(APPROVED_FIXTURE_DEMO_HTML).not.toMatch(/\bXMLHttpRequest\b/)
    expect(APPROVED_FIXTURE_DEMO_HTML).toContain('INTE RIKTIG BACKTEST')
  })
})
