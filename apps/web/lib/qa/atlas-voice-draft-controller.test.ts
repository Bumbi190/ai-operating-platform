import { describe, expect, it } from 'vitest'
import { AtlasConversationController } from '@/lib/atlas/conversation/controller'
import { VOICE_DOCUMENT_INCOMPLETE_WARNING } from '@/lib/atlas/voice-pilot/document-mode'

const frame = (event: Record<string,unknown>) => 'data: ' + JSON.stringify(event) + '\n\n'
function controllerFor(events: Record<string,unknown>[]) {
  const controller = new AtlasConversationController(async () =>
    new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } }))
  controller.activateConversation({ id: 'voice-doc', state: 'ok', saved: [] })
  return controller
}
describe('Voice document completion is distinct from transport completion', () => {
  it('keeps the full truncated draft in history but refuses to report finished', async () => {
    const partial = '## Claude-prompt\n\nEtt steg finns redan.' + VOICE_DOCUMENT_INCOMPLETE_WARNING
    const controller = controllerFor([
      { event: 'text', text: partial },
      { event: 'draft_interrupted', saved: true, continuationAllowed: true },
      { event: 'done' },
    ])
    const settled: boolean[] = []
    controller.subscribeSettled(event => settled.push(event.ok))
    const result = await controller.sendTurn({conversationId:'voice-doc',text:'Skriv en fullständig Claude-prompt',inputSource:'voice'})
    expect(result.ok).toBe(false)
    expect(result.notice).toContain('ofullständigt')
    expect(settled).toEqual([false])
    expect(controller.snapshot().history.at(-1)?.content).toBe(partial)
    expect(controller.snapshot().entries.filter(e=>e.kind==='assistant').at(-1)).toMatchObject({
      kind:'assistant',incomplete:true,continuationAllowed:true,
    })
    expect(controller.snapshot().pending).toBe(false)
  })
  it('reports complete only when no interrupted marker was emitted', async () => {
    const controller = controllerFor([{event:'text',text:'En färdig plan.'},{event:'done'}])
    const result = await controller.sendTurn({conversationId:'voice-doc',text:'Skriv en plan',inputSource:'text'})
    expect(result.ok).toBe(true)
    expect(controller.snapshot().history.at(-1)?.content).toBe('En färdig plan.')
  })
})
