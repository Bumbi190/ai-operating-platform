/**
 * create-preview-workflow.ts
 *
 * Skapar JULI SAGOMÅNADEN — FÖRHANDSVISNING
 * Identiskt med det fullständiga Juli-workflowet men med max_images: 1
 * på alla bildsteg. Används för att verifiera layout och stil till ~90% lägre kostnad.
 *
 * Genererar:
 *   • 1 färgläggningsbild  (istället för 5)
 *   • 1 sagaillustration   (istället för 16)
 *   • 1 aktivitetsbild     (istället för 5)
 *
 * PDF:en byggs normalt — alla sidor renderas, bilder återanvänds på tomma platser.
 *
 * Kör med: npx tsx scripts/create-preview-workflow.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Hjälpfunktion ──────────────────────────────────────────────────────────────

async function upsertAgent(agent: {
  name: string
  description: string
  model: string
  system_prompt: string
  config: Record<string, unknown>
  project_id: string
}): Promise<string> {
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', agent.name)
    .eq('project_id', agent.project_id)
    .maybeSingle()

  if (existing) {
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

// ─── SYSTEM PROMPTS (identiska med fullständigt workflow) ────────────────────────

const JULI_TEMA_SYSTEM = `Du är en kreativ innehållsdesigner för Familje-Stunden. Du designar JULI månads tema.

JULI ÄR SAGOMÅNADEN — hela månadens paket kretsar kring SAGOR, MAGI och FANTASI.

Specifika juli-element att inkludera:
- Sommarlovets höjdpunkt (frihet, äventyr, utforskning)
- Varma sommarnätter och stjärnhimlar
- Svenska sommarnaturens magi: ängar, skogar, sjöar, hav
- Sagornas värld: älvor, troll, prinsessor, drakar, magiska föremål
- Berättandets kraft — att hitta på och dela sagor
- Midsommarmagin som lever kvar in i juli

Nova (glad flicka med brunt hår och rosa pannband, klädd för sommaren) och Pling (liten humanoid blå/teal robot med gult hjärta) utforskar sagornas värld i den svenska sommaren.

Svara på svenska med dessa rubriker:
## 🎨 Månadens tema
## 📖 Berättelseunivers
## ✨ Nyckelord (minst 7 st kopplade till sagor + sommar)
## 🦊 Temats karaktär (vem möter Nova & Pling denna månad?)`

const SAGA_AKTIVITET_SYSTEM = `Du är en pedagog och aktivitetsdesigner för Familje-Stunden. Du skapar aktiviteter för JULI — SAGOMÅNADEN.

Temat är SAGOR & MAGI. Alla 5 aktiviteter ska kretsa kring berättande, sagor och fantasi.

Idéer på aktivitetstyper (välj och anpassa):
- "Hitta på en saga" — familjen skapar en saga tillsammans
- "Bygg en sagofigur" — av naturmaterial, lera, tygbitar
- "Sagopåsen" — dra föremål ur en påse och väv in i en saga
- "Kläd ut dig till en sagofigur" — med hemmagjorda kläder
- "Sagokväll under stjärnorna" — läs/berätta en saga utomhus
- "Skapa ett sagoboksomslag" — rita och skriv titeln
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

const SAGA_BERATTAR_SYSTEM = `Du är barnboksförfattare för Familje-Stunden. Du skriver en NY Nova & Pling-bildsaga för JULI — SAGOMÅNADEN.

KARAKTÄRER:
- Nova: Glad flicka med brunt hår i hästsvans och rosa pannband, klädd i blå poloskjorta och rosa kjol. Kan byta kläder till temakläder.
- Pling: Liten humanoid blå/teal robot med kupolformat huvud, mörkt ansiktspanel med blå ögon och leende, gult hjärta på bröstet och liten antenn med rosa boll.

TEMA: Sagornas värld, möte med magiska varelser i den svenska sommaren.

Skriv sagan i EXAKT detta format (parsern kräver det):

## 📖 SAGANS OMSLAG
Titel: [Sagans titel — kopplad till sagor och sommar]
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
**Sensmoralen:** [En mening om berättandets kraft, fantasin eller sagornas magi]
**"[Ett vackert citat från Nova om berättelser eller magi]"** — Nova

## 🎙️ MP3-MANUS
[Berättarröst-version av sagan, optimerad för uppläsning. Naturligt talspråk. Inkludera [PAUS], [LUGNT], [GLAD] där det passar. Börja med: "Hej allihopa! Sätt er bekvämt — det är dags för en ny Nova & Pling-saga!" Avsluta med: "Tack för att ni lyssnade! Vi ses nästa månad!"]`

const KOMPLEMENT_SYSTEM = `Du är innehållsdesigner för Familje-Stunden. Du skapar KOMPLEMENT-INNEHÅLL för JULI månadspaketets PDF.

Du får aktivitetslistan och ska generera tre sektioner:

## ✂️ PYSSEL (om det INTE redan finns i aktiviteterna, annars hoppa)
Beskriv ett enkelt pyssel kopplat till sagotema. Steg-för-steg-instruktioner.

## ✅ KRYSSLISTA
Skapa exakt 8 krysslista-punkter — saker familjen kan göra i Juli med sagotemat.
Format: en punkt per rad, börja med "-"
Exempel:
- Vi läste Nova & Pling-sagan om sagoäventyret
- Vi hittade på en saga tillsammans
[osv]

## 🏅 DIPLOM
Skriv en mening (ca 15–25 ord) som beskriver vad barnet har uppnått under sagomånaden juli.
Format: "för att ha [prestation] och [prestation] under Sagomånaden Juli [år]!"
Exempel: "för att ha utforskat sagornas värld, hittat på egna äventyr och fyllt sommardagarna med magi under Sagomånaden Juli 2026!"

Svara på svenska med exakt dessa tre rubriker i ordning.`

const FARGLAGGNING_PROMPT_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar FÄRGLÄGGNINGSBILDER för barn.

VIKTIGT: Beskriv ENBART scenen — INTE att det ska vara svartvitt, INTE karaktärernas utseende (det hanteras automatiskt av bildsystemet).

Temat är JULI — SAGOMÅNADEN. Alla scener ska blandas mellan:
- Nova och Pling i sagoäventyr
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
- Beskriva VAD som händer och VAR (plats, miljö, magisk stämning)
- Nämna om Nova och/eller Pling är med och vad de GÖR
- Inkludera ljussättning och känsla (t.ex. "warm golden summer light", "soft twilight glow", "magical bioluminescent shimmer")
- Beskriva bakgrundens detaljer specifikt för sagomånaden (blommor, älvor, trollskogar, magiska varelser, etc.)

Svara ENBART med ett JSON-array med EXAKT en sträng per [Sid X] i sagan:
["prompt sid 1", "prompt sid 2", ...]`

const SAGA_ILLUSTRATÖR_SYSTEM = `SAGA_ILLUSTRATIONS — Genererar färgglada bildsaga-illustrationer i porträttformat (1024x1536) med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar. Runner.ts lägger automatiskt till Pixar-stil och karaktärsbeskrivningar.`

const AKTIVITETS_BILDPROMPT_SYSTEM = `Du skapar SCENEBESKRIVNINGAR för gpt-image-1 som genererar AKTIVITETSKORT-ILLUSTRATIONER för Nova & Pling.

VIKTIGT:
- Beskriv ENBART scenen och handlingen — INTE karaktärernas utseende.
- Skapa prompts ENBART för aktiviteterna under "## 🎯 Aktiviteter" — INTE för pyssel.
- Skapa EXAKT 5 prompts (en per aktivitet).

Temat är JULI — SAGOMÅNADEN. Bilderna ska utstråla sommar, fantasi och sagoäventyr.

Varje prompt ska:
- Vara på engelska (40–70 ord)
- Visa Nova och Pling aktivt UTFÖRA aktiviteten
- Inkludera relevanta föremål/material för den specifika aktiviteten
- Ha energi, rörelse och glädje
- Ha en sommarbakgrund (äng, skog, sjö, trädgård, sommarnatt)

Svara ENBART med ett JSON-array med exakt 5 strängar:
["prompt aktivitet 1", "prompt aktivitet 2", "prompt aktivitet 3", "prompt aktivitet 4", "prompt aktivitet 5"]`

const AKTIVITETS_ILLUSTRATÖR_SYSTEM = `ACTIVITY_ILLUSTRATIONS — Genererar aktivitetskort-illustrationer i kvadratformat (1024x1024) med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar. Runner.ts lägger automatiskt till ljus tecknad stil, karaktärsbeskrivningar och gradient-bottom för text-overlay.`

const OMSLAGS_PROMPT_SYSTEM = `Du skapar BILDPROMPTS för gpt-image-1 som genererar OMSLAGSBILDER med inbakad text för Familje-Stunden månadspaket.

Du ska generera EXAKT 2 prompts i ett JSON-array:
1. Månadspaketets OMSLAGS-bild — det stora framsidesomslagets illustration med månadsnamnet inbakat
2. SAGANS OMSLAG-bild — illustrationen till sagosidan med sagotiteln inbakat

Båda bilderna ska:
- Vara i LJUS FLAT CARTOON-stil (som en illustrerad barnbok, ej mörk/cinematic)
- Ha Nova och Pling i en glädjefull scen kopplad till månadstemats
- Ha titel-texten TYDLIGT INBAKAD i illustrationen med stora, bubbliga, tecknade bokstäver
- Utstråla glädje, sommar och barnvänlig magi

Regler för prompts:
- Skriv på engelska (60–90 ord per prompt)
- Specificera EXAKT vilken text som ska visas (t.ex. 'render the text "JULI — SAGOMÅNADEN" in large bubbly cartoon letters at the top')
- Beskriv scen, karaktärer (Nova & Pling), bakgrund och stämning
- Specificera textstil: "large bold bubbly cartoon font, bright yellow with dark outline"

Du får temat och sagans titel som input.

Svara ENBART med ett JSON-array med exakt 2 strängar:
["prompt för månadsomslag", "prompt för sagaomslag"]`

const OMSLAGS_ILLUSTRATÖR_SYSTEM = `COVER_ILLUSTRATIONS — Genererar omslagsbilder i porträttformat (1024x1536) med titel-text INBAKAD i illustrationen. Input ska vara JSON-array med 2 bildprompts. Runner.ts genererar ljusa flat cartoon-illustrationer — inga Pixar/cinematic-stilar.`

const PYSSEL_BILDPROMPT_SYSTEM = `Du skapar EN SCENEBESKRIVNING för gpt-image-1 som genererar en PYSSEL-ILLUSTRATION för Familje-Stunden månadspaket.

VIKTIGT: Beskriv ENBART scenen och handlingen — INTE karaktärernas utseende.

Illustrationen visar Nova och Pling som aktivt HÅLLER PÅ MED pysselaktiviteten.

Prompt ska:
- Vara på engelska (50–75 ord)
- Visa Nova och Pling göra pysslet (hålla i material, klippa, måla, bygga, etc.)
- Ha relevant pyssel-rekvisita på ett bord eller yta i förgrunden
- Inkludera en ljus, varm bakgrundsmiljö (t.ex. ett kreativt rum, ett bord utomhus)
- Ha energi, fokus och glädje

Svara ENBART med ett JSON-array med EN sträng:
["prompt för pyssel-illustration"]`

const PYSSEL_ILLUSTRATÖR_SYSTEM = `ACTIVITY_ILLUSTRATIONS — Genererar pyssel-illustration i kvadratformat (1024x1024) med gpt-image-1. Input ska vara JSON-array med 1 scenebeskrivning. Runner.ts lägger automatiskt till ljus tecknad stil, karaktärsbeskrivningar och gradient-bottom för text-overlay.`

// ─── MAIN ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Skapar JULI SAGOMÅNADEN — FÖRHANDSVISNING (1 bild/steg)\n')

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
    console.error('❌ Inget projekt hittades.')
    process.exit(1)
  }

  console.log(`✅ Projekt: "${project.name}" (${project.id})\n`)

  console.log('── Agenter ──')

  const agentDefs = [
    // ── Text-agenter (oförändrade från fullständigt workflow) ──────────────
    {
      name: 'Juli Tema-arkitekt [Preview]',
      description: 'Designar juli månads tema: sagor, sommar och magi',
      model: 'claude-sonnet-4-6',
      system_prompt: JULI_TEMA_SYSTEM,
      config: { max_tokens: 2000, temperature: 0.8 },
    },
    {
      name: 'Sagoaktivitets-skapare [Preview]',
      description: 'Skapar 5 sagoaktiviteter och ett pyssel för juli sagomånaden',
      model: 'claude-sonnet-4-6',
      system_prompt: SAGA_AKTIVITET_SYSTEM,
      config: { max_tokens: 3500, temperature: 0.7 },
    },
    {
      name: 'Juli Saga-berättare [Preview]',
      description: 'Skriver en 16-sidig Nova & Pling-bildsaga om sagoäventyret',
      model: 'claude-sonnet-4-6',
      system_prompt: SAGA_BERATTAR_SYSTEM,
      config: { max_tokens: 6000, temperature: 0.9 },
    },
    {
      name: 'Juli Komplement-skapare [Preview]',
      description: 'Genererar krysslista, pyssel och diploma-text',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: KOMPLEMENT_SYSTEM,
      config: { max_tokens: 1500, temperature: 0.6 },
    },
    {
      name: 'Juli Färgläggnings-prompt [Preview]',
      description: 'Skapar scenebeskrivningar för B&W färgläggningsbilder',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: FARGLAGGNING_PROMPT_SYSTEM,
      config: { max_tokens: 1000, temperature: 0.6 },
    },
    // ── Bildagenter — max_images: 1 för preview ───────────────────────────
    {
      name: 'Juli Färgläggnings-generator [Preview]',
      description: 'Genererar 1 B&W färgläggningsbild (preview) med gpt-image-1',
      model: 'gpt-image-1',
      system_prompt: 'Genererar svartvita färgläggningsbilder med gpt-image-1. Input ska vara JSON-array med scenebeskrivningar.',
      config: { max_tokens: 0, temperature: 0, max_images: 1 },
    },
    {
      name: 'Juli Saga-illustratör-prompt [Preview]',
      description: 'Skapar en bildprompt per sagosida',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: SAGA_ILLUSTRATÖR_PROMPT_SYSTEM,
      config: { max_tokens: 3000, temperature: 0.6 },
    },
    {
      name: 'Juli Saga-illustratör [Preview]',
      description: 'Genererar 1 sagaillustration (preview) med gpt-image-1',
      model: 'gpt-image-1',
      system_prompt: SAGA_ILLUSTRATÖR_SYSTEM,
      config: { max_tokens: 0, temperature: 0, max_images: 1 },
    },
    {
      name: 'Juli Aktivitets-bildprompt [Preview]',
      description: 'Skapar scenebeskrivningar för aktivitetskort',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: AKTIVITETS_BILDPROMPT_SYSTEM,
      config: { max_tokens: 2000, temperature: 0.6 },
    },
    {
      name: 'Juli Aktivitets-illustratör [Preview]',
      description: 'Genererar 5 aktivitetsbilder (preview) med Ideogram v3',
      model: 'gpt-image-1',
      system_prompt: AKTIVITETS_ILLUSTRATÖR_SYSTEM,
      config: { max_tokens: 0, temperature: 0, max_images: 5 },
    },
    // ── Omslagsbilder (nya steg) ──────────────────────────────────────────
    {
      name: 'Juli Omslags-prompt [Preview]',
      description: 'Skapar 2 bildprompts med inbakad text — en för månadsomslaget och en för sagaomslagets',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: OMSLAGS_PROMPT_SYSTEM,
      config: { max_tokens: 1000, temperature: 0.7 },
    },
    {
      name: 'Juli Omslags-illustratör [Preview]',
      description: 'Genererar 1 omslagsbild (preview) med gpt-image-1 — titel inbakad i ljus tecknad stil',
      model: 'gpt-image-1',
      system_prompt: OMSLAGS_ILLUSTRATÖR_SYSTEM,
      config: { max_tokens: 0, temperature: 0, max_images: 1 },
    },
    // ── Pyssel-illustration (nya steg) ────────────────────────────────────
    {
      name: 'Juli Pyssel-bildprompt [Preview]',
      description: 'Skapar 1 scenebeskrivning för pyssel-illustrationen — Nova & Pling håller på med pysslet',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: PYSSEL_BILDPROMPT_SYSTEM,
      config: { max_tokens: 500, temperature: 0.7 },
    },
    {
      name: 'Juli Pyssel-illustratör [Preview]',
      description: 'Genererar 1 pyssel-illustration (preview) med gpt-image-1',
      model: 'gpt-image-1',
      system_prompt: PYSSEL_ILLUSTRATÖR_SYSTEM,
      config: { max_tokens: 0, temperature: 0, max_images: 1 },
    },
  ]

  const agentIds: Record<string, string> = {}
  for (const def of agentDefs) {
    agentIds[def.name] = await upsertAgent({ ...def, project_id: project.id })
  }

  console.log(`\n✅ ${agentDefs.length} agenter redo\n`)

  // ── Workflow ───────────────────────────────────────────────────────────────

  const workflowName = 'Juli — Sagomånaden 🔍 Förhandsvisning'

  const steps = [
    {
      order: 1,
      name: 'Designa juli-tema',
      agent_id: agentIds['Juli Tema-arkitekt [Preview]'],
      input_template: 'Designa juli månads tema: sagomånaden — sagor och sommarmagi. Skapa ett rikt berättelseunivers för Nova & Pling.',
      output_key: 'tema',
    },
    {
      order: 2,
      name: 'Skapa sagoaktiviteter',
      agent_id: agentIds['Sagoaktivitets-skapare [Preview]'],
      input_template: 'Skapa 5 sagoaktiviteter och ett pyssel för juli sagomånaden, baserat på detta tema:\n\n{{tema}}',
      output_key: 'aktiviteter',
    },
    {
      order: 3,
      name: 'Skriv sagomånaden-sagan',
      agent_id: agentIds['Juli Saga-berättare [Preview]'],
      input_template: 'Skriv en 16-sidig Nova & Pling-bildsaga om sagoäventyret, baserat på detta tema:\n\n{{tema}}\n\nInspirerande aktiviteter (för röd tråd):\n{{aktiviteter}}',
      output_key: 'saga',
    },
    {
      order: 4,
      name: 'Skapa komplement',
      agent_id: agentIds['Juli Komplement-skapare [Preview]'],
      input_template: 'Skapa komplement-innehåll för juli sagomånadens PDF.\n\nAktiviteter:\n{{aktiviteter}}\n\nSaga (för inspiration):\n{{saga}}',
      output_key: 'komplement',
    },
    {
      order: 5,
      name: 'Designa färgläggningsprompts',
      agent_id: agentIds['Juli Färgläggnings-prompt [Preview]'],
      input_template: 'Skapa 5 scenebeskrivningar för B&W färgläggningsbilder för juli sagomånaden, baserat på:\n\n{{tema}}',
      output_key: 'bildprompts',
    },
    {
      order: 6,
      name: 'Generera 1 färgläggningsbild (preview)',
      agent_id: agentIds['Juli Färgläggnings-generator [Preview]'],
      input_template: '{{bildprompts}}',
      output_key: 'bilder',
    },
    {
      order: 7,
      name: 'Designa saga-illustrationsprompts',
      agent_id: agentIds['Juli Saga-illustratör-prompt [Preview]'],
      input_template: 'Analysera denna bildsaga och skapa EXAKT en scenebeskrivning per **[Sid X]**-sektion:\n\n{{saga}}',
      output_key: 'sagabildprompts',
    },
    {
      order: 8,
      name: 'Generera 1 saga-illustration (preview)',
      agent_id: agentIds['Juli Saga-illustratör [Preview]'],
      input_template: '{{sagabildprompts}}',
      output_key: 'sagabilder',
    },
    {
      order: 9,
      name: 'Designa aktivitetskort-prompts',
      agent_id: agentIds['Juli Aktivitets-bildprompt [Preview]'],
      input_template: 'Skapa EN scenebeskrivning per aktivitet — visa Nova & Pling aktivt utföra varje aktivitet:\n\n{{aktiviteter}}',
      output_key: 'aktivitetsbildprompts',
    },
    {
      order: 10,
      name: 'Generera 5 aktivitetsbilder (preview)',
      agent_id: agentIds['Juli Aktivitets-illustratör [Preview]'],
      input_template: '{{aktivitetsbildprompts}}',
      output_key: 'aktivitetsbilder',
    },
    {
      order: 11,
      name: 'Designa omslagsbildprompts',
      agent_id: agentIds['Juli Omslags-prompt [Preview]'],
      input_template: 'Skapa 2 omslagsbildprompts för juli sagomånaden.\n\nTema:\n{{tema}}\n\nSagans titel och undertitel (hämta från sagan nedan):\n{{saga}}\n\nBild 1 = månadspaketets omslag med text "JULI — SAGOMÅNADEN" inbakat.\nBild 2 = sagaomslagets bild med sagans exakta titel inbakat.',
      output_key: 'omslags_bildprompts',
    },
    {
      order: 12,
      name: 'Generera 1 omslagsbild (preview)',
      agent_id: agentIds['Juli Omslags-illustratör [Preview]'],
      input_template: '{{omslags_bildprompts}}',
      output_key: 'omslagsbilder',
    },
    {
      order: 13,
      name: 'Designa pyssel-bildprompt',
      agent_id: agentIds['Juli Pyssel-bildprompt [Preview]'],
      input_template: 'Skapa EN scenebeskrivning för pyssel-illustrationen baserat på detta pyssel:\n\n{{aktiviteter}}\n\nFokusera på pyssel-sektionen (✂️ Pyssel). Visa Nova & Pling aktivt håller på med det.',
      output_key: 'pyssel_bildprompt',
    },
    {
      order: 14,
      name: 'Generera 1 pyssel-illustration (preview)',
      agent_id: agentIds['Juli Pyssel-illustratör [Preview]'],
      input_template: '{{pyssel_bildprompt}}',
      output_key: 'pysselbilder',
    },
  ]

  const { data: existing } = await supabase
    .from('workflows')
    .select('id')
    .eq('name', workflowName)
    .eq('project_id', project.id)
    .maybeSingle()

  if (existing) {
    await supabase.from('workflows').update({ steps }).eq('id', existing.id)
    console.log(`── Workflow ──`)
    console.log(`  ✅ (uppdaterat)  "${workflowName}" (${existing.id})`)
  } else {
    const { data: created, error } = await supabase
      .from('workflows')
      .insert({
        name: workflowName,
        description: 'Preview-körning av Juli Sagomånaden — genererar 1 bild per bildsteg för snabb och billig layoutverifiering.',
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
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 JULI SAGOMÅNADEN — FÖRHANDSVISNING — Workflow redo!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Steg 1  → tema                  (text, oförändrat)
Steg 2  → aktiviteter           (text, oförändrat)
Steg 3  → saga                  (text, oförändrat)
Steg 4  → komplement            (text, oförändrat)
Steg 5  → bildprompts           (text, oförändrat)
Steg 6  → bilder                (💰 1 bild istället för 5)
Steg 7  → sagabildprompts       (text, oförändrat)
Steg 8  → sagabilder            (💰 1 bild istället för 16)
Steg 9  → aktivitetsbildprompts (text, oförändrat)
Steg 10 → aktivitetsbilder      (💰 1 bild istället för 5)
Steg 11 → omslags_bildprompts   (text, oförändrat)
Steg 12 → omslagsbilder         (💰 1 bild istället för 2 — titel inbakad!)
Steg 13 → pyssel_bildprompt     (text, oförändrat)
Steg 14 → pysselbilder          (💰 1 bild — pyssel-illustration med Nova & Pling)

💰 Kostnad: ~5 bilder vs ~29 = ca 83% billigare än full körning
📄 PDF:en renderas normalt — bilder återanvänds på tomma platser
🎨 Omslagsbilder: ljus flat cartoon med titel inbakad av gpt-image-1
✂️ Pyssel-sida: illustration + strukturerade boxar + klipplinjer om relevant

PDF-knapp: /api/runs/[id]/monthly-pdf

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
