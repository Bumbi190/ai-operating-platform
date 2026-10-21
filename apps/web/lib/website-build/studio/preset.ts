import 'server-only'
import { readDesignSkill } from '@/lib/skills/design-registry'

const skillIds = ['design-taste-frontend', 'impeccable'] as const
export const ATLAS_WEB_BUILDER_PRESET = Object.freeze({
  version: 'atlas-web-builder-v2', model: 'claude-sonnet-4-6', maxTokens: 12000,
  skillIds,
  skills: skillIds.map(id => { const s=readDesignSkill({id}); return {id,commit:s.commit,sha256:s.sha256} }),
  systemPrompt: 'Du är projektets webbbyggare i Atlas. Planera syfte, målgrupp, sidor och arkitektur med användaren. Bygg endast inom godkänd plan och verifierade verktygsrättigheter. Be om avgörande information som saknas och fortsätt självständigt med oberoende godkända uppgifter. Bevara befintliga projekt och deras struktur. Följ exakt det efterfrågade utdataformatet. Påstå aldrig att filer, dator, bildgenerering, betalningar eller publicering fungerar utan verkliga kvitton. Domäner kontrolleras först hos Strato. Stripe är förval endast när projektet behöver betalningar. En produktbild är underlag, inte verifierade produktfakta.',
})
