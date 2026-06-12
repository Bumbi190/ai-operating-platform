# OMNIRA UI/UX 2.0 — Produkt- och UX-plan

_Planeringsartefakt, juni 2026. Ingen kod ändrad. Grundad i faktisk kod (`apps/web`, 41 sidor, 14 sidebar-poster, 40+ DB-tabeller) samt audit av Graphify, Logseq och Obsidian. Bygger vidare på `OMNIRA_ATLAS_FIRST_UX_AUDIT.md` men ersätter dess IA där den krockar med projekt-first-målet._

---

## 0. Sammanfattning i en mening

Omnira har redan sin produkt — Atlas, en agent som kan rapportera och agera över hela plattformen — men UI:t är fortfarande en samling av ~20 verktygssidor som duplicerar varandra; 2.0 gör **Atlas till operativsystemet, projekten till rummen, och resten till instrument som Atlas djuplänkar in i** — plus två nya ytor som idag helt saknas: en typad kunskapsgraf och en lineage-vy över agentarbetet.

---

## 1. Audit av nuvarande UI — vad som är fel

### 1.1 Vad som faktiskt finns

**Global sidebar: 14 poster** (`Sidebar.tsx`): Atlas, Operations Center, Marknadsgranskning, Content Center, Operationscentral (`/dashboard`), Revenue Center, Action Center, Agentaktivitet, Operatör (`/manager`), Chat, Granskningar, Minne, Kostnader, Planering. Därtill tre sidor som *inte* finns i nav: `/atlas/actions`, `/atlas/activity`, `/system`. Plus projekt-subnav (Agenter, Arbetsflöden, Körningar, Utdata) och fyra extra medieflikar enbart för `ai-media-automation`. Plus en permanent Activity Rail-kolumn på 300px på varje sida.

### 1.2 Kritiska fynd

**F1 — Samma information renderas 3–4 gånger.** Tre "executive briefings" (`/atlas`, `/dashboard`, `/atlas/actions`), två action-listor (`/action-center`, `/atlas/actions`), tre activity-ytor (rail, `/atlas/activity`, `/agent-activity`), tre operationsvyer (`/atlas/operations`, `/manager`, `/dashboard`). Ingen är kanonisk. Detta är inte 14 verktyg — det är ~6 verktyg renderade i 14 skepnader.

**F2 — Navigationen är verktygscentrerad, men din mentala modell är projekt.** Koden bekräfta det: `familje-stunden`, `the-prompt`, `gainpilot` är de entiteter affärslogiken (revenue, leads, marketing, content) snurrar kring — men sidebar-hierarkin sätter 14 globala verktyg överst och degraderar projekten till en "Autonom stack"-lista längst ner. Du tvingas tänka "vilket verktyg?" när frågan alltid är "vilket projekt?".

**F3 — Projekt-modellen är inkonsekvent i grunden.** `ai-media-automation` är det mest refererade projekt-slugget i koden (35 förekomster) men är inte en business — det är en *pipeline* som producerar innehåll åt Familje-Stunden. Samtidigt ligger `/atlas/marketing` (endast Familje-Stunden) och `/atlas/content` (endast The Prompt) i *global* nav. Projektscopet läcker åt båda håll: globala ytor är hemligt projekt-specifika, och projekt-ytor är globala.

**F4 — Dashboarden visar data, inte beslut.** `/dashboard` och `/atlas` radar upp kort och siffror men svarar inte på operatörens enda fråga: *vad ska jag göra härnäst, och varför?* Beslutstödet (ROI-flaggor, failed runs, väntande approvals) finns utspritt i fyra ytor i stället för som en rankad lista med en åtgärdsknapp.

**F5 — ⌘K är dekoration och Atlas djuplänkar inte.** Command-baren har ingen handler. Atlas-svar innehåller aldrig "öppna denna sida". Det enda navigationssättet är sidebar-jakt — tvärtemot Atlas-first-tesen.

**F6 — Manuella knappar ("Kör nu", regenerate, pause) lägger systemunderhåll på operatören.** Atlas är byggd för att initiera; UI:t kräver ändå klick.

**F7 — Namngivningen vilseleder aktivt.** "Operationscentral" = `/dashboard` men "Operations Center" = `/atlas/operations`; "Action Center" är både en sida och namnet på en annan sida. Svenska/engelska blandas utan princip.

**F8 — Det som borde finnas saknas.** Ingen kunskapsgraf (trots `memories`, `platform_memory`, `dream_issues`, `manager_tasks`, decisions i `/memory`). Ingen lineage-vy (trots att kedjan Workflow → Run → Finding → Task → Resolution finns i datan). Ingen riktig analytics (sparklines finns, men inga trendgrafer över kostnad/revenue/leads/följare per projekt över tid).

**F9 — Repo-cruft.** `CommandBar 2.tsx`, `brand 2/`, `supabase 2/`, `package-lock 2.json`, stray `route 2.ts` — duplicerade skuggfiler som skapar "vilken fil är äkta?"-risk.

### 1.3 Slutsats

Problemet är inte att sidorna är fula — de är genomarbetade. Problemet är att **arkitekturen optimerar för feature-synlighet i stället för operatörsbeslut**, och att Atlas behandlas som en sida bland fjorton i stället för som plattformens kärna.

---

## 2. Audit av referensrepon — vad som är värt att ta

### 2.1 Graphify (safishamsi/graphify)

Bygger automatiskt kunskapsgraf ur filer (AST, markdown, PDF) och levererar interaktiv graf + query-bar JSON-artefakt.

**Adoptera:**
1. **Automatisk grafbyggnad.** Grafen är en biprodukt av systemets aktivitet — aldrig manuellt arbete. Omniras agenter skapar redan noderna (runs, tasks, findings); de ska skapa kanterna också.
2. **Kant-provenance: EXTRACTED / INFERRED.** Varje relation taggas som explicit loggad ("Run X producerade Finding Y") eller inferrerad (semantisk likhet). Avgörande för förtroende.
3. **Grafen som agent-API, inte bara människo-UI.** Atlas ska kunna query:a grafen ("path från Decision D till Revenue-event R") — grafen blir Atlas långtidsminnes-index, inte bara en visualisering.
4. **Derived insights ovanpå grafen:** god nodes (vad allt hänger ihop genom), överraskande kopplingar med "varför" i klartext, föreslagna frågor.

**Adoptera INTE:** den globala grafrenderingen som primärt gränssnitt (även Graphify levererar värdet via queries/rapport, inte bubblorna); algoritmisk community-klustring som primär gruppering — Omnira har redan *typade* noder, använd typerna.

### 2.2 Logseq

Block-baserad outliner med bidirektionella länkar, journals, Datalog-queries, graph view.

**Adoptera:**
1. **Backlinks-panelen ("Linked references") är hjälten, inte grafen.** På varje entitet: "dessa 7 Runs refererar denna Decision". Mest använda relationsvyn i hela verktygsklassen.
2. **Sparade queries som levande vyer.** "Alla Decisions utan kopplad Task", "Findings olösta >7 dagar" — frågebara vyer slår visuell browsing.
3. **Journal-tänket** mappar direkt på agentloggar: en kronologisk daglig vy där Runs/Findings landar automatiskt och länkar ut till entiteter. (= dagens Activity, men med länkar till grafen.)
4. **Riktningen i Logseq DB-versionen** — typade entiteter + typade properties i databas i stället för fritext — validerar Omniras upplägg.

**Adoptera INTE:** graph view:n (brett kritiserad även internt som "eye candy" — en hairball man tittar på en gång och aldrig agerar från); block-outlinern som datamodell (fel granularitet — Omniras entiteter är strukturerade objekt); manuell `[[länkning]]` som krav (grafer som kräver användarlänkning förblir glesa); rått Datalog exponerat mot användaren.

### 2.3 Obsidian

Lokala markdown-filer, backlinks + unlinked mentions, global/local graph, canvas, dataview.

**Adoptera:**
1. **Local graph med djup-reglage — den enskilt bästa idén.** Utgå från *en* entitet (en Decision), visa grannskapet 1–2 hopp ut. Liten, läsbar, handlingsbar. Detta — inte en global graf — är default-vyn.
2. **Filter + färggrupper per nodtyp** (Memory/Finding/Task/Decision/Workflow/Run togglas var för sig), inkl. "orphans"-toggle ≈ "visa föräldralösa minnen".
3. **Unlinked mentions som agent-funktion:** Atlas föreslår kanter den *tror* finns ("denna Run nämner Decision-X — koppla?") i stället för att användaren länkar manuellt.
4. **Canvas-idén selektivt:** kuraterade tavlor av utvalda noder (t.ex. en kampanjplan) som komplement — inte kärnan.

**Adoptera INTE:** global graf som default (oläsbar hårboll vid >några hundra noder — kräv aktivt filter innan rendering); fysik-reglage (center/repel/link force) exponerade för användaren — välj deterministisk, typgrupperad layout; otypade kanter (Obsidians kanter betyder bara "nämner" — Omnira behöver `produced_by`, `decided_in`, `resolves`, `blocks`, `derived_from`).

### 2.4 Syntes

> **Ta:** local graph kring entitet + backlinks-panel + automatiska, typade, provenance-taggade kanter + föreslagna kanter + sparade queries + journal-vy + derived insights + graf som agent-API.
> **Skippa:** global hairball som dekoration, manuell länkning som förutsättning, block-outliner, fysikinställningar, rått frågespråk.
> **Inte ett Obsidian-klon:** Obsidian är ett *anteckningsverktyg där människan skriver*. Atlas Knowledge Graph är ett *systemminne där agenter skriver och människan auditerar*. Det vänder på hela interaktionsmodellen.

---

## 3. Designprinciper för 2.0

1. **Atlas är OS:et, inte en flik.** Allt som Atlas kan säga i en mening är en fråga, inte en sida.
2. **En sida förtjänar sin existens endast om** den visar något Atlas inte kan säga i en mening *och* operatören behöver skanna visuellt (trendgraf, approval-kö, graf-grannskap, lineage).
3. **Projekt är rummen.** All projektdata bor under projektet. Inga projekt-specifika ytor i global nav.
4. **Instrument är read-only och filter-adresserbara.** Åtgärder initieras via Atlas; varje instrument accepterar query-params så Atlas kan djuplänka till exakt rätt slice.
5. **Agenterna bygger grafen; människan auditerar den.** Aldrig manuell länkning som krav.
6. **Ett koncept, ett namn, ett ställe.** Inga dubbletter, inga svensk/engelska kollisioner.

---

## 4. Informationsarkitektur 2.0

```
ATLAS  (hem + chat = en yta; landningssida)
  ├─ Briefing (morgonläge: vad hände, vad kostade det, vad kräver dig)
  ├─ Nästa åtgärder (EN rankad lista, med Atlas-exekvering + djuplänk-chips)
  └─ Konversation (samma yta — ingen separat /chat)

PROJEKT  (rummen — primär struktur)
  ├─ Familje-Stunden
  ├─ The Prompt
  ├─ GainPilot
  ├─ Omnira (plattformen som eget projekt: bugscan, hälsa, principer)
  └─ … varje projekt har SAMMA standardvyer:
       Översikt   — projektets briefing + nyckeltal + nästa åtgärder (projektscopad)
       Analytics  — trender: kostnad, revenue, leads, följare, content-performance
       Innehåll   — pipeline/kö (absorberar media-, content- och marketing-ytorna;
                    vilka moduler som visas styrs av projektets capabilities)
       Granskning — approvals för projektet
       System     — agenter, workflows, runs, outputs (ihopslagna, flikade — inte 4 nav-poster)

INSTRUMENT  (globala, read-only, tvärsnitt — Atlas djuplänkar hit)
  ├─ Analytics   — cross-projekt: kostnad/revenue/ROI per projekt över tid (absorberar /costs, /revenue)
  ├─ Aktivitet   — EN journal-lik händelseström: runs, approvals, findings (absorberar rail, /atlas/activity, /agent-activity)
  ├─ Kunskap     — Knowledge Graph + minnen + beslut (absorberar /memory, MemoryGraph; se §7)
  └─ Atlas OS    — Agent Operating System-vyn: lineage Workflow → Run → Finding → Task → Resolution
                   + systemhälsa/telemetri (absorberar /system, /manager, Dream/bug-status; se §8)

INSTÄLLNINGAR
```

**Vad som INTE längre finns som egna ytor:** Dashboard, Operations Center, Action Center, Agentaktivitet, Operatör, Marknadsgranskning (global), Content Center (global), Kostnader, Revenue Center, Planering, separat Chat. Se §6.

**Skillnad mot förra auditens IA:** den föreslog "Atlas + 5 instrument + projekt". 2.0 inverterar: **projekten lyfts till primär nivå med fullständiga standardvyer**, och instrumenten krymper till 4 rena tvärsnitt. Approvals är inte längre globalt instrument utan projektvy (global kö nås via Atlas/Aktivitet-filter), och Money generaliseras till Analytics.

---

## 5. Ny navigation

### 5.1 Sidebar (~10 poster, två grupper i stället för 14 + expansioner)

```
◆ Atlas                    ← primär, alltid överst

PROJEKT
  ● Familje-Stunden
  ● The Prompt
  ● GainPilot
  ● Omnira
  + Nytt projekt

INSTRUMENT
  ▸ Analytics
  ▸ Aktivitet
  ▸ Kunskap
  ▸ Atlas OS

⚙ Inställningar
```

Klick på projekt → projektets Översikt; standardvyerna (Översikt/Analytics/Innehåll/Granskning/System) renderas som **flikar i projektytan**, inte som sidebar-expansion. Sidebaren slutar växa när projekt läggs till.

### 5.2 ⌘K blir riktig navigation

En palett, två lägen, ett register:
- **Jump:** "the prompt analytics" → `/projects/the-prompt/analytics`. "granskningar familje" → `/projects/familje-stunden/granskning`.
- **Intent:** fritext som inte matchar destination skickas till Atlas ("publicera nästa reel", "vad failade inatt?").
- Bygger på befintliga `lib/nav/registry.ts` (`resolveDestination`) — registret finns redan, det saknar bara palett och handler.

### 5.3 Atlas djuplänkar (kontraktet)

- `AtlasLink { label, destinationId, project?, filters? }` — strukturerat fält i chat-svaren (href-data finns redan i `lib/atlas/actions.ts` och `context.topPriority`).
- Chat-klienten renderar chips: `[ Granska 3 approvals → ]`, `[ The Prompt: kostnadstrend → ]`.
- **Alla vyer läser filter från query-params** (`/projects/the-prompt/analytics?metric=cost&range=30d`, `/instrument/aktivitet?status=failed&project=gainpilot`).
- ⌘K, chips och sidebar löser alla genom samma registry → en sanningskälla för "var bor detta koncept".

### 5.4 Activity Rail

Tas bort som permanent kolumn. Ersätts av en kollapsbar peek (ikon i CommandBar med badge) in i Aktivitet-instrumentet. 300px återlämnas till innehållet.

---

## 6. Sid-disposition: ta bort, slå ihop, flytta, dölj bakom Atlas

| Idag (route) | Beslut | Blir |
|---|---|---|
| `/atlas` + `/chat` + `/chat/[id]` | **Slå ihop** | Atlas (hem = chat = en yta) |
| `/dashboard` | **Ta bort** | Briefing-innehållet flyttar in i Atlas hem |
| `/atlas/actions` + `/action-center` | **Ta bort båda** | EN rankad åtgärdslista i Atlas hem |
| `/atlas/activity` + `/agent-activity` + Activity Rail | **Slå ihop** | Instrument: Aktivitet |
| `/atlas/operations` | **Ta bort** | Summering i Atlas hem; detalj i projektens Översikt |
| `/manager` | **Dölj bakom Atlas** | Manager nås via Atlas (`ask_manager`); telemetri → Atlas OS |
| `/atlas/marketing` | **Flytta** | `/projects/familje-stunden/` (Innehåll/Granskning) |
| `/atlas/content` | **Flytta** | `/projects/the-prompt/innehall` |
| `/costs` + `/revenue` | **Slå ihop** | Instrument: Analytics (+ projektens Analytics-flik) |
| `/memory` | **Slå ihop** | Instrument: Kunskap (graf + backlinks + queries) |
| `/system` | **Slå ihop** | Instrument: Atlas OS |
| `/planning` | **Dölj bakom Atlas** | Planering är en Atlas-konversation + tasks i grafen; ingen egen sida |
| `/approvals` | **Flytta + behåll global vy via filter** | Projektflik Granskning; "alla projekt" = Aktivitet-filter eller Atlas |
| `/projects/[slug]/agents·workflows·runs·outputs` | **Slå ihop** | Projektflik System (intern flikning) |
| `/projects/[slug]/media·generate·news·scripts` | **Slå ihop** | Projektflik Innehåll (modulär: visas där capability finns) |
| `ai-media-automation` som projekt | **Omklassificera** | Pipeline-capability under Familje-Stunden (eller delad infra under Omnira-projektet) — inte ett eget "rum" |
| Manuella knappar (Kör nu, regenerate, pause) | **Demotera** | Primär väg = Atlas föreslår/utför; manuell knapp som fallback i Atlas OS |
| `* 2.*`-skuggfiler, `brand 2/`, `supabase 2/` | **Radera** | — |

Netto: **41 sidor / 14 nav-poster → ~10 nav-mål** (Atlas, 4 projekt × flikar, 4 instrument, Inställningar).

---

## 7. Atlas Knowledge Graph (Instrument: Kunskap)

### 7.1 Datamodell — typade noder och kanter

Noder (finns redan som tabeller): **Memory** (`memories`, `platform_memory`), **Dream Finding** (`dream_issues`, `bugscan_findings`), **Task** (`manager_tasks`), **Decision** (beslut ur `/memory`), **Workflow** (`workflows`), **Run** (`runs`), **Project**, **Output**, **Lead/Revenue-event** (valbart i v2).

Typade kanter med provenance:

```
Workflow ──spawned──▶ Run ──produced──▶ Output
Run ──surfaced──▶ Dream Finding ──delegated_to──▶ Task ──resolved_by──▶ Run/Decision
Decision ──derived_from──▶ Memory/Finding     Memory ──about──▶ Project
varje kant: { type, provenance: EXTRACTED | INFERRED | SUGGESTED, created_by: agent|user, ts }
```

EXTRACTED-kanter skrivs automatiskt av befintliga flöden (delegate_dream_finding, resolve, runs→outputs — relationerna finns redan som FK:er; grafen är till stor del en *vy* över befintlig data, inte ett nytt system). INFERRED skapas av Atlas (semantik). SUGGESTED = unlinked mentions som operatören bekräftar med ett klick.

### 7.2 UI — tre paneler, ingen global hairball

1. **Local graph (mitten):** alltid centrerad på en vald entitet, djup-reglage 1–3 hopp, deterministisk typgrupperad layout (ingen fysik-tweaking), färg per nodtyp med typ-toggles, streckade kanter = INFERRED.
2. **Backlinks-panel (höger):** "Linked references" för vald nod ("7 Runs refererar denna Decision"), grupperade per kanttyp, plus SUGGESTED-sektion ("Atlas tror dessa hör ihop — bekräfta?").
3. **Query-bar + sparade vyer (topp):** UI-byggda filter (typ, projekt, tidsspann, status), sparade som levande vyer: "Decisions utan Task", "Findings olösta >7d", "Vad vet vi om The Prompts hooks?". Ingen global graf renderas utan aktivt filter.

Derived insights-rad (Graphify): god nodes, överraskande kopplingar med "varför", föreslagna frågor — klick öppnar local graph där.

### 7.3 Atlas-integration

Grafen är **Atlas minnesindex**: Atlas query:ar den (grannskap, path, backlinks) i stället för att läsa råtabeller, och varje graf-svar i chat får en chip → `/instrument/kunskap?focus=<nod>`. Operatörens roll är att *granska och lita på*, inte underhålla.

---

## 8. Agent Operating System-vyn (Instrument: Atlas OS)

Inspirerad av Graphify men med **lineage som tidslinje, inte bubbelgraf**. Svarar på: *vad gjorde systemet, varför, och vad ledde det till?*

### 8.1 Lineage-vyn (kärnan)

Horisontellt flöde per kedja, vänster→höger = kausalitet:

```
[Workflow: Daily Pipeline] → [Run #4812 ✓ 02:14] → [Finding: IG-token går ut] → [Task → agent] → [Resolution: Run #4820 ✓]
                              └→ [Output: reel_0610.mp4] → [Publicering ✓]
```

- Varje nod är klickbar (öppnar run-detalj, finding, task) och har status/tid/kostnad.
- Filter: projekt, tidsspann, status (failed-kedjor överst), workflow.
- En kedja = en rad; expandera för run-loggar inline. Detta är samma data som Aktivitet, men **grupperad kausalt i stället för kronologiskt**.
- Oavslutade kedjor (Finding utan Task, Task utan Resolution) flaggas — det är beslutstöd, inte dekoration.

### 8.2 Systemhälsa (sekundär flik)

Absorberar `/system` + `/manager`-telemetri + Dream/bugscan-status: agentflotta, cron-heartbeats, token-hälsa, pipeline-status, nattens Dream/bugscan-sammanfattning. Dream och bugscan presenteras som **en** "nattlig intelligens"-ström (idag två parallella system med fyra UI-vägar).

---

## 9. Analytics 2.0

**Projektnivå (flik i varje projekt)** — beslutstöd, inte instrumentpanel:
- Tidsserier (30/90d): kostnad, revenue, netto/ROI, leads, följare, content-performance (per kanal).
- Varje graf har "Fråga Atlas"-koppling: klick på en anomali → Atlas förklarar med kontext.
- Data finns: `cost_events`, `revenue_events`, `revenue_snapshots`, `leads`, `media_insights`, `campaigns`.

**Global nivå (instrumentet Analytics):**
- Per-projekt-jämförelse: staplad kostnad vs revenue, ROI-ranking, trendriktning.
- "Cost without revenue"-flaggor (dagens Action Center-logik) blir en stående insight-rad.
- Followers/engagement cross-kanal (IG/YT) ur `media_insights`.

Designregel: max 6 grafer per vy, varje graf måste kunna besvara en fråga som börjar med "ska jag…" — annars stryks den. Sparklines i kort ersätts av riktiga, filtrerbara grafer (recharts finns redan i stacken).

---

## 10. Roadmap (faser, utan kod ännu — sekvens för senare implementation)

| Fas | Innehåll | Varför först |
|---|---|---|
| **P0 — Avduplicera** | Slå ihop briefings/actions/activity till en av varje; fixa namn; radera skuggfiler | Störst effekt, minst kod; röjer marken |
| **P1 — Atlas-first-navigation** | Riktig ⌘K-palett, AtlasLink-chips, filter-adresserbara vyer via gemensamt registry | Tesens kärna; gör Atlas till styrytan |
| **P2 — Projekt-first-IA** | Ny sidebar (~10 mål), projektens standardflikar, flytta marketing/content in i projekt, omklassificera `ai-media-automation` | Den nya ryggraden |
| **P3 — Analytics 2.0** | Projekt- och global analytics med tidsserier | Datan finns; snabb vinst ovanpå P2 |
| **P4 — Knowledge Graph** | Kant-tabell + local graph + backlinks + sparade queries + SUGGESTED-flöde | Kräver P2:s entitetsmodell |
| **P5 — Atlas OS / lineage** | Lineage-vyn + enad nattintelligens + demotera manuella knappar | Kräver grafens kanter (P4) |
| **P6 — Proaktiv Atlas** | Push-briefing, nudges, Atlas föreslår innan du frågar | Slutläget: du svarar Atlas i stället för att navigera |

---

## 11. Öppna frågor (behöver dina beslut)

1. **`ai-media-automation`:** capability under Familje-Stunden, eller delad pipeline under Omnira-projektet? Påverkar P2.
2. **Omnira som projekt:** ska plattformen själv (bugscan, hälsa, principer) vara ett "rum" i projektlistan, eller bo enbart i Atlas OS-instrumentet? (Planen antar projektrum + att Atlas OS är tvärsnittet.)
3. **Approvals globalt:** räcker Atlas + projektflikar, eller vill du ha en dedikerad global kö kvar under en övergångsperiod?
4. **Leads/Revenue-noder i grafen:** v1 (mer komplett lineage hela vägen till pengar) eller v2 (mindre scope)?
5. **Mobil:** vilken yta är viktigast i telefonen — Atlas chat + approvals, antar jag? Styr hur mycket av instrumenten som behöver responsiv design alls.
