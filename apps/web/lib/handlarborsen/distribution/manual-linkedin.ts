import type {SocialContentPost,SocialContentAsset} from '@/lib/social-launch/content/types'

/** Predictable download name; no user-controlled filename or URL. */
export function manualAssetFilename(asset: Pick<SocialContentAsset,'kind'|'mimeType'>): string | null {
  const extensions: Record<string,string> = {
    'image/jpeg': 'jpg','image/png': 'png','image/webp': 'webp',
    'image/avif': 'avif','image/gif': 'gif',
    'video/mp4': 'mp4','video/webm': 'webm',
  }
  const extension = extensions[asset.mimeType]
  if (!extension || !asset.mimeType.startsWith(asset.kind + '/')) {
    return null
  }
  return 'handlarborsen-' + asset.kind + '.' + extension
}

/** A client-side COPY action, not an external publish or schedule permission. */
export type ManualLinkedInCopy =
  | {ok: true; text: string; title: string; mediaCount: number; postId: string; revisionId: string}
  | {ok: false; reason: 'not_linkedin' | 'review_required' | 'revision_mismatch' | 'invalid_content'}

function safeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2048) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

/**
 * Export only a fully reviewed LinkedIn revision. The content text stays
 * byte-for-byte the operator-reviewed text (plus the reviewed optional URL).
 *
 * Account connection, SMTP success, and a manual copy never mean "published".
 * MEDIA is deliberately not embedded into clipboard text. The UI offers the
 * reviewed, project-authorised assets as separate downloads.
 */
export function buildManualLinkedInCopy(
  post: Pick<SocialContentPost, 'id' | 'status' | 'decision' | 'revision'>,
): ManualLinkedInCopy {
  if (post.revision.draft.channel !== 'linkedin') return {ok: false, reason: 'not_linkedin'}
  if (post.status !== 'approved' || !post.decision || post.decision.decision !== 'approve') {
    return {ok: false, reason: 'review_required'}
  }
  if (post.decision.revisionId !== post.revision.id ||
      post.decision.sha256 !== post.revision.sha256) {
    return {ok: false, reason: 'revision_mismatch'}
  }
  const {title, text, linkUrl} = post.revision.draft
  if (!title?.trim() || !text?.trim() || text.length > 5000 ||
      (linkUrl !== null && !safeHttpsUrl(linkUrl))) {
    return {ok: false, reason: 'invalid_content'}
  }

  const copy = linkUrl && !text.includes(linkUrl)
    ? text + '\n\n' + linkUrl
    : text
  return {
    ok: true,
    text: copy,
    title,
    mediaCount: post.revision.media.length,
    postId: post.id,
    revisionId: post.revision.id,
  }
}
