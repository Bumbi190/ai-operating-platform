# AI Operations Platform — MVP Architecture
> Version 1.0 · 2026-05-16 · Optimerat för Claude Code + Codex

---

## Vad vi bygger (och vad vi INTE bygger)

**Vi bygger:** En centraliserad kontrollpanel för att köra AI-agenter och workflows  
för flera oberoende projekt (Familje-Stunden, GainPilot, m.fl.).

**Vi bygger INTE (ännu):** Microservices, message queues, RBAC, multi-tenancy,  
enterprise-observabilitet, komplex orkestrering.

**Framgångsmåttet för MVP:** En enskild användare kan logga in, skapa ett projekt,  
definiera en agent, köra den, se utdatan i realtid och ladda ner resultatet.

---

## 1. Kärnprimitiver — vad plattformen består av

Fem begrepp räcker för att beskriva hela systemet:

```
PROJECT  →  har flera  →  AGENTS
AGENT    →  ingår i    →  WORKFLOWS
WORKFLOW →  producerar →  RUNS
RUN      →  genererar  →  OUTPUTS + LOGS
```

### Project
En isolerad arbetsyta. Exempel: `familje-stunden`, `gainpilot`.  
Varje projekt har egna agenter, workflows, minne och utdata.

### Agent
En AI-entitet med ett namn, en systemprompt och en vald modell.  
En agent = en roll. Exempel: `StoryAgent`, `ActivityAgent`, `PDFAgent`.

### Workflow
En ordnad lista av agentsteg som körs i sekvens.  
Stegens utdata skickas vidare som input till nästa steg.

### Run
En körning av ett workflow. Har en status (`pending → running → done/failed`)  
och lagrar input, mellanresultat och slutresultat.

### Output
Slutprodukten av en run — text, JSON, fil (PDF, bild).  
Lagras i Supabase Storage och länkas till runnen.

---

## 2. Globalt vs projekt-specifikt

### Globalt (delat av alla projekt)
| Vad | Varför globalt |
|-----|----------------|
| Autentisering (Supabase Auth) | En användare, ett konto |
| LLM-konfiguration (API-nycklar, modellval) | Dyrt att duplicera |
| Skill-bibliotek (Agentic OS skills) | Återanvändbara byggblock |
| Platform UI shell (sidomeny, nav) | Konsistent UX |
| Loggformat och schema | Enhetlig debuggning |

### Projekt-specifikt
| Vad | Varför per projekt |
|-----|--------------------|
| Agenter | Varje projekt har unika roller |
| Workflows | Varje projekt har unika processer |
| Minne/knowledge base | Kontexten är domän-specifik |
| Utdata och filer | Ska inte blandas mellan projekt |
| Dashboard-widgets | Relevanta metrics skiljer sig |

---

## 3. Minimal arkitektur

```
┌─────────────────────────────────────────────────┐
│                  BROWSER                        │
│           Next.js 14 (App Router)               │
│    Dashboard · Projects · Agents · Runs · Logs  │
└──────────────┬──────────────────────────────────┘
               │ HTTP + Server-Sent Events (SSE)
┌──────────────▼──────────────────────────────────┐
│           Next.js API Routes                    │
│  /api/runs/[id]/execute  (startar körning)      │
│  /api/runs/[id]/stream   (SSE-ström av events)  │
│  /api/outputs/[id]       (hämta resultat)        │
└──────────────┬──────────────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  Supabase DB      LLM APIs
  (PostgreSQL)     (Anthropic · OpenAI · OpenRouter)
  Supabase Auth
  Supabase Storage
  Supabase Realtime
```

**Inga separata tjänster för MVP.** Next.js hanterar både UI och API.  
Supabase hanterar allt persistent. LLM-APIer anropas direkt.

> Lägg till en Python-worker (Hermes) FÖRST när du behöver: verktygsanrop  
> (filsystem, browser), körningar >60s, eller komplex multi-agent orkestrering.

---

## 4. Exakt mappstruktur

```
AI Operating Platform/
│
├── apps/
│   └── web/                          # Next.js 14 — hela applikationen
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── layout.tsx
│       │   │
│       │   ├── (platform)/           # Skyddade routes (kräver login)
│       │   │   ├── layout.tsx        # Shell: sidomeny + header
│       │   │   ├── dashboard/
│       │   │   │   └── page.tsx      # Översikt: alla projekt, senaste runs
│       │   │   │
│       │   │   └── projects/
│       │   │       └── [slug]/
│       │   │           ├── page.tsx           # Projektöversikt
│       │   │           ├── agents/
│       │   │           │   ├── page.tsx       # Lista agenter
│       │   │           │   ├── new/page.tsx   # Skapa agent
│       │   │           │   └── [id]/page.tsx  # Redigera agent
│       │   │           ├── workflows/
│       │   │           │   ├── page.tsx       # Lista workflows
│       │   │           │   ├── new/page.tsx   # Skapa workflow
│       │   │           │   └── [id]/
│       │   │           │       ├── page.tsx   # Redigera workflow
│       │   │           │       └── run/page.tsx  # Kör workflow manuellt
│       │   │           ├── runs/
│       │   │           │   ├── page.tsx       # Körningshistorik
│       │   │           │   └── [id]/page.tsx  # Realtidslogg för körning
│       │   │           └── outputs/
│       │   │               └── page.tsx       # Alla utdata, nedladdning
│       │   │
│       │   └── api/
│       │       ├── projects/
│       │       │   └── route.ts               # GET lista, POST skapa
│       │       ├── agents/
│       │       │   ├── route.ts               # GET, POST
│       │       │   └── [id]/route.ts          # GET, PATCH, DELETE
│       │       ├── workflows/
│       │       │   ├── route.ts
│       │       │   └── [id]/route.ts
│       │       ├── runs/
│       │       │   ├── route.ts               # POST starta körning
│       │       │   └── [id]/
│       │       │       ├── route.ts           # GET status
│       │       │       └── stream/route.ts    # GET SSE-ström
│       │       └── outputs/
│       │           └── [id]/route.ts          # GET, DELETE
│       │
│       ├── components/
│       │   ├── ui/                   # shadcn/ui-komponenter
│       │   ├── platform/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── RunStatusBadge.tsx
│       │   │   ├── LogStream.tsx     # Realtidslogg (SSE)
│       │   │   └── OutputCard.tsx
│       │   └── forms/
│       │       ├── AgentForm.tsx
│       │       └── WorkflowForm.tsx
│       │
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── client.ts         # Browser-klient
│       │   │   ├── server.ts         # Server-klient (API routes)
│       │   │   └── types.ts          # Auto-genererade DB-typer
│       │   ├── ai/
│       │   │   ├── runner.ts         # Kör ett agentsteg (anropar LLM)
│       │   │   ├── stream.ts         # Hanterar SSE-streaming
│       │   │   └── models.ts         # Modellkonfiguration
│       │   └── skills/
│       │       └── index.ts          # Laddar skills från packages/
│       │
│       ├── .env.local                # Lokala env-variabler
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── package.json
│
└── packages/
    └── agent-skills/                 # Skill-definitioner (från Agentic OS)
        ├── index.ts                  # Exporterar alla skills
        ├── story-generator/
        │   └── skill.ts             # Systemprompt + konfiguration
        ├── activity-planner/
        │   └── skill.ts
        ├── image-prompt-writer/
        │   └── skill.ts
        └── pdf-assembler/
            └── skill.ts
```

> **Notera:** `workers/` och `packages/shared` används INTE i MVP.  
> `apps/API` ersätts av Next.js API routes — ingen separat backend.

---

## 5. Databasschema (Supabase / PostgreSQL)

Sju tabeller. Inget mer.

```sql
-- ─────────────────────────────────────
--  PROJECTS
-- ─────────────────────────────────────
CREATE TABLE projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                        -- "Familje-Stunden"
  slug       TEXT NOT NULL UNIQUE,                 -- "familje-stunden"
  color      TEXT DEFAULT '#6366f1',               -- UI-färg
  settings   JSONB DEFAULT '{}',                   -- Flexibel projektkonfig
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────
--  AGENTS
-- ─────────────────────────────────────
CREATE TABLE agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,                    -- "StoryAgent"
  description    TEXT,
  system_prompt  TEXT NOT NULL,                    -- Agentens roll och instruktioner
  model          TEXT DEFAULT 'claude-sonnet-4-6', -- Modell att använda
  skill_ids      TEXT[] DEFAULT '{}',              -- Länkade skills från packages/
  config         JSONB DEFAULT '{}',               -- max_tokens, temperature, etc.
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────
--  WORKFLOWS
-- ─────────────────────────────────────
CREATE TABLE workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                       -- "Månadspaket Generator"
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',         -- Array av steg, se format nedan
  trigger     TEXT DEFAULT 'manual',               -- 'manual' | 'cron' | 'webhook'
  cron_expr   TEXT,                                -- "0 9 1 * *" (1:a varje månad)
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

/*
  steps-format (JSONB array):
  [
    {
      "order": 1,
      "name": "Generera berättelse",
      "agent_id": "<uuid>",
      "input_template": "Skapa en berättelse om {{theme}} för barn {{age_range}}",
      "output_key": "story"
    },
    {
      "order": 2,
      "name": "Skapa aktiviteter",
      "agent_id": "<uuid>",
      "input_template": "Baserat på denna berättelse:\n{{story}}\nSkapa 3 aktiviteter.",
      "output_key": "activities"
    }
  ]
*/

-- ─────────────────────────────────────
--  RUNS
-- ─────────────────────────────────────
CREATE TABLE runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'pending',   -- pending | running | done | failed
  input        JSONB DEFAULT '{}',       -- Parametrar som matades in vid start
  context      JSONB DEFAULT '{}',       -- Ackumulerade mellanresultat (output_key → värde)
  error        TEXT,                     -- Felbeskrivning om status = failed
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────
--  RUN LOGS  (ett event per LLM-anrop/steg)
-- ─────────────────────────────────────
CREATE TABLE run_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_order  INTEGER,
  step_name   TEXT,
  role        TEXT,                      -- 'user' | 'assistant' | 'system' | 'tool'
  content     TEXT,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────
--  OUTPUTS
-- ─────────────────────────────────────
CREATE TABLE outputs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- "Januari 2026 - Månadspaket"
  type        TEXT NOT NULL,             -- 'text' | 'pdf' | 'image' | 'json'
  content     TEXT,                      -- För text/JSON-utdata
  file_url    TEXT,                      -- Supabase Storage URL (för PDF/bild)
  file_size   INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────
--  MEMORIES  (per projekt, enkel nyckel-värde)
-- ─────────────────────────────────────
CREATE TABLE memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,             -- "last_theme" | "user_preferences"
  value       TEXT NOT NULL,
  source      TEXT,                      -- 'manual' | 'agent' | 'run:<run_id>'
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, key)
);

-- ─────────────────────────────────────
--  ROW LEVEL SECURITY
-- ─────────────────────────────────────
ALTER TABLE projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories  ENABLE ROW LEVEL SECURITY;

-- En policy räcker för MVP (ägaren ser sitt eget)
CREATE POLICY "owner_access" ON projects
  USING (owner_id = auth.uid());

-- För tabeller som refererar projects: koppla via projects-tabellen
CREATE POLICY "owner_access" ON agents
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- (Samma mönster för workflows, runs, run_logs, outputs, memories)
```

### Supabase Storage Buckets
```
outputs/          # PDFer och bilder från körningar (privat, signerade URLs)
  └── {project_id}/{run_id}/{filename}
```

---

## 6. API-endpoints (Next.js API Routes)

Minimalt. Inget CRUD-ramverk, inga abstraktioner ännu.

```
METHOD  PATH                              BESKRIVNING
──────  ────────────────────────────────  ───────────────────────────────
GET     /api/projects                     Lista användarens projekt
POST    /api/projects                     Skapa nytt projekt

GET     /api/projects/[slug]/agents       Lista agenter i projekt
POST    /api/projects/[slug]/agents       Skapa agent
PATCH   /api/projects/[slug]/agents/[id]  Uppdatera agent
DELETE  /api/projects/[slug]/agents/[id]  Ta bort agent

GET     /api/projects/[slug]/workflows    Lista workflows
POST    /api/projects/[slug]/workflows    Skapa workflow
PATCH   /api/projects/[slug]/workflows/[id]  Uppdatera workflow

POST    /api/runs                         Starta en körning (workflow_id + input)
GET     /api/runs/[id]                    Hämta status + kontext
GET     /api/runs/[id]/stream             SSE-ström av log-events (realtid)
POST    /api/runs/[id]/cancel             Avbryt körning

GET     /api/outputs                      Lista utdata (per projekt)
GET     /api/outputs/[id]/download        Signerad URL för filnedladdning
DELETE  /api/outputs/[id]                 Ta bort utdata

GET     /api/projects/[slug]/memories     Lista minnen
PUT     /api/projects/[slug]/memories     Sätt/uppdatera minne (key + value)
```

**Totalt: 18 endpoints.** Inga fler för MVP.

---

## 7. De första agenterna

Varje agent är en `skill.ts`-fil med systemprompt + config.

### Agent 1 — StoryAgent (Familje-Stunden)
```typescript
// packages/agent-skills/story-generator/skill.ts
export const storyGeneratorSkill = {
  id: 'story-generator',
  name: 'Berättelsegenerator',
  description: 'Skapar barnvänliga berättelser baserat på tema och åldersgrupp',
  defaultModel: 'claude-sonnet-4-6',
  systemPrompt: `Du är en kreativ barnboksförfattare som skriver på svenska.
Du skapar engagerande, åldersanpassade berättelser med:
- Tydlig handling (början, mitten, slut)
- Positiva värderingar och lärdomar
- Levande karaktärer som barn kan identifiera sig med
- Enkelt men rikt språk

Format: Returnera berättelsen som ren text med rubrik överst.
Längd: 300–500 ord om inget annat anges.`,
  config: {
    max_tokens: 1500,
    temperature: 0.8,
  },
};
```

### Agent 2 — ActivityAgent (Familje-Stunden)
```typescript
export const activityPlannerSkill = {
  id: 'activity-planner',
  name: 'Aktivitetsplanerare',
  description: 'Skapar barnaktiviteter kopplade till berättelsens tema',
  defaultModel: 'claude-haiku-4-5',  // Snabbare, billigare för enkla uppgifter
  systemPrompt: `Du skapar praktiska familjeaktiviteter kopplade till en berättelse.
Varje aktivitet ska:
- Ta 15–45 minuter
- Kräva enkelt material (finns hemma)
- Passa barn 4–8 år
- Ha tydliga steg-för-steg-instruktioner

Format (JSON):
{
  "activities": [
    {
      "title": "...",
      "duration_minutes": 20,
      "materials": ["...", "..."],
      "steps": ["...", "...", "..."],
      "learning_goal": "..."
    }
  ]
}`,
  config: {
    max_tokens: 2000,
    temperature: 0.7,
  },
};
```

### Agent 3 — ImagePromptAgent (Familje-Stunden)
```typescript
export const imagePromptWriterSkill = {
  id: 'image-prompt-writer',
  name: 'Bildprompt-skrivare',
  description: 'Skapar optimerade bildprompts för AI-bildgenerering',
  defaultModel: 'claude-haiku-4-5',
  systemPrompt: `Du skriver bildprompts för AI-bildgenerering (Ideogram/Flux).
Stil: "children's book illustration, watercolor, soft colors, friendly characters"
Undvik: realism, mörka teman, skrämmande element.
Skriv alltid på engelska (bildmodeller fungerar bäst på engelska).
Format: En prompt per rad, max 100 ord per prompt.`,
  config: {
    max_tokens: 500,
    temperature: 0.6,
  },
};
```

### Agent 4 — GeneralistAgent (Globalt, alla projekt)
```typescript
export const generalistSkill = {
  id: 'generalist',
  name: 'Generalist',
  description: 'Universell agent för ad-hoc uppgifter och testning',
  defaultModel: 'claude-sonnet-4-6',
  systemPrompt: `Du är en hjälpsam AI-assistent.
Svara alltid på det språk som användaren skriver på.
Var konkret och handlingsinriktad.`,
  config: {
    max_tokens: 4000,
    temperature: 0.7,
  },
};
```

---

## 8. De första workflows

### Workflow 1 — "Månadspaket" (Familje-Stunden)

```json
{
  "name": "Månadspaket Generator",
  "description": "Genererar ett komplett aktivitetspaket för en månad",
  "trigger": "manual",
  "steps": [
    {
      "order": 1,
      "name": "Välj tema",
      "agent_id": "<story-agent-id>",
      "input_template": "Föreslå ett kreativt tema för barn {{age_range}} för månaden {{month}}. Ge ett ord eller kort fras.",
      "output_key": "theme"
    },
    {
      "order": 2,
      "name": "Skriv berättelse",
      "agent_id": "<story-agent-id>",
      "input_template": "Skriv en berättelse med temat '{{theme}}' för barn i åldern {{age_range}}.",
      "output_key": "story"
    },
    {
      "order": 3,
      "name": "Skapa aktiviteter",
      "agent_id": "<activity-agent-id>",
      "input_template": "Baserat på denna berättelse:\n\n{{story}}\n\nSkapa 3 familjeaktiviteter kopplade till temat '{{theme}}'.",
      "output_key": "activities_json"
    },
    {
      "order": 4,
      "name": "Skriv bildprompts",
      "agent_id": "<image-prompt-agent-id>",
      "input_template": "Skapa 2 bildprompts för temat '{{theme}}'. En för berättelsens huvudscen, en för aktivitetssidan.",
      "output_key": "image_prompts"
    }
  ]
}
```

**Input-parametrar vid körning:**
```json
{
  "month": "Juni 2026",
  "age_range": "4–7 år"
}
```

### Workflow 2 — "Ad-hoc Agent Run" (Globalt)

```json
{
  "name": "Kör agent manuellt",
  "description": "Enstaka agentkörning med valfri prompt",
  "trigger": "manual",
  "steps": [
    {
      "order": 1,
      "name": "Kör",
      "agent_id": "<generalist-agent-id>",
      "input_template": "{{prompt}}",
      "output_key": "result"
    }
  ]
}
```

---

## 9. Vad ska byggas FÖRST

### Ordning: Data → API → UI → Agent

**Steg 1 — Databas (dag 1)**
```
1. Skapa Supabase-projekt
2. Kör schema.sql (alla 7 tabeller)
3. Aktivera RLS-policies
4. Generera TypeScript-typer: supabase gen types typescript
5. Skapa Storage bucket: outputs/
```

**Steg 2 — Next.js-projekt (dag 1–2)**
```
1. npx create-next-app@latest apps/web --typescript --tailwind --app
2. Installera: @supabase/supabase-js @supabase/ssr
3. Installera: shadcn/ui (npx shadcn@latest init)
4. Konfigurera Supabase-klienter (client.ts + server.ts)
5. Lägg till .env.local med Supabase-nycklar + LLM API-nycklar
```

**Steg 3 — Auth (dag 2)**
```
1. Login-sida med Supabase Auth (email magic link)
2. Middleware för skyddade routes
3. Testa att inloggning fungerar
```

**Steg 4 — Project CRUD (dag 2–3)**
```
1. /api/projects (GET + POST)
2. /dashboard/page.tsx — visa lista med projekt
3. Skapa-projekt-formulär (namn + slug + färg)
4. /projects/[slug]/page.tsx — tom projektsida
```

**Steg 5 — Agent CRUD (dag 3)**
```
1. /api/projects/[slug]/agents (GET + POST + PATCH + DELETE)
2. AgentForm.tsx — name, description, system_prompt, model-väljare
3. Lista agenter per projekt
```

**Steg 6 — Workflow CRUD (dag 4)**
```
1. /api/projects/[slug]/workflows (GET + POST + PATCH)
2. WorkflowForm.tsx — name + steg-builder (drag-n-drop steg)
3. Varje steg: välj agent, skriv input_template, namnge output_key
```

**Steg 7 — Run-motorn (dag 5–6) — DET VIKTIGASTE**
```
1. POST /api/runs — skapar run-rad, sätter status=running, kör sekventiellt:
   a. Loopa steg för steg
   b. Interpolera input_template med context-värden
   c. Anropa LLM (Anthropic SDK / OpenAI SDK)
   d. Spara varje event till run_logs
   e. Spara output_key i runs.context
   f. Vid klart: status=done, spara output-rad
   g. Vid fel: status=failed, spara error

2. GET /api/runs/[id]/stream — SSE-ström:
   Poller run_logs var 500ms, skickar nya rader som SSE-events

3. /runs/[id]/page.tsx — LogStream.tsx visar events i realtid
```

**Steg 8 — Outputs (dag 7)**
```
1. Visa outputs per projekt
2. Nedladdning via signerade Supabase Storage URLs
3. Kopiera text till urklipp (för text-outputs)
```

**MVP klar på ~7 dagar med fokuserat arbete.**

---

## 10. Implementationsordning för Claude Code + Codex

### Hur man promptar Claude Code effektivt för detta projekt

**Regel 1: Ge alltid schema-kontext**
```
"Vi bygger AI Operations Platform. Schema finns i MVP_ARCHITECTURE.md.
Tabellerna är: projects, agents, workflows, runs, run_logs, outputs, memories.
Bygg nu: [specifik uppgift]"
```

**Regel 2: En fil i taget**
```
Bygg: apps/web/lib/ai/runner.ts
Funktion: Tar ett workflow-steg + context, anropar LLM, returnerar {output, tokens, duration_ms}
Använd: Anthropic SDK (claude-sonnet-4-6 som default)
Stöd: Streaming via callbacks
```

**Regel 3: Testa i terminalen, inte i UI**
Bygg ett enkelt test-script för run-motorn innan du kopplar upp det mot UI:
```bash
npx tsx scripts/test-run.ts
```

**Regel 4: Hårdkoda innan du generaliserar**
Bygg Månadspaket-workflowet hårdkodat i ett script → verifiera att det fungerar → generalisera till workflow-motorn.

**Regel 5: Commit efter varje steg**
```
git commit -m "feat: add run engine with SSE streaming"
git commit -m "feat: add agent CRUD API"
```

---

## Anti-overengineering-regler

| Frestelse | Gör istället |
|-----------|-------------|
| Bygga en queue (BullMQ/Inngest) nu | Kör synkront i API route — lägg till queue när du har körningar >60s |
| Separera Python-backend (Hermes) nu | Anropa LLM direkt från Next.js — integrera Hermes när du behöver verktyg/filsystem |
| Bygga komplex workflow-UI med drag-n-drop | Börja med JSON-editor för steps — polera UI sen |
| Lägga till pgvector/embeddings | Lägg till memories som nyckel-värde — vektor-sökning kommer i fas 2 |
| Stödja flera LLM-leverantörer direkt | Börja med Anthropic direkt — lägg till OpenRouter sedan |
| Bygga team-funktioner | Enkelt ägande (owner_id) räcker — teamfunktioner i fas 3 |
| Lägga till cron-triggers nu | Bygg manual trigger först — cron kommer naturligt sen |
| Skapa admin-panel | Hantera via Supabase Studio i dev — admin-UI i fas 4 |

---

## Fasplan (realistisk)

```
FAS 0 — Foundation          ~1 vecka
  ✓ Supabase + schema
  ✓ Next.js + auth
  ✓ Project CRUD
  ✓ Första projekt: familje-stunden

FAS 1 — Kör en agent        ~1 vecka
  ✓ Agent CRUD
  ✓ Run-motor (sekventiell)
  ✓ SSE-streaming till UI
  ✓ Output-visning

FAS 2 — Workflows           ~1 vecka
  ✓ Workflow CRUD
  ✓ Steg-builder
  ✓ Context-interpolation ({{variable}})
  ✓ Månadspaket-workflow kör end-to-end

FAS 3 — Outputs             ~1 vecka
  ✓ PDF-generering (react-pdf eller Puppeteer)
  ✓ Bildgenerering (Ideogram API / Replicate)
  ✓ Fillagring i Supabase Storage
  ✓ Nedladdning

FAS 4 — GainPilot onboarding   ~3 dagar
  ✓ Skapa projekt: gainpilot
  ✓ Definiera GainPilot-agenter
  ✓ Verifiera att multi-projekt fungerar

FAS 5 — Memories + polish   ~1 vecka
  ✓ Memory CRUD per projekt
  ✓ Agenter kan läsa minnen via context
  ✓ Dashboard med senaste runs + status
  ✓ Körningslogg (historik)
```

**Totalt: ~6 veckor till en plattform med riktiga utdata.**

---

## Nästa steg (direkt)

1. `cd "/Users/andrehultgren/Documents/AI Operating Platform"`
2. `npx create-next-app@latest apps/web --typescript --tailwind --app --src-dir no`
3. Kopiera schema.sql från detta dokument till `packages/db/schema.sql`
4. Skapa Supabase-projekt på supabase.com
5. Kör schema i Supabase SQL editor
6. Börja med: `apps/web/lib/supabase/client.ts`
