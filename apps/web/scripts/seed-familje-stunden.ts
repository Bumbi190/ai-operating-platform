/**
 * Seed script: Skapar Familje-Stunden agenter och månadspaket-workflow.
 *
 * Kör med: npx tsx scripts/seed-familje-stunden.ts
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
  console.log('🌱 Seedar Familje-Stunden agenter och workflow...\n')

  // ── Hämta Familje-Stunden projekt ──────────────────────────────────────────
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')

  console.log('Tillgängliga projekt:', projects?.map(p => p.name).join(', '))

  const project = projects?.find(p =>
    p.name.toLowerCase().includes('familje') ||
    p.name.toLowerCase().includes('stunden')
  ) ?? projects?.[0]

  if (!project) {
    console.error('❌ Hittade inga projekt alls. Skapa ett projekt i UI:t först.')
    process.exit(1)
  }

  console.log(`✅ Projekt: ${project.name} (${project.id})`)

  // ── Skapa agenter ──────────────────────────────────────────────────────────

  const agents = [
    {
      name: 'Tema-arkitekt',
      description: 'Skapar månadens övergripande tema, berättelseunivers och nyckelord',
      model: 'claude-sonnet-4-6',
      system_prompt: `Du är en kreativ innehållsdesigner för Familje-Stunden — en plattform som skapar månadspaket med aktiviteter, pyssel och sagor för barn (3–10 år) och deras familjer.

Din uppgift är att skapa ett RIKT och SAMMANHÄNGANDE tema för månaden. Temat ska:
- Passa årstiden och eventuella högtider den månaden
- Ha ett tydligt berättelseunivers (t.ex. "En resa till djuphavet" eller "Skogsälvornas hemliga höstmarknad")
- Innehålla 5–7 nyckelord som genomsyrar allt material
- Föreslå en tematisk "hjälte" eller karaktär som barnen kan följa

Svara på svenska. Strukturera svaret med tydliga rubriker:
## 🎨 Månadens tema
## 📖 Berättelseunivers
## ✨ Nyckelord
## 🦊 Temats karaktär`,
      config: { max_tokens: 2000, temperature: 0.8 },
      project_id: project.id,
    },
    {
      name: 'Aktivitets-skapare',
      description: 'Genererar aktiviteter och pyssel baserat på månadens tema',
      model: 'claude-sonnet-4-6',
      system_prompt: `Du är en pedagog och aktivitetsdesigner för Familje-Stunden. Du skapar roliga, enkla och meningsfulla aktiviteter för familjer med barn 3–10 år.

Givet ett månads-tema ska du skapa 5 AKTIVITETER och 3 PYSSEL:

Aktiviteter ska:
- Vara enkla att genomföra hemma (max 30 min)
- Inte kräva specialmaterial
- Passa hela familjen
- Kopplas tydligt till temat

Pyssel ska:
- Ha enkel materiallista (saker man har hemma)
- Ge ett konkret, snyggt resultat
- Ha steg-för-steg-instruktioner

Svara på svenska. Använd detta format:

## 🎯 Aktiviteter
### [Namn]
**Tid:** [X min] | **Ålder:** [X–X år]
**Vad du behöver:** ...
**Gör så här:** ...
**Koppling till temat:** ...

## ✂️ Pyssel
### [Namn]
**Material:** ...
**Steg:** ...`,
      config: { max_tokens: 3000, temperature: 0.7 },
      project_id: project.id,
    },
    {
      name: 'Saga-berättare',
      description: 'Skriver bildsaga och mp3-manus baserat på temat',
      model: 'claude-sonnet-4-6',
      system_prompt: `Du är en barnboksförfattare för Familje-Stunden. Du skriver korta, magiska bildsagor för barn 3–8 år.

Givet ett tema och en karaktär, skriv:

1. EN BILDSAGA (8–10 sidor/scener)
   - Varje sida: 2–4 meningar, enkel och vacker svenska
   - Tydlig bildanvisning för varje sida (vad illustrationen ska visa)
   - Börja med "Det var en gång..." och avsluta med en positiv känsla

2. ETT MP3-MANUS (samma saga, optimerat för uppläsning)
   - Naturligt talspråk, bra pauseringar
   - Anteckna "[PAUS]" där det passar
   - Ca 3–5 minuter uppläsning

Svara på svenska med tydliga rubriker:
## 📚 Bildsaga: [Titel]
[Sid 1] Text | 🖼️ Bild: [beskrivning]
...

## 🎙️ MP3-manus`,
      config: { max_tokens: 4000, temperature: 0.9 },
      project_id: project.id,
    },
    {
      name: 'Bildprompt-designer',
      description: 'Skapar DALL-E prompts för färgläggningsbilder baserat på temat',
      model: 'claude-sonnet-4-6',
      system_prompt: `Du skapar bildprompts för DALL-E 3 som genererar FÄRGLÄGGNINGSBILDER för barn.

Givet ett tema ska du skapa exakt 4 bildprompts som passar som färgläggningssidor.

Regler för varje prompt:
- Börja alltid med: "Black and white coloring page for children, simple bold line art, no shading, white background, clean outlines,"
- Beskriv en tydlig, enkel scen kopplad till temat
- Barnvänlig, söt stil
- Inga detaljer som är svåra att färglägga
- Avsluta med: "suitable for ages 3-8, printable quality"

Svara ENBART med ett JSON-array med 4 strängar, inget annat:
["prompt 1", "prompt 2", "prompt 3", "prompt 4"]`,
      config: { max_tokens: 1000, temperature: 0.5 },
      project_id: project.id,
    },
    {
      name: 'DALL-E Bildgenerator',
      description: 'Genererar färgläggningsbilder med gpt-image-1',
      model: 'gpt-image-1',
      system_prompt: 'Genererar bilder med gpt-image-1. Input ska vara JSON-array med prompts.',
      config: { max_tokens: 0, temperature: 0 },
      project_id: project.id,
    },
  ]

  const agentIds: Record<string, string> = {}

  for (const agent of agents) {
    // Kolla om agenten redan finns
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('name', agent.name)
      .eq('project_id', project.id)
      .single()

    if (existing) {
      console.log(`  ⏭️  Agent finns redan: ${agent.name}`)
      agentIds[agent.name] = existing.id
      continue
    }

    const { data, error } = await supabase
      .from('agents')
      .insert(agent)
      .select('id')
      .single()

    if (error || !data) {
      console.error(`  ❌ Kunde inte skapa agent ${agent.name}:`, error?.message)
      continue
    }

    agentIds[agent.name] = data.id
    console.log(`  ✅ Agent skapad: ${agent.name}`)
  }

  // ── Skapa workflow ─────────────────────────────────────────────────────────

  const workflowName = 'Familje-Stunden Månadspaket'

  const { data: existingWf } = await supabase
    .from('workflows')
    .select('id')
    .eq('name', workflowName)
    .eq('project_id', project.id)
    .single()

  if (existingWf) {
    console.log(`\n⏭️  Workflow "${workflowName}" finns redan (${existingWf.id})`)
    console.log('\n✨ Seed klar!')
    return
  }

  const steps = [
    {
      order: 1,
      name: 'Skapa månads-tema',
      agent_id: agentIds['Tema-arkitekt'],
      input_template: 'Skapa ett rikt månads-tema för {{månad}}. Tänk på årstid och högtider som passar den månaden.',
      output_key: 'tema',
    },
    {
      order: 2,
      name: 'Skapa aktiviteter och pyssel',
      agent_id: agentIds['Aktivitets-skapare'],
      input_template: 'Skapa aktiviteter och pyssel baserat på detta tema:\n\n{{tema}}',
      output_key: 'aktiviteter',
    },
    {
      order: 3,
      name: 'Skriv bildsaga och mp3-manus',
      agent_id: agentIds['Saga-berättare'],
      input_template: 'Skriv en bildsaga och mp3-manus för detta tema:\n\n{{tema}}\n\nAktiviteter för inspiration:\n{{aktiviteter}}',
      output_key: 'saga',
    },
    {
      order: 4,
      name: 'Designa bildprompts',
      agent_id: agentIds['Bildprompt-designer'],
      input_template: 'Skapa 4 DALL-E bildprompts för färgläggningsbilder baserat på:\n\n{{tema}}',
      output_key: 'bildprompts',
    },
    {
      order: 5,
      name: 'Generera färgläggningsbilder',
      agent_id: agentIds['DALL-E Bildgenerator'],
      input_template: '{{bildprompts}}',
      output_key: 'bilder',
    },
  ]

  const { data: workflow, error: wfError } = await supabase
    .from('workflows')
    .insert({
      name: workflowName,
      description: 'Genererar ett komplett månadspaket: tema, aktiviteter, pyssel, saga och färgläggningsbilder',
      project_id: project.id,
      steps,
    })
    .select('id')
    .single()

  if (wfError || !workflow) {
    console.error('\n❌ Kunde inte skapa workflow:', wfError?.message)
    process.exit(1)
  }

  console.log(`\n✅ Workflow skapat: "${workflowName}" (${workflow.id})`)
  console.log('\n🎉 Seed klar! Du kan nu köra månadspaket-workflowet via chatten.')
  console.log('   Prova: "Kör månadspaket för juni"')
}

main().catch(console.error)
