/**
 * Strict boundary for the LEGACY AI-news production pipeline.
 *
 * The Prompt and the original ai-media-automation project own that workflow:
 * Victoria news TTS, Ideogram scenes, generated news music, newsjack breaking,
 * and legacy Remotion Lambda composition. Familje-Stunden uses its own
 * separately governed content workflow; knowing a project_id is NOT authority
 * to run this news pipeline in that project.
 *
 * Keep this an explicit allow-list until future media capabilities are
 * represented by a reviewed DB contract. Do not infer authority from a
 * generic settings.media.enabled flag.
 */
const LEGACY_AI_NEWS_SLUGS = new Set(['the-prompt', 'ai-media-automation'])

export function isLegacyNewsPipelineProject(slug: string | null | undefined): boolean {
  return typeof slug === 'string' && LEGACY_AI_NEWS_SLUGS.has(slug)
}
