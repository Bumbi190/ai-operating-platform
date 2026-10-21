import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
describe('workspace routes ship in the tracked tree', () => {
  it.each(['build/page.tsx', 'build/[sessionId]/page.tsx'])('tracks %s with the exact source tested locally', route => {
    const path = 'apps/web/app/(platform)/projects/[slug]/' + route
    expect(() => execFileSync('git', ['ls-files', '--error-unmatch', '--', ':(literal)' + path], { cwd: resolve('../..'), stdio: 'pipe' })).not.toThrow()
    const staged = execFileSync('git', ['show', ':' + path], { cwd: resolve('../..'), encoding: 'utf8' })
    expect(staged).toBe(readFileSync(resolve('../..', path), 'utf8').replaceAll('\r\n', '\n'))
  })
})
