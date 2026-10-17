/**
 * UI-only navigation boundary for the legacy The Prompt AI-news workflow.
 *
 * Only these known news projects should display Breaking/News/Scripts
 * affordances; other brands use their own editorial surfaces.
 *
 * IMPORTANT: this is NOT an API capability grant or an ownership check.
 * Existing API authorization allows a project owner to render their own
 * content and has explicit publisher destination barriers. New scoped
 * voice/render capabilities must be designed separately without breaking
 * those tested owner authorities.
 */
const LEGACY_AI_NEWS_SLUGS = new Set(['the-prompt', 'ai-media-automation'])

export function isLegacyNewsPipelineProject(slug: string | null | undefined): boolean {
  return typeof slug === 'string' && LEGACY_AI_NEWS_SLUGS.has(slug)
}
