import 'server-only'
import { promises as fs } from 'node:fs'
import { win32 } from 'node:path'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { buildLocalReview, type LocalReviewState } from './local-review'

/**
 * Opt-in, development-only reader for the sanitized local audit report.
 * Called ONLY after the page resolved the project via RLS and confirmed it is
 * Handlarbörsen. Reads exactly two pinned files; no path/URL input exists.
 * Every failure is fail-closed and returns a fixed code — never content or paths.
 */
export const LOCAL_REVIEW_DIR_NAME = 'hb-scb-status-audited-20261028-061729'
export const LOCAL_REVIEW_CSV_NAME = 'review-legal-entities-only.csv'
export const LOCAL_REVIEW_SUMMARY_NAME = 'summary.json'
export const LOCAL_REVIEW_MAX_BYTES = 350_000

export interface LocalReviewDeps {
  env: Record<string, string | undefined>
  platform: string
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ size: number; isFile(): boolean }>
  readFile(path: string): Promise<string>
}

const defaultDeps = (): LocalReviewDeps => ({
  env: process.env,
  platform: process.platform,
  realpath: p => fs.realpath(p),
  stat: p => fs.stat(p),
  readFile: p => fs.readFile(p, 'utf8'),
})

const unavailable = (reason: string): LocalReviewState => ({ status: 'unavailable', reason })
const sameWinPath = (a: string, b: string) => win32.normalize(a).toLowerCase() === win32.normalize(b).toLowerCase()

export async function loadLocalReviewForOwner(projectId: string, deps: LocalReviewDeps = defaultDeps()): Promise<LocalReviewState> {
  // Gates: all evaluated before any filesystem access.
  if (deps.env.NODE_ENV !== 'development' || deps.platform !== 'win32' ||
    deps.env.HB_LEADFINDER_LOCAL_REVIEW_ENABLED !== 'true') return { status: 'disabled' }
  if (projectId !== HANDLARBORSEN_PROJECT_ID) return { status: 'disabled' }
  const profile = deps.env.USERPROFILE
  if (!profile || !win32.isAbsolute(profile)) return unavailable('profile_missing')

  try {
    const dir = win32.join(profile, 'Projects', 'Omnira', 'Temp', LOCAL_REVIEW_DIR_NAME)
    const realDir = await deps.realpath(dir)
    if (!sameWinPath(realDir, dir)) return unavailable('path_rejected')

    const read = async (name: string): Promise<string> => {
      const file = win32.join(dir, name)
      const realFile = await deps.realpath(file)
      if (!sameWinPath(win32.dirname(realFile), realDir) || !sameWinPath(win32.basename(realFile), name)) throw new Error('outside')
      const info = await deps.stat(realFile)
      if (!info.isFile() || info.size > LOCAL_REVIEW_MAX_BYTES) throw new Error('size')
      const text = await deps.readFile(realFile)
      if (text.length > LOCAL_REVIEW_MAX_BYTES) throw new Error('size')
      return text
    }
    const [csv, summary] = await Promise.all([read(LOCAL_REVIEW_CSV_NAME), read(LOCAL_REVIEW_SUMMARY_NAME)])
    return buildLocalReview(csv, summary)
  } catch {
    return unavailable('read_failed')
  }
}
