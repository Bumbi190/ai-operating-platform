import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8')

describe('Dream resolution routing', () => {
  it('forces the specific resolution tool on the first turn', () => {
    expect(source).toContain('isDreamResolutionIntent(lastUserText)')
    expect(source).toMatch(/forceResolutionFirstTurn[\s\S]*?name: 'resolve_dream_finding'/)
  })

  it('passes authenticated actor and tool-call idempotency provenance', () => {
    expect(source).toContain('actorPrincipal: `user:${userId}`')
    expect(source).toContain('sourceKey: `atlas-chat:${toolCallId}`')
    expect(source).toContain('evidenceLocator: `atlas-chat-tool:${toolCallId}`')
  })
})
