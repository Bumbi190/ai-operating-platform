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
  it('routes explicit v3 classified-dealer questions, preserving plain-statistics reads', () => {
    expect(read('Nova, hur många riktiga externa bilhandlare har vi i Handlarbörsen? Visa även antal testkonton och interna bolag. Använd statistik v3 och ange datakällan.')).toBe('handlarborsen_growth_brief')
    expect(read('Visa statistik v3 för Handlarbörsen')).toBe('handlarborsen_growth_brief')
    expect(read('Hur många verkliga bilhandlare finns i Handlarbörsen?')).toBe('handlarborsen_growth_brief')
    expect(read('Hur många registrerade företag finns i Handlarbörsen?')).toBe('handlarborsen_statistics')
    expect(read('Skicka statistik v3 för Handlarbörsen till kontakter')).toBeNull()
    expect(read('Visa statistik v3 för Familje-Stunden')).toBeNull()
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
  it('isolates the growth tool response from legacy snapshots and prior conversation context', () => {
    const route = readFileSync(fileURLToPath(new URL('../../app/api/chat/route.ts', import.meta.url)), 'utf8')
    expect(route).toContain("const growthReadTurn = hbReadIntent === 'handlarborsen_growth_brief'")
    expect(route).toContain('if (growthReadTurn) systemPrompt = GROWTH_EVIDENCE_DIRECTIVE')
    expect(route).toContain('sourceReadTurn || growthReadTurn')
    expect(route).toContain('Om företagsantal saknas i observations')
    expect(route).toContain('När readiness är insufficient_data')
    expect(route).toContain("name === 'handlarborsen_growth_brief'")
  })
  it('does not open unrelated project mail or status and never turns generic speech into a request', () => {
    expect(read('Vad säger de senaste mejlen i Familje-Stunden?')).toBeNull()
    expect(read('Vad är statistiken i The Prompt?')).toBeNull()
    expect(read('Hej Nova')).toBeNull()
    expect(read('Skicka ett nytt mejl från Handlarbörsen')).toBeNull()
    expect(read('Slå på automatisering för Handlarbörsen')).toBeNull()
  })
})
