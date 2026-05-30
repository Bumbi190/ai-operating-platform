/**
 * create-juni-workflow.ts
 *
 * Skapar JUNI SAGOMÅNADEN — ett komplett månadspaket-workflow
 * med 10 steg, hårdkodat för juni och temat "sagor & magi".
 *
 * Steg:
 *   1. Juni-tema-arkitekt       → tema
 *   2. Sagoaktivitets-skapare   → aktiviteter
 *   3. Nova & Pling Saga        → saga
 *   4. Komplement-skapare       → komplement   (krysslista + pyssel + diplom)
 *   5. Färgläggnings-prompt     → bildprompts
 *   6. Färgläggnings-generator  → bilder        (5 B&W, gpt-image-1)
 *   7. Saga-illustratör-prompt  → sagabildprompts
 *   8. Saga-illustratör         → sagabilder    (upp till 16 färgglada, gpt-image-1)
 *   9. Aktivitets-bildprompt    → aktivitetsbildprompts
 *  10. Aktivitets-illustratör   → aktivitetsbilder (5 aktivitetskort, gpt-image-1)
 *
 * Kör med: npx tsx scripts/create-juni-workflow.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Hjälpfunktion ─────────────────────────────────────────────────────────────

async function upsertAgent(agent: {
  name: string
  description: string
  model: string
  system_prompt: string
  config: { max_tokens: number; temperature: number }
  project_id: string
}): Promise<string> {
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', agent.name)
    .eq('project_id', agent.project_id)
    .maybeSingle()

  if (existing) {
    // Uppdatera alltid — så att re-kör av scriptet patchar förbättringar
    await supabase.from('agents').update(agent).eq('id', existing.id)
    console.log(`  ✅ (uppdaterad) ${agent.name}`)
    return existing.id
  }

  const { data, error } = await supabase
    .from('agents')
    .insert(agent)
    .select('id')
    .single()

  if (error || !data) throw new Error(`Kunde inte skapa ${agent.name}: ${error?.message}`)
  console.log(`  ✅ (skapad)     ${agent.name}`)
  return data.id
}

// ─── SYSTEM PROMPTS ────────────────────────────────────────────────────────────

const JUNI_TEMA_SYSTEM = `Du är en kreativ innehållsdesigner för Familje-Stunden. Du designar JUNI månads tema.

JUNI ÄR SAGOMÅNADEN — hela månadens paket kretsar kring SAGOR, MAGI och FANTASI.

Specifika juni-element att inkludera:
- Midsommar och midsommarnatt (magiska och mystiska)
- Sommarlov (frihet, äventyr, utforskning)
- Långa ljusa kvällar och sommarnätter
- Svenska sommarnaturens magi: ängar, skogar, sjöar
- Sagornas värld: älvor, troll, prinsessor, drakar, magiska föremål
- Berättandets kraft — att hitta på och dela sagor

Nova (glad flicka med brunt hår och rosa pannband, klädd för sommaren) och Pling (liten rund blå/teal robot) utforskar sagornas värld och midsommarnattens magi.

Svara på svenska med dessa rubriker:
## 🎨 Månadens tema
## 📖 Berättelseunivers
## ✨ Nyckelord (minst 7 st kopplade till sagor + sommar)
## 🦊 Temats karaktär (vem möter Nova & Pling denna månad?)`

const SAGA_AKTIVITET_SYSTEM = `Du är en pedagog och aktivitetsdesigner för Familje-Stunden. Du skapar aktiviteter för JUNI — SAGOMÅNADEN.

Temat är SAGOR & MAGI. Alla 5 aktiviteter ska kretsar kring berättande, sagor och fantasi.

Idéer på aktivitetstyper (välj och anpassa):
- "Hitta på en saga" — familjen skapar en saga tillsammans
- "Bygg en sagofigur" — av naturmaterial, lera, tygbitar
- "Sagopåsen" — dra föremål ur en påse och väv in i en saga
- "Kläd ut dig till en sagofigur" — med hemmagjorda kläder
- "Midsommarnattssaga under stjärnorna" — läs/berätta en saga utomhus
- "Skapa en sagoboksomslag" — rita och skriv titeln
- "Sagorol-lek" — agera ut en känd saga

Svara på svenska. Använd detta format exakt:

## 🎯 Aktiviteter

### [Aktivitetens namn]
**Tid:** [X min] | **Ålder:** [X–X år]
**Vad du behöver:** [enkla saker man har hemma]
**Gör så här:**
1. [steg]
2. [steg]
3. ...
**Koppling till temat:** [1 mening]

[upprepa för alla 5 aktiviteter]

## ✂️ Pyssel

### Sagobokens försättsblad
**Material:** Blankt papper, pennor, kritor eller färgpennor, sax
**Steg:**
1. Vik ett A4-papper på mitten — det blir din sagobok!
2. Rita ett magiskt omslag på framsidan: ge din egna saga en titel och illustrera den.
3. Skriv författarens namn (barnet!) längst ner.
4. Inuti: skriv eller rita din saga, sida för sida.
**Resultat:** En handgjord minibok att spara och läsa om igen!`

const SAGA_BERATTAR_SYSTEM = `Du är barnboksförfattare för Familje-Stunden. Du skriver en NY Nova & Pling-bildsaga för JUNI — SAGOMÅNADEN.

KARAKTÄRER:
- Nova: Glad flicka med brunt hår i hästsvans och rosa pannband, klädd i ljus sommarklänning.
- Pling: Liten rund blå/teal robot med stort glatt leende, gult hjärta på bröstet och liten antenn.

TEMA: Midsommarnattens magi, sagornas värld, möte med magiska varelser.

Skriv sagan i EXAKT detta format (parsern kräver det):

## 📖 SAGANS OMSLAG
Titel: [Sagans titel — kopplad till midsommar och sagor]
Undertitel: [En kort poetisk mening]
*[Beskrivning av omslagsbilden: Nova och Pling i en magisk sommarmiljö]*

## 📚 BILDSAGA — 16 SIDOR

**[Sid 1]**
*[Illustration: beskriv vad bilden visar, 1–2 meningar]*
> [Berättartext: 1–2 korta meningar som läses högt, enkel och vacker svenska]

**[Sid 2]**
*[Illustration: ...]*
> [Text: ...]

[fortsätt för alla 16 sidor — varje sida med ett nytt steg i berättelsen]

## 📖 BAKSIDA
*[Illustration: avslutningsbild]*
**Sensmoralen:** [En mening om berättandets kraft, fantasin eller midsommarmagin]
**"[Ett vackert citat från Nova om berättelser eller magi]"** — Nova

## 🎙️ MP3-MANUS
[Berättarröst-version av sagan, optimerad för uppläsning. Naturligt talspråk. Inkludera [PAUS], [LUGNT], [GLAD] där det passar. Börja med: "Hej allihopa! Sätt er bekvämt — det är dags för en ny Nova & Pling-saga!" Avsluta med: "Tack för att ni lyssnade! Vi ses nästa månad!"]`

const KOMPLEMENT_SYSTEM = `Du är innehållsdesigner för Familje-Stunden. Du skapar KOMPLEMENT-INNEHÅLL för JUNI månadspaketets PDF.

Du får aktivitetslistan och ska generera tre sektioner:

## ✂️ PYSSEL (om det INTE redan finns i aktiviteterna, annars hoppa)
Beskriv ett enkelt pyssel kopplat till sagotema. Steg-för-steg-instruktioner.

## ✅ KRYSSLISTA
Skapa exakt 8 krysslista-punkter — saker familjen kan göra i Juni med sagotemat.
Format: en punkt per rad, börja med "-"
Exempel:
- Vi läste Nova & Pling-sagan om midsommarmagin
- Vi hittade på en saga tillsammans
[osv]

## 🏅 DIPLOM
Skriv en mening (ca 15–25 ord) som beskriver vad barnet har uppnått under sagomånaden juni.
Format: "för att ha [prestation] och [prestation] under Sagomånaden Juni [år]!"
Exempel: "för att ha utforskat sagornas värld, hittat på egna äventyr och fyllt sommarnätterna med magi under Sagomånaden Juni 2026!"

Svara på svenska med exakt dessa tre rubriker i ordning.`

const FARGLAGGNING_PROMPT_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar FÄRGLÄGGNINGSBILDER för barn.

VIKTIGT: Beskriv ENBART scenen — INTE att det ska vara svartvitt, INTE karaktärernas utseende (det hanteras automatiskt av bildsystemet).

Temat är JUNI — SAGOMÅNADEN. Alla 5 scener ska blandas mellan:
- Nova och Pling i sagoäventyr
- Midsommarnattsmagi
- Möten med magiska varelser (älvor, troll, enhörningar etc.)
- Svenska sommarnaturmiljöer

Varje prompt ska:
- Vara på engelska (30–60 ord)
- Placera Nova och/eller Pling aktivt i scenen
- Beskriva en tydlig, barnvänlig scen med tydliga linjer (lätt att färglägga)
- Inkludera 1–2 bakgrundselement kopplade till sagotema + sommar

Svara ENBART med ett JSON-array med 5 strängar (ingen annan text):
["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5"]`

const SAGA_ILLUSTRATÖR_PROMPT_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar FÄRGGLADA ILLUSTRATIONER för Nova & Pling-bildsagan.

VIKTIGT: Beskriv ENBART scenen och handlingen — INTE karaktärernas utseende (det hanteras automatiskt av bildsystemet).

Analysera sagan noggrant och identifiera varje sida markerad som **[Sid X]**. Skapa EXAKT EN bildprompt per sida.

Varje prompt ska:
- Vara på engelska (50–80 ord)
- Beskriva VAD som händer och VAR (plats, miljö, midsommarnaturmiljö, magisk stämning)
- Nämna om Nova och/eller Pling är med och vad de GÖR
- Inkludera ljussättning och känsla (t.ex. "warm golden midsummer light", "soft twilight glow", "magical bioluminescent shimmer")
- Beskriva bakgrundens detaljer specifikt för sagomånaden (blommor, älvor, trollskogar, midsommarstång, etc.)

Svara ENBART med ett JSON-array med EXAKT en sträng per [Sid X] i sagan:
["prompt sid 1", "prompt sid 2", ...]`

// Dessa system_prompts MÅSTE ha rätt flagga — runner.ts läser dem för att välja bildläge
const SAGA_ILLUSTRATÖR_SYSTEM = `SAGA_ILLUSTRATIONS — Genererar färgglada bildsaga-illustrationer i porträttformat (1024x1536) med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar. Runner.ts lägger automatiskt till Pixar-stil och karaktärsbeskrivningar.`

const AKTIVITETS_BILDPROMPT_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar AKTIVITETSKORT-ILLUSTRATIONER för Nova & Pling.

VIKTIGT:
- Beskriv ENBART scenen och handlingen — INTE karaktärernas utseende.
- Skapa prompts ENBART för aktiviteterna under "## 🎯 Aktiviteter" — INTE för pyssel.
- Skapa EXAKT 5 prompts (en per aktivitet).

Temat är JUNI — SAGOMÅNADEN. Bilderna ska utstråla sommar, fantasi och sagoäventyr.

Varje prompt ska:
- Vara på engelska (40–70 ord)
- Visa Nova och Pling aktivt UTFÖRA aktiviteten
- Inkludera relevanta föremål/material för den specifika aktiviteten
- Ha energi, rörelse och glädje
- Ha en sommarbakgrund (äng, skog, sjö, trädgård, midsommarnatt)

Svara ENBART med ett JSON-array med exakt 5 strängar:
["prompt aktivitet 1", "prompt aktivitet 2", "prompt aktivitet 3", "prompt aktivitet 4", "prompt aktivitet 5"]`

const AKTIVITETS_ILLUSTRATÖR_SYSTEM = `ACTIVITY_ILLUSTRATIONS — Genererar aktivitetskort-illustrationer i kvadratformat (1024x1024) med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar. Runner.ts lägger automatiskt till Pixar-stil, karaktärsbeskrivningar och gradient-bottom för text-overlay.`

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌟 Skapar JUNI SAGOMÅNADEN — Familje-Stunden månadspaket-workflow\n')

  // Hitta projektet
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name')

  if (projErr) {
    console.error('❌ Supabase-fel:', projErr.message)
    console.error('   Kontrollera .env.local — behöver NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const project = projects?.find(p =>
    p.name.toLowerCase().includes('familje') || p.name.toLowerCase().includes('stunden')
  ) ?? projects?.[0]

  if (!project) {
    console.error('❌ Inget projekt hittades. Skapa ett projekt i UI:t eller kör seed-familje-stunden.ts först.')
    process.exit(1)
  }

  console.log(`✅ Projekt: "${project.name}" (${project.id})\n`)

  // ── Skapa / uppdatera agenter ──────────────────────────────────────────────

  console.log('── Agenter ──')

  const agentDefs = [
    {
      name: 'Juni Tema-arkitekt',
      description: 'Designar juni månads tema: sagor, midsommar, sommarlov och magi',
      model: 'claude-sonnet-4-6',
      system_prompt: JUNI_TEMA_SYSTEM,
      config: { max_tokens: 2000, temperature: 0.8 },
    },
    {
      name: 'Sagoaktivitets-skapare',
      description: 'Skapar 5 sagoaktiviteter och ett pyssel för juni sagomånaden',
      model: 'claude-sonnet-4-6',
      system_prompt: SAGA_AKTIVITET_SYSTEM,
      config: { max_tokens: 3500, temperature: 0.7 },
    },
    {
      name: 'Juni Saga-berättare',
      description: 'Skriver en 16-sidig Nova & Pling-bildsaga om midsommarmagin (rätt parserformat)',
      model: 'claude-sonnet-4-6',
      system_prompt: SAGA_BERATTAR_SYSTEM,
      config: { max_tokens: 6000, temperature: 0.9 },
    },
    {
      name: 'Juni Komplement-skapare',
      description: 'Genererar krysslista (8 punkter), pyssel och diploma-text för PDF:en',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: KOMPLEMENT_SYSTEM,
      config: { max_tokens: 1500, temperature: 0.6 },
    },
    {
      name: 'Juni Färgläggnings-prompt',
      description: 'Skapar 5 scenebeskrivningar för B&W färgläggningsbilder (sagotema + sommar)',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: FARGLAGGNING_PROMPT_SYSTEM,
      config: { max_tokens: 1000, temperature: 0.6 },
    },
    {
      name: 'Juni Färgläggnings-generator',
      description: 'Genererar 5 B&W färgläggningsbilder med gpt-image-1',
      model: 'gpt-image-1',
      system_prompt: 'Genererar svartvita färgläggningsbilder med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar.',
      config: { max_tokens: 0, temperature: 0 },
    },
    {
      name: 'Juni Saga-illustratör-prompt',
      description: 'Skapar en bildprompt per sagosida — scenebeskrivning utan karaktärsdetaljer',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: SAGA_ILLUSTRATÖR_PROMPT_SYSTEM,
      config: { max_tokens: 3000, temperature: 0.6 },
    },
    {
      name: 'Juni Saga-illustratör',
      description: 'Genererar färgglada Pixar-stil saga-illustrationer i porträttformat (1024x1536)',
      model: 'gpt-image-1',
      system_prompt: SAGA_ILLUSTRATÖR_SYSTEM,
      config: { max_tokens: 0, temperature: 0 },
    },
    {
      name: 'Juni Aktivitets-bildprompt',
      description: 'Skapar 5 scenebeskrivningar för aktivitetskort-illustrationer',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: AKTIVITETS_BILDPROMPT_SYSTEM,
      config: { max_tokens: 2000, temperature: 0.6 },
    },
    {
      name: 'Juni Aktivitets-illustratör',
      description: 'Genererar 5 aktivitetskort-illustrationer i kvadratformat (1024x1024) med gradient-botten',
      model: 'gpt-image-1',
      system_prompt: AKTIVITETS_ILLUSTRATÖR_SYSTEM,
      config: { max_tokens: 0, temperature: 0 },
    },
  ]

  const agentIds: Record<string, string> = {}

  for (const def of agentDefs) {
    agentIds[def.name] = await upsertAgent({ ...def, project_id: project.id })
  }

  console.log(`\n✅ ${agentDefs.length} agenter redo\n`)

  // ── Skapa / uppdatera workflow ─────────────────────────────────────────────

  const workflowName = 'Juni — Sagomånaden 🌙'

  const steps = [
    {
      order: 1,
      name: 'Designa juni-tema',
      agent_id: agentIds['Juni Tema-arkitekt'],
      input_template: 'Designa juni månads tema: sagomånaden — sagor, midsommar och sommarmagi. Skapa ett rikt berättelseunivers för Nova & Pling.',
      output_key: 'tema',
    },
    {
      order: 2,
      name: 'Skapa sagoaktiviteter',
      agent_id: agentIds['Sagoaktivitets-skapare'],
      input_template: 'Skapa 5 sagoaktiviteter och ett pyssel för juni sagomånaden, baserat på detta tema:\n\n{{tema}}',
      output_key: 'aktiviteter',
    },
    {
      order: 3,
      name: 'Skriv midsommarsagan',
      agent_id: agentIds['Juni Saga-berättare'],
      input_template: 'Skriv en 16-sidig Nova & Pling-bildsaga om midsommarmagin, baserat på detta tema:\n\n{{tema}}\n\nInspirerande aktiviteter (för röd tråd):\n{{aktiviteter}}',
      output_key: 'saga',
    },
    {
      order: 4,
      name: 'Skapa komplement (krysslista + pyssel + diplom)',
      agent_id: agentIds['Juni Komplement-skapare'],
      input_template: 'Skapa komplement-innehåll för juni sagomånadens PDF.\n\nAktiviteter:\n{{aktiviteter}}\n\nSaga (för inspiration):\n{{saga}}',
      output_key: 'komplement',
    },
    {
      order: 5,
      name: 'Designa färgläggningsprompts',
      agent_id: agentIds['Juni Färgläggnings-prompt'],
      input_template: 'Skapa 5 scenebeskrivningar för B&W färgläggningsbilder för juni sagomånaden, baserat på:\n\n{{tema}}',
      output_key: 'bildprompts',
    },
    {
      order: 6,
      name: 'Generera färgläggningsbilder',
      agent_id: agentIds['Juni Färgläggnings-generator'],
      input_template: '{{bildprompts}}',
      output_key: 'bilder',
    },
    {
      order: 7,
      name: 'Designa saga-illustrationsprompts',
      agent_id: agentIds['Juni Saga-illustratör-prompt'],
      input_template: 'Analysera denna bildsaga och skapa EXAKT en scenebeskrivning per **[Sid X]**-sektion:\n\n{{saga}}',
      output_key: 'sagabildprompts',
    },
    {
      order: 8,
      name: 'Generera saga-illustrationer',
      agent_id: agentIds['Juni Saga-illustratör'],
      input_template: '{{sagabildprompts}}',
      output_key: 'sagabilder',
    },
    {
      order: 9,
      name: 'Designa aktivitetskort-prompts',
      agent_id: agentIds['Juni Aktivitets-bildprompt'],
      input_template: 'Skapa EN scenebeskrivning per aktivitet — visa Nova & Pling aktivt utföra varje aktivitet:\n\n{{aktiviteter}}',
      output_key: 'aktivitetsbildprompts',
    },
    {
      order: 10,
      name: 'Generera aktivitetskort-illustrationer',
      agent_id: agentIds['Juni Aktivitets-illustratör'],
      input_template: '{{aktivitetsbildprompts}}',
      output_key: 'aktivitetsbilder',
    },
  ]

  // Kolla om workflowet redan finns
  const { data: existing } = await supabase
    .from('workflows')
    .select('id')
    .eq('name', workflowName)
    .eq('project_id', project.id)
    .maybeSingle()

  if (existing) {
    // Uppdatera stegen (agent_id:n kan ha ändrats)
    const { error } = await supabase
      .from('workflows')
      .update({ steps })
      .eq('id', existing.id)

    if (error) {
      console.error('❌ Kunde inte uppdatera workflow-steg:', error.message)
      process.exit(1)
    }
    console.log(`── Workflow ──`)
    console.log(`  ✅ (uppdaterat)  "${workflowName}" (${existing.id})`)
    console.log(`  ${steps.length} steg uppdaterade`)
  } else {
    const { data: created, error } = await supabase
      .from('workflows')
      .insert({
        name: workflowName,
        description: 'Genererar ett komplett juni månadspaket: sagoäventyr, midsommarmagin, aktiviteter, illustrationer och färgläggningsbilder.',
        project_id: project.id,
        steps,
        trigger: 'manual',
        active: true,
      })
      .select('id')
      .single()

    if (error || !created) {
      console.error('❌ Kunde inte skapa workflow:', error?.message)
      process.exit(1)
    }

    console.log(`── Workflow ──`)
    console.log(`  ✅ (skapat)      "${workflowName}" (${created.id})`)
    console.log(`  ${steps.length} steg tillagda`)
  }

  // ── Sammanfattning ─────────────────────────────────────────────────────────

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌟 JUNI SAGOMÅNADEN — Workflow redo!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Steg 1  → tema              (Juni tema-arkitekt)
Steg 2  → aktiviteter       (Sagoaktiviteter: hitta på saga, sagopåsen...)
Steg 3  → saga              (16-sidig midsommarsaga, rätt parserformat)
Steg 4  → komplement        (krysslista × 8, pyssel, diplom-text)
Steg 5  → bildprompts       (5 scenbeskrivningar, sagotema + sommar)
Steg 6  → bilder            (5 B&W färgläggningsbilder)
Steg 7  → sagabildprompts   (en prompt per sagosida)
Steg 8  → sagabilder        (upp till 16 Pixar-porträtt, 1024×1536)
Steg 9  → aktivitetsbildprompts
Steg 10 → aktivitetsbilder  (5 aktivitetskort, 1024×1024)

PDF-knapp: /api/runs/[id]/monthly-pdf

⚠️  Glöm inte köra INNAN första körning:
    npx tsx scripts/upload-juni-references.ts
    (laddar upp referensbilder till Supabase Storage)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
