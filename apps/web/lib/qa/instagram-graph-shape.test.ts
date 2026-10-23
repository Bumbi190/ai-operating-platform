import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMediaInsights } from '../media/insights'

afterEach(() => vi.unstubAllGlobals())

describe('Instagram Graph metric shapes', () => {
  it('supports values and total_value safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { name: 'reach', total_value: { value: 230 } },
        { name: 'views', values: [{ value: 540 }] },
        { name: 'saved', total_value: { value: 0 } },
        { name: 'shares', values: [] },
        { name: 'likes', values: [{ value: -5 }] },
      ] }),
    }))
    const result = await fetchMediaInsights('123456', 'example')
    expect(result.ok).toBe(true)
    expect(result.metrics).toEqual({ reach: 230, views: 540, saved: 0 })
  })

  it('leaves missing metrics unknown rather than zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [] }),
    }))
    const result = await fetchMediaInsights('123456', 'example')
    expect(result.ok).toBe(true)
    expect(result.metrics).toEqual({})
  })
})
