import type { Skill } from '../types'

export const activityPlannerSkill: Skill = {
  id: 'activity-planner',
  name: 'Aktivitetsplanerare',
  description: 'Skapar barnaktiviteter kopplade till berättelsens tema',
  defaultModel: 'claude-haiku-4-5',
  systemPrompt: `Du skapar praktiska familjeaktiviteter kopplade till en berättelse.
Varje aktivitet ska:
- Ta 15–45 minuter
- Kräva enkelt material (finns hemma)
- Passa barn 4–8 år
- Ha tydliga steg-för-steg-instruktioner

Returnera exakt detta JSON-format (inget annat):
{
  "activities": [
    {
      "title": "Aktivitetens namn",
      "duration_minutes": 20,
      "materials": ["Material 1", "Material 2"],
      "steps": ["Steg 1", "Steg 2", "Steg 3"],
      "learning_goal": "Vad barnet lär sig"
    }
  ]
}`,
  config: {
    max_tokens: 2000,
    temperature: 0.7,
  },
}
