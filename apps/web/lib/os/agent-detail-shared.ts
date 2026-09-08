/**
 * Agent Detail — the client-safe half of the contract.
 *
 * WHY THIS FILE EXISTS. `lib/os/agent-detail.ts` is `server-only`: it reaches
 * the database, applies project scoping and derives activity. `AgentDetail.tsx`
 * is a client component and needs the tab vocabulary — the ids, their labels and
 * the copy for a section Omnira cannot populate. Importing those from the loader
 * pulled `server-only` into the client bundle and `next build` correctly refused:
 *
 *   ./lib/os/agent-detail.ts
 *   ./components/platform/vnext/AgentDetail.tsx
 *   You're importing a component that needs server-only.
 *
 * Type-only imports were never the problem — those are erased. The three
 * constants below are runtime values, so they had to live somewhere both sides
 * can reach. That is all this module is.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, project scoping, the
 * activity query. Those stay server-only, and a test pins that boundary.
 */

/** What a section can truthfully show. */
export type TabAvailability = 'REAL' | 'PARTIAL' | 'UNAVAILABLE'

export const AGENT_DETAIL_TABS = [
  'overview', 'chat', 'skills', 'tools', 'memory', 'permissions', 'workflows', 'tasks',
] as const
export type AgentDetailTabId = (typeof AGENT_DETAIL_TABS)[number]

export const AGENT_DETAIL_TAB_LABELS: Record<AgentDetailTabId, string> = {
  overview: 'Översikt',
  chat: 'Chatt',
  skills: 'Färdigheter',
  tools: 'Verktyg',
  memory: 'Minne',
  permissions: 'Behörigheter',
  workflows: 'Workflows',
  tasks: 'Uppgifter',
}

/**
 * Why a section shows nothing.
 *
 * Written as a statement of the current runtime, not as a promise. "Kommer
 * snart" would claim a roadmap position this repository does not represent
 * anywhere; "finns inte i runtime ännu" is simply what is true today.
 */
export const AGENT_DETAIL_TAB_UNAVAILABLE: Partial<Record<AgentDetailTabId, {
  what: string
  why: string
}>> = {
  chat: {
    what: 'En direkt konversation med den här agenten.',
    why: 'Det finns ingen agentspecifik chattruntime. `agent_messages` bär meddelanden mellan agenter och Manager, inte mellan dig och en agent.',
  },
  tools: {
    what: 'De verktyg agenten får använda.',
    why: 'Ingen per-agent verktygskoppling finns i runtime. Omnira har kapabiliteter, men ingen modell som tilldelar dem till en enskild agent.',
  },
  memory: {
    what: 'Vad agenten minns mellan körningar.',
    why: 'Minne lagras per projekt, inte per agent. Att visa projektets minne här vore att påstå en koppling som inte finns.',
  },
  permissions: {
    what: 'Vad agenten har rätt att göra.',
    why: 'Behörigheter modelleras inte per agent. Autonomi, delegering och godkännandegrindar hör till uppdrag och körningar — inte till en stående agentroll.',
  },
  tasks: {
    what: 'Uppgifter som tilldelats agenten.',
    why: 'Ingen uppgift pekar på en agent. `manager_tasks` kopplas till projekt, körningar och workflows — aldrig till en agentrad.',
  },
}
