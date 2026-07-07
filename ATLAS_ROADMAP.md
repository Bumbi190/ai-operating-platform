# Project Atlas — Roadmap

Atlas is the Executive Chief of Staff layer for Omnira. It does **not** replace
the underlying systems (agents, workflows, costs, approvals, memory) — it becomes
the operating layer *on top* of them, and the primary thing the operator meets.

Principle: **intelligence, memory, delegation, transparency** — not visual effects.

---

## Phase 1 — Atlas Home + Context Brain  ✅ (built)

The foundation: Atlas becomes the entry point and can already see everything.

- **Atlas identity** (`lib/atlas/identity.ts`) — the Executive-Chief-of-Staff
  system prompt + persistent business profiles (Familje-Stunden = quality over
  automation; GainPilot = lead gen; The Prompt = AI media). The operator never
  has to repeat this.
- **Context Brain** (`lib/atlas/context.ts`) — one defensive, read-only function
  that assembles a live snapshot from existing tables: spend today/week/month
  (+ forecast + per provider), revenue & cost per business, qualified leads,
  media published this week, items pending review, pending approvals, failed
  runs (24h), and the single highest-leverage action.
- **Atlas Home** (`app/(platform)/atlas/page.tsx`) — time-aware executive
  greeting, per-business briefing lines, AI-spend line, one recommended action,
  quick actions (priorities, approvals, revenue, costs, talk to Atlas), a
  platform-pulse stat row, and a per-business watch grid.
- **Entry point** — root + post-login now land on `/atlas`; Atlas is the top,
  primary item in the sidebar. Dashboard remains as a detail view.

---

## Phase 2 — Conversational Atlas + Transparency  (next)

Make Atlas something you *talk to*, with memory and full visibility.

1. **Re-identity the chat as Atlas.** Point `app/api/chat/route.ts` at
   `buildAtlasSystemPrompt()` and inject the live Context-Brain snapshot every
   turn, so Atlas answers "how much have we spent / how many leads / what should
   I focus on" directly from real data.
2. **Conversational memory.** Reuse the existing `conversations` /
   `conversation_messages` tables + `platform_memory`. Atlas recalls preferences,
   recent decisions, and pending tasks across sessions — no repeating.
3. **Voice that feels alive.** Longer pause before interrupting, live
   transcription, short conversational chunks (never monologues), save + replay
   conversations, allow interruption.
4. **Atlas Activity Center** (new page) — live transparency over what Atlas and
   the agents are doing right now: running workflows, progress, recent decisions,
   pending decisions. Sourced from `runs`, `run_logs`, `agent_messages`,
   `manager_tasks`. The operator never wonders "did anything happen?".
5. **Embed conversation into Atlas Home** so talking to Atlas is the default
   action, not a separate page.

---

## Phase 3 — Delegation + Briefings + Tool Intelligence

Atlas acts, not just reports.

1. **Delegation system.** "Atlas, create a GainPilot campaign" → Atlas drafts a
   plan, assigns agents, tracks the chain, and reports progress
   (Research ✓ · Copy ✓ · Image ⏳ · QA ⏳). Built on `manager_tasks` +
   `agent_messages` + the run engine, with the delegation chain shown live.
2. **Tool intelligence.** Atlas auto-selects the right tool/workflow (publishing,
   analytics, planning, approvals, cost tracking) — the operator never needs to
   know which agent or workflow to invoke.
3. **Executive briefings.** Morning / evening / weekly / monthly, covering
   revenue, costs, growth, risks, opportunities and recommendations. Extends the
   existing `morning_briefings` + briefing engine; scheduled via the cron system.
4. **Atlas becomes the platform.** Everything else (agents, workflows, analytics,
   costs, approvals) settles into supporting infrastructure beneath Atlas.

---

## Notes

- Atlas reuses what exists (Manager `buildContext`, `cost_events`, `platform_memory`,
  briefing components) rather than duplicating it.
- Business profiles currently live in code (`identity.ts`); Phase 2 can move them
  into `projects.settings` so they're editable without a deploy.
- The Context Brain is deterministic and free to run; LLM is used only where it
  adds real reasoning (conversation, briefing synthesis), keeping the cost page honest.
