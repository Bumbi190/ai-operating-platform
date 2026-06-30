# Atlas Presence — Strategisk Roadmap

**Branch:** feat/atlas-voice-ui  
**Datum:** 2026-06-29  
**Status:** Review-dokument — ingen kod ännu

---

## Analys: Nuläge mot de 6 principerna

### Princip 1 — Atlas är alltid centrum

**✅ Matchar:**
- Orben finns och är centrerad på /atlas
- Atlas-sidan är produktens entry point (redirect från /)
- `primary: true` på Atlas i sidebaren ger visuell tyngd

**⚠️ Halv-väg:**
- Den globala `VoiceAssistant`-pillern finns på alla andra sidor men är ett litet diskret element — inte en närvaro

**❌ Gap:**
- På `/projects/familje-stunden`, `/approvals`, `/revenue` etc. finns ingen orb alls
- Det finns inget visuellt eller konversationellt som säger "Atlas är med dig här"
- Orben är en **sida**, inte ett **lager**

---

### Princip 2 — Atlas försvinner aldrig

**❌ Kritiskt gap:**
- `historyRef`, `convRef`, `phase`, `response` — allt detta bor i `AtlasVoiceHome`-komponentens lokala state
- Navigerar du bort från /atlas → hela konversationen raderas ur minnet
- Det finns ingen `AtlasPresenceContext` på layout-nivå
- `OperatorModeProvider` visar att mönstret för persistent layout-kontext redan existerar — det är precis samma slots som Atlas Presence ska in i

**⚠️ Partial:**
- Samtal sparas i DB (`conversations`-tabellen via `ensureConversation`)
- Men det finns ingen automatisk återhämtning av pågående konversation vid navigering

---

### Princip 3 — Atlas öppnar workspaces, inte sidor

**❌ Saknas helt:**
- All navigering är `router.push()` — hårda sidbyten
- Det `navigate`-event som LLM:en skickar → `router.push` direkt
- Ingen animering, ingen soft transition, ingenting
- Varken Framer Motion eller CSS View Transitions används någonstans

**⚠️ Halvvägs:**
- Konceptet finns — Atlas kan trigga navigate-events via chatten
- `resolveDestination` i `lib/nav/registry.ts` är ett nav-abstraktionslager som kan utnyttjas

---

### Princip 4 — Ersätt dashboard med konversation

**✅ Matchar (vår branch):**
- Dashboard-data är nu nedflyttad under the fold
- Orb + greeting är det första man ser

**⚠️ Halvvägs:**
- Atlas ger fortfarande en lång executive summary vid sidladdning (`atlasExecutiveSummary` returnerar `whatHappened`, `whatWorked`, `whatFailed`, `needsAttention` — 10–15 punkter totalt)
- Systempromptens voice-mode says "speak in short conversational chunks" men det gäller bara samtalsläget, inte den initiala laddningen
- Det finns ingen "morgonhälsning"-mekanism som ger Atlas ett enda kort meddelande vid öppning

**❌ Gap:**
- Briefing-kolumnerna (3 st) är fortfarande ute — renodlade admin-kort
- Platform Pulse (4 sifferkort) är fortfarande ute — dashboard-widget

---

### Princip 5 — Orben ska kännas levande

**✅ Matchar:**
- 4 CSS-animationsfaser finns (idle breathe, listening rings, thinking arc, speaking bars)
- Expanderande ringar på listening och speaking
- Roterande conic-gradient på thinking

**⚠️ Inte riktigt:**
- "Particles attracting to center" för listening = inte implementerat, vi har expanderande ringar (motsatt riktning)
- "Flowing energy" för thinking = en roterande arc är mekanisk, inte organisk
- Speaking bars är statiska CSS-animationer, inte synkade med faktisk audio-amplitud

**❌ Gap:**
- Ingen Web Audio API-integration (bars animerar med förbestämd rytm, inte voicens faktiska vågform)
- Ingen partikel-effekt
- Idle breathing är korrekt men enkel — inget djup

---

### Princip 6 — Minska admin-känslan

**✅ Gjort:**
- CommandBar dold på /atlas
- Global voice-pill dold på /atlas
- Dashboard nedflyttad under the fold

**⚠️ Halvvägs:**
- Sidebaren har 8 explicita nav-poster med kategorirubriker ("Operationer", "Autonom stack") — mer AWS Console än OS
- "Alla system nominella · v4.2" i sidebaren = infrastruktur-dashboard-känsla

**❌ Kvarstår på andra sidor:**
- Approvals: `grid-cols-12` hero med stor ikon, tre stat-kort, rubriknivåer
- Revenue: kalkylblads-liknande tabeller
- Agent Activity: ops-konsol med status-badges och JSON-rader
- Allt detta ägs av andra arbetsströmmar men sätter tonen

---

## Vad som inte ska röras (konfliktzoner)

Dessa filer/areas ägs av Memory- och Intelligence-arbetsströmmar:
- `lib/atlas/memory/*` — Atlas Memory
- `lib/atlas/intelligence/*` — Brief/Intelligence layer
- `lib/atlas/collectors/*` — Signal ingestion
- `supabase/migrations/*` — Inga nya migreringar
- `app/(platform)/atlas/activity/*` — Ägs av annan ström
- `lib/atlas/context.ts`, `lib/atlas/executive.ts` — Serverlogik, rör ej

**Säkert att bygga:**
- `components/platform/os/*` — UI-komponenter
- `app/(platform)/atlas/page.tsx`, `AtlasVoiceHome.tsx` — Startsidan
- `app/(platform)/layout.tsx` — Layout-kontexten (med försiktighet)
- Ny fil: `lib/atlas/presence-context.tsx` — Ren UI-state
- CSS/animations i `globals.css`

---

## Atlas Presence Roadmap

### Fas P0 — Grunden (klar, denna branch)
*"Atlas har en plats"*
- ✅ AtlasOrb-komponent med 4 animationsfaser
- ✅ AtlasVoiceHome ersätter dashboard-hero
- ✅ Dashboard-data nedflyttad, inte borttagen
- ✅ CommandBar och global pill dolda på /atlas
- ✅ TTS-förbättringar (hd, speed, silence)

---

### Fas P1 — Atlas Presence Context
*"Atlas minns dig när du navigerar"*

**Syfte:** Lyfta konversationsstate till layout-nivå så att Atlas inte försvinner vid sidbyte.

**Arkitektur:**
```
app/(platform)/layout.tsx
  └── AtlasPresenceProvider  ← ny
        ├── phase, transcript, response
        ├── historyRef, convRef
        └── startListening, stopAudio, sendMessage

app/(platform)/atlas/page.tsx
  └── AtlasVoiceHome
        └── useAtlasPresence() ← läser från context

app/(platform)/[alla andra sidor]
  └── AtlasMiniOrb  ← ny, läser från samma context
        ↓
      Liten persistent orb i hörnet (inte pill),
      pulserar om Atlas lyssnar, klickbar för att återgå
```

**Filer:**
- Ny: `lib/atlas/presence-context.tsx` — `AtlasPresenceProvider` + `useAtlasPresence()`
- Ändrad: `app/(platform)/layout.tsx` — lägg till `AtlasPresenceProvider`
- Ny: `components/platform/os/AtlasMiniOrb.tsx` — liten persistent orb på icke-Atlas-sidor
- Ändrad: `AtlasVoiceHome.tsx` — konsumera context istället för lokalt state

**Konfliktrisk:** Låg. Ny fil + liten layout-ändring. Memory/Intelligence berörs inte.

---

### Fas P2 — Workspace Transitions
*"Atlas öppnar rum, inte URLs"*

**Syfte:** Mjuka övergångar när Atlas navigerar — känslan av att ett rum öppnas.

**Arkitektur:**
```
AtlasPresenceContext
  └── openWorkspace(href, label)
        ↓
      1. Atlas säger "Öppnar Familje-Stunden..." (TTS)
      2. Canvas fade-out (200ms)
      3. router.push(href)
      4. Canvas fade-in (300ms)
      5. Atlas säger "Klart." (optional)
```

**Teknisk lösning:**
- CSS View Transitions API (`document.startViewTransition`) — stöds i Chrome 111+
- Fallback: opacity transition via en `WorkspaceTransition`-wrapper i layout
- Ingen Framer Motion behövs (håller bundle liten)

**Filer:**
- Ny: `components/platform/os/WorkspaceTransition.tsx` — transition-wrapper
- Ändrad: `lib/atlas/presence-context.tsx` — lägg till `openWorkspace()`
- Ändrad: `AtlasVoiceHome.tsx` + `VoiceAssistant.tsx` — använd `openWorkspace` istället för `router.push`

**Konfliktrisk:** Låg. Berör bara transitionen, inte sidinnehållet.

---

### Fas P3 — Atlas Morgonhälsning
*"Atlas summerar, frågar sedan"*

**Syfte:** Atlas öppnar varje session med 1–2 meningar och pauser. Inte en rapport.

**Nuläge:** `atlasExecutiveSummary()` returnerar 10–15 items. Atlas läser upp allt.

**Önskat beteende:**
```
Atlas: "God morgon André. Familje-Stunden tappade 6% SEK-trafik den här veckan
        och The Prompt publicerade 12 artiklar. Ska jag gå igenom vad som kräver
        din uppmärksamhet?"

André: "Ja."

Atlas: "Tre saker. För det första..."
```

**Lösning:**
- Ny systemprompt-parameter: `mode: 'greeting' | 'conversation'`
- I greeting-mode: Atlas genererar max 2 meningar + frågar om fördjupning
- Befintlig `atlasExecutiveSummary()` används *bara om operatören ber om det* — inte frontladdad

**Filer:**
- Ändrad: `lib/atlas/identity.ts` — `buildAtlasSystemPrompt()` får greeting-mode
- Ändrad: `AtlasVoiceHome.tsx` — skicka en initialhälsning automatiskt vid öppning (om Atlas inte talat de senaste 30 min)

**Konfliktrisk:** Medium. `identity.ts` är delad — ändra med kirurgisk precision, lägg till parameter utan att bryta befintligt beteende.

---

### Fas P4 — Levande Orb (Web Audio + Partiklar)
*"Orben pulserar med Atlas röst"*

**Syfte:** Orb-animationerna ska vara responsiva mot faktisk audio-amplitud, inte fördröjda CSS-loops.

**Teknisk lösning:**
```typescript
// AudioContext → AnalyserNode → getByteTimeDomainData()
// → normalisera amplitud → animera bar-höjder via requestAnimationFrame
// → ParticleSystem (canvas overlay) vid listening-fas
```

**Specificerat:**
- **Listening:** 20–30 partiklar rör sig inåt mot orb-centrum (attraktion), inte utåt
- **Thinking:** Flödande gradient-blob som morphar organiskt (SVG filter `feTurbulence`)
- **Speaking:** Canvas-overlay med realtids-vågform från Web Audio AnalyserNode

**Filer:**
- Ny: `components/platform/os/AtlasOrbCanvas.tsx` — canvas-overlay för partiklar + waveform
- Ändrad: `AtlasOrb.tsx` — integrera canvas-overlay
- Ändrad: `AtlasVoiceHome.tsx` — pass `audioRef` till AtlasOrb för amplitud-analys

**Konfliktrisk:** Ingen. Ren UI-komponent.

---

### Fas P5 — Sidebar som Presence, inte Navigation
*"Sidebaren reflekterar vad Atlas vet, inte vad du kan klicka på"*

**Syfte:** Minska admin-känslan i sidebaren.

**Förslag:**
- Ta bort explicita nav-poster ("Marknadsgranskning", "Content Center") — nås via Atlas-samtal eller sökning
- Sidebaren visar istället: AtlasMiniOrb + pågående konversation + projekt (som "rum")
- "Alla system nominella · v4.2" ersätts med "Atlas aktiv" (eller ingen status alls)
- Projekt-listan kvarstår — det är värdefull kontextuell navigering

**Konfliktrisk:** Låg. Sidebar ägs av UX-arbetsströmmen.

---

## Prioriteringsordning (rekommendation)

```
P1 → Presence Context       ~ 2 dagar   (blockerar P2, P3)
P2 → Workspace Transitions  ~ 1 dag     (högt synlig, låg risk)
P3 → Morgonhälsning         ~ 1 dag     (systemprompten är kirurgisk)
P4 → Levande Orb            ~ 2 dagar   (mest visuell effekt)
P5 → Sidebar                ~ 1 dag     (gör det sist — låg latency-impakt)
```

P1 är rätt nästa steg. Utan det är Atlas fortfarande en sida, inte en OS-layer.

---

## Vad som INTE ska byggas i Atlas Presence

*(Andra arbetsströmmar äger dessa)*
- Atlas Memory UI (memory.tsx) — Memory-strömmen
- Brief/Intelligence-presentation — Intelligence-strömmen
- Signaler och Collectors-UI — Collectors-strömmen
- Supabase RLS, migreringar, Edge Functions

Atlas Presence bygger ovanpå deras arbete — inte i konflikt med det.
