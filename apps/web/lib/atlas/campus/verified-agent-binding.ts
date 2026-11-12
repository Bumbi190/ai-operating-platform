/**
 * Agent Office v0.36 – identity confirmation, NOT agent execution.
 *
 * Input MUST come from the already authenticated, per-operator scoped
 * OrganisationModel. The API route reuses loadOrganisationModel() each GET;
 * client-supplied IDs and slugs are merely selection requests, never grants.
 *
 * A project can have MANY agents; no "first agent wins", no 3D assignment.
 * A match proves only this exact registered agent belongs to this project
 * in the user's visible organisation. It cannot prove live work or consent.
 */
import 'server-only'
import type { OrganisationModel } from '@/lib/os/organisation'
import { PLING_APPROVED_VOICE } from './voice-identity'

export const AGENT_BINDING_SOURCE = 'AUTHENTICATED_PROJECT_AGENT_MATCH_V036' as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLEAN_SLUG = /^[a-z0-9-]{3,64}$/
const oneLine = (v: string, max: number): string =>
  v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,max)

export interface VerifiedAgentBinding {
  readonly schemaVersion: 1
  readonly source: typeof AGENT_BINDING_SOURCE
  readonly verifiedIdentity: true
  readonly verifiedAt: string
  readonly project: {
    readonly id: string
    readonly slug: string
    readonly name: string
  }
  readonly agent: {
    readonly id: string
    readonly name: string
    readonly description: string | null
    readonly detailsHref: string | null
  }
  readonly character: 'pling'
  readonly voice: {
    readonly label: string
    readonly profileApproved: true
    readonly liveSynthesisReady: false
  }
  readonly executionStatus: 'not_verified'
  readonly approvalStatus: 'not_checked'
  readonly chatStatus: 'not_connected'
  readonly callStatus: 'not_connected'
  /** No private binding, UUID or agent selection is sent to the PUBLIC 3D scene. */
  readonly public3dBinding: 'none'
}

export function resolveVerifiedAgentBinding(
  model: OrganisationModel | null,
  projectId: string,
  agentId: string,
  now: Date = new Date(),
): VerifiedAgentBinding | null {
  if (!model || model.availability.projects !== true
      || model.availability.agents !== true) return null
  if (!UUID.test(projectId) || !UUID.test(agentId)) return null
  if (!Number.isFinite(now.getTime())) return null
  const project = model.projects.find(p => p.id === projectId)
  if (!project || !CLEAN_SLUG.test(project.slug)) return null
  const matches = project.agents.filter(a => a.id === agentId)
  // Duplicate identities within the same project are ambiguous – fail closed.
  if (matches.length !== 1) return null
  const agent = matches[0]!
  const name = oneLine(agent.name,80)
  const projectName = oneLine(project.name,80)
  if (!name || !projectName) return null
  // Reuse the actual registry route when available, never caller-provided href.
  const expected = `/projects/${project.slug}/agents/${agent.id}`
  const detailsHref = agent.href === expected ? expected : null
  return Object.freeze({
    schemaVersion: 1,
    source: AGENT_BINDING_SOURCE,
    verifiedIdentity: true,
    verifiedAt: now.toISOString(),
    project: Object.freeze({
      id: project.id, slug: project.slug, name: projectName,
    }),
    agent: Object.freeze({
      id: agent.id, name,
      description: agent.description ? oneLine(agent.description.split(/\r?\n/,1)[0] ?? '',160) || null : null,
      detailsHref,
    }),
    character: 'pling',
    voice: Object.freeze({
      label: PLING_APPROVED_VOICE.label,
      profileApproved: true,
      liveSynthesisReady: false,
    }),
    executionStatus: 'not_verified',
    approvalStatus: 'not_checked',
    chatStatus: 'not_connected',
    callStatus: 'not_connected',
    public3dBinding: 'none',
  })
}
