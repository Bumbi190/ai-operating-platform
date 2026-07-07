# AtlasRuntime — Slutgiltigt Kontrakt

**Branch:** feat/atlas-voice-ui
**Datum:** 2026-06-29
**Status:** Redo för implementation

---

## Kärnprincip

Atlas är inte en sida. Atlas är ett runtime som existerar oberoende av vilket workspace som är synligt. Användaren navigerar workspaces. Atlas är alltid närvarande.

Runtime äger ingenting utanför sitt ansvar. Det koordinerar state och exponerar ett API. Resonerande tillhör Executive Intelligence. Minne tillhör Memory. Hämtning tillhör Retrieval Faculty. Exekvering tillhör Manager.

---

## Publikt API

```typescript
const atlas = useAtlas()
```

Det är det. Konsumenter behöver inte känna till att det finns en `AtlasRuntimeProvider` internt.

---

## Typer

### VoicePhase
*Vad rösten gör — mekanisk/audio-tillstånd.*

```typescript
export type VoicePhase =
  | 'idle'       // inget aktivt
  | 'listening'  // STT aktivt, tar emot tal
  | 'thinking'   // LLM streamas, TTS-kön byggs
  | 'speaking'   // audio spelas upp
```

### ExecutiveState
*Vad Atlas gör — beteende/semantiskt tillstånd.*

```typescript
export type ExecutiveState =
  | 'idle'        // Atlas är inte aktivt engagerad
  | 'briefing'    // Atlas levererar en sammanfattning eller rapport
  | 'advising'    // Atlas ger rekommendationer i pågående dialog
  | 'delegating'  // Atlas triggar agenter, workflows eller navigering
  | 'monitoring'  // Atlas observerar passivt — session öppen men tyst
```

**Viktigt:** Runtime *klassar inte* meddelanden för att avgöra ExecutiveState.
Den läser strukturella signaler från SSE-strömmen — samma events som
redan existerar:

| Signal | ExecutiveState |
|--------|---------------|
| Svar på första meddelandet (ingen historik) | `briefing` |
| Svar på uppföljande meddelanden | `advising` |
| `event: 'navigate'` tas emot | `delegating` |
| `event: 'tool_call'` med trigger_workflow | `delegating` |
| Session aktiv, >5 min sedan senaste interaktion | `monitoring` |
| Session avslutad / ej aktiverad | `idle` |

Ingen intelligens. Ren tillståndsmaskin.

### Workspace
*Rikare objekt med semantisk metadata — inte bara en URL.*

```typescript
export interface Workspace {
  // Navigering
  href: string
  label: string              // "Familje-Stunden", "Granskningar", "Atlas"

  // Projekttillhörighet (satt om workspacet är ett projekt)
  project?: {
    id: string
    slug: string
    name: string
    color: string
  }

  // Semantisk metadata
  icon?: string              // lucide-ikonnamn, t.ex. "shield-check", "trending-up"
  status?: 'healthy' | 'needs_attention' | 'active' | 'unknown'
  priority?: 'urgent' | 'normal' | 'low'
}
```

`currentWorkspace` spåras automatiskt via `usePathname()` inuti runtime.
Konsumenter behöver aldrig anropa `setWorkspace()` — de navigerar bara.

En `resolveWorkspace(pathname) → Workspace`-funktion mappar URL:er till
semantiska objekt. Den listan underhålls i `lib/atlas/workspace-registry.ts`
(ny fil, P1A).

### ConversationMessage

```typescript
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}
```

### ProjectRef

```typescript
export interface ProjectRef {
  id: string
  slug: string
  name: string
  color: string
}
```

---

## AtlasValue — det fullständiga gränssnittet

```typescript
export interface AtlasValue {

  // ── Röst ──────────────────────────────────────────────────────────────
  voicePhase: VoicePhase       // vad rösten gör just nu
  transcript: string           // löpande STT-text under listening
  response: string             // ackumulerat Atlas-svar (streaming)
  perf: string | null          // latens-readout, t.ex. "⚡ 1.4s"

  // ── Exekutivt läge ────────────────────────────────────────────────────
  executiveState: ExecutiveState   // vad Atlas gör semantiskt

  // ── Session ───────────────────────────────────────────────────────────
  isSessionActive: boolean     // har operatören aktiverat Atlas?
  lastActiveAt: Date | null    // tidpunkt för senaste interaktion

  // ── Konversation ──────────────────────────────────────────────────────
  history: ConversationMessage[]  // hela sessions-historiken
  conversationId: string | null   // DB-id för pågående konversation

  // ── Workspace ─────────────────────────────────────────────────────────
  currentWorkspace: Workspace     // alltid satt — aldrig null under plattformssession
  openWorkspace(href: string, label?: string): void
  // Öppnar workspace med soft transition + optional Atlas-kommentar.
  // Ersätter direkta router.push() från Atlas-voice.

  // ── Projektkontext ────────────────────────────────────────────────────
  activeProject: ProjectRef | null  // sätts automatiskt om pathname innehåller /projects/:slug

  // ── Röst-kontroller ───────────────────────────────────────────────────
  activate(): void               // starta lyssning, sätt isSessionActive = true
  deactivate(): void             // avsluta session
  stopAudio(): void              // barge-in: avbryt tal, återgå till listening
  sendMessage(text: string): Promise<void>  // textbaserad ingång (snabbfrågor)
}
```

---

## Ansvarsgränser

| Ansvar | Ägs av |
|--------|--------|
| Konversationsstate, röstfas, executive state | AtlasRuntime |
| Workspace-spårning | AtlasRuntime (via usePathname) |
| AI-resonerande, svar-generering | Executive Intelligence |
| Minne, kontext-recall | Memory |
| Hämtning av live-data | Retrieval Faculty |
| Workflow-exekvering | Manager |
| Visuell presentation av state | AtlasVoiceHome, AtlasMiniOrb (P1B) |

Runtime injicerar **inga** snapshottyper för Memory eller Executive.
Det är deras ansvar att konsumera `useAtlas()` och reagera på state —
inte runtimens ansvar att hålla deras data.

---

## Provider-hierarki

```
app/(platform)/layout.tsx  ← Server Component
  └── AtlasRuntimeProvider    ← 'use client', YTTERST
        └── OperatorModeProvider  ← oförändrad
              └── (VoiceAssistant ersätts av runtime-logiken)
                  └── grid (Sidebar + canvas + ActivityRail)
```

`AtlasRuntimeProvider` är ytterst eftersom Atlas är OS-lagret.
Allt annat (operatörsläge, framtida Memory-provider) är subsystem.

---

## Filer i P1A

| Fil | Åtgärd |
|-----|--------|
| `lib/atlas/runtime.tsx` | Skapar — `AtlasRuntimeProvider` + `useAtlas()` |
| `lib/atlas/workspace-registry.ts` | Skapar — `resolveWorkspace(pathname)` |
| `app/(platform)/layout.tsx` | Ändrar — lägger till `AtlasRuntimeProvider` ytterst, tar bort `<VoiceAssistant />` |
| `app/(platform)/atlas/AtlasVoiceHome.tsx` | Refaktorerar — konsumerar `useAtlas()`, noll lokal state |
| `components/platform/os/VoiceAssistant.tsx` | Deprecateras — returnerar `null`, logiken lever i runtime |

### Berör inte
- `lib/atlas/context.ts`, `executive.ts`, `intelligence/*`, `memory/*`, `collectors/*`
- `/api/chat` eller `/api/chat/tts`
- Supabase-migreringar
- Andra sidor (approvals, revenue, agent-activity)

---

## P1B lägger till (separat PR)

```typescript
// Konsumerar useAtlas() — inga ändringar av runtime behövs
<AtlasMiniOrb />   // bottom-right, synlig på alla sidor utom /atlas
                   // visar voicePhase + executiveState
                   // klick → expand till konversationspanel
```

---

## Bekräftelsefrågor inför implementation

Dessa är lösta i detta dokument, men markeras explicit:

1. **Namn** — `useAtlas()` ✅
2. **ExecutiveState** — tillståndsmaskin på SSE-events, inte inference ✅
3. **Workspace** — rikare objekt med project/icon/status/priority ✅
4. **Inga Memory/Brief-slots** — runtimans ansvar är avgränsat ✅
5. **Provider-ordning** — `AtlasRuntimeProvider` ytterst ✅
