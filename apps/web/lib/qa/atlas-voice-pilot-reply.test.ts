import { describe, expect, it } from 'vitest'
import { takeSpeechChunk } from '@/lib/atlas/voice-pilot/reply'

describe('early spoken reply', () => {
  it('releases a useful first phrase before a long sentence is complete', () => {
    const text = 'Jag kan hjälpa dig att planera nästa steg för Familje-Stunden och sedan titta på hur vi går vidare'
    const length = takeSpeechChunk(text, true, false)
    expect(length).toBeGreaterThanOrEqual(40)
    expect(length).toBeLessThanOrEqual(80)
    expect(text[length - 1]).toBe(' ')
    expect(takeSpeechChunk(text, false, false)).toBe(0)
  })
  it('preserves sentence boundaries, waits for useful text, and flushes every remaining character', () => {
    expect(takeSpeechChunk('Visst. Nästa mening', true, false)).toBe(7)
    expect(takeSpeechChunk('En kort början', true, false)).toBe(0)
    const text = 'Här finns flera ord '.repeat(40)
    let consumed = 0
    while (consumed < text.length) consumed += takeSpeechChunk(text.slice(consumed), consumed === 0, true)
    expect(consumed).toBe(text.length)
  })
})
