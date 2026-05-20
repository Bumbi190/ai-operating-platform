/**
 * update-image-agents.ts
 *
 * Fixar bildkvaliteten i alla tre bildtyper:
 *
 * PROBLEM 1 — Saga-illustratör saknar SAGA_ILLUSTRATIONS-flagga i system_prompt
 *   → Runner genererar sagabilder i felaktigt "coloring"-läge
 *   → Fix: Lägg till flagga i system_prompt
 *
 * PROBLEM 2 — Saga-illustratör-prompt: motstridiga karaktärsbeskrivningar
 *   → Agenten beskriver Pling som "rund blå robot" men runner lägger till "dome-shaped"
 *   → Agenten skapar 5 prompts men sagan har 8-16 sidor
 *   → Fix: Agenten ska INTE beskriva utseende — bara scen och handling.
 *          Skapa EN prompt per [Sid X]-sida i sagan.
 *
 * PROBLEM 3 — Bildprompt-designer (färgläggning): dubbel prefix
 *   → Agenten börjar prompts med "Black and white coloring page..." men runner lägger redan till det
 *   → Agenten nämner INTE Nova & Pling i scenen
 *   → Fix: Agenten ska bara beskriva SCENEN med Nova & Pling — runner lägger till formateringen.
 *          Öka till 5 prompts.
 *
 * PROBLEM 4 — Ingen aktivitetsbild-pipeline
 *   → runner.ts har ACTIVITY_ILLUSTRATIONS-läge men det används aldrig
 *   → Fix: Skapa Aktivitets-bildprompt + Aktivitets-illustratör agenter + workflow-steg
 *
 * Kör med: npx tsx scripts/update-image-agents.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── Uppdaterade/nya system prompts ────────────────────────────────────────────

/**
 * Saga-illustratör-prompt (UPPDATERAD)
 *
 * Notera: Agenten ska INTE beskriva Novas och Plings utseende — det hanteras av
 * runner.ts som automatiskt prepend:ar karaktärsbeskrivning + stilprefixet.
 * Agenten ska bara beskriva SCEN, HANDLING, STÄMNING.
 */
const SAGA_PROMPT_DESIGNER_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar FÄRGGLADA ILLUSTRATIONER för Nova & Pling-bildsagan.

VIKTIGT: Beskriv ENBART scenen och handlingen — INTE karaktärernas utseende (det hanteras automatiskt av bildsystemet).

Analysera sagan noggrant och identifiera varje sida/scen markerad som [Sid X], **[Sid X]**, "Sida X" eller liknande. Skapa EXAKT EN bildprompt per sida.

Varje prompt ska:
- Vara på engelska (50–80 ord)
- Beskriva VAD som händer i scenen och VAR (plats, miljö)
- Nämna om Nova och/eller Pling är med och vad de GÖR (inte hur de ser ut)
- Inkludera stämning, belysning och känsla (t.ex. "warm golden hour light", "soft misty morning", "cozy indoor lamplight")
- Beskriva bakgrundens detaljer och atmosfär

Exempel på bra prompt:
"Nova and Pling exploring a glowing underwater cave, Pling floating curiously toward a luminescent sea anemone, colorful coral formations surrounding them, beams of light filtering through turquoise water from above, sense of wonder and discovery, magical bioluminescent glow"

Svara ENBART med ett JSON-array med EXAKT en sträng per sida i sagan (ingen annan text, inga rubriker, inget markdown):
["prompt sid 1", "prompt sid 2", ...]`

/**
 * Saga-illustratör (UPPDATERAD)
 *
 * Måste innehålla SAGA_ILLUSTRATIONS för att runner.ts ska välja rätt bildläge:
 * - 1024×1536 portrait format
 * - Pixar/Disney stil med full färg
 * - Automatisk karaktärsbeskrivning prepend:as av runner
 */
const SAGA_ILLUSTRATOR_SYSTEM = `SAGA_ILLUSTRATIONS — Genererar färgglada bildsaga-illustrationer i porträttformat (1024x1536) med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar. Runner.ts lägger automatiskt till Pixar-stil och karaktärsbeskrivningar.`

/**
 * Bildprompt-designer (UPPDATERAD — färgläggning)
 *
 * Runner.ts lägger redan till:
 *   "Coloring book page for children ages 3-8. Black and white line art only, no shading,
 *    no gray tones, pure white background, clean bold outlines. Characters: Nova is a curious
 *    girl... Pling is a small dome-shaped blue-teal robot... {prompt}
 *    Simple cute cartoon style, printable quality, suitable for coloring with crayons."
 *
 * Agenten ska ENBART beskriva scenen — inte format, inte karaktärsutseende.
 */
const COLORING_PROMPT_DESIGNER_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar FÄRGLÄGGNINGSBILDER för barn.

VIKTIGT: Beskriv ENBART scenen — INTE att det ska vara svartvitt, INTE karaktärernas detaljerade utseende (det hanteras automatiskt av bildsystemet).

Givet ett tema ska du skapa exakt 5 scenebeskrivningar — en per nyckelmöment i temat.

Varje prompt ska:
- Vara på engelska (30–60 ord)
- Placera Nova och Pling mitt i en tematisk aktivitet kopplade till temat
- Beskriva en tydlig, enkel scen som är lätt att färglägga (inga för små detaljer)
- Inkludera 1–2 bakgrundselement kopplade till temat
- Vara konkret — vad GÖR Nova och Pling just nu?

Svara ENBART med ett JSON-array med 5 strängar (ingen annan text):
["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5"]`

/**
 * Aktivitets-bildprompt (NY)
 *
 * Runner.ts lägger till:
 *   "Children's activity card illustration, Pixar/Disney style, vibrant full color.
 *    Scene with characters occupies the top 65% of the image. The bottom 35% transitions
 *    to a clean soft pastel/white gradient area... Consistent characters: Nova... Pling... {prompt}"
 *
 * Agenten ska skapa EN prompt per aktivitet (enbart under "## 🎯 Aktiviteter", inte pyssel).
 */
const ACTIVITY_PROMPT_DESIGNER_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar AKTIVITETSKORT-ILLUSTRATIONER för Nova & Pling.

VIKTIGT:
- Beskriv ENBART scenen och handlingen — INTE karaktärernas utseende (det hanteras automatiskt).
- Skapa prompts ENBART för de namngivna aktiviteterna under "## 🎯 Aktiviteter" — INTE för pyssel under "## ✂️ Pyssel".
- Skapa EXAKT 5 prompts (en per aktivitet), även om fler sektioner finns i texten.

Varje prompt ska:
- Vara på engelska (40–70 ord)
- Visa Nova och Pling aktivt UTFÖRA aktiviteten (inte bara stå bredvid)
- Inkludera relevanta föremål/material för aktiviteten
- Ha energi, rörelse och glädje
- Beskriva konkret ACTION — vad händer just nu i bilden?
- Inkludera plats/miljö som passar aktiviteten

Exempel:
Om aktiviteten är "Bygg ett fågelbo":
"Nova and Pling building a small wooden birdhouse together, Nova carefully hammering a nail while Pling steadies the wood pieces, sawdust swirling around them, a sunny backyard workshop setting with sunlight streaming through the trees, tools and wood pieces neatly arranged nearby, joyful focused expressions"

Svara ENBART med ett JSON-array med exakt 5 strängar (ingen annan text, inga rubriker):
["prompt aktivitet 1", "prompt aktivitet 2", "prompt aktivitet 3", "prompt aktivitet 4", "prompt aktivitet 5"]`

/**
 * Aktivitets-illustratör (NY)
 *
 * Måste innehålla ACTIVITY_ILLUSTRATIONS för att runner.ts ska välja rätt bildläge:
 * - 1024×1024 kvadrat-format
 * - Nedre 35% tömd för textöverlägg i PDF
 * - Automatisk karaktärsbeskrivning prepend:as av runner
 */
const ACTIVITY_ILLUSTRATOR_SYSTEM = `ACTIVITY_ILLUSTRATIONS — Genererar aktivitetskort-illustrationer i kvadratformat (1024x1024) med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar. Runner.ts lägger automatiskt till Pixar-stil, karaktärsbeskrivningar och gradient-bottom för text-overlay.`

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎨 Uppdaterar bildagenter för bättre bildkvalitet...\n')

  // Hämta projekt
  const { data: projects, error: projErr } = await supabase.from('projects').select('id, name')
  if (projErr) {
    console.error('❌ Supabase-fel:', projErr.message)
    console.error('   Kontrollera att NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY är rätt i .env.local')
    process.exit(1)
  }

  console.log(`   Hittade ${projects?.length ?? 0} projekt: ${projects?.map(p => p.name).join(', ')}`)

  const project = projects?.find(p =>
    p.name.toLowerCase().includes('familje') || p.name.toLowerCase().includes('stunden')
  ) ?? projects?.[0]

  if (!project) {
    console.error('❌ Inget projekt hittades i databasen. Kör seed-familje-stunden.ts först.')
    process.exit(1)
  }
  console.log(`✅ Projekt: ${project.name} (${project.id})\n`)

  // Hämta alla befintliga agenter för projektet
  const { data: existingAgents } = await supabase
    .from('agents')
    .select('id, name, model, system_prompt')
    .eq('project_id', project.id)

  const agentByName = new Map(existingAgents?.map(a => [a.name, a]) ?? [])

  const agentIds: Record<string, string> = {}
  Array.from(agentByName.entries()).forEach(([name, agent]) => {
    agentIds[name] = agent.id
  })

  // ── Fix 1: Saga-illustratör — lägg till SAGA_ILLUSTRATIONS-flagga ──────────

  console.log('── Fix 1: Saga-illustratör ──')
  const sagaIllustrator = agentByName.get('Saga-illustratör')
  if (sagaIllustrator) {
    if (sagaIllustrator.system_prompt?.includes('SAGA_ILLUSTRATIONS')) {
      console.log('  ✅ Redan korrekt (har SAGA_ILLUSTRATIONS)')
    } else {
      const { error } = await supabase
        .from('agents')
        .update({ system_prompt: SAGA_ILLUSTRATOR_SYSTEM })
        .eq('id', sagaIllustrator.id)
      if (error) console.error('  ❌ Misslyckades:', error.message)
      else console.log('  ✅ Lagt till SAGA_ILLUSTRATIONS-flagga')
    }
  } else {
    // Skapa agenten om den saknas
    const { data, error } = await supabase.from('agents').insert({
      name: 'Saga-illustratör',
      description: 'Genererar färgglada Pixar-stil illustrationer för bildsagan (porträttformat)',
      model: 'gpt-image-1',
      system_prompt: SAGA_ILLUSTRATOR_SYSTEM,
      config: { max_tokens: 0, temperature: 0 },
      project_id: project.id,
    }).select('id').single()
    if (error || !data) console.error('  ❌ Kunde inte skapa Saga-illustratör:', error?.message)
    else {
      agentIds['Saga-illustratör'] = data.id
      console.log('  ✅ Saga-illustratör skapad')
    }
  }

  // ── Fix 2: Saga-illustratör-prompt — ta bort motstridiga karaktärsbeskrivningar ──

  console.log('\n── Fix 2: Saga-illustratör-prompt ──')
  const sagaPromptDesigner = agentByName.get('Saga-illustratör-prompt')
  if (sagaPromptDesigner) {
    const { error } = await supabase
      .from('agents')
      .update({
        system_prompt: SAGA_PROMPT_DESIGNER_SYSTEM,
        config: { max_tokens: 3000, temperature: 0.6 },
      })
      .eq('id', sagaPromptDesigner.id)
    if (error) console.error('  ❌ Misslyckades:', error.message)
    else console.log('  ✅ System prompt uppdaterad — ingen karaktärsbeskrivning, en prompt per sida')
  } else {
    const { data, error } = await supabase.from('agents').insert({
      name: 'Saga-illustratör-prompt',
      description: 'Skapar scenebeskrivningar för färgglada saga-illustrationer (Pixar-stil)',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: SAGA_PROMPT_DESIGNER_SYSTEM,
      config: { max_tokens: 3000, temperature: 0.6 },
      project_id: project.id,
    }).select('id').single()
    if (error || !data) console.error('  ❌ Kunde inte skapa Saga-illustratör-prompt:', error?.message)
    else {
      agentIds['Saga-illustratör-prompt'] = data.id
      console.log('  ✅ Saga-illustratör-prompt skapad')
    }
  }

  // ── Fix 3: Bildprompt-designer — ta bort dubbel prefix, lägg till Nova & Pling ──

  console.log('\n── Fix 3: Bildprompt-designer (färgläggning) ──')
  const coloringDesigner = agentByName.get('Bildprompt-designer')
  if (coloringDesigner) {
    const { error } = await supabase
      .from('agents')
      .update({
        system_prompt: COLORING_PROMPT_DESIGNER_SYSTEM,
        config: { max_tokens: 1000, temperature: 0.5 },
      })
      .eq('id', coloringDesigner.id)
    if (error) console.error('  ❌ Misslyckades:', error.message)
    else console.log('  ✅ Uppdaterad — tar bort dubbel prefix, 5 prompts, Nova & Pling i scen')
  } else {
    console.error('  ⚠️  Bildprompt-designer hittades inte')
  }

  // ── Fix 4a: Skapa Aktivitets-bildprompt (ny agent) ────────────────────────

  console.log('\n── Fix 4a: Aktivitets-bildprompt (ny) ──')
  const existingActivityPrompt = agentByName.get('Aktivitets-bildprompt')
  if (existingActivityPrompt) {
    // Uppdatera om den redan finns
    const { error } = await supabase
      .from('agents')
      .update({
        system_prompt: ACTIVITY_PROMPT_DESIGNER_SYSTEM,
        config: { max_tokens: 2000, temperature: 0.6 },
      })
      .eq('id', existingActivityPrompt.id)
    if (error) console.error('  ❌ Misslyckades:', error.message)
    else {
      agentIds['Aktivitets-bildprompt'] = existingActivityPrompt.id
      console.log('  ✅ Aktivitets-bildprompt uppdaterad')
    }
  } else {
    const { data, error } = await supabase.from('agents').insert({
      name: 'Aktivitets-bildprompt',
      description: 'Skapar scenebeskrivningar för aktivitetskort-illustrationer (en per aktivitet)',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: ACTIVITY_PROMPT_DESIGNER_SYSTEM,
      config: { max_tokens: 2000, temperature: 0.6 },
      project_id: project.id,
    }).select('id').single()
    if (error || !data) console.error('  ❌ Kunde inte skapa Aktivitets-bildprompt:', error?.message)
    else {
      agentIds['Aktivitets-bildprompt'] = data.id
      console.log('  ✅ Aktivitets-bildprompt skapad')
    }
  }

  // ── Fix 4b: Skapa Aktivitets-illustratör (ny agent) ──────────────────────

  console.log('\n── Fix 4b: Aktivitets-illustratör (ny) ──')
  const existingActivityIllustrator = agentByName.get('Aktivitets-illustratör')
  if (existingActivityIllustrator) {
    const { error } = await supabase
      .from('agents')
      .update({ system_prompt: ACTIVITY_ILLUSTRATOR_SYSTEM })
      .eq('id', existingActivityIllustrator.id)
    if (error) console.error('  ❌ Misslyckades:', error.message)
    else {
      agentIds['Aktivitets-illustratör'] = existingActivityIllustrator.id
      console.log('  ✅ Aktivitets-illustratör uppdaterad')
    }
  } else {
    const { data, error } = await supabase.from('agents').insert({
      name: 'Aktivitets-illustratör',
      description: 'Genererar aktivitetskort-illustrationer i kvadratformat med Pixar-stil',
      model: 'gpt-image-1',
      system_prompt: ACTIVITY_ILLUSTRATOR_SYSTEM,
      config: { max_tokens: 0, temperature: 0 },
      project_id: project.id,
    }).select('id').single()
    if (error || !data) console.error('  ❌ Kunde inte skapa Aktivitets-illustratör:', error?.message)
    else {
      agentIds['Aktivitets-illustratör'] = data.id
      console.log('  ✅ Aktivitets-illustratör skapad')
    }
  }

  // ── Uppdatera workflow-steg ───────────────────────────────────────────────

  console.log('\n── Uppdaterar workflow-steg ──')

  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, steps')
    .eq('name', 'Familje-Stunden Månadspaket')
    .eq('project_id', project.id)
    .single()

  if (!workflow) { console.error('❌ Workflow inte hittat'); process.exit(1) }
  console.log(`  Workflow: ${workflow.id}`)

  const steps = (workflow.steps ?? []) as Array<Record<string, unknown>>

  // Hämta nuvarande agent-id:n om vi inte satte dem ovan (de var redan i DB)
  for (const agentName of [
    'Saga-illustratör-prompt', 'Saga-illustratör',
    'Bildprompt-designer', 'DALL-E Bildgenerator',
    'Aktivitets-bildprompt', 'Aktivitets-illustratör',
  ]) {
    if (!agentIds[agentName]) {
      const found = agentByName.get(agentName)
      if (found) agentIds[agentName] = found.id
    }
  }

  // Bygg en ny steg-lista — behåll befintliga men patcha input_templates och lägg till nya

  // Uppdatera steg 4 (bildprompts/Bildprompt-designer) — ändra antal + ta bort DALL-E-referens
  const step4 = steps.find((s) => s.output_key === 'bildprompts')
  if (step4) {
    step4.input_template = 'Skapa 5 färgläggningsbild-scenebeskrivningar baserat på detta tema:\n\n{{tema}}\n\nNotera: Varje scen ska visa Nova och Pling i en tematisk aktivitet.'
    console.log('  ✅ Steg 4 (bildprompts) input_template uppdaterad')
  }

  // Uppdatera steg 6 (sagabildprompts) — en prompt per sida istället för 5 fasta
  const step6 = steps.find((s) => s.output_key === 'sagabildprompts')
  if (step6) {
    step6.input_template = 'Analysera denna bildsaga och skapa EXAKT en scenebeskrivning per sida (varje [Sid X]-sektion):\n\n{{saga}}'
    if (agentIds['Saga-illustratör-prompt']) {
      step6.agent_id = agentIds['Saga-illustratör-prompt']
    }
    console.log('  ✅ Steg 6 (sagabildprompts) input_template uppdaterad')
  }

  // Uppdatera steg 7 (sagabilder) — sätt rätt agent om den skapades/uppdaterades
  const step7 = steps.find((s) => s.output_key === 'sagabilder')
  if (step7 && agentIds['Saga-illustratör']) {
    step7.agent_id = agentIds['Saga-illustratör']
    console.log('  ✅ Steg 7 (sagabilder) agent_id verifierad')
  }

  // Lägg till aktivitetsbild-steg (8 och 9) om de saknas
  const hasActivityPromptStep  = steps.some((s) => s.output_key === 'aktivitetsbildprompts')
  const hasActivityIllusStep   = steps.some((s) => s.output_key === 'aktivitetsbilder')

  const maxOrder = steps.reduce((m, s) => Math.max(m, (s.order as number) ?? 0), 0)

  const newSteps: Array<Record<string, unknown>> = [...steps]

  if (!hasActivityPromptStep && agentIds['Aktivitets-bildprompt']) {
    newSteps.push({
      order: maxOrder + 1,
      name: 'Designa aktivitetskort-illustrationsprompts',
      agent_id: agentIds['Aktivitets-bildprompt'],
      input_template: `Skapa EN scenebeskrivning per aktivitet baserat på denna aktivitetslista:

{{aktiviteter}}

Analysera aktiviteterna noga och skapa en illustration-prompt som visar Nova & Pling aktivt utföra exakt den aktiviteten.`,
      output_key: 'aktivitetsbildprompts',
    })
    console.log(`  ✅ Lade till steg ${maxOrder + 1} (aktivitetsbildprompts)`)
  }

  if (!hasActivityIllusStep && agentIds['Aktivitets-illustratör']) {
    newSteps.push({
      order: maxOrder + 2,
      name: 'Generera aktivitetskort-illustrationer',
      agent_id: agentIds['Aktivitets-illustratör'],
      input_template: '{{aktivitetsbildprompts}}',
      output_key: 'aktivitetsbilder',
    })
    console.log(`  ✅ Lade till steg ${maxOrder + 2} (aktivitetsbilder)`)
  }

  if (hasActivityPromptStep) console.log('  ⏭️  Aktivitetsbildprompts-steg finns redan')
  if (hasActivityIllusStep)  console.log('  ⏭️  Aktivitetsbilder-steg finns redan')

  // Spara uppdaterade steg
  const { error: stepsErr } = await supabase
    .from('workflows')
    .update({ steps: newSteps })
    .eq('id', workflow.id)

  if (stepsErr) {
    console.error('  ❌ Misslyckades spara steg:', stepsErr.message)
  } else {
    console.log(`  ✅ Workflow sparad med ${newSteps.length} steg totalt`)
  }

  // ── Sammanfattning ────────────────────────────────────────────────────────

  console.log('\n🎉 Klart! Sammanfattning av ändringar:')
  console.log('  1. Saga-illustratör       → SAGA_ILLUSTRATIONS-flagga tillagd (rätt bildformat + stil)')
  console.log('  2. Saga-illustratör-prompt → En prompt per sida, inga karaktärsbeskrivningar')
  console.log('  3. Bildprompt-designer     → Nova & Pling i scenen, 5 prompts, ingen dubbel prefix')
  console.log('  4. Aktivitets-bildprompt   → Ny agent skapad (ACTIVITY_ILLUSTRATIONS-pipeline)')
  console.log('  5. Aktivitets-illustratör  → Ny agent skapad (gpt-image-1 kvadratformat)')
  console.log('  6. Workflow               → Uppdaterade templates + lade till 2 aktivitetssteg')
  console.log('\nNästa körning av månadspaket-workflow genererar:')
  console.log('  • Färgläggningsbilder med Nova & Pling i tematiska scener')
  console.log('  • Sagabilder i rätt Pixar-stil (porträttformat), en per sida')
  console.log('  • Aktivitetskort-illustrationer med Nova & Pling som utför varje aktivitet')
}

main().catch(console.error)
