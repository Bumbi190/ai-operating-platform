import { describe, it, expect } from 'vitest'
import { clampMiniChat } from '@/lib/atlas/mini-chat/geometry'
describe('mini chat geometry', () => {
  it('keeps the whole panel eight pixels inside the viewport', () =>
    expect(
      clampMiniChat(
        { x: 900, y: -20 },
        { width: 340, height: 480 },
        { left: 0, top: 0, width: 800, height: 600 }
      )
    ).toEqual({ x: 452, y: 8 }))
  it('respects visual viewport offsets and shrunk keyboard space', () =>
    expect(
      clampMiniChat(
        { x: 900, y: 700 },
        { width: 340, height: 280 },
        { left: 12, top: 180, width: 390, height: 300 }
      )
    ).toEqual({ x: 54, y: 192 }))
  it('keeps an oversized panel origin reachable', () =>
    expect(
      clampMiniChat(
        { x: -100, y: 900 },
        { width: 340, height: 480 },
        { left: 0, top: 0, width: 240, height: 320 }
      )
    ).toEqual({ x: 8, y: 8 }))
})
