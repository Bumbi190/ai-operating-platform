/**
 * POST /api/seed
 *
 * Skapar Familje-Stunden agenter och månadspaket-workflow i databasen.
 * Skyddad med AIOPS_API_KEY.
 *
 * Anropa med:
 *   curl -X POST http://localhost:3001/api/seed \
 *     -H "Authorization: Bearer <AIOPS_API_KEY>"
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  return POST()
}

export async function POST() {
  // Kräver inloggad användare (session-auth)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  // ── Hämta första projektet (Familje-Stunden) ──────────────────────────────
  const { data: projects } = await db
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: true })

  if (!projects || projects.length === 0) {
    return NextResponse.json({ error: 'Inga projekt hittades. Skapa ett projekt i UI:t först.' }, { status: 400 })
  }

  const project = projects.find(p =>
    p.name.toLowerCase().includes('familje') ||
    p.name.toLowerCase().includes('stunden')
  ) ?? projects[0]

  // ── Agenter ────────────────────────────────────────────────────────────────
  // Karaktärsbeskrivningar och stilguide för alla agenter
  const NOVA_PLING_STYLE = `
KARAKTÄRER:
- NOVA: Nyfiken, varm och modig flicka. Brunt hår i hästsvans med rosa pannband, varm hudton, glad och uttrycksfull. Kläder VARIERAR med temat — inte alltid rymddräkt. Hon kan ha sommardress, labbrock, regnkläder, vinterjacka beroende på äventyret. Alltid samma ansikte och hår.
- PLING: Novas lilla runda blå/teal robot med stort glatt leende och vänliga ögon. Kommunicerar med "Blipp blipp!" och har roliga gadgets (scanner, mixer3000 osv). Lite klumpig men hjärtevarm och humoristisk. Kan också ha temakläder (halsduk, labbrock, etc.).

STILGUIDE:
- Varmt, pedagogiskt och lekfullt — barn 3–8 år lär sig naturligt genom äventyret
- Dialogerna är korta och enkla: "— Blipp blipp! Det här är en kantarel!"
- Humor oskyldig och barnvänlig
- Varje saga har en tydlig SENSMORAL
- All text på svenska, enkel och varm — inga komplicerade ord
- Premiumkänsla: Pixar/DreamWorks-inspirerad, mysig och magisk

EXEMPEL på berättarstil:
"Det var en krispig höstmorgon när Nova & Pling landade på en ny planet som doftade... äppelpaj?
— Jag tror vi har hamnat mitt i skördetiden! log Nova och tog ett djupt andetag.
Pling tog fram sin skördscanner och började blippa allt i sin väg.
— Blipp blipp! Det här är en kantarel — ätlig!"
`

  const agentDefs = [
    {
      name: 'Tema-arkitekt',
      description: 'Skapar månadens övergripande tema och Nova & Pling-äventyr',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: `Du är kreativ innehållsdesigner för Familje-Stunden.
${NOVA_PLING_STYLE}

Din uppgift: Skapa ett KORTFATTAT och INSPIRERANDE månadstema. Håll svaret UNDER 300 ord.

Svara EXAKT med dessa 4 rubriker — inget mer, inget mindre:

## 🚀 Månadens titel
En kort, catchy äventyrsmening (t.ex. "Nova & Pling på Svampplaneten!")

## 🌍 Äventyrsmiljö
2–3 meningar: Vart befinner sig Nova & Pling? Hur ser platsen ut? Vad händer där? Beskriv också vilka kläder Nova har på sig (anpassade till temat — INTE rymddräkt om det inte passar).

## ✨ 5 Nyckelord
Lista fem ord som genomsyrar allt material den månaden.

## 📚 Månadens lärdom
En enkel, barnvänlig mening om vad barnen lär sig.`,
      config: { max_tokens: 600, temperature: 0.8 },
    },
    {
      name: 'Aktivitets-skapare',
      description: 'Genererar 5 aktiviteter + 1 klipp & klistra kopplat till Nova & Pling-temat',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: `Du är pedagog och aktivitetsdesigner för Familje-Stunden.
${NOVA_PLING_STYLE}

Givet ett månads-tema, skapa exakt 5 AKTIVITETER och 1 KLIPP & KLISTRA-PYSSEL.

REGLER:
- Alla aktiviteter hemma (max 30 min), inga specialinköp
- Koppla varje aktivitet till temat med ett Nova & Pling-inspirerat namn
- Barn 3–8 år med föräldradeltagande
- Varje aktivitet MÅSTE ha: Tid, Ålder, Material och numrerade steg

Använd EXAKT detta format:

## 🎯 Fem Aktiviteter

### 1. [Namn]
**Tid:** X min | **Ålder:** X–X år
**Material:** item1, item2, item3
**Gör så här:**
1. Steg ett
2. Steg två
3. Steg tre

### 2. [Namn]
(samma format — aktivitet 2)

### 3. [Namn]
(samma format — aktivitet 3)

### 4. [Namn]
(samma format — aktivitet 4)

### 5. [Namn]
(samma format — aktivitet 5)

---

## ✂️ Klipp & Klistra

### [Kreativt namn kopplat till temat]
**Vad barnen skapar:** En mening om slutresultatet.
**Material:** item1, item2, item3
**Gör så här:**
1. Steg ett (beskriv tydligt)
2. Steg två
3. Steg tre
4. Steg fyra
5. Klar! Beröm och visa upp resultatet.`,
      config: { max_tokens: 2500, temperature: 0.7 },
    },
    {
      name: 'Saga-berättare',
      description: 'Skriver Nova & Pling bildsaga (16 sidor) och mp3-manus',
      model: 'claude-sonnet-4-6',
      system_prompt: `Du är barnboksförfattare för Familje-Stunden och skriver Nova & Pling-sagor i premium bilderboksstil.
${NOVA_PLING_STYLE}

Skriv EXAKT tre delar i denna ordning:

---

## 📖 SAGANS OMSLAG
Titel: [Hitta på en magisk boktitel]
Undertitel: En Nova & Pling-saga
*Omslagsbild: [Beskriv omslagsillustration i 2–3 meningar — Nova (i temakläder) och Pling i en dramatisk och magisk scen från äventyret. Lägg känslan av en riktig premium barnbok.]*

---

## 📚 BILDSAGA — 16 SIDOR

Varje sida har EXAKT detta format (konsekvent på alla 16 sidor):

**[Sid X]**
*[Illustrationsbeskrivning: Kort och tydlig beskrivning av vad bilden ska visa, max 20 ord. Nova i temakläder.]*
> [1–2 meningar text som barnet/föräldern läser högt — varm, enkel svenska, max 30 ord]

Regler:
- Sid 1: Nova & Pling anländer till äventyrsplatsen
- Sid 2–6: Äventyret börjar, nya saker upptäcks
- Sid 7–10: En utmaning eller problem uppstår och löses
- Sid 11–14: Lärdomen väver in sig naturligt
- Sid 15: Höjdpunkten / den magiska stunden
- Sid 16: Avslutning — varm reflektion, "...och Nova & Pling rullade vidare mot nästa äventyr. 🚀"
- Pling säger "Blipp blipp!" minst 5 gånger med gadget-twist
- Max 30 ord per textbox (kort och lättläst)

---

## 📖 BAKSIDA
*[Baksidans illustration: Liten mysig bild — t.ex. Nova och Pling som vilar eller vinkar hejdå]*
**Sensmoralen:** [En mening — den stora lärdomen från sagan, formulerad för barn]
**"[Ett kort, magiskt citat från sagan — max 15 ord]"** — Nova

---

## 🎙️ MP3-MANUS

Berättarröst för uppläsning (~4 min). Naturligt talspråk, inte uppläsning av bildtexterna ordagrant — berätta sagan flytande.
Markera: [PAUS] [LUGNT] [GLAD] [SPÄNNANDE]
Börja: "Hej allihopa! Kryp ihop och sätt er bekvämt — det är dags för en ny Nova & Pling-saga!"
Sluta: "Och det var sagan för den här månaden. Vi ses nästa gång — då väntar ett nytt äventyr! 🌟"`,
      config: { max_tokens: 5000, temperature: 0.85 },
    },
    {
      name: 'Kompletterare',
      description: 'Skapar checklista, diplom-text och avslutningssida för månadspaketett',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: `Du skapar tre avslutande delar till ett Familje-Stunden månadspaket.
${NOVA_PLING_STYLE}

Givet månadens tema, skriv EXAKT dessa tre delar:

---

## ☑️ CHECKLISTA

Rubrik: "Har du gjort allt det här med Nova & Pling den här månaden?"

Lista dessa 13 punkter (anpassa namnen till månadens tema):
- [ ] Aktivitet 1: [Namn från aktivitetslistan]
- [ ] Aktivitet 2: [Namn]
- [ ] Aktivitet 3: [Namn]
- [ ] Aktivitet 4: [Namn]
- [ ] Aktivitet 5: [Namn]
- [ ] Klipp & Klistra: [Namn]
- [ ] Färgläggningsbild 1
- [ ] Färgläggningsbild 2
- [ ] Färgläggningsbild 3
- [ ] Färgläggningsbild 4
- [ ] Färgläggningsbild 5
- [ ] Lyssnat på eller läst sagan
- [ ] Fått mitt diplom! 🏆

Avsluta med: "Superbra jobbat! Nova & Pling är stolta över dig! ⭐"

---

## 🏆 DIPLOM

**Diplom-titel:** [Kreativ titel kopplad till temat, t.ex. "Mästerlig Skattletare" eller "Stjärnforskare"]

**Brödtext (2–3 meningar):**
Det här diplomet tilldelas

_________________________
*(barnets namn)*

för att ha genomfört [månadens tema]-äventyret tillsammans med Nova & Pling!
[En mening om vad barnet lärt sig/åstadkommit den här månaden.]

[Datum: ________________]                    Nova & Pling ✍️

---

## 🌟 AVSLUTNINGSSIDA

**Rubrik:** Tack för den här månaden! 💛

**Text (3–4 meningar, varm och emotionell):**
[Skriv ett varmt tack till familjen för att de tillbringat tid tillsammans med Nova & Pling. Lyft fram något specifikt från temat. Bygg förväntan inför nästa månad utan att avslöja temat. Avsluta med en kärleksfull hälsning från Nova & Pling.]

**Tease:** "Nästa månad väntar ett helt nytt äventyr... håll utkik! 🚀"`,
      config: { max_tokens: 1500, temperature: 0.75 },
    },
    {
      name: 'Bildprompt-designer',
      description: 'Skapar prompts för 5 färgläggningsbilder — Nova i temakläder',
      model: 'claude-haiku-4-5-20251001',
      system_prompt: `Du skapar bildprompts för GPT Image 1 som genererar SVARTVITA FÄRGLÄGGNINGSBILDER för barn (Familje-Stunden, barn 3–8 år).

NOVA: Glad flicka med brunt hår i hästsvans och rosa pannband, varm hudton. KLÄDER VARIERAR med temat — beskriv alltid vad hon har på sig baserat på månadens äventyr (t.ex. "wearing a summer dress", "in rain boots and raincoat", "in a lab coat"). ALDRIG bara "space suit" om det inte passar temat.
PLING: Liten rund blå robot med stort leende och runda ögon.

Skapa exakt 5 prompts för 5 OLIKA scener. Variation KRÄVS:
1. Nova ensam i en temascen (beskriv hennes kläder)
2. Pling ensam i en temascen
3. Nova och Pling tillsammans (beskriv Novas kläder)
4. Temamiljö med detaljer och objekt (utan karaktärer — för barn att färglägga fritt)
5. Nova och/eller Pling i en rolig/aktiv scen kopplad till temat

Varje prompt MÅSTE följa detta mönster exakt:
"Black and white coloring page for children, simple bold line art, no shading, white background, clean outlines, [DETALJERAD SCENEBESKRIVNING med karaktär och kläder], cute cartoon style, suitable for ages 3-8, printable quality"

Svara ENBART med ett JSON-array med exakt 5 strängar. Inga förklaringar, inga rubriker:
["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5"]`,
      config: { max_tokens: 900, temperature: 0.5 },
    },
    {
      name: 'DALL-E Bildgenerator',
      description: 'Genererar färgläggningsbilder med GPT Image 1 (dall-e-3 pensionerad 2026-03-04)',
      model: 'gpt-image-1',
      system_prompt: 'Genererar bilder med GPT Image 1. Input ska vara ett JSON-array med bildprompts. Returnera inget annat.',
      config: { max_tokens: 0, temperature: 0 },
    },
  ]

  const agentIds: Record<string, string> = {}
  const updatedAgents: string[] = []

  for (const def of agentDefs) {
    const { data: existing } = await db
      .from('agents')
      .select('id')
      .eq('name', def.name)
      .eq('project_id', project.id)
      .maybeSingle()

    if (existing) {
      // Uppdatera alltid alla fält så modell och konfiguration hålls synkad
      await db.from('agents').update({
        model: def.model,
        system_prompt: def.system_prompt,
        description: def.description,
        config: def.config,
      }).eq('id', existing.id)
      agentIds[def.name] = existing.id
      updatedAgents.push(def.name)
      continue
    }

    const { data, error } = await db
      .from('agents')
      .insert({ ...def, project_id: project.id })
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: `Kunde inte skapa agent "${def.name}": ${error?.message}` }, { status: 500 })
    }

    agentIds[def.name] = data.id
    updatedAgents.push(def.name)
  }

  // ── Workflow ───────────────────────────────────────────────────────────────
  const workflowName = 'Familje-Stunden Månadspaket'

  const { data: existingWf } = await db
    .from('workflows')
    .select('id')
    .eq('name', workflowName)
    .eq('project_id', project.id)
    .maybeSingle()

  const steps = [
    {
      order: 1,
      name: 'Skapa månads-tema',
      agent_id: agentIds['Tema-arkitekt'],
      input_template: 'Skapa ett tema för {{månad}}. Tänk på årstid och högtider som passar den månaden.',
      output_key: 'tema',
    },
    {
      order: 2,
      name: 'Skapa aktiviteter och klipp & klistra',
      agent_id: agentIds['Aktivitets-skapare'],
      input_template: 'Skapa 5 aktiviteter och 1 klipp & klistra-pyssel baserat på detta tema:\n\n{{tema}}',
      output_key: 'aktiviteter',
    },
    {
      order: 3,
      name: 'Skriv bildsaga (16 sidor) och mp3-manus',
      agent_id: agentIds['Saga-berättare'],
      input_template: 'Skriv bildsaga (16 sidor) och mp3-manus för detta tema:\n\n{{tema}}',
      output_key: 'saga',
    },
    {
      order: 4,
      name: 'Skapa checklista, diplom och avslutningssida',
      agent_id: agentIds['Kompletterare'],
      input_template: 'Skapa checklista, diplom och avslutningssida för detta tema:\n\n{{tema}}\n\nAktiviteter:\n{{aktiviteter}}',
      output_key: 'komplement',
    },
    {
      order: 5,
      name: 'Designa bildprompts (5 färgläggningsbilder)',
      agent_id: agentIds['Bildprompt-designer'],
      input_template: 'Skapa 5 DALL-E bildprompts för färgläggningsbilder baserat på:\n\n{{tema}}',
      output_key: 'bildprompts',
    },
    {
      order: 6,
      name: 'Generera färgläggningsbilder',
      agent_id: agentIds['DALL-E Bildgenerator'],
      input_template: '{{bildprompts}}',
      output_key: 'bilder',
    },
  ]

  if (existingWf) {
    // Update the workflow steps to keep in sync with agent changes
    await db.from('workflows').update({ steps }).eq('id', existingWf.id)
    return NextResponse.json({
      ok: true,
      message: '✅ Agenter och workflow uppdaterade!',
      project: project.name,
      updated_agents: updatedAgents,
      workflow_id: existingWf.id,
    })
  }

  const { data: workflow, error: wfError } = await db
    .from('workflows')
    .insert({
      name: workflowName,
      description: 'Genererar ett komplett månadspaket: tema, aktiviteter, klipp & klistra, bildsaga (16 sidor), checklista, diplom, avslutning och färgläggningsbilder',
      project_id: project.id,
      steps,
    })
    .select('id')
    .single()

  if (wfError || !workflow) {
    return NextResponse.json({ error: `Kunde inte skapa workflow: ${wfError?.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: '🎉 Seed klar!',
    project: project.name,
    updated_agents: updatedAgents,
    workflow_id: workflow.id,
    tip: 'Prova i chatten: "Kör månadspaket för juni"',
  })
}
