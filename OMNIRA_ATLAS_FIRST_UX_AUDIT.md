# Omnira — Atlas-First UX Simplification Audit

_Planning artifact. No code changed. Grounded in the actual `apps/web` source as of `c1ee94b` (June 2026)._
_Lens: a daily operator running multiple businesses. Optimize for **less operator work**, not more feature visibility._

---

## 0. The one-sentence finding

Omnira already has an executive agent (Atlas) that can *report on* and *act across* the whole platform from chat — but the UI is still built as a collection of ~20 admin pages that re-expose, three and four times over, the same briefings, action lists, and activity feeds Atlas already produces. The work isn't to build Atlas-first; it's to **delete the duplicate surfaces Atlas makes redundant** and **let Atlas drive navigation** instead of the sidebar.

---

## 1. Current-state audit

### 1.1 What actually exists

**Global navigation (left sidebar) — 14 top-level entries**, from `components/platform/Sidebar.tsx`:

| Sidebar label (sv) | Route | What it is |
|---|---|---|
| Atlas | `/atlas` | Primary home: greeting + briefing + chat box + quick actions + pulse stats + business cards |
| Operations Center | `/atlas/operations` | Aggregated operational view per business |
| Marknadsgranskning | `/atlas/marketing` | Marketing approval inbox — **Familje-Stunden only** |
| Content Center | `/atlas/content` | Editorial queue — **The Prompt website only** |
| Operationscentral | `/dashboard` | Executive briefing + "Business Command Center" cards |
| Revenue Center | `/revenue` | Revenue events + leads |
| Action Center | `/action-center` | "Mission board" of attention items |
| Agentaktivitet | `/agent-activity` | Live running + recent runs |
| Operatör | `/manager` | Manager-agent "mission control" |
| Chat | `/chat` | Atlas conversation (the real agent) |
| Granskningar | `/approvals` | Approvals queue |
| Minne | `/memory` | Memory / decisions / patterns |
| Kostnader | `/costs` | Cost intelligence |
| Planering | `/planning` | Planning board |

**Plus two Atlas pages that exist but are _not_ in the sidebar** (reachable only via in-page links): `/atlas/actions` ("Vad du bör göra" — Executive-Brain ranked actions) and `/atlas/activity` ("live transparency" feed). And **`/system`** (telemetry: agent fleet, memory graph, publish pipeline), reachable via a small link on `/dashboard`.

**Project sub-nav** (expands under each project): Agenter, Arbetsflöden, Körningar, Utdata — plus, for `ai-media-automation` only: Mediepipeline, Generera, Nyhetsflöde, Manuskriptkö.

**Always-on third column (300–320px): the Activity Rail** — a live event feed of runs/approvals, present on every page.

**Top bar (CommandBar):** breadcrumb · a `⌘K` "Search · jump · command" affordance · operator-mode switcher · clock · notifications bell.

### 1.2 What Atlas can already do (the part the UI ignores)

From `app/api/chat/route.ts`, Atlas in chat is **already an action engine**, not a Q&A box. It carries a live cross-business context snapshot (costs, revenue, approvals, failed runs, content performance, opportunities, operations, Dream findings) and these tools:

- `list_workflows`, `trigger_workflow`, `get_run_status` — run and track any workflow
- `run_media_step` — drive the real media pipeline (news → script → voiceover → render → publish)
- `ask_manager` — operational analysis / planning
- `delegate` — break a goal into tasks and assign them
- `get_dream_findings`, `delegate_dream_finding`, `resolve_dream_finding` — the full Dream→Action loop

It even has an honesty-guard that forbids claiming an action it didn't actually perform. **This is the product.** Almost every dashboard in §1.1 is a read-only projection of data Atlas already holds and can already act on.

### 1.3 The deep-linking reality

Despite the ambition, **Atlas does not deep-link**. Chat responses stream text plus `tool_call`/`tool_result` events; they never emit a "open this page" link. The only deep-links in the product are *static* `href`s hard-coded into Action Center, the Activity Rail, and `context.topPriority` (e.g. failed runs → `/atlas/activity`, leads → `/revenue`). And the `⌘K` bar — the single most natural Atlas-first entry point — **is decorative**: no click handler, no palette, no command routing.

---

## 2. Pain points (be critical)

**P1 — Three "executive briefings."** `atlasExecutiveSummary()` powers both `/atlas` and `/atlas/actions`; `/dashboard` renders its own `ExecutiveBriefing`. The operator sees the same "what happened / what it cost / what worked / what needs attention" story in three places with three layouts. None is canonical.

**P2 — Two "Action Centers."** `/action-center` (attention-item "mission board") and `/atlas/actions` ("what you should do", Executive-Brain ranked) are different code solving the identical operator question: *what do I do next?* One of them isn't even in the nav.

**P3 — Three "activity" surfaces.** The always-on Activity Rail, `/atlas/activity`, and `/agent-activity` all read `runs`/`approvals` and render "what just happened." The operator can't tell which is authoritative — and the rail permanently spends 300px showing a low-density log that a full page already covers.

**P4 — Overlapping "operational aggregates."** `/atlas/operations`, `/manager`, and `/dashboard` are three command-center views of the same businesses. The operations page's own header comment defensively insists it "doesn't duplicate Dashboard or Activity Center" — a tell that the boundaries are already unclear to the people who built them.

**P5 — Project surfaces masquerading as platform surfaces.** `/atlas/marketing` (Familje-Stunden only) and `/atlas/content` (The Prompt only) sit in *global* nav. A multi-business operator is shown single-business tools as if they were platform-wide, and the project-scoping model (`/projects/[slug]/…`) is silently broken.

**P6 — Money is split.** `/costs`, `/revenue`, and the per-business cards on `/atlas` and `/dashboard` all narrate profitability. ROI ("cost without revenue") is computed in Action Center, shown as cards elsewhere, and answerable in chat. Four places, one question.

**P7 — Naming actively misleads.** Swedish/English collide and duplicate: "Operationscentral" = `/dashboard` but "Operations Center" = `/atlas/operations`; "Operatör" = `/manager`; "Action Center" is the English label for `/action-center` *and* the name of `/atlas/actions`. Labels increase load instead of reducing it.

**P8 — The `⌘K` command bar is a no-op.** The Atlas-first affordance users expect (type to jump or command) does nothing. Navigation is forced back onto a 14-item sidebar.

**P9 — Dream is surfaced four ways, and competes with bug-scan.** Dream findings appear via the per-project `DreamStatus` card (with a manual "Kör nu" button), the `MorningBugPopup` on Atlas home (a *separate* `lib/bugs` digest), the chat tools, and passive injection into chat context. Two parallel "nightly intelligence" systems (`lib/atlas/dream` vs `lib/bugs`) reach the operator through unrelated UI.

**P10 — Manual "run" buttons push system-maintenance onto the operator.** "Kör nu" (Dream), pause toggles, regenerate buttons — these are operator chores that Atlas is designed to initiate. Every manual button is a small tax that contradicts the Atlas-first thesis.

**P11 — Repo cruft and shadow files.** `CommandBar 2.tsx`, `index 2.ts`, `system 2.ts`, `globals 2.css`, `brand 2/`, `supabase 2/`, and the stray `route 2.ts` files (already flagged in the route manifest) are duplication risk and a source of "which file is real?" confusion.

---

## 3. Recommended information architecture

The mental model should be **one agent, a few instruments, and your projects** — not a wall of admin pages.

```
ATLAS  (the OS itself — home + chat are one surface)
  └─ greets, briefs, recommends the next action, executes, and DEEP-LINKS

INSTRUMENTS  (read-only, on-demand, Atlas deep-links into them with filters)
  ├─ Activity     — one live feed: runs + agents + approvals events  (absorbs rail, /atlas/activity, /agent-activity)
  ├─ Approvals    — the decision queue
  ├─ Money        — costs + revenue + ROI, one surface           (absorbs /costs, /revenue)
  ├─ Knowledge    — memory + decisions + the Obsidian graph        (absorbs /memory, MemoryGraph)
  └─ Health       — system telemetry, tokens, pipeline, Dream/bug status (absorbs /system + Dream/bug surfacing)

PROJECTS  (everything project-scoped lives here)
  └─ /projects/[slug]/…  ← Marketing & Content move in here from global nav

SETTINGS
```

That is **Atlas + 5 instruments + Projects + Settings ≈ 8 nav targets**, down from ~20 routes and 14 sidebar entries. Every "briefing," "action center," and "operations/manager/command center" page is either folded into Atlas Home or deleted — Atlas *is* the command center.

Principle for the survivors: **a dashboard earns its place only if it shows something Atlas can't say in a sentence and an operator needs to scan visually** (a cost trend, an approval queue, a knowledge graph). If Atlas can already answer it, it's not a page — it's a question.

---

## 4. Atlas-first navigation model

1. **Atlas Home and Chat become one surface.** Opening Omnira lands you in Atlas: the live briefing, the single ranked "next actions" list, and the conversation box — all in one view. No separate `/atlas` vs `/chat` vs `/atlas/actions`.

2. **`⌘K` becomes the real navigation.** Wire it to an Atlas command/jump palette: type a destination ("approvals", "money for The Prompt") to jump, or type an intent ("publish the next reel", "what failed today?") to hand it straight to Atlas. This replaces sidebar-hunting as the primary way to move.

3. **Atlas responses carry action chips.** Every chat answer that references a thing renders inline deep-link chips — `[ Review 3 approvals → ]`, `[ Open The Prompt costs → ]` — built from the same `href` data already in `lib/atlas/actions.ts` and `context.topPriority`. The operator goes from "Atlas said it" to "the exact filtered page" in one click (see §5 for the contract).

4. **The sidebar shrinks and regroups** to the IA in §3: `Atlas` · a `Views` group (Activity, Approvals, Money, Knowledge, Health) · `Projects` · `Settings`. ~8 entries, each a noun, no duplicates, no Swedish/English collisions.

5. **The Activity Rail becomes an optional peek, not a permanent column.** Collapse it by default; it's a glance into the single Activity instrument, openable on demand — returning 300px of canvas to the work.

6. **Default to Atlas doing, not the operator clicking.** Where a dashboard has a manual button (Dream "Kör nu", regenerate, run-step), the primary path becomes "ask Atlas / Atlas proposes it"; the manual button is demoted to a fallback.

---

## 5. How Atlas should open & deep-link into the correct page

A concrete, low-risk contract that reuses what already exists:

- **Today:** Atlas emits text + `tool_call`/`tool_result` SSE events. `lib/atlas/actions.ts` and `lib/atlas/context.ts` already attach a canonical `href` to every action/priority.
- **Change:** define a small `AtlasLink { label, href, filter? }` and let Atlas attach links to answers (either as a structured field alongside the text stream, or parsed from a lightweight inline token). The chat client renders them as chips and navigates with the existing Next router.
- **Targets must accept filters as query params** so a deep-link lands pre-scoped — e.g. `/activity?status=failed&project=the-prompt`, `/approvals?state=pending`, `/money?project=…`. (The instruments in §3 should read these on load.)
- **`⌘K` shares the same registry**: the jump targets and the chat action-chips both resolve through one route+filter map, so there's a single source of truth for "where does this concept live."
- **Net effect:** "discussing something" in Atlas and "being on the right page for it" become the same gesture. No more guessing which of three activity pages to open.

---

## 6. Dashboard simplification plan

| Today | Action | Becomes |
|---|---|---|
| `/atlas`, `/dashboard`, `/atlas/actions` (3 briefings) | **Merge** into one Atlas Home | Atlas Home (briefing + ranked actions + chat) |
| `/action-center` + `/atlas/actions` (2 action lists) | **Collapse to one** ranked "Attention" list, shown on Atlas Home | Atlas Home section + deep-link target |
| Activity Rail + `/atlas/activity` + `/agent-activity` | **Merge to one** Activity instrument; rail = collapsible peek | `Activity` |
| `/costs` + `/revenue` | **Merge** | `Money` (cost, revenue, ROI together) |
| `/atlas/operations` + `/manager` + `/dashboard` cards | **Demote**: summary on Atlas Home, detail folds into `Health`/`Money`/`Activity` | (removed as standalone peers) |
| `/atlas/marketing`, `/atlas/content` | **Move to project scope** | `/projects/[slug]/marketing`, `/projects/[slug]/content` |
| `/system` + Dream/bug popups + `DreamStatus` | **Consolidate** telemetry + nightly intelligence | `Health` |
| `/memory` + `MemoryGraph` (in `/system`) | **Merge** | `Knowledge` (incl. Obsidian view, §7) |

Two rules for everything that survives:

1. **Read-only instruments.** Remove manual action buttons from dashboards; actions are initiated through Atlas (or proposed by it). A dashboard's job is to *show*, Atlas's job is to *do*.
2. **Filter-addressable.** Every instrument accepts the query-param filters from §5 so Atlas can deep-link into the exact slice.

---

## 7. Obsidian-view: placement & purpose

There is no "Obsidian" in the code today, but the raw material exists: `MemoryGraph.tsx` (a node/edge graph, currently buried in `/system`), the `/memory` decisions/patterns page, the Dream issue ledger (`dream_issues`, with stable identities and lifecycles), and business entities.

**Placement:** inside the **Knowledge** instrument (§3) — the merge of `/memory` + `MemoryGraph`. Not a daily surface.

**Purpose:** an Obsidian-style *linked-knowledge graph* over Omnira's long-term brain — decisions, learned patterns, recurring Dream findings, and the businesses they attach to, as interlinked notes. It is **the memory Atlas reasons over, made browsable.** Atlas writes to it continuously (every decision, every resolved Dream issue); the operator visits it occasionally to *trust and audit* — "what have we learned about The Prompt's best hooks?", "why did we decide X?". 

**Atlas integration:** deep-linkable like any instrument — "show me what we know about churn" opens the graph centered on that node. It is a reference/trust surface, explicitly *not* a place the operator is expected to maintain by hand.

---

## 8. Prioritized implementation roadmap (highest impact first)

**P0 — De-duplicate & de-confuse (highest impact, lowest code).**
Collapse the three briefings into Atlas Home; pick one Action list and one Activity view and delete the losers; fix the Swedish/English label collisions (one canonical name per concept); delete the shadow files (`* 2.tsx`, `brand 2/`, `route 2.ts`, etc.). This alone removes most of the cognitive load without building anything new.

**P1 — Make Atlas drive navigation (the core of the thesis).**
Wire `⌘K` to a real Atlas jump/command palette; add action-chip deep-links to chat responses using the existing `href` data; define the shared route+filter registry (§5). This is what actually makes the platform feel like an OS.

**P2 — Collapse the sidebar to the §3 IA.**
Rebuild `Sidebar.tsx` to ~8 grouped entries; move Marketing & Content under `/projects/[slug]`; make the Activity Rail a collapsible peek instead of a permanent column.

**P3 — Merge instruments.**
`Money` (costs + revenue + ROI); `Activity` (rail + both activity pages); `Knowledge` (memory + graph = Obsidian view); `Health` (system + Dream/bug consolidation). Make each filter-addressable.

**P4 — Shift actions into Atlas.**
Replace manual "Kör nu" / run / regenerate buttons on dashboards with Atlas-initiated flows; instruments go read-only. Unify Dream and bug-scan into one nightly-intelligence stream surfaced through Atlas + Health, not four UI paths.

**P5 — Proactive Atlas (so pages are opened even less).**
Atlas pushes the morning briefing, nudges on failures/approvals, and proposes the next action unprompted — the end state where the operator mostly *responds to Atlas* rather than *navigates Omnira*.

---

## 9. What to delete vs keep (quick reference)

**Delete / merge away:** `/atlas/actions` ↔ `/action-center` (keep one, fold into Atlas Home) · `/atlas/activity` ↔ `/agent-activity` ↔ Activity Rail (one Activity view) · `/dashboard` & `/atlas/operations` & `/manager` as standalone peers (fold into Atlas Home + instruments) · `/costs` + `/revenue` (→ Money) · all `* 2.*` shadow files.

**Move:** `/atlas/marketing`, `/atlas/content` → `/projects/[slug]/…`.

**Keep as instruments (read-only, filter-addressable):** Activity · Approvals · Money · Knowledge (incl. Obsidian graph) · Health. Plus Projects and Settings.

**Keep as the product:** Atlas (home + chat unified), with real `⌘K` and deep-linking.
