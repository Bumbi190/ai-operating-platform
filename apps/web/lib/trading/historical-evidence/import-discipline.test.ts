/**
 * Historic evidence orchestration must never become an authority or provider.
 * Positive controls ensure these guards check the real production module.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(HERE,'historical-bucket-evidence.ts'),'utf8')
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/(^|[^:])\/\/.*$/gm,'$1')

describe('historical-evidence package stays read-only',()=>{
  it('positive control reads the actual production source',()=>{
    expect(source).toContain('readHistoricalBucketEvidence')
    expect(source).toContain('evaluateBucketEvidence')
    expect(source.length).toBeGreaterThan(1500)
  })

  it('imports only established domain leaves, not execution or provider runtimes',()=>{
    const imports=[...source.matchAll(/from\s+'([^']+)'/g)].map(m=>m[1]).sort()
    expect(imports).toEqual([
      '../contract-identity',
      '../market-data',
      '../session-calendar',
      '../time',
    ])
    expect(source).not.toMatch(/trading\/internal|\.\.\/internal/)
  })

  it('has no network, credential, broker or mutable orders',()=>{
    for(const p of [
      /\bfetch\s*\(/, /\bWebSocket\b/, /\baxios\b/, /https?:\/\//,
      /process\.env/, /apiKey/, /password/, /\bsecret\b/i,
      /\bsubmitOrder\b/, /\bplaceOrder\b/, /\bcancelOrder\b/,
      /\bmodifyOrder\b/, /\bclosePosition\b/,
    ]) expect(source).not.toMatch(p)
  })

  it('mints no trading approval, signal or grade',()=>{
    for(const p of [
      /\bExecutionIntent\b/, /\bApprovalGrant\b/, /\bRiskClearance\b/,
      /\bPropClearance\b/, /\bStrategySignal\b/,
      /\bsetupGrade\b/, /\bTradeProposal\b/,
    ]) expect(source).not.toMatch(p)
  })

  it('has no host-time or random nondeterminism',()=>{
    for(const p of [/Date\.now\s*\(/,/new Date\s*\(/,/Math\.random\s*\(/,/setTimeout\s*\(/])
      expect(source).not.toMatch(p)
  })
})
