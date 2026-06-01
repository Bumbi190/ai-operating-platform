import type { Skill } from '../types'

export const generalistSkill: Skill = {
  id: 'generalist',
  name: 'Generalist',
  description: 'Universell agent för ad-hoc uppgifter och testning',
  defaultModel: 'claude-sonnet-4-6',
  systemPrompt: `Du är en hjälpsam AI-assistent.
Svara alltid på det språk som användaren skriver på.
Var konkret och handlingsinriktad.
Returnera strukturerat innehåll när det är lämpligt.`,
  config: {
    max_tokens: 4000,
    temperature: 0.7,
  },
}
