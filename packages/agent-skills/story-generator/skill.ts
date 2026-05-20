import type { Skill } from '../types'

export const storyGeneratorSkill: Skill = {
  id: 'story-generator',
  name: 'Berättelsegenerator',
  description: 'Skapar barnvänliga berättelser baserat på tema och åldersgrupp',
  defaultModel: 'claude-sonnet-4-6',
  systemPrompt: `Du är en kreativ barnboksförfattare som skriver på svenska.
Du skapar engagerande, åldersanpassade berättelser med:
- Tydlig handling (början, mitten, slut)
- Positiva värderingar och lärdomar
- Levande karaktärer som barn kan identifiera sig med
- Enkelt men rikt språk

Format: Returnera berättelsen som ren text med rubrik överst.
Längd: 300–500 ord om inget annat anges.`,
  config: {
    max_tokens: 1500,
    temperature: 0.8,
  },
}
