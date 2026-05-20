# Implementationschecklista — AI Ops Platform
> Uppdaterad 2026-05-16 · Optimerad för Claude Code + Codex

---

## Hur man använder detta dokument

Kör dessa uppgifter i ordning. Varje uppgift är en prompt du kan ge direkt till Claude Code eller Codex.  
Markera med ✅ när klar, ⚠️ när blockerad, 🔄 när pågående.

---

## STEG 0 — Förutsättningar (gör detta nu, manuellt)

- [ ] **Skapa Supabase-projekt** på https://supabase.com
  - [ ] Kopiera `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] Kör `packages/db/schema.sql` i Supabase SQL Editor
  - [ ] Skapa Storage bucket `outputs` (Dashboard → Storage → New bucket, sätt till privat)

- [ ] **Skapa `.env.local`** i `apps/web/`:
  ```bash
  cp apps/web/.env.local.example apps/web/.env.local
  # Fyll i dina nycklar
  ```

- [ ] **Installera beroenden** (kör EN gång):
  ```bash
  cd "AI Operating Platform/apps/web"
  npm install
  ```

- [ ] **Verifiera att Next.js startar**:
  ```bash
  npm run dev
  # Öppna http://localhost:3000 — ska omdirigera till /login
  ```

---

## STEG 1 — Project CRUD

### 1.1 · Listsida — Dashboard visar projekt ✅ (klar)
Fil: `apps/web/app/(platform)/dashboard/page.tsx`

### 1.2 · Skapa projekt — formulärsida
**Fil att skapa:** `apps/web/app/(platform)/projects/new/page.tsx`

**Prompt till Claude Code:**
```
Skapa en Next.js Server Component-sida på:
apps/web/app/(platform)/projects/new/page.tsx

Krav:
- Client Component ('use client')
- Formulär med fälten: name (text, required), color (color picker, default #6366f1)
- Slug genereras automatiskt från name (använd slugify från @/lib/utils)
- Visa slug preview under name-fältet
- POST till /api/projects vid submit
- Vid lyckat svar: router.push('/projects/[slug]')
- Felhantering: visa felmeddelande under formuläret
- Importera: useRouter från 'next/navigation'
- Stil: samma mönster som login-sidan, max-w-sm centered
```

### 1.3 · API POST /api/projects ✅ (klar)
Fil: `apps/web/app/api/projects/route.ts`

### 1.4 · Projektöversikt ✅ (klar)
Fil: `apps/web/app/(platform)/projects/[slug]/page.tsx`

### 1.5 · Redigera projekt
**Fil att skapa:** `apps/web/app/(platform)/projects/[slug]/settings/page.tsx`
**API att skapa:** `apps/web/app/api/projects/[slug]/route.ts` (PATCH + DELETE)

**Prompt till Claude Code:**
```
Skapa:
1. apps/web/app/api/projects/[slug]/route.ts
   - PATCH: uppdatera name och color
   - DELETE: ta bort projekt och redirect till /dashboard

2. apps/web/app/(platform)/projects/[slug]/settings/page.tsx
   - Formulär för att redigera name och color
   - Farlig zon: Ta bort projekt (med bekräftelsedialog)
   - Använd samma API-mönster som other routes
```

---

## STEG 2 — Agent CRUD

### 2.1 · Lista agenter ✅ (klar)
Fil: `apps/web/app/(platform)/projects/[slug]/agents/page.tsx`

### 2.2 · Skapa agent — formulärsida
**Fil att skapa:** `apps/web/app/(platform)/projects/[slug]/agents/new/page.tsx`

**Prompt till Claude Code:**
```
Skapa: apps/web/app/(platform)/projects/[slug]/agents/new/page.tsx

Krav ('use client'):
- Formulär med fälten:
  name: text input, required
  description: textarea, valfri, 2 rader
  model: select-dropdown med värden från @/lib/ai/models.ts MODELS-objektet
  system_prompt: textarea, required, 8 rader, monospace font
  config.max_tokens: number input, default 4000
  config.temperature: range slider 0–1, step 0.1, visa värdet bredvid
- POST till /api/projects/[slug]/agents
- Vid lyckat svar: router.push('/projects/[slug]/agents')
- Visa skill-förslag (knappar som fyller i system_prompt från packages/agent-skills/)
```

### 2.3 · API CRUD ✅ (klar)
Filer:
- `apps/web/app/api/projects/[slug]/agents/route.ts`
- `apps/web/app/api/projects/[slug]/agents/[id]/route.ts`

### 2.4 · Redigera agent
**Fil att skapa:** `apps/web/app/(platform)/projects/[slug]/agents/[id]/page.tsx`

**Prompt till Claude Code:**
```
Skapa: apps/web/app/(platform)/projects/[slug]/agents/[id]/page.tsx

Ladda agenten server-side från Supabase.
Återanvänd samma formulär som new/page.tsx (extrahera till components/forms/AgentForm.tsx).
PATCH till /api/projects/[slug]/agents/[id] vid uppdatering.
DELETE-knapp med bekräftelse → redirect till agents-listan.
```

---

## STEG 3 — Workflow CRUD

### 3.1 · Lista workflows ✅ (klar)
Fil: `apps/web/app/(platform)/projects/[slug]/workflows/page.tsx`

### 3.2 · Skapa workflow — formulärsida
**Fil att skapa:** `apps/web/app/(platform)/projects/[slug]/workflows/new/page.tsx`

**Prompt till Claude Code:**
```
Skapa: apps/web/app/(platform)/projects/[slug]/workflows/new/page.tsx

Krav ('use client'):
- Hämta agenter för projektet via GET /api/projects/[slug]/agents
- Formulär:
  name: text required
  description: textarea optional

  Steg-builder (dynamisk lista):
  - Knapp "Lägg till steg" lägger till ett nytt steg-objekt
  - Varje steg visar:
    * order: auto-numrerat
    * name: text input
    * agent_id: select från hämtade agenter
    * input_template: textarea med hjälptext "Använd {{variabelnamn}} för att referera till tidigare steg"
    * output_key: text input (nyckel som sparas i context, t.ex. "story")
  - Knapp "Ta bort" per steg
  - Steg kan omordnas med upp/ned-knappar

- POST till /api/projects/[slug]/workflows
- Vid lyckat svar: router.push('/projects/[slug]/workflows')

Data-format för steps (JSONB):
[{ "order": 1, "name": "...", "agent_id": "uuid", "input_template": "...", "output_key": "story" }]
```

### 3.3 · API CRUD ✅ (klar)
Filer:
- `apps/web/app/api/projects/[slug]/workflows/route.ts`
- (Skapa `apps/web/app/api/projects/[slug]/workflows/[id]/route.ts` — PATCH + DELETE)

### 3.4 · Redigera workflow + Kör-sida
**Filer att skapa:**
- `apps/web/app/(platform)/projects/[slug]/workflows/[id]/page.tsx` (redigera)
- `apps/web/app/(platform)/projects/[slug]/workflows/[id]/run/page.tsx` (kör)

**Prompt till Claude Code:**
```
Skapa: apps/web/app/(platform)/projects/[slug]/workflows/[id]/run/page.tsx

Krav ('use client'):
1. Ladda workflow server-side, visa dess steg
2. Visa formulär med input-parametrar:
   - Identifiera alla {{variabelnamn}} i input_templates som INTE är output_keys
   - Dessa är de initiala input-parametrarna (t.ex. theme, age_range)
   - Visa ett text-fält per parameter
3. Kör-knapp → POST /api/runs med { workflow_id, input }
4. Vid 202-svar: redirect till /projects/[slug]/runs/[run_id]
   (run-sidan visar SSE-logströmmen i realtid)
```

---

## STEG 4 — Run Engine

### 4.1 · POST /api/runs ✅ (klar)
Fil: `apps/web/app/api/runs/route.ts`

**Beslut:** Körning körs asynkront i bakgrunden efter att API:t returnerat 202.  
Inte blockerat → svarar direkt med `run_id`.

### 4.2 · GET /api/runs/[id] ✅ (klar)
Fil: `apps/web/app/api/runs/[id]/route.ts`

### 4.3 · SSE-ström ✅ (klar)
Fil: `apps/web/app/api/runs/[id]/stream/route.ts`

**Hur det fungerar:**
- Polls `run_logs` var 800ms
- Skickar nya rader som SSE-events
- Stänger strömmen när status = done/failed
- Frontend-komponent: `components/platform/LogStream.tsx`

### 4.4 · Run-detaljsida ✅ (klar)
Fil: `apps/web/app/(platform)/projects/[slug]/runs/[id]/page.tsx`

### 4.5 · Förbättringar av Run Engine (nästa fas)

**Prompt till Claude Code (när behov finns):**
```
Förbättra apps/web/app/api/runs/route.ts:
1. Streaming: Skicka SSE-tokens direkt under LLM-anropet
   (använd runStep med onChunk-callback i runner.ts)
   → Kräver ReadableStream-response istället för 202
   
2. Parallel steps: Lägg till stöd för steps med samma order-nummer körs parallellt
   (om workflow-steget har ett "parallel: true"-fält)
   
3. Timeout: Avbryt körning om den tar >120 sekunder
   → Uppdatera run.status = 'failed', error = 'Timeout'
```

---

## STEG 5 — Outputs

### 5.1 · Lista utdata ✅ (klar)
Fil: `apps/web/app/(platform)/projects/[slug]/outputs/page.tsx`

### 5.2 · Output-API ✅ (klar)
Fil: `apps/web/app/api/outputs/[id]/route.ts` (GET + DELETE)

### 5.3 · Förbättrad output-hantering

**Prompt till Claude Code:**
```
Uppdatera apps/web/app/api/runs/route.ts, funktionen executeWorkflow:

1. Förbättra output-skapande:
   - Namnge output med workflow-namn + datum: "Månadspaket Generator — Juni 2026"
   - Spara HELA context (alla steg) som JSON-output, inte bara sista steget
   - Om context innehåller giltig JSON med "activities"-nyckel → type = 'json'
   - Annars → type = 'text'

2. Lägg till text-output-kopiering i:
   apps/web/app/(platform)/projects/[slug]/outputs/page.tsx
   - Knapp "Kopiera" → kopierar content till clipboard
   - Visa bekräftelse "Kopierat!" i 2 sekunder
```

---

## STEG 6 — Memories (enkel nyckel-värde)

### 6.1 · API
**Fil att skapa:** `apps/web/app/api/projects/[slug]/memories/route.ts`

**Prompt till Claude Code:**
```
Skapa: apps/web/app/api/projects/[slug]/memories/route.ts

GET: Lista alla minnen för projektet
PUT body: { key: string, value: string, source?: string }
    → Upsert (INSERT ON CONFLICT UPDATE) baserat på (project_id, key)
DELETE: query param ?key=xxx → ta bort ett minne
```

### 6.2 · Memories i run engine

**Prompt till Claude Code:**
```
Uppdatera lib/ai/runner.ts och app/api/runs/route.ts:

Inför körning: hämta alla minnen för projektet från Supabase.
Lägg till minneskontext i system_prompt:

const memoryContext = memories.length > 0
  ? `\n\nRelevant projektminnne:\n${memories.map(m => `${m.key}: ${m.value}`).join('\n')}`
  : ''

Ersätt: agent.system_prompt
Med: agent.system_prompt + memoryContext
```

---

## STEG 7 — Polish & kvalitet

### 7.1 · Felgränssnitt
**Prompt till Claude Code:**
```
Skapa: apps/web/components/platform/ErrorBoundary.tsx
- Client Component med React error boundary
- Visa trevligt felmeddelande med "Försök igen"-knapp
Lägg till i apps/web/app/(platform)/layout.tsx runt {children}
```

### 7.2 · Loading states
**Prompt till Claude Code:**
```
Skapa: apps/web/app/(platform)/loading.tsx
- Visar en centrerad spinner (enkel Tailwind-animation)
- Next.js använder denna automatiskt som Suspense fallback

Skapa även loading.tsx i varje page-katalog som gör tunga DB-anrop:
- projects/[slug]/loading.tsx
- projects/[slug]/agents/loading.tsx
- projects/[slug]/runs/loading.tsx
```

### 7.3 · Sidebar som reagerar på project-ändringar
**Problem:** Sidebar laddas server-side i layout.tsx och uppdateras inte utan full refresh.

**Prompt till Claude Code:**
```
Gör om Sidebar till att hämta projekt client-side:
1. Extrahera till 'use client' komponent
2. Hämta projekter via fetch('/api/projects') i useEffect
3. Lägg till optimistic update: när ett nytt projekt skapas, lägg till i listan direkt
```

### 7.4 · Notifications (toast)
**Prompt till Claude Code:**
```
Lägg till toast-notiser för:
- "Projekt skapat" efter POST /api/projects
- "Agent sparad" efter PATCH /api/agents/[id]  
- "Körning startad, körning-ID: [id]" efter POST /api/runs
- "Fel: [message]" vid API-fel

Använd @radix-ui/react-toast (redan installerat).
Skapa: apps/web/components/ui/toaster.tsx + hooks/use-toast.ts
Lägg till <Toaster /> i apps/web/app/layout.tsx
```

---

## STEG 8 — GainPilot onboarding

**Prompt till Claude Code:**
```
Skapa seed-data för GainPilot-projektet.
Lägg till i packages/db/seed.sql:

GainPilot-agenter:
1. ProspectResearcher: Researchar potentiella kunder baserat på ICP
   Model: claude-sonnet-4-6
   System prompt: "Du är en B2B-försäljningsexpert..."
   
2. EmailWriter: Skriver personaliserade prospektemail
   Model: claude-haiku-4-5
   System prompt: "Du skriver korta, effektiva kalla email..."
   
3. FollowUpAgent: Skriver uppföljningsmail
   Model: claude-haiku-4-5

GainPilot-workflow: "Lead Generation Pipeline"
Steps:
1. ProspectResearcher → input: {{company_name}}, output: prospect_profile
2. EmailWriter → input: {{prospect_profile}}, output: cold_email
3. FollowUpAgent → input: {{cold_email}}, output: followup_email
```

---

## Arkitektoniska beslut att dokumentera

När du bygger varje del, spara besluten som kommentarer i koden:

```typescript
// BESLUT: Kör LLM-anrop synkront i API route för MVP.
// Flytta till Inngest/BullMQ när körningar tar >60s konsekvent.
// Se: apps/web/app/api/runs/route.ts

// BESLUT: SSE polling var 800ms istället för Supabase Realtime.
// Enklare att debugga, räcker för <10 samtida körningar.
// Byt till Realtime när fler användare behövs.
// Se: apps/web/app/api/runs/[id]/stream/route.ts

// BESLUT: Memories som nyckel-värde istället för vektorer.
// pgvector läggs till i fas 2 när semantisk sökning behövs.
// Se: packages/db/schema.sql
```

---

## Testordning (när du vill verifiera en feature)

```bash
# 1. Skapa ett projekt
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Projekt"}'

# 2. Skapa en agent (byt ut project-slug)
curl -X POST http://localhost:3000/api/projects/test-projekt/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestAgent",
    "system_prompt": "Du är en hjälpsam assistent.",
    "model": "claude-haiku-4-5"
  }'

# 3. Skapa ett workflow (byt ut agent-id)
curl -X POST http://localhost:3000/api/projects/test-projekt/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workflow",
    "steps": [{
      "order": 1,
      "name": "Svar",
      "agent_id": "<agent-id>",
      "input_template": "{{prompt}}",
      "output_key": "result"
    }]
  }'

# 4. Kör workflow (byt ut workflow-id)
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "<workflow-id>",
    "input": { "prompt": "Hej! Vad heter du?" }
  }'

# 5. Följ körningen (byt ut run-id)
curl http://localhost:3000/api/runs/<run-id>
```

---

## Prioriteringsordning (om du måste välja)

1. **STEG 0** — Inget funkar utan Supabase och env-variabler
2. **STEG 1.2** — Ny projekt-sida (utan den kan du inte skapa projekt via UI)
3. **STEG 2.2** — Ny agent-sida (kärnan i plattformen)
4. **STEG 3.2** — Nytt workflow (kopplar allt ihop)
5. **STEG 3.4** — Kör-sida (det är här magin sker)
6. **STEG 4** — Run engine (redan klar — verifiera att den fungerar)
7. **STEG 7** — Polish när kärnfunktionaliteten fungerar
