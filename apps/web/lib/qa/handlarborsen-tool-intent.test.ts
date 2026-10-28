import { describe, expect, it } from 'vitest'
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
  it('does not open unrelated project mail or status and never turns generic speech into a request', () => {
    expect(read('Vad säger de senaste mejlen i Familje-Stunden?')).toBeNull()
    expect(read('Vad är statistiken i The Prompt?')).toBeNull()
    expect(read('Hej Nova')).toBeNull()
    expect(read('Skicka ett nytt mejl från Handlarbörsen')).toBeNull()
    expect(read('Slå på automatisering för Handlarbörsen')).toBeNull()
  })
})
