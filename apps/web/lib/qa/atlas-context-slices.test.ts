import { describe, expect, it } from 'vitest'
import { readAtlasContextSlices } from '@/lib/atlas/context-slices'

describe('Atlas top-level context slices', () => {
  it('starts every independent source before any source settles', async () => {
    const started: string[] = []
    const releases: Array<() => void> = []
    const wait = (name: string, value: unknown) => new Promise<any>(resolve => {
      started.push(name)
      releases.push(() => resolve(value))
    })
    const pending = readAtlasContextSlices({
      live: () => wait('live', 'L'),
      tool: () => wait('tool', 'T'),
      action: () => wait('action', { text: 'A', hasRecentDelegation: true }),
      records: () => wait('records', 'R'),
    })
    await Promise.resolve()
    expect(started).toEqual(['live', 'tool', 'action', 'records'])
    releases.reverse().forEach(release => release())
    await expect(pending).resolves.toEqual({
      live: 'L', tool: 'T', action: 'A', records: 'R', hasRecentDelegation: true,
    })
  })

  it('degrades failures independently without changing output order', async () => {
    const result = await readAtlasContextSlices({
      live: async () => 'L',
      tool: async () => { throw new Error('down') },
      action: async () => ({ text: 'A', hasRecentDelegation: false }),
      records: async () => 'R',
    })
    expect(result).toEqual({
      live: 'L', tool: '', action: 'A', records: 'R', hasRecentDelegation: false,
    })
  })
})
