import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
async function factory() {
  const url = pathToFileURL(join(process.cwd(), '../../scripts/ci/full-web-fixture.mjs')).href
  return (await import(url)).makeFixtureRunner
}
function state() {
  const root = mkdtempSync(join(tmpdir(), 'omnira-full-web-safety-')); roots.push(root)
  return { root, env: { CI: 'true', GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: root, GITHUB_ENV: join(root, 'env') } }
}
describe('Full Web disposable fixture safety', () => {
  it('refuses a pre-existing compatibility name rather than reusing another task’s database', async () => {
    const make = await factory(), { root, env } = state(), commands: string[][] = []
    const runner = make({ env, execute: (args: string[]) => { commands.push(args); return { status: 0, stdout: 'already-exists', stderr: '' } } })
    expect(() => runner.prepare()).toThrow(/existing fixture/i)
    expect(commands.some(args => ['create', 'start', 'exec', 'rm'].includes(args[0]))).toBe(false)
    expect(() => readFileSync(join(root, 'full-web-fixture.json'))).toThrow()
  })
  it('refuses cleanup when recorded identity belongs to a different run', async () => {
    const make = await factory(), { root, env } = state(), commands: string[][] = [], id = 'a'.repeat(64)
    const record = JSON.stringify({ id, image: 'sha256:' + 'b'.repeat(64), run: '123456-1' })
    writeFileSync(join(root, 'full-web-fixture.json'), record)
    const foreign = { Id: id, Image: 'sha256:' + 'b'.repeat(64), Config: { Labels: { 'com.omnira.full-web-run': 'another-run' } } }
    const runner = make({ env, execute: (args: string[]) => { commands.push(args); return { status: 0, stdout: JSON.stringify([foreign]), stderr: '' } } })
    expect(() => runner.cleanup()).toThrow(/ownership/i)
    expect(commands.some(args => args[0] === 'rm')).toBe(false)
    expect(readFileSync(join(root, 'full-web-fixture.json'), 'utf8')).toBe(record)
  })
  it.each(['DOCKER_HOST', 'DOCKER_CONTEXT'])('rejects %s overrides before any Docker command', async key => {
    const make = await factory(), { env } = state(), commands: string[][] = []
    expect(() => make({ env: { ...env, [key]: key === 'DOCKER_HOST' ? 'tcp://remote.invalid:2375' : 'remote' }, execute: (args: string[]) => { commands.push(args); throw Error('Unexpected Docker call') } })).toThrow(/Docker.*override/i)
    expect(commands).toEqual([])
  })
})
