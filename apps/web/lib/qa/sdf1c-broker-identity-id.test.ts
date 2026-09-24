/** SDF-1C1A: the native Keychain helper only ever receives a canonical UUID identity id. */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile }))

import { MacKeychainIdentity } from '../../../code-broker/src/identity/keychain'

const helper = new MacKeychainIdentity('/nonexistent/omnira-broker-identity')
const PUBLIC_RESULT = JSON.stringify({
  identityId: '00000000-0000-4000-8000-000000000001', keyThumbprint: 'T'.repeat(43), storage: 'keychain',
  publicJwk: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) },
})

beforeEach(() => {
  execFile.mockReset()
  execFile.mockImplementation((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, value?: unknown) => void) =>
    callback(null, { stdout: PUBLIC_RESULT }))
})

describe('SDF-1C1A native helper identity id validation', () => {
  const MALFORMED: Record<string, string> = {
    'all hyphens (36 chars)': '-'.repeat(36),
    'all hex, no hyphens (36 chars)': 'a'.repeat(36),
    'wrong grouping': 'aaaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa',
    'hyphen in a group position of hex': '0000000-00000-4000-8000-000000000001',
    'invalid version nibble 0': '00000000-0000-0000-8000-000000000001',
    'invalid version nibble 9': '00000000-0000-9000-8000-000000000001',
    'invalid variant nibble 0': '00000000-0000-4000-0000-000000000001',
    'invalid variant nibble c': '00000000-0000-4000-c000-000000000001',
    'non-hex character': '0000000g-0000-4000-8000-000000000001',
    'trailing newline': '00000000-0000-4000-8000-000000000001\n',
    'shell metacharacters at length 36': '00000000-0000-4000-8000-0000000;rm-',
    'too long': '00000000-0000-4000-8000-0000000000010',
  }
  for (const [name, value] of Object.entries(MALFORMED)) {
    it(`rejects ${name} before execFile can be called`, async () => {
      await expect(helper.generate(value)).rejects.toThrow('invalid identity id')
      await expect(helper.publicIdentity(value)).rejects.toThrow('invalid identity id')
      await expect(helper.sign(value, 'payload')).rejects.toThrow('invalid identity id')
      expect(execFile).not.toHaveBeenCalled()
    })
  }

  it('accepts a normal randomUUID() and passes it through unchanged', async () => {
    const id = randomUUID()
    await helper.publicIdentity(id)
    expect(execFile).toHaveBeenCalledTimes(1)
    expect(execFile.mock.calls[0][1]).toEqual(['public', '--identity', id])
  })
})
