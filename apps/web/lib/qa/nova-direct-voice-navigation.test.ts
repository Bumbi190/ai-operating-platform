import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { directVoiceNavigation } from '@/lib/atlas/voice-pilot/direct-navigation'

describe('Fast, same-origin voice navigation for Nova', () => {
  it.each([
    ['Nova, öppna kalendern', '/calendar'],
    ['Hej nova vill du navigera till kalendern i om era', '/calendar'],
    ['Hej Nova, navigera till kalendern i Omnira!', '/calendar'],
    ['Nova visa Omniras kalender', '/calendar'],
    ['Nova gå till Atlas', '/atlas'],
    ['Nova öppna planeringen', '/planning'],
    ['Nova öppna projekt', '/projects'],
    ['Nova visa marknadsgranskning', '/atlas/marketing'],
  ])('directly resolves trusted navigation %s', (spoken, href) => {
    const result = directVoiceNavigation(spoken)
    expect(result?.href).toBe(href)
    expect(result?.reply).toBeTruthy()
  })

  it.each([
    'Nova skapa ett möte i kalendern',
    'Nova öppna kalendern och boka ett möte',
    'Nova gå till https://attacker.invalid',
    'Nova visa mina mejl',
    'Nova publicera ett inlägg på LinkedIn',
    'Nova navigera till kalendern; radera allt',
    'Jag vill planera ett inlägg för Handlarbörsen imorgon',
    'Berätta om kalendern',
    'Nova öppna kalendern och ändra något',
    'öppna C:\\Windows\\System32',
    '',
    'Nova öppna kalendern ' + 'x'.repeat(500),
  ])('refuses external, complex and potentially mutating requests %s', spoken => {
    expect(directVoiceNavigation(spoken)).toBeNull()
  })

  it('is wired into the live voice hook before LLM submit and uses a scoped route callback', () => {
    const hook = readFileSync(join(process.cwd(), 'lib/atlas/voice-pilot/use-voice-session.ts'), 'utf8')
    const runtime = readFileSync(join(process.cwd(), 'lib/atlas/runtime.tsx'), 'utf8')
    expect(hook).toContain('const direct = directVoiceNavigation(combined)')
    expect(hook).toContain('latest.current.onDirectNavigation(direct.href)')
    expect(hook.indexOf('latest.current.onDirectNavigation(direct.href)'))
      .toBeLessThan(hook.indexOf("writeDraft(combined, 'voice')"))
    expect(runtime).toContain('onDirectNavigation: href => openWorkspace(href)')
  })
})
