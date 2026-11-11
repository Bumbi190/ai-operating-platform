import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Approved Nova commands cannot silently bypass the read-only relay', () => {
  it('keeps two explicit task modes, with separate authenticated Atlas execution', () => {
    const bridge = source('components/platform/os/NovaBridgeRuntime.tsx')
    expect(bridge).toContain("mode: 'nova_readonly' | 'atlas_operator' | 'nova_voice'")
    expect(bridge).toContain("!['atlas_operator', 'nova_voice'].includes(task.mode)")
    expect(bridge).toContain("!voiceAuthorizedRef.current")
    expect(bridge).toContain("await current.sendOperatorMessage(task.text)")
    expect(bridge).toContain("if (task.mode === 'atlas_operator') await executeOperator(task)")
    expect(bridge).toContain("else if (task.mode === 'nova_readonly' || task.mode === 'nova_voice') await executeReadOnly(task)")
    expect(bridge).toContain("mode: 'nova_readonly', voice: native")
  })
  it('polls emergency stop while Atlas is waiting on model or tools', () => {
    const bridge = source('components/platform/os/NovaBridgeRuntime.tsx')
    expect(bridge).toContain('runningTaskRef.current = true')
    expect(bridge).toContain('void (async () => {')
    expect(bridge).toContain("if (data.command?.id) await executeVoiceControl(data.command)")
    expect(bridge).toContain("runningTaskRef.current = false")
    expect(bridge).toContain("current.stopAudio()")
  })
  it('uses the same voice conversation and existing tool/approval route', () => {
    const hook = source('lib/atlas/voice-pilot/use-voice-session.ts')
    const runtime = source('lib/atlas/runtime.tsx')
    expect(runtime).toContain('async function sendOperatorMessage(text: string)')
    expect(runtime).toContain("const reply = await voiceSession.submitText(text)")
    expect(hook).toContain('const outcome = await conversation.sendTurn')
    expect(hook).toContain('return completed && current() ? responseText : null')
    expect(runtime).toContain('sendOperatorMessage,')
  })
  it('rearms a timed-out mic without leaving the user in a dead call', () => {
    const bridge = source('components/platform/os/NovaBridgeRuntime.tsx')
    const runtime = source('lib/atlas/runtime.tsx')
    expect(bridge).toContain("command.kind === 'voice_resume'")
    expect(bridge).toContain("!current.voiceMicActive")
    expect(bridge).toContain("else if (current.voiceMicActive)")
    expect(bridge).toContain("atlas.voiceMicProblem ? 'error'")
    expect(runtime).toContain("voiceMicActive: managedVoice && (voiceSession.mic || voiceSession.opening)")
    expect(runtime).toContain('voiceMicProblem: managedVoice ? voiceSession.micProblem : null')
  })
})
