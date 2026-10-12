import 'server-only'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { getProjectBySlug } from '@/lib/project/get-project'
import { createAdminClient } from '@/lib/supabase/admin'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { loadHandlarborsenAnalysisSource, type MarketplaceSourceResult } from './handlarborsen-marketplace-source'
import { buildAnalysisReviewDraft, type SaveSelector } from './analysis-review-contract'
import { hashAnalysisSource, UUID } from './analysis-source-binding'
import {
  AnalysisDraftStore,
  decodeDraftCursor,
  type SavedAnalysisDraft,
  type AnalysisDraftEvent,
} from './analysis-draft-store'
import { analysisDraftsEnabled } from './analysis-draft-feature'
export type AnalysisFailure = { status: 'no_session' | 'not_found' | 'conflict' | 'unavailable' }
export type SaveResult = { status: 'ok'; id: string; created: boolean } | AnalysisFailure
export type AnalysisDraftView = {
  draft: SavedAnalysisDraft
  supersededBy: string | null
  stale: boolean
  applicability: 'current' | 'new_evidence' | 'needs_assessment' | 'unknown'
}
export type AnalysisListResult = { items: AnalysisDraftView[]; nextCursor: string | null } | AnalysisFailure
interface Dependencies {
  env: NodeJS.ProcessEnv
  access: typeof resolveProjectAccess
  project: typeof getProjectBySlug
  db: () => any
  source: typeof loadHandlarborsenAnalysisSource
  store: (db: any) => Pick<AnalysisDraftStore, 'save' | 'list' | 'get' | 'events'>
  now: () => Date
}
const defaults: Dependencies = {
  env: process.env,
  access: resolveProjectAccess,
  project: getProjectBySlug,
  db: createAdminClient,
  source: loadHandlarborsenAnalysisSource,
  store: (db) => new AnalysisDraftStore(db),
  now: () => new Date(),
}
export function createAnalysisDraftService(deps: Dependencies = defaults) {
  async function authorize(slug: string) {
    const access = await deps.access()
    if (!access.ok) return { status: 'no_session' } as AnalysisFailure
    const p = await deps.project(slug)
    if (
      !p ||
      p.id !== HANDLARBORSEN_PROJECT_ID ||
      p.slug !== HANDLARBORSEN_PROJECT_SLUG ||
      !access.allowedProjectIds.includes(p.id)
    )
      return { status: 'not_found' } as AnalysisFailure
    const db = deps.db()
    const { data: live, error } = await db
      .from('projects')
      .select('id, slug, owner_id, atlas_mode')
      .eq('id', p.id)
      .maybeSingle()
    if (error) return { status: 'unavailable' } as AnalysisFailure
    if (!live || live.owner_id !== access.userId || live.id !== p.id || live.slug !== p.slug)
      return { status: 'not_found' } as AnalysisFailure
    return { project: p, actor: access.userId, mode: live.atlas_mode, db, scope: { allowedProjectIds: [p.id] } }
  }
  async function views(
    auth: Exclude<Awaited<ReturnType<typeof authorize>>, AnalysisFailure>,
    drafts: SavedAnalysisDraft[],
    events: AnalysisDraftEvent[],
  ) {
    const now = deps.now(),
      live = ['observer', 'active'].includes(auth.mode)
    let current: MarketplaceSourceResult | null = null
    if (live)
      try {
        current = await deps.source(auth.project, auth.scope, { db: auth.db, now })
      } catch {}
    return drafts.map((draft) => {
      let applicability: AnalysisDraftView['applicability'] = 'needs_assessment'
      if (live) {
        if (current?.status !== 'ok' || !current.source) applicability = 'unknown'
        else {
          const hash = hashAnalysisSource(current.source)
          const b = buildAnalysisReviewDraft(
            current.source,
            current.report,
            { ruleId: draft.ruleId, ruleVersion: draft.ruleVersion, expectedEvidenceHash: hash },
            now,
          )
          const required =
            draft.ruleId === 'company-status'
              ? ['companies_registered_total', 'companies_verified_total']
              : ['bids_total', 'bids_last_24h']
          const before = draft.sourceEnvelope.snapshots[0] as Record<string, unknown> | undefined,
            after = current.source.snapshots[0] as Record<string, unknown> | undefined
          const valuesChanged = required.some((k) => before?.[k] !== after?.[k])
          applicability =
            b.status !== 'ok' || valuesChanged
              ? 'needs_assessment'
              : hash === draft.evidenceHash
                ? 'current'
                : 'new_evidence'
        }
      }
      return {
        draft,
        supersededBy: events.find((e) => e.draftId === draft.id && e.kind === 'superseded')?.supersededBy ?? null,
        stale: now.getTime() > Date.parse(draft.freshUntil),
        applicability,
      }
    })
  }
  return {
    async save(slug: string, selector: SaveSelector): Promise<SaveResult> {
      if (!analysisDraftsEnabled(deps.env)) return { status: 'conflict' }
      try {
        const auth = await authorize(slug)
        if ('status' in auth) return auth
        if (!['observer', 'active'].includes(auth.mode)) return { status: 'conflict' }
        const now = deps.now(),
          r = await deps.source(auth.project, auth.scope, { db: auth.db, now })
        if (r.status !== 'ok') return { status: 'not_found' }
        if (!r.source) return { status: r.report.state === 'read_failed' ? 'unavailable' : 'conflict' }
        const built = buildAnalysisReviewDraft(r.source, r.report, selector, now)
        return built.status === 'ok' ? await deps.store(auth.db).save(auth.actor, built.draft) : { status: 'conflict' }
      } catch {
        return { status: 'unavailable' }
      }
    },
    async list(slug: string, cursor: string | null): Promise<AnalysisListResult> {
      try {
        const auth = await authorize(slug)
        if ('status' in auth) return auth
        const parsed = cursor === null ? null : decodeDraftCursor(cursor)
        if (cursor !== null && !parsed) return { status: 'not_found' }
        const store = deps.store(auth.db),
          r = await store.list(auth.project.id, parsed),
          events = await store.events(
            auth.project.id,
            r.items.map((d) => d.id),
          )
        return { items: await views(auth, r.items, events), nextCursor: r.nextCursor }
      } catch {
        return { status: 'unavailable' }
      }
    },
    async get(slug: string, id: string): Promise<AnalysisDraftView | AnalysisFailure> {
      try {
        const auth = await authorize(slug)
        if ('status' in auth) return auth
        if (!UUID.test(id)) return { status: 'not_found' }
        const store = deps.store(auth.db),
          draft = await store.get(auth.project.id, id)
        if (!draft) return { status: 'not_found' }
        const events = await store.events(auth.project.id, [id])
        return (await views(auth, [draft], events))[0]
      } catch {
        return { status: 'unavailable' }
      }
    },
  }
}
export const saveAnalysisDraft = (slug: string, selector: SaveSelector) =>
  createAnalysisDraftService().save(slug, selector)
export const listAnalysisDrafts = (slug: string, cursor: string | null) =>
  createAnalysisDraftService().list(slug, cursor)
export const getAnalysisDraft = (slug: string, id: string) => createAnalysisDraftService().get(slug, id)
