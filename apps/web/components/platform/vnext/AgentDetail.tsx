'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import {
  AGENT_DETAIL_TABS,
  AGENT_DETAIL_TAB_LABELS,
  AGENT_DETAIL_TAB_UNAVAILABLE,
  type AgentDetailModel,
  type AgentDetailTabId,
} from '@/lib/os/agent-detail'
import styles from './AgentDetail.module.css'

/**
 * Agent Detail v2 — inspection, not configuration.
 *
 * The boundary this surface keeps: the EDITOR owns mutation and configuration
 * (`EditAgentClient`, reached through the explicit action in the header); the
 * DETAIL owns what the agent is, what it is doing right now, and which of
 * Omnira's capability sections can truthfully say anything about it.
 *
 * Every section is classified by real runtime support before it renders, and a
 * section with no runtime link says so in words rather than showing an empty
 * list that would read as "this agent has none". That distinction is the whole
 * point: `agents.skill_ids` resolves against no registry, no agent→tool
 * assignment exists, memory is project-scoped, tasks never name an agent, and
 * there is no operator↔agent chat runtime. Absence is reported as absence.
 *
 * Tabs are ordinary buttons in a `tablist`, so Tab reaches them and Enter or
 * Space activates them — the browser's own behaviour. No keyboard router, and
 * no arrow-key convention invented here.
 */
export function AgentDetail({ model, editHref }: { model: AgentDetailModel; editHref: string }) {
  const [active, setActive] = useState<AgentDetailTabId>('overview')
  const baseId = useId()
  const { agent, project } = model

  const status = model.working === null ? 'unknown' : model.working ? 'working' : 'idle'
  const statusLabel =
    model.working === null ? 'Status okänd' : model.working ? 'Arbetar' : 'Inaktiv'

  return (
    <div className={styles.page} style={{ '--agent-accent': project.color } as React.CSSProperties}>
      <div className={styles.ambient} aria-hidden="true" />

      {/* ── Identity ─────────────────────────────────────────────────────────
          Deliberately subordinate: the project is named above the agent, so the
          hierarchy reads Atlas → project → agent rather than as a standalone
          profile page. */}
      <header className={styles.identity}>
        <p className={styles.context}>
          {project.href
            ? <Link href={project.href} className={styles.contextLink}>{project.name}</Link>
            : <span>{project.name}</span>}
          <span className={styles.contextSep} aria-hidden="true">/</span>
          <span className={styles.contextLeaf}>Agent</span>
        </p>

        <div className={styles.identityRow}>
          <span className={styles.mark} aria-hidden="true">
            {agent.name.slice(0, 2).toUpperCase()}
          </span>

          <div className={styles.identityText}>
            <h1 className={styles.name}>{agent.name}</h1>
            <p className={styles.meta}>
              <span className={styles.status} data-status={status}>
                <span className={styles.statusDot} data-status={status} aria-hidden="true" />
                {statusLabel}
              </span>
              <span className={styles.metaSep} aria-hidden="true">·</span>
              <span className={styles.model}>{agent.model}</span>
            </p>
          </div>

          <Link href={editHref} className={styles.editAction}>
            <Pencil size={13} aria-hidden="true" />
            Redigera agent
          </Link>
        </div>

        {agent.description ? <p className={styles.description}>{agent.description}</p> : null}
      </header>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className={styles.tabs} role="tablist" aria-label="Agentsektioner">
        {AGENT_DETAIL_TABS.map((tab) => {
          const availability = model.tabs[tab]
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab}`}
              aria-selected={active === tab}
              aria-controls={`${baseId}-panel-${tab}`}
              className={styles.tab}
              data-active={active === tab || undefined}
              data-availability={availability}
              onClick={() => setActive(tab)}
            >
              {AGENT_DETAIL_TAB_LABELS[tab]}
              {availability === 'UNAVAILABLE' ? (
                <span className={styles.tabMark} aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className={styles.panel}
        tabIndex={0}
      >
        {active === 'overview' ? <Overview model={model} /> : null}
        {active === 'skills' ? <Skills skillIds={agent.skillIds} /> : null}
        {active === 'workflows' ? <Workflows model={model} /> : null}
        {AGENT_DETAIL_TAB_UNAVAILABLE[active] ? (
          <Unavailable
            title={AGENT_DETAIL_TAB_LABELS[active]}
            what={AGENT_DETAIL_TAB_UNAVAILABLE[active]!.what}
            why={AGENT_DETAIL_TAB_UNAVAILABLE[active]!.why}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Only fields the row actually carries. */
function Overview({ model }: { model: AgentDetailModel }) {
  const { agent, project } = model
  return (
    <dl className={styles.facts}>
      <Fact label="Projekt" value={project.name} />
      <Fact label="Modell" value={agent.model} />
      <Fact
        label="Systemprompt"
        // Presence, not content: the prompt is the editor's material, and the
        // detail surface does not expose configuration casually.
        value={agent.hasSystemPrompt
          ? `Konfigurerad · ${agent.systemPromptChars.toLocaleString('sv-SE')} tecken`
          : 'Ingen systemprompt'}
      />
      <Fact
        label="Deklarerade färdigheter"
        value={agent.skillIds.length === 0
          ? 'Inga deklarerade'
          : `${agent.skillIds.length} st`}
      />
      <Fact
        label="Workflows"
        value={!model.workflowsAvailable
          ? 'Kunde inte läsas'
          : model.workflows.length === 0
            ? 'Ingår i inga steg'
            : `${model.workflows.length} st`}
      />
      <Fact
        label="Skapad"
        value={agent.createdAt
          ? new Date(agent.createdAt).toLocaleDateString('sv-SE')
          : 'Okänt'}
      />
    </dl>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}

/**
 * Declared skills.
 *
 * Rendered as the identifiers they are. There is no `skills` table in the
 * repository or in production, so nothing resolves these into a name, an icon
 * or a capability — and inventing one here would turn an uninterpreted label
 * into a claim about what the agent can do.
 */
function Skills({ skillIds }: { skillIds: string[] }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionNote}>
        Färdigheter deklareras på agenten som identifierare. Det finns inget
        färdighetsregister att slå upp dem i, så de visas som de är — utan
        beskrivning, version eller härledd förmåga.
      </p>
      {skillIds.length === 0 ? (
        <p className={styles.empty}>Agenten deklarerar inga färdigheter.</p>
      ) : (
        <ul className={styles.skillList}>
          {skillIds.map((id) => (
            <li key={id} className={styles.skill}>{id}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Workflow membership.
 *
 * From `workflows.steps[].agent_id` — the only agent↔workflow link that exists.
 * Membership and current execution are real; run history per agent is not, and
 * is not implied.
 */
function Workflows({ model }: { model: AgentDetailModel }) {
  if (!model.workflowsAvailable) {
    return <p className={styles.empty}>Workflows kunde inte läsas just nu.</p>
  }
  return (
    <div className={styles.section}>
      <p className={styles.sectionNote}>
        Workflows vars steg pekar på den här agenten. Historik per agent finns
        inte — bara medlemskap och vad som kör just nu.
      </p>
      {model.workflows.length === 0 ? (
        <p className={styles.empty}>Ingen workflow har ett steg som pekar på agenten.</p>
      ) : (
        <ul className={styles.workflowList}>
          {model.workflows.map((workflow) => (
            <li key={workflow.workflowId} className={styles.workflow}>
              <span className={styles.workflowHead}>
                <span className={styles.workflowName}>{workflow.workflowName}</span>
                {workflow.running ? (
                  <span className={styles.workflowRunning}>kör nu</span>
                ) : null}
              </span>
              <span className={styles.workflowSteps}>
                {workflow.steps.join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A section Omnira cannot currently populate.
 *
 * A product state, not an error: it names what the section represents, then
 * says what is missing in the runtime. No "coming soon" — this repository
 * represents no roadmap position, so claiming one would be a promise nothing
 * backs.
 */
function Unavailable({ title, what, why }: { title: string; what: string; why: string }) {
  return (
    <div className={styles.unavailable} role="note">
      <p className={styles.unavailableBadge}>Inte tillgängligt ännu</p>
      <h2 className={styles.unavailableTitle}>{title}</h2>
      <p className={styles.unavailableWhat}>{what}</p>
      <p className={styles.unavailableWhy}>{why}</p>
    </div>
  )
}
