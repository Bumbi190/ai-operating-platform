/**
 * Dedicated, read-only GitHub App transport for Nova source inspection.
 * Never reuses the Family project's credential or an account-wide PAT.
 * Every file is read at a pinned commit SHA after numeric repo-ID verification.
 */
import 'server-only'
import { createHash, createSign } from 'node:crypto'
import {
  immutableSourceUrl, isSafeInspectableText, selectedSourceLines, SOURCE_GIT_SHA,
  SOURCE_MAX_BYTES, sourceRepositoryForProject, parseSourceRequest, type SourceRepository, type SourceRequest,
} from './policy'

const API = 'https://api.github.com'
const MAX_JSON_BYTES = 100_000
const REQUEST_TIMEOUT_MS = 8_000
// The route has a 30s wall-time limit: no chain of Git trees may exceed this
// independent transport deadline even when each individual GET is slow.
const INSPECTION_DEADLINE_MS = 23_000
const API_ACCEPT = 'application/vnd.github+json'
type Fetcher = typeof fetch

interface GitHubAppSettings { appId: string; installationId: string; privateKey: string }
function configuredApp(): GitHubAppSettings | null {
  const appId = process.env.NOVA_SOURCE_GITHUB_APP_ID?.trim()
  const installationId = process.env.NOVA_SOURCE_GITHUB_INSTALLATION_ID?.trim()
  const privateKey = (process.env.NOVA_SOURCE_GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim()
  return /^\d+$/.test(appId ?? '') && /^\d+$/.test(installationId ?? '')
    && privateKey.includes('-----BEGIN') && privateKey.includes('PRIVATE KEY')
    ? { appId: appId!, installationId: installationId!, privateKey } : null
}
const b64url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function signedAppJwt(settings: GitHubAppSettings): string | null {
  const time = Math.floor(Date.now() / 1000) - 60
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iat: time, exp: time + 7 * 60, iss: settings.appId }))
  try {
    const sign = createSign('RSA-SHA256')
    sign.update(head + '.' + claims)
    sign.end()
    return head + '.' + claims + '.' + b64url(sign.sign(settings.privateKey))
  } catch { return null }
}

export type SourceInspectionFailure = 'not_configured' | 'provider_unavailable' | 'identity_unverified' | 'source_denied'
export type SourceInspectionResult =
  | { ok: false; code: SourceInspectionFailure }
  | { ok: true; repository: string; repositoryId: number; projectSlug: string; sha: string;
      observedAt: string; action: 'status'; readonly: true }
  | { ok: true; repository: string; repositoryId: number; projectSlug: string; sha: string;
      observedAt: string; action: 'read_file'; readonly: true; path: string; sourceUrl: string;
      lines: Array<{ line: number; text: string }>; totalLines: number; startLine: number;
      nextStartLine: number | null; truncated: boolean; untrustedSource: true }

class InspectionError extends Error {
  constructor(public readonly code: SourceInspectionFailure) { super('source_inspection_' + code) }
}
const fail = (code: SourceInspectionFailure): SourceInspectionResult => ({ ok: false, code })
interface CachedToken { value: string; expiry: number; appId: string; installationId: string; repositoryId: number }
let cached: CachedToken | null = null
export function __clearNovaSourceTokenForTest() { cached = null }

async function boundedJson(url: string, opts: RequestInit, fetcher: Fetcher, deadline: number): Promise<Record<string, any>> {
  if (Date.now() >= deadline) throw new InspectionError('provider_unavailable')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())))
  try {
    const response = await fetcher(url, {
      ...opts, cache: 'no-store', redirect: 'error', signal: ctl.signal,
      headers: { Accept: API_ACCEPT, 'X-GitHub-Api-Version': '2022-11-28', ...opts.headers },
    })
    if (!response.ok) throw new InspectionError('provider_unavailable')
    const length = response.headers.get('content-length')
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))
      throw new InspectionError('provider_unavailable')
    const reader = response.body?.getReader()
    if (!reader) throw new InspectionError('provider_unavailable')
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_JSON_BYTES) {
        void reader.cancel().catch(() => {})
        throw new InspectionError('provider_unavailable')
      }
      chunks.push(value)
    }
    const bytes = Buffer.concat(chunks.map(c => Buffer.from(c)))
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new InspectionError('provider_unavailable')
    return parsed as Record<string, any>
  } catch {
    // Never quote provider errors: they may contain credential-bearing requests.
    throw new InspectionError('provider_unavailable')
  } finally { clearTimeout(timer) }
}

async function readToken(repo: SourceRepository, fetcher: Fetcher, deadline: number): Promise<string> {
  const cfg = configuredApp()
  if (!cfg) throw new InspectionError('not_configured')
  if (cached && cached.appId === cfg.appId && cached.installationId === cfg.installationId
    && cached.repositoryId === repo.repositoryId
    && cached.expiry > Date.now() + 5 * 60_000) return cached.value
  const jwt = signedAppJwt(cfg)
  if (!jwt) throw new InspectionError('not_configured')
  const receipt = await boundedJson(API + '/app/installations/' + cfg.installationId + '/access_tokens', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repository_ids: [repo.repositoryId], permissions: { contents: 'read' } }),
  }, fetcher, deadline)
  const permitted = receipt.permissions
  const repositories = receipt.repositories
  if (!permitted || permitted.contents !== 'read' || receipt.repository_selection !== 'selected' ||
    Object.keys(permitted).some(k => (k !== 'contents' && k !== 'metadata') || permitted[k] !== 'read') ||
    !Array.isArray(repositories) || repositories.length !== 1 || repositories[0]?.id !== repo.repositoryId)
    throw new InspectionError('identity_unverified')
  const expiry = typeof receipt.expires_at === 'string' ? Date.parse(receipt.expires_at) : NaN
  if (!Number.isFinite(expiry) || expiry < Date.now() + 6 * 60_000 ||
    typeof receipt.token !== 'string' || !receipt.token) throw new InspectionError('identity_unverified')
  cached = { value: receipt.token, expiry, appId: cfg.appId, installationId: cfg.installationId, repositoryId: repo.repositoryId }
  return cached.value
}

async function getRepoJson(repo: SourceRepository, path: string, token: string, fetcher: Fetcher, deadline: number) {
  return boundedJson(API + '/repos/' + repo.owner + '/' + repo.name + path, {
    method: 'GET', headers: { Authorization: 'Bearer ' + token },
  }, fetcher, deadline)
}

/**
 * A path accepted by policy.ts must ALSO be a real regular blob in the
 * immutable commit's Git tree. The GitHub /contents endpoint dereferences some
 * symlinks and can otherwise expose a denied target through a harmless alias.
 *
 * Walk each tree non-recursively at pinned SHA; reject symlinks (120000),
 * submodules (160000), non-tree ancestors and truncated/incomplete trees.
 */
async function resolveRegularBlob(
  repo: SourceRepository,
  rootTreeSha: string,
  path: string,
  token: string,
  fetcher: Fetcher,
  deadline: number,
): Promise<{ sha: string; size: number }> {
  if (!SOURCE_GIT_SHA.test(rootTreeSha)) throw new InspectionError('identity_unverified')
  const parts = path.split('/')
  let treeSha = rootTreeSha
  for (const [index, part] of parts.entries()) {
    const tree = await getRepoJson(repo, '/git/trees/' + treeSha, token, fetcher, deadline)
    if (tree.sha !== treeSha || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 650)
      throw new InspectionError('source_denied')
    const matches = tree.tree.filter((entry: any) => entry?.path === part)
    if (matches.length !== 1) throw new InspectionError('source_denied')
    const entry = matches[0]
    if (!SOURCE_GIT_SHA.test(entry.sha)) throw new InspectionError('source_denied')
    if (index < parts.length - 1) {
      if (entry.type !== 'tree' || entry.mode !== '040000') throw new InspectionError('source_denied')
      treeSha = entry.sha
      continue
    }
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)
      || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > SOURCE_MAX_BYTES)
      throw new InspectionError('source_denied')
    return { sha: entry.sha, size: entry.size }
  }
  throw new InspectionError('source_denied')
}

/** Verify bytes belong to the exact blob named by the immutable Git tree. */
function validGitBlob(bytes: Buffer, sha: string): boolean {
  const calculated = createHash('sha1')
    .update('blob ' + bytes.byteLength + '\0', 'utf8')
    .update(bytes)
    .digest('hex')
  return calculated === sha
}

export async function inspectVerifiedSource(
  request: SourceRequest, options: { fetcher?: Fetcher } = {},
): Promise<SourceInspectionResult> {
  // Revalidate at the provider boundary too: TypeScript caller types are not
  // authority, and a future tool handler must not bypass the path allowlist.
  const verified = parseSourceRequest(request)
  if (!verified) return fail('source_denied')
  const repo = sourceRepositoryForProject(verified.projectSlug)
  if (!repo) return fail('identity_unverified')
  const fetcher = options.fetcher ?? fetch
  try {
    const deadline = Date.now() + INSPECTION_DEADLINE_MS
    const token = await readToken(repo, fetcher, deadline)
    // Repo name alone is not authorization: prove immutable repo and owner IDs.
    const identity = await getRepoJson(repo, '', token, fetcher, deadline)
    if (identity.id !== repo.repositoryId || identity.owner?.id !== repo.ownerId ||
      String(identity.full_name).toLowerCase() !== (repo.owner + '/' + repo.name).toLowerCase() ||
      identity.default_branch !== repo.branch) throw new InspectionError('identity_unverified')
    const commit = await getRepoJson(repo, '/commits/' + repo.branch, token, fetcher, deadline)
    const sha = commit.sha
    if (typeof sha !== 'string' || !SOURCE_GIT_SHA.test(sha)) throw new InspectionError('identity_unverified')
    const common = {
      repository: repo.owner + '/' + repo.name, repositoryId: repo.repositoryId,
      projectSlug: repo.projectSlug, sha, observedAt: new Date().toISOString(), readonly: true as const,
    }
    if (verified.action === 'status') return { ok: true, action: 'status', ...common }

    const path = verified.path
    const rootTreeSha = commit.commit?.tree?.sha
    const entry = await resolveRegularBlob(repo, rootTreeSha, path, token, fetcher, deadline)
    // Fetch a verified *blob*, not /contents/path. The latter may follow a
    // symlink to a secret file even when the requested alias looks safe.
    const result = await getRepoJson(repo, '/git/blobs/' + entry.sha, token, fetcher, deadline)
    if (result.sha !== entry.sha || result.encoding !== 'base64' ||
      result.size !== entry.size || typeof result.content !== 'string')
      throw new InspectionError('source_denied')
    const encoded = result.content.replace(/\s/g, '')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
      throw new InspectionError('source_denied')
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.byteLength !== entry.size || bytes.byteLength > SOURCE_MAX_BYTES ||
      !validGitBlob(bytes, entry.sha))
      throw new InspectionError('source_denied')
    let decoded: string
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { throw new InspectionError('source_denied') }
    if (!isSafeInspectableText(decoded)) throw new InspectionError('source_denied')
    const totalLines = decoded.split(/\r?\n/).length
    const startLine = verified.startLine ?? 1
    if (startLine > totalLines) throw new InspectionError('source_denied')
    const lines = selectedSourceLines(decoded, startLine)
    const lastLine = lines[lines.length - 1]?.line
    if (!lastLine) throw new InspectionError('source_denied')
    const truncated = lastLine < totalLines
    return {
      ok: true, action: 'read_file', path, lines, totalLines, startLine,
      nextStartLine: truncated ? lastLine + 1 : null, truncated,
      sourceUrl: immutableSourceUrl(repo, sha, path, lastLine, startLine),
      untrustedSource: true, ...common,
    }
  } catch (error) {
    return fail(error instanceof InspectionError ? error.code : 'provider_unavailable')
  }
}
