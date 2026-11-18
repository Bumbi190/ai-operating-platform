/** Optional Hermes enrichment must never consume the time reserved for writing and editorial QA. */
export function articleReadTimeoutMs(sourceUrl: string | null, elapsedMs: number): number {
  if (!sourceUrl || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0
  let url: URL
  try { url = new URL(sourceUrl) } catch { return 0 }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return 0
  // Avoid sending publisher homepages, directory pages, or search results to article extraction.
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length === 0) return 0
  if (parts.length === 1 && /^(news|ai|tech|technology|latest|stories|articles|search|topic|topics|category|categories|en|sv)$/i.test(parts[0])) return 0
  // An optional enrichment should finish by 28s, leaving 24s before QA's 52s cut-off.
  const budget = Math.min(6_000, 28_000 - elapsedMs)
  return budget >= 1_500 ? budget : 0
}
