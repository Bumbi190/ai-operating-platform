# Omnira P1 — Atlas Navigation Layer: Audit & Architecture Plan

_Planning artifact. No code changed. Grounded in `apps/web` source as of `c1ee94b`._
_Goal: make Atlas the primary navigation layer — Atlas answers can open the right view, and `⌘K` becomes a real jump/command surface. One registry powers both._

---

## 1. Audit findings

### 1.1 The Atlas chat flow (`app/api/chat/route.ts` + `components/platform/ChatClient.tsx`)

- The server streams **SSE events**: `text`, `tool_call`, `tool_result`, `done`, `timing`, `error`. There is **no link/navigation channel**.
- Atlas already has real tools (`trigger_workflow`, `run_media_step`, `ask_manager`, `delegate`, `get_dream_findings`, `delegate_dream_finding`, `resolve_dream_finding`) and an honesty-guard. So the tool-emit pattern we need for links already exists and is proven.
- `ChatClient` renders assistant `text` via `ReactMarkdown`, and `tool_call`/`tool_result` as a `ToolCallCard`. **It renders no action chips.** When a turn ends, `assistantText` is appended to history; tool data is shown transiently but the persisted history reload only rebuilds `text` messages (tool/link context is lost on refresh).
- The system prompt (`lib/atlas/identity.ts` → `buildAtlasSystemPrompt`) tells Atlas to "recommend the single highest-leverage action" but gives it **no mechanism to point at a destination**. Atlas can describe ("review the 3 approvals") but cannot open anything.

**Conclusion:** the cleanest deep-link channel is a new **Atlas tool** that takes registry destination keys (never URLs) + filters, which the server validates and re-emits as a structured `links` SSE event. This mirrors the existing tool architecture and respects "Atlas must never generate raw URLs."

### 1.2 The CommandBar (`components/platform/os/CommandBar.tsx`)

- The `⌘K` "Search · jump · command" element is a `<button>` with **no `onClick`, no palette, no keyboard listener**. Purely decorative.
- The breadcrumb is derived live from `usePathname()` — fine, keep it.
- The bar is already a client component rendered once in the platform layout, so it is the correct host for a global `⌘K` listener and palette.

### 1.3 Route structure & routing logic (the duplication problem)

- Deep-link `href`s are **hard-coded in three places**: `lib/atlas/actions.ts` (e.g. `/atlas/activity`, `/approvals`, `/revenue`), `lib/atlas/context.ts` (`topPriority.href`), and the Activity Rail events in `app/(platform)/layout.tsx` (`action: { href: '/system' }`, `/approvals`). No shared map. The same concept ("failed runs") points at `/atlas/activity` in one file and `/agent-activity` exists as another page — exactly the divergence a registry prevents.
- **Query-param filtering barely exists.** Only `projects/[slug]/{news,scripts,outputs}` read `searchParams`. `approvals`, `agent-activity`, `costs`, `revenue` render unfiltered. So filtered deep-links will *land* on the right page but won't *filter* until each page reads its params (phased work, graceful degradation in the meantime).
- **Display name ≠ slug.** `BUSINESS_PROFILES` maps `"The Prompt"` → slug **`ai-media-automation`**; other slugs are `gainpilot`, `familje-stunden`. A registry must resolve names/aliases → canonical slug, or "Open Money for The Prompt" will target the wrong project.
- The target instrument routes in the brief (`/activity`, `/money`, `/health`, `/knowledge`) **do not exist yet** (they're P3). The registry must therefore separate *logical destination* from *current path* so chips work today against existing pages and repoint centrally when instruments land.

---

## 2. Architecture proposal

Four pieces, **one registry as the single source of truth**.

### 2.1 The Navigation Registry — `lib/nav/registry.ts` (new, the core)

A single module that defines every navigable destination and is the *only* place routing logic lives.

```ts
// Logical destinations — stable keys Atlas and CommandBar both reference.
export type DestinationId =
  | 'atlas' | 'chat'
  | 'approvals' | 'activity' | 'money' | 'costs' | 'revenue'
  | 'dream' | 'knowledge' | 'health'
  | 'content_queue' | 'marketing_queue'
  | 'project_home'

export interface Destination {
  id: DestinationId
  label: string                     // human label ("Approvals", "Money")
  keywords: string[]                // CommandBar fuzzy match ("money","spend","cost")
  projectAware: boolean             // does it take a project?
  filters?: Record<string, string[]> // allowed filter keys + allowed values
  build: (ctx: { projectSlug?: string; filters?: Record<string,string> }) => string
}

// Indirection so P3 instruments repoint in ONE place:
const ROUTE_MAP: Record<DestinationId, string> = {
  activity: '/agent-activity',   // → '/activity' when the instrument ships
  money:    '/costs',            // → '/money'
  // approvals: '/approvals' (already canonical), etc.
  ...
}
```

Plus three pure functions — the public API everything else calls:

- `resolveDestination(id, { project?, filters? }): { id, label, href } | null` — validates the id, resolves project name/alias → slug (via a `PROJECT_ALIASES` map seeded from `BUSINESS_PROFILES`), whitelists filters, builds the final `href` with query params. Returns `null` for anything invalid (this is the guard that makes raw-URL injection impossible).
- `searchDestinations(query, { projects }): Destination[]` — ranks destinations + project entries for the CommandBar palette.
- `listProjectDestinations(slug)` — for project-scoped jumps.

**Project-aware routing:** `build()` appends `?project=<slug>` (or routes under `/projects/<slug>/…` for content/marketing) using the resolved canonical slug. Aliases ("the prompt", "prompt") resolve to `ai-media-automation`.

### 2.2 Atlas deep links — chat tool `present_links` (new tool in `app/api/chat/route.ts`)

- New tool: `present_links({ items: [{ destination, project?, filters?, label? }] })`. Atlas chooses **semantic keys**, never URLs.
- Server resolves each item via `resolveDestination()`. Invalid items are dropped (logged). Resolved `{id,label,href}[]` is:
  1. emitted as a new SSE event `links`, and
  2. returned as the `tool_result` (so the model sees what it surfaced and can reference it; also persisted as `tool_data`).
- `TOOL_GUIDE` gains a short rule: *"When your answer references a place the operator can act (approvals, a queue, costs, dream findings), call `present_links` with the relevant destination keys. Never write URLs. Prefer 1–3 links."*
- This is read-only (a navigation suggestion), so it does **not** trip the honesty-guard `actionToolUsed` logic — leave that untouched.

### 2.3 Atlas Action Chips — `components/platform/os/AtlasActionChips.tsx` (new, reusable)

- Pure presentational component: `({ links: { id, label, href }[] }) => ...` rendering a row of chips (`Link` from `next/link`).
- `ChatClient` handles the new `links` SSE event, attaches the links to the current assistant message, and renders `<AtlasActionChips>` beneath the Markdown answer.
- Persistence: store links in the assistant message's `tool_data` so they survive reload (extends the saved-message rehydration in `ChatClient`).
- Reused later by Atlas Home briefing and the Activity Rail (same component, same registry) — satisfies "reusable, project-scoped, registry-backed."

### 2.4 CommandBar becomes real — `CommandPalette.tsx` (new) + `CommandBar.tsx` (modify)

- New `CommandPalette` (client): an overlay with a search input and three result groups, all sourced from the registry:
  - **Jump to page** — `searchDestinations()` non-project entries.
  - **Jump to project** — projects (passed down from layout) × relevant destinations.
  - **Execute Atlas intent** — if the query looks like a command ("publish the next reel", "what failed today?"), offer "Ask Atlas →" which routes to `/chat/<new>?send=<query>` (reusing the existing `?send=` auto-send path already in `ChatClient`).
- `CommandBar`: add a global `keydown` listener (`⌘K`/`Ctrl+K`) and wire the existing button's `onClick` to open the palette. The palette needs the project list — pass `projects` from the platform layout (already fetched there) into `CommandBar`.

### 2.5 Single-source guarantee

`lib/atlas/actions.ts`, `lib/atlas/context.ts`, and the Activity Rail event builders are **refactored to call `resolveDestination()`** instead of hard-coding `href`s. After this, grepping for string literals like `'/approvals'` outside `registry.ts` should return (near) zero — the verification step asserts it.

### 2.6 Data flow (one diagram)

```
                       ┌─────────────────────────┐
   ⌘K / palette  ─────▶│   lib/nav/registry.ts   │◀──── lib/atlas/actions.ts
   Atlas present_links ▶│  resolveDestination()   │      lib/atlas/context.ts
   Activity Rail  ─────▶│  searchDestinations()   │      (no more hard-coded hrefs)
                       └────────────┬────────────┘
                                    │ {id,label,href}
                 ┌──────────────────┼───────────────────┐
                 ▼                  ▼                   ▼
         AtlasActionChips     CommandPalette        Next <Link>
         (beneath answers)    (jump / intent)       navigation
```

---

## 3. Exact files to modify

**New**
- `apps/web/lib/nav/registry.ts` — destinations, `ROUTE_MAP`, `PROJECT_ALIASES`, `resolveDestination`, `searchDestinations`, `listProjectDestinations`, types.
- `apps/web/components/platform/os/AtlasActionChips.tsx` — reusable chip row.
- `apps/web/components/platform/os/CommandPalette.tsx` — ⌘K overlay (jump page / jump project / ask Atlas).

**Modify**
- `apps/web/app/api/chat/route.ts` — add `present_links` tool def + `executeTool` handler; emit `links` SSE event; add link rule to `TOOL_GUIDE`.
- `apps/web/components/platform/ChatClient.tsx` — handle `links` event; render `AtlasActionChips`; persist/rehydrate links via `tool_data`.
- `apps/web/components/platform/os/CommandBar.tsx` — global `⌘K` listener; wire button `onClick`; accept `projects` prop.
- `apps/web/app/(platform)/layout.tsx` — pass `projects` into `CommandBar`.
- `apps/web/lib/atlas/identity.ts` — one line in the system prompt about surfacing navigation via `present_links`, never URLs.
- `apps/web/lib/atlas/actions.ts` — replace hard-coded `href`s with `resolveDestination()`.
- `apps/web/lib/atlas/context.ts` — replace `topPriority.href` literals with `resolveDestination()`.

**Modify (filter consumers — phased, for filters to actually take effect)**
- `apps/web/app/(platform)/approvals/page.tsx` — read `?state=`.
- `apps/web/app/(platform)/agent-activity/page.tsx` — read `?status=` (+ `?project=`).
- `apps/web/app/(platform)/costs/page.tsx`, `revenue/page.tsx` — read `?project=`.

(Content/marketing queues are already project-fixed; they just need the registry to route to them.)

---

## 4. Risks

1. **Project name → slug ambiguity.** "The Prompt" = `ai-media-automation`. Mitigation: `PROJECT_ALIASES` seeded from `BUSINESS_PROFILES`; `resolveDestination` returns `null` on unknown project rather than guessing.
2. **Filters land but don't filter (yet).** Target pages don't read params today. Mitigation: graceful degradation (chip still opens the right page); ship filter-reading per page in the phased step; until then the href can omit unsupported filters.
3. **Future instrument routes don't exist.** `/activity`, `/money`, `/health`, `/knowledge` are P3. Mitigation: `ROUTE_MAP` points logical ids at current pages now; repoint in one place when instruments ship — no registry redesign (satisfies requirement 5).
4. **Latency from an extra tool turn** when Atlas calls `present_links`. Mitigation: links are optional and non-forced; text streams first, chips resolve after; cap at 1–3 links; never on the voice/fast paths.
5. **Hallucinated/empty links.** Mitigation: registry validation drops invalid items; `AtlasActionChips` renders nothing for an empty set.
6. **Persistence gap.** Links shown live but lost on reload if not saved. Mitigation: store in `tool_data`; extend `ChatClient` rehydration.
7. **`⌘K` collisions / a11y.** Browser and OS bindings, focus trapping. Mitigation: `preventDefault` on match, Escape-to-close, focus-trap, `aria` roles, restore focus on close.
8. **Registry drift.** A new page added without a registry entry re-introduces hard-coded hrefs. Mitigation: lint/test asserting no route-literals outside `registry.ts`; document the "add a destination" step.
9. **Scope creep into P3.** This phase must not try to build the instruments. Mitigation: registry + indirection only; instruments are out of scope.

---

## 5. Implementation plan (sequenced)

1. **Registry first (`lib/nav/registry.ts`)** with `resolveDestination`, `searchDestinations`, `ROUTE_MAP`, `PROJECT_ALIASES`, and unit tests. Nothing else can be built correctly before this exists.
2. **Refactor existing hrefs** in `lib/atlas/actions.ts` + `context.ts` + Activity Rail to use the registry. Pure refactor, no behavior change — proves the registry covers today's needs and removes duplication early.
3. **`present_links` tool** in `app/api/chat/route.ts` + `links` SSE event + `TOOL_GUIDE`/identity prompt update.
4. **`AtlasActionChips`** + `ChatClient` wiring (live render + `tool_data` persistence).
5. **`CommandPalette`** + `CommandBar` `⌘K` wiring + pass `projects` from layout. (Jump-page, jump-project, ask-Atlas.)
6. **Filter consumers** (phased): `approvals` (`state`), `agent-activity` (`status`/`project`), `costs`/`revenue` (`project`).
7. **Verification pass** (§6), then demo for approval before any P3 instrument work.

Each step is independently shippable; 1–2 alone remove the duplicated routing logic, 3–5 deliver the user-visible "Atlas navigates" outcome.

---

## 6. Verification checklist

**Registry (unit)**
- [ ] `resolveDestination('approvals', { filters:{ state:'pending' }})` → `/approvals?state=pending`.
- [ ] `resolveDestination('money', { project:'gainpilot' })` → resolves slug + correct path via `ROUTE_MAP`.
- [ ] Project alias: `project:'The Prompt'` and `'prompt'` → `ai-media-automation`.
- [ ] Unknown destination, unknown project, or disallowed filter value → `null` (raw-URL injection impossible).
- [ ] Repointing `ROUTE_MAP.money` to `/money` changes every consumer with no other edits.

**Atlas deep links**
- [ ] A status answer ("3 pending approvals") triggers `present_links`; client receives `links` SSE; chips render beneath the answer.
- [ ] Chips deep-link with filters; clicking lands on the correct (filtered, where supported) page.
- [ ] Links persist across reload (rehydrated from `tool_data`).
- [ ] Atlas cannot surface a chip for a non-registry destination (validation drops it).
- [ ] Voice/fast paths surface no chips and incur no extra latency.

**CommandBar / palette**
- [ ] `⌘K` (and Ctrl+K) opens the palette from any page; Escape closes; focus restored.
- [ ] "approvals", "money", "failed runs", "the prompt", "dream findings" each resolve to the right destination via the registry.
- [ ] Jump-to-project lists projects and routes project-scoped destinations correctly.
- [ ] A command-like query offers "Ask Atlas →" and routes to `/chat/<new>?send=…`.

**Single source of truth**
- [ ] Grep: no route string-literals (`'/approvals'`, `'/costs'`, …) outside `lib/nav/registry.ts` (allowing layout/sidebar nav config).
- [ ] CommandBar and AtlasActionChips both import only the registry for hrefs.

**Regression / a11y**
- [ ] Existing chat behavior (text, tool cards, honesty-guard, `?send=`) unchanged.
- [ ] Palette keyboard-navigable; chips reachable by keyboard; contrast AA.

---

## 7. Out of scope (explicit)

Building the `/activity`, `/money`, `/health`, `/knowledge` instruments (P3); sidebar collapse (P2); removing duplicate pages. This phase delivers the **navigation layer and registry** so those land later by repointing `ROUTE_MAP`, with zero registry redesign.
