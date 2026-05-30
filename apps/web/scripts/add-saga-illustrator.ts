/**
 * add-saga-illustrator.ts
 *
 * Lägger till två nya agenter + två nya workflow-steg i Familje-Stunden:
 *   Steg 6: Saga-illustratör-prompt  → sagabildprompts
 *   Steg 7: Saga-illustratör         → sagabilder  (färgglada Pixar-illustrationer)
 *
 * Kör med: npx tsx scripts/add-saga-illustrator.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  console.log('🎨 Lägger till Saga-illustratör-agenter...\n')

  const { data: projects } = await supabase.from('projects').select('id, name')
  const project = projects?.find(p =>
    p.name.toLowerCase().includes('familje') || p.name.toLowerCase().includes('stunden')
  ) ?? projects?.[0]

  if (!project) { console.error('❌ Inget projekt hittades'); process.exit(1) }
  console.log(`✅ Projekt: ${project.name} (${project.id})`)

  // ── Skapa/uppdatera agenter ───────────────────────────────────────────────

  const newAgents = [
    {
      name: 'Saga-illustratör-prompt',
      description: 'Skapar bildprompts för färgglada saga-illustrationer (Pixar-stil)',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: `Du skapar bildprompts för gpt-image-1 som genererar FÄRGGLADA ILLUSTRATIONER för Nova & Pling-bildsagan.

KARAKTÄRER (beskriv ALLTID dessa exakt):
- NOVA: Glad flicka med brunt hår i hästsvans och rosa pannband, varm hudton, uttrycksfull. Kläder varierar med temat.
- PLING: Liten rund blå/teal robot med stort glatt leende och stora vänliga ögon, en liten antenn. Kommunicerar med "Blipp blipp!".

Givet sagan ska du skapa exakt 5 bildprompts — en för varje nyckelmöment i historien (sida 1, 4, 7, 11, 15 ungefär).

Varje prompt ska:
- Börja med: "Children's book illustration, Pixar/DreamWorks style, warm vibrant colors, soft lighting, detailed background,"
- Beskriva Nova och Pling i en specifik scen från sagan
- Inkludera karaktärsbeskrivning: "Nova (brown-haired girl with pink headband, [theme outfit]), Pling (small round blue robot with happy smile)"
- Vara rik på detaljer om bakgrund, stämning och känsla
- Avsluta med: "high quality, 4k, children's book art style"

Svara ENBART med ett JSON-array med 5 strängar:
["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5"]`,
      config: { max_tokens: 1500, temperature: 0.6 },
      project_id: project.id,
    },
    {
      name: 'Saga-illustratör',
      description: 'Genererar färgglada Pixar-stil illustrationer för bildsagan',
      model: 'gpt-image-1',
      system_prompt: 'Genererar färgglada saga-illustrationer med gpt-image-1. Input ska vara JSON-array med prompts.',
      config: { max_tokens: 0, temperature: 0 },
      project_id: project.id,
    },
  ]

  const agentIds: Record<string, string> = {}

  for (const agent of newAgents) {
    const { data: existing } = await supabase
      .from('agents').select('id').eq('name', agent.name).eq('project_id', project.id).single()

    if (existing) {
      // Update existing
      await supabase.from('agents').update(agent).eq('id', existing.id)
      agentIds[agent.name] = existing.id
      console.log(`  ✅ Uppdaterad: ${agent.name}`)
    } else {
      const { data, error } = await supabase.from('agents').insert(agent).select('id').single()
      if (error || !data) { console.error(`  ❌ ${agent.name}:`, error?.message); continue }
      agentIds[agent.name] = data.id
      console.log(`  ✅ Skapad: ${agent.name}`)
    }
  }

  // ── Hämta workflow ────────────────────────────────────────────────────────

  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, steps')
    .eq('name', 'Familje-Stunden Månadspaket')
    .eq('project_id', project.id)
    .single()

  if (!workflow) { console.error('❌ Workflow inte hittat'); process.exit(1) }
  console.log(`\n✅ Workflow: ${workflow.id}`)

  const steps = (workflow.steps ?? []) as Array<Record<string, unknown>>

  // Check if steps already exist
  const hasPromptStep = steps.some((s) => s.output_key === 'sagabildprompts')
  const hasIllusStep  = steps.some((s) => s.output_key === 'sagabilder')

  if (hasPromptStep && hasIllusStep) {
    console.log('⏭️  Saga-illustratör-steg finns redan')
  } else {
    const maxOrder = steps.reduce((m, s) => Math.max(m, (s.order as number) ?? 0), 0)

    const newSteps = [
      ...steps,
      !hasPromptStep && {
        order: maxOrder + 1,
        name: 'Designa saga-illustrationsprompts',
        agent_id: agentIds['Saga-illustratör-prompt'],
        input_template: 'Skapa 5 bildprompts för färgglada saga-illustrationer baserat på denna saga:\n\n{{saga}}',
        output_key: 'sagabildprompts',
      },
      !hasIllusStep && {
        order: maxOrder + 2,
        name: 'Generera saga-illustrationer',
        agent_id: agentIds['Saga-illustratör'],
        input_template: '{{sagabildprompts}}',
        output_key: 'sagabilder',
      },
    ].filter(Boolean)

    const { error } = await supabase
      .from('workflows').update({ steps: newSteps }).eq('id', workflow.id)

    if (error) { console.error('❌ Steg-uppdatering misslyckades:', error.message) }
    else { console.log(`  ✅ Lade till ${newSteps.length - steps.length} nya steg`) }
  }

  console.log('\n🎉 Klart! Nästa körning genererar färgglada saga-illustrationer.')
}

main().catch(console.error)
