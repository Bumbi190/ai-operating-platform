import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { classifyHandlarborsenReadIntent as read } from '@/lib/atlas/project-analytics/handlarborsen-tool-intent'

describe('Handlarbörsen read-only intent classification', () => {
  it('forces the latest Strato inbox read for a natural Swedish voice question', () => {
    expect(read('Har du tillgång till Handlarbörsens Strato-mail och kan du läsa det senaste mejlet?'))
      .toBe('handlarborsen_latest_mail')
    expect(read('Kolla senaste mejlet från info@handlarborsen.se'))
      .toBe('handlarborsen_latest_mail')
  })
  it('uses only the two most recent user turns as conversational project context', () => {
    expect(read('Har vi fått något nytt mejl?', ['Vi ska se på Handlarbörsen']))
      .toBe('handlarborsen_latest_mail')
    expect(read('Visa statistiken', ['Vi arbetar med Handlarbörsen']))
      .toBe('handlarborsen_statistics')
    expect(read('Visa statistiken', ['Handlarbörsen', 'Familje-Stunden', 'The Prompt']))
      .toBeNull()
  })
  it('forces statistics when the user explicitly asks for counts or verification', () => {
    expect(read('Kan du analysera Handlarbörsens statistik?'))
      .toBe('handlarborsen_statistics')
    expect(read('Hur många verifierade handlare har Handlarbörsen?'))
      .toBe('handlarborsen_statistics')
  })
  it('routes explicit Handlarbörsen growth questions to the owner-only growth tool', () => {
    expect(read('Nova, hur utvecklas Handlarbörsen och vad bör vi prioritera för att få fler handlare?'))
      .toBe('handlarborsen_growth_brief')
    expect(read('Nova, hur utvecklas Handlarbörsen och vad borde vi prioritera för att få fler registrerade handlare? Använd verifierade siffror och ange källorna.'))
      .toBe('handlarborsen_growth_brief')
    expect(read('Hur ser registreringsintresset ut?', ['Handlarbörsen']))
      .toBe('handlarborsen_growth_brief')
    expect(read('Skicka en tillväxtrapport för Handlarbörsen')).toBeNull()
    expect(read('Hur utvecklas Familje-Stunden?')).toBeNull()
  })
  it('keeps explicit growth evidence reads out of the content fast-path', () => {
    const route = readFileSync(fileURLToPath(new URL('../../app/api/chat/route.ts', import.meta.url)), 'utf8')
    expect(route).toContain('const hbGrowthBriefReadIntent =')
    expect(route).toContain("=== 'handlarborsen_growth_brief'")
    expect(route).toContain('&& !hbReplyLifecycleReadIntent && !hbGrowthBriefReadIntent && !socialPreparationIntent &&')
    expect(route).toContain("mode === 'content' || isFastPathContent(lastUserText)")
    expect(route).toContain('const forceHbReadFirstTurn = hbReadIntent')
  })
  it('limits an explicit growth turn to its read-only tool rather than the conflicting statistics tool', () => {
    const route = readFileSync(fileURLToPath(new URL('../../app/api/chat/route.ts', import.meta.url)), 'utf8')
    expect(route).toContain("hbReadIntent === 'handlarborsen_growth_brief' ? TOOLS.filter(tool => tool.name === 'handlarborsen_growth_brief')")
    expect(route).toContain('const forceHbReadFirstTurn = hbReadIntent')
    expect(route).toContain("name: forceHbReadFirstTurn")
    expect(route).toContain('tillväxtfrågor ska gå till growth_brief')
    expect(route).not.toContain('Använd vid frågor om registreringar, verifierade företag, aktivitet och hur vi ska nå fler handlare.')
  })
  it('does not open unrelated project mail or status and never turns generic speech into a request', () => {
    expect(read('Vad säger de senaste mejlen i Familje-Stunden?')).toBeNull()
    expect(read('Vad är statistiken i The Prompt?')).toBeNull()
    expect(read('Hej Nova')).toBeNull()
    expect(read('Skicka ett nytt mejl från Handlarbörsen')).toBeNull()
    expect(read('Slå på automatisering för Handlarbörsen')).toBeNull()
  })
})
