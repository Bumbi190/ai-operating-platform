/**
 * PHASE 4E2 — the global API-key auth chain is gone from the codebase.
 *
 * This is the last lock in a four-phase retirement, and each phase closed a
 * different kind of exposure:
 *
 *   4B  HTTP capability     no route accepts the key
 *   4C  consumer + secret   Familje-Stunden neither reads nor holds it
 *   4D  runtime config      no Vercel env record, active runtimes rebuilt
 *   4E  verifier + plaintext  the helper itself, and the local env copies
 *
 * What this file owns is the LAST one: that the verifier cannot come back
 * unnoticed, and that deleting it did not take the cron class with it.
 *
 * ── WHY THIS ASSERTS ON DEFINITIONS, NOT SUBSTRINGS ──────────────────────────
 *
 * `AIOPS_API_KEY` still appears legitimately in this repository: negative
 * regression tests set it to prove it is refused, and several route comments
 * state that it grants nothing. A substring check for the identifier would trip
 * over its own documentation and push future maintainers toward deleting the
 * comments that make the invariant legible. So the assertions target
 * DEFINITIONS and ENV READS — the things that would actually restore
 * capability.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')
const API_AUTH = 'lib/api-auth.ts'

/**
 * `execFileSync` with an argv, never a shell string: the repository path
 * contains spaces ("AI Operating Platform"), and a shell-interpolated `find`
 * word-splits into non-existent paths — making the scan silently empty and the
 * assertion unfalsifiable. That exact bug has already been found twice here.
 */
const routeFiles = () => {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
  return execFileSync('find', [`${WEB_ROOT}/app/api`, '-name', 'route.ts'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
}

describe('the global key verifier is gone', () => {
  it('api-auth.ts defines neither helper', () => {
    const src = read(API_AUTH)
    expect(src).not.toMatch(/export\s+function\s+requireApiKey/)
    expect(src).not.toMatch(/export\s+async\s+function\s+requireUserOrApiKey/)
    expect(src).not.toMatch(/function\s+timingSafeEqualStr/)
  })

  it('api-auth.ts reads no global key from the environment', () => {
    expect(read(API_AUTH)).not.toContain('process.env.AIOPS_API_KEY')
  })

  it('no PRODUCTION module defines the helpers', () => {
    // Scoped to production on purpose. The test files below contain the string
    // `export function requireApiKey` inside their own NEGATIVE assertions, so
    // an unscoped scan matches its own proof and can never pass. That is the
    // broad-substring trap this suite is written to avoid.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let out = ''
    try {
      out = execFileSync('grep', [
        '-rlE', 'export (async )?function require(Api|UserOrApi)Key',
        `${WEB_ROOT}/app`, `${WEB_ROOT}/lib`,
      ], { encoding: 'utf8' })
    } catch (e) {
      const err = e as { status?: number }
      if (err.status !== 1) throw e   // 1 = no match at all, which passes
    }
    const production = out.trim().split('\n').filter(Boolean).filter(f => !f.includes('/qa/'))
    expect(production).toEqual([])
  }, 20_000)

  it('no production module reads the global key from the environment', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let out = ''
    try {
      out = execFileSync('grep', ['-rl', 'process.env.AIOPS_API_KEY', `${WEB_ROOT}/app`, `${WEB_ROOT}/lib`],
        { encoding: 'utf8' })
    } catch (e) {
      const err = e as { status?: number }
      if (err.status !== 1) throw e   // 1 = no match, which is the pass
    }
    const production = out.trim().split('\n').filter(Boolean).filter(f => !f.includes('/qa/'))
    expect(production).toEqual([])
  })
})

describe('no route can reach a global key path', () => {
  it('finds route files at all — the scan must be able to fail', () => {
    expect(routeFiles().length).toBeGreaterThan(20)
  })

  it('zero routes call the helpers, directly or via one hop', () => {
    const reaching = routeFiles().filter(f => {
      const src = readFileSync(f, 'utf8')
      if (/require(Api|UserOrApi)Key\s*\(/.test(src)) return true
      for (const m of src.matchAll(/from '@\/(lib\/[a-z0-9/-]+)'/g)) {
        const dep = resolve(WEB_ROOT, `${m[1]}.ts`)
        if (existsSync(dep) && /require(Api|UserOrApi)Key\s*\(/.test(readFileSync(dep, 'utf8'))) return true
      }
      return false
    }).map(f => f.replace(`${WEB_ROOT}/app/api`, '').replace('/route.ts', ''))
    expect(reaching).toEqual([])
  })

  it('zero route files import from api-auth for anything but cron', () => {
    const importers = routeFiles().filter(f => /from '@\/lib\/api-auth'/.test(readFileSync(f, 'utf8')))
    for (const f of importers) {
      expect(readFileSync(f, 'utf8')).toMatch(/requireCronAuth/)
    }
  })
})

describe('the cron class survived the deletion', () => {
  it('api-auth.ts still exports requireCronAuth over CRON_SECRET', () => {
    const src = read(API_AUTH)
    expect(src).toContain('export function requireCronAuth')
    expect(src).toContain('process.env.CRON_SECRET')
  })

  it('requireCronAuth is still fail-closed on a missing secret', () => {
    // The property, not the wording: no secret must mean no pass. Asserted on
    // source because the helper has no production caller to drive.
    const src = read(API_AUTH)
    const fn = src.slice(src.indexOf('export function requireCronAuth'))
    expect(fn).toMatch(/if\s*\(!cronSecret\)/)
    expect(fn).toContain('status: 500')
    expect(fn).toContain('status: 401')
  })

  it('the AuthResult shape requireCronAuth returns is still defined', () => {
    const src = read(API_AUTH)
    expect(src).toContain('type AuthResult')
    expect(src).toContain('interface AuthOk')
    expect(src).toContain('interface AuthFail')
  })

  it('cron routes still read CRON_SECRET — the class is in use', () => {
    const cron = routeFiles().filter(f => /process\.env\.CRON_SECRET/.test(readFileSync(f, 'utf8')))
    expect(cron.length).toBeGreaterThan(10)
  })
})

describe('other constant-time comparisons are untouched', () => {
  /**
   * Only api-auth's private helper was deleted. Three unrelated
   * implementations exist and a broad crypto refactor was explicitly out of
   * scope — this catches one being swept up by a future cleanup.
   */
  it('the credential verifier keeps its own constant-time compare', () => {
    const src = read('lib/auth/project-api-credentials.ts')
    expect(src).toContain('timingSafeEqual')
    expect(src).toContain('export function secretHashMatches')
  })

  it('the webhook signature checks keep theirs', () => {
    expect(read('app/api/webhooks/stripe/route.ts')).toContain('timingSafeEqual')
    expect(read('app/api/webhooks/instagram/route.ts')).toContain('timingSafeEqual')
  })

  it('api-auth no longer needs a crypto import', () => {
    expect(read(API_AUTH)).not.toMatch(/^import crypto/m)
  })
})
