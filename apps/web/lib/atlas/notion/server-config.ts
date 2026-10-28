/**
 * Server-only operator configuration for the Notion P0 reader.
 *
 * This does not connect Atlas chat or grant runtime permissions. The caller must
 * pass the authenticated principal's FRESH allowedProjectIds from Supabase.
 * Environment configuration is operational policy, not user-supplied request data.
 */
import 'server-only'
import { NotionReadError, type ApprovedNotionPage, type NotionReadConfig } from './read-only'

export function loadNotionReadConfig(authorizedProjectIds: readonly string[]): NotionReadConfig {
  if (process.env.ATLAS_NOTION_MODE !== 'read') {
    return { mode: 'off', authorizedProjectIds: [], approvedPages: [] }
  }
  const text = process.env.ATLAS_NOTION_APPROVED_PAGES_JSON
  if (!text || text.length > 4_096) throw new NotionReadError('page_not_approved')
  let entries: unknown
  try { entries = JSON.parse(text) } catch { throw new NotionReadError('page_not_approved') }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 16
    || entries.some(x => !x || typeof x !== 'object' || Array.isArray(x)
      || Object.keys(x).sort().join(',') !== 'pageId,projectId'
      || typeof x.pageId !== 'string' || typeof x.projectId !== 'string')) {
    throw new NotionReadError('page_not_approved')
  }
  return {
    mode: 'read',
    token: process.env.ATLAS_NOTION_READ_TOKEN,
    authorizedProjectIds,
    approvedPages: entries as ApprovedNotionPage[],
  }
}
