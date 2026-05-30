# SYSTEM_STATUS.md — AI Operations Platform

**Senast uppdaterad:** 2026-05-16  
**Status:** Strukturellt komplett — väntar på Supabase-konfiguration för e2e-test

---

## ✅ Vad som fungerar (verifierat i kod)

### Monorepo & Infrastruktur
- `npm workspaces` med korrekt hoisting till rot-`node_modules`
- TypeScript `moduleResolution: "node"` → löser paket från rot-`node_modules`
- Tailwind CSS v3 + shadcn/ui CSS-variabler konfigurerade
- Next.js 14 App Router med Route Groups `(auth)` och `(platform)`
- Middleware-baserad auth: ej inloggad → `/login`, inloggad på auth-route → `/dashboard`

### Databas (schema verifierat)
- 7 tabeller: `projects`, `agents`, `workflows`, `runs`, `run_logs`, `outputs`, `memories`
- RLS aktiverat på alla tabeller med ägar-baserade policies
- Korrekt kaskadradering (project → agents/workflows/runs/run_logs/outputs)
- Index på alla vanliga query-patterns (project_id, status, created_at)

### API-lager (alla routes implementerade)
| Endpoint | Metod | Status |
|----------|-------|--------|
| `/api/projects` | GET, POST | ✅ |
| `/api/projects/[slug]/agents` | GET, POST | ✅ |
| `/api/projects/[slug]/agents/[id]` | PATCH, DELETE | ✅ |
| `/api/projects/[slug]/workflows` | GET, POST | ✅ |
| `/api/projects/[slug]/workflows/[id]` | PATCH, DELETE | ✅ |
| `/api/runs` | POST | ✅ |
| `/api/runs/[id]` | GET | ✅ |
| `/api/runs/[id]/stream` | GET (SSE) | ✅ |
| `/api/outputs/[id]` | GET (download), DELETE | ✅ |

### UI-sidor (alla implementerade)
| Sida | Status |
|------|--------|
| `/login` | ✅ Magic link auth |
| `/dashboard` | ✅ Projektöversikt |
| `/projects/new` | ✅ Projektformulär med färgväljare |
| `/projects/[slug]` | ✅ Projektkort |
| `/projects/[slug]/agents` | ✅ Agentlista |
| `/projects/[slug]/agents/new` | ✅ Skapa agent |
| `/projects/[slug]/agents/[id]` | ✅ Redigera/radera agent |
| `/projects/[slug]/workflows` | ✅ Workflowlista |
| `/projects/[slug]/workflows/new` | ✅ Workflow-byggare |
| `/projects/[slug]/workflows/[id]` | ✅ Redigera/radera workflow |
| `/projects/[slug]/workflows/[id]/run` | ✅ Starta körning |
| `/projects/[slug]/runs` | ✅ Körningslista |
| `/projects/[slug]/runs/[id]` | ✅ Körningsdetalj + live-logg |
| `/projects/[slug]/outputs` | ✅ Utdatalista |

### Run Engine (kritisk logik)
- **Bakgrundskörning** med service-role Supabase-klient (ej bunden till request-livscykeln)
- **Sekventiell stegexekvering** med kontextackumulering (`{{variabel}}`-interpolering)
- **Loggning** av varje steg (user-meddelande + assistant-svar + tokens + tid)
- **SSE-stream** pollar `run_logs` var 800ms med admin-klient
- **Felhantering**: skriver fel till `run_logs` + markerar run som `failed`
- **Outputs**: sparar sista stegets output till `outputs`-tabellen

### Komponenter
- `LogStream` — SSE-klient med dedup, steg-separatorer, token-metadata
- `RunStatusBadge` — pill med status-färger
- `AgentForm` — återanvändbar med skill-presets och avancerade inställningar
- `Sidebar` — navigering med projekt-context
- UI-primitiver: Button, Input, Label, Textarea, Select, Badge

---

## ⚠️ Instabilt / Ej verifierat e2e

### Måste konfigureras innan test
1. **Supabase-projekt** — skapa på supabase.com
2. **Kör schema** — kopiera `packages/db/schema.sql` → Supabase SQL Editor
3. **Skapa Storage bucket** — Dashboard → Storage → skapa bucket `outputs` (privat)
4. **Fyll i `.env.local`** — kopiera från `apps/web/.env.local.example`
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. **Aktivera Email/Magic Link** — Supabase Dashboard → Authentication → Providers → Email

### Ännu ej testat
- Faktisk magic link-autentisering mot Supabase
- End-to-end körning: projekt → agent → workflow → run → SSE-stream → output
- SSE-stream under körning (polling varje 800ms)
- Output-nedladdning via signed URL

---

## 🐛 Kända buggar

### Kosmestika TypeScript-fel
- Supabase `.select()` returnerar `never`-typer vid vissa joins — påverkar inte runtime
- Workaround: explicit cast (`as RunLog[]`, `as WorkflowStep[]`)

### Saknade sidor
- Inga loading.tsx-filer (Suspense boundaries) — sidor visas utan skeleton-states
- Inga error.tsx-filer — Next.js default felhantering
- Ingen `/projects/[slug]/settings` sida — PATCH/DELETE på projekt

### SSE-begränsningar
- Max 180 polls (~2.4 min) — körningar längre än 2.4 min tappar stream
- Om Vercel serverless function tar >60s timeas den ut — byt till Inngest/BullMQ
- Inga Supabase Realtime-subscriptions än (polling är enklare att debugga)

### Outputs-sidan
- "Kopiera"-knapp för text-outputs är inte implementerad (onClick är tom)

---

## 📊 Teknisk skuld (prioriterad)

### Hög prioritet
1. **End-to-end test** — verifiera hela loopen med riktig Supabase + Anthropic
2. **loading.tsx** på alla sidor — förbättra upplevd prestanda
3. **Kopiera-knapp** i outputs-sidan — `navigator.clipboard.writeText(output.content)`

### Medel prioritet
4. **Git commits** — commita varje subsystem separat
5. **Projekt-inställningar** — `/projects/[slug]/settings` med PATCH/DELETE
6. **Workflow-kloning** — kopiera ett workflow till ett annat projekt
7. **Run-pagination** — just nu limit(50), ingen pagination

### Låg prioritet
8. **Supabase Realtime** — ersätt polling med WS-baserade subscriptions
9. **Dra-och-släpp** i workflow-byggaren — GripVertical-ikonen finns men är inte kopplad
10. **Agentfärdigheter (skills)** — `skill_ids` är i schemat men ej kopplat i UI
11. **Cron-trigger** — `cron_expr` och `trigger: 'cron'` är i schemat men ej i UI
12. **Webhook-trigger** — `trigger: 'webhook'` är i schemat men ej i UI

---

## 🎯 Nästa prioriteringar

### Omedelbart (nästa session)
```
1. Konfigurera Supabase (schema + env)
2. Starta dev-server: cd apps/web && npm run dev
3. Logga in med magic link
4. Skapa testprojekt → testagent → testworkflow
5. Kör workflow → verifiera SSE-stream → verifiera output sparas
6. Git commit: "feat: working run engine e2e"
```

### Fas 2 (när e2e fungerar)
- Familje-Stunden projekt med riktiga agenter (berättelsegenerator, aktivitetsplanerare)
- PDF-generering av outputs
- GainPilot projekt

---

## 🏗️ Arkitekturöversikt

```
apps/web/
├── app/
│   ├── (auth)/login          — Magic link login
│   └── (platform)/
│       ├── dashboard         — Projektöversikt
│       └── projects/[slug]/
│           ├── agents/       — CRUD agenter
│           ├── workflows/    — CRUD + kör workflows
│           ├── runs/         — Körningslista + live-logg
│           └── outputs/      — Utdatadatagalleri
├── lib/
│   ├── ai/runner.ts          — Anthropic SDK-anrop
│   ├── ai/models.ts          — Modellkatalog
│   ├── supabase/server.ts    — Cookie-baserad klient (auth)
│   ├── supabase/admin.ts     — Service-role klient (bakgrundskörning)
│   └── utils.ts              — cn(), interpolate(), slugify()
└── components/
    ├── forms/AgentForm.tsx   — Återanvändbart agentformulär
    └── platform/
        ├── LogStream.tsx     — SSE-klient för körningsloggar
        ├── RunStatusBadge.tsx
        └── Sidebar.tsx

packages/
├── db/schema.sql             — 7-tabell PostgreSQL-schema med RLS
└── agent-skills/             — Skill-definitioner (ej kopplat till UI än)
```

---

## Snabbstart

```bash
# 1. Installera beroenden
npm install

# 2. Kopiera och fyll i env
cp apps/web/.env.local.example apps/web/.env.local
# Redigera .env.local med dina nycklar

# 3. Starta dev-server
cd apps/web
npm run dev

# 4. Öppna http://localhost:3000
```

**Supabase-setup:**
1. Skapa nytt projekt på supabase.com
2. Gå till SQL Editor → klistra in innehållet från `packages/db/schema.sql`
3. Gå till Storage → skapa bucket `outputs` (privat)
4. Gå till Authentication → URL Configuration → lägg till `http://localhost:3000/**` i Redirect URLs
5. Kopiera URL, anon-nyckel och service-role-nyckel till `.env.local`
