/**
 * Website-article FactCheck v1 — source intake (no network: reader injected).
 */

import { describe, expect, it } from 'vitest'
import {
  classifyHost, collectSources, pickCorroborating, safeSourceUrl, titleSimilarity, type SourceReader,
} from '@/lib/article/factcheck/sources'

const LONG = 'Acme released Model X on Tuesday with a new pricing tier and broader availability. '.repeat(10)
const NOW = () => new Date('2026-10-28T09:00:00.000Z')

describe('safeSourceUrl', () => {
  it.each([
    'http://theverge.com/a', 'https://user:pw@theverge.com/a', 'https://localhost/a', 'https://127.0.0.1/a',
    'https://10.0.0.5/a', 'https://192.168.1.1/x', 'https://169.254.169.254/latest', 'https://intranet.local/a',
    'https://8.8.8.8/a', 'javascript:alert(1)', 'not a url', '',
  ])('rejects %s', (u) => expect(safeSourceUrl(u)).toBeNull())

  it('accepts a public https URL', () => expect(safeSourceUrl('https://www.reuters.com/tech/x')?.hostname).toBe('www.reuters.com'))
})

describe('classifyHost', () => {
  it('uses the explicit table for primary sources and shared ownership', () => {
    expect(classifyHost('www.anthropic.com', 'corroborating')).toEqual({ group: 'anthropic', kind: 'primary' })
    expect(classifyHost('arstechnica.com', 'corroborating').group).toBe(classifyHost('www.wired.com', 'corroborating').group)
  })
  it('treats unknown hosts as reporting grouped by host', () => {
    expect(classifyHost('www.example-news.com', 'originating')).toEqual({ group: 'example-news.com', kind: 'originating_report' })
  })
})

describe('pickCorroborating', () => {
  const origin = { title: 'Acme launches Model X with lower pricing', url: 'https://www.theverge.com/acme' }
  it('picks same-story coverage from other publisher groups only', () => {
    const picks = pickCorroborating(origin, [
      { id: 'a', title: 'Acme launches Model X, cuts pricing', url: 'https://www.reuters.com/acme' },
      { id: 'b', title: 'Acme Model X launches with lower pricing', url: 'https://www.theverge.com/other' }, // same group as origin
      { id: 'c', title: 'Unrelated chip export story', url: 'https://www.bbc.com/chips' },
      { id: 'd', title: 'Acme launches Model X pricing', url: 'http://insecure.example/x' },
      { id: 'e', title: 'Acme launches Model X lower pricing', url: 'https://arstechnica.com/x' },
      { id: 'f', title: 'Acme launches Model X lower pricing review', url: 'https://www.wired.com/x' }, // same group as e
    ])
    expect(picks.map((p) => p.id).sort()).toEqual(['a', 'e'])
  })
  it('similarity ignores stopwords and case', () => {
    expect(titleSimilarity('The Acme Model X', 'acme model x')).toBe(1)
    expect(titleSimilarity('', 'acme')).toBe(0)
  })
})

describe('collectSources', () => {
  it('records unavailable and short sources without throwing', async () => {
    const reader: SourceReader = async (url) => {
      if (url.includes('reuters')) throw new Error('timeout')
      if (url.includes('arstechnica')) return { success: true, url, title: 'short', text: 'too short' }
      return { success: true, url, title: 'Origin', text: LONG }
    }
    const r = await collectSources({
      newsItem: { title: 'Acme launches Model X lower pricing', url: 'https://www.theverge.com/acme' },
      corroborating: [
        { id: 'a', title: 'Acme launches Model X lower pricing', url: 'https://www.reuters.com/a' },
        { id: 'b', title: 'Acme launches Model X lower pricing', url: 'https://arstechnica.com/b' },
      ],
      reader, now: NOW,
    })
    expect(r.sources.map((s) => s.id)).toEqual(['s1'])
    expect(r.log.join('\n')).toMatch(/read_error timeout/)
    expect(r.log.join('\n')).toMatch(/too_short/)
  })

  it('classifies by the FINAL url and drops redirects to unsafe hosts', async () => {
    const reader: SourceReader = async (url) =>
      url.includes('theverge') ? { success: true, url: 'https://openai.com/blog/x', title: 'x', text: LONG }
        : { success: true, url: 'http://169.254.169.254/', title: 'x', text: LONG }
    const r = await collectSources({
      newsItem: { title: 'Acme launches Model X lower pricing', url: 'https://www.theverge.com/acme' },
      corroborating: [{ id: 'a', title: 'Acme launches Model X lower pricing', url: 'https://www.reuters.com/a' }],
      reader, now: NOW,
    })
    expect(r.sources).toHaveLength(1)
    expect(r.sources[0].kind).toBe('primary')
    expect(r.log.join('\n')).toMatch(/unsafe_final_url/)
  })

  it('returns no originating source when the news item has no safe url', async () => {
    const r = await collectSources({ newsItem: { title: 't', url: null }, corroborating: [], reader: async () => null, now: NOW })
    expect(r.sources).toEqual([])
  })
})
