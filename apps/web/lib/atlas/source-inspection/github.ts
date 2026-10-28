/**
 * Dedicated, read-only GitHub App transport for Nova source inspection.
 * Never reuses the Family project's credential or an account-wide PAT.
 * Every file is read at a pinned commit SHA after numeric repo-ID verification.
 */
import 'server-only'
import { createSign } from 'node:crypto'
import {
  immutableSourceUrl, isSafeInspectableText, selectedSourceLines, SOURCE_GIT_SHA,
  SOURCE_MAX_BYTES, sourceRepositoryForProject, parseSourceRequest, type SourceRepository, type SourceRequest,
} from './policy'

const API = 'https://api.github.com'
const MAX_JSON_BYTES = 100_000
const REQUEST_TIMEOUT_MS = 8_000
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
      lines: Array<{ line: number; text: string }>; totalLines: number; truncated: boolean;
      untrustedSource: true }

class InspectionError extends Error {
  constructor(public readonly code: SourceInspectionFailure) { super('source_inspection_' + code) }
}
const fail = (code: SourceInspectionFailure): SourceInspectionResult => ({ ok: false, code })
interface CachedToken { value: string; expiry: number; appId: string; installationId: string }
let cached: CachedToken | null = null
export function __clearNovaSourceTokenForTest() { cached = null }

async function boundedJson(url: string, opts: RequestInit, fetcher: Fetcher): Promise<Record<string, any>> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
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

async function readToken(repo: SourceRepository, fetcher: Fetcher): Promise<string> {
  const cfg = configuredApp()
  if (!cfg) throw new InspectionError('not_configured')
  if (cached && cached.appId === cfg.appId && cached.installationId === cfg.installationId
    && cached.expiry > Date.now() + 5 * 60_000) return cached.value
  const jwt = signedAppJwt(cfg)
  if (!jwt) throw new InspectionError('not_configured')
  const receipt = await boundedJson(API + '/app/installations/' + cfg.installationId + '/access_tokens', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repository_ids: [repo.repositoryId], permissions: { contents: 'read' } }),
  }, fetcher)
  const permitted = receipt.permissions
  const repositories = receipt.repositories
  if (!permitted || permitted.contents !== 'read' ||
    Object.keys(permitted).some(k => (k !== 'contents' && k !== 'metadata') || permitted[k] !== 'read') ||
    !Array.isArray(repositories) || repositories.length !== 1 || repositories[0]?.id !== repo.repositoryId)
    throw new InspectionError('identity_unverified')
  const expiry = typeof receipt.expires_at === 'string' ? Date.parse(receipt.expires_at) : NaN
  if (!Number.isFinite(expiry) || expiry < Date.now() + 6 * 60_000 ||
    typeof receipt.token !== 'string' || !receipt.token) throw new InspectionError('identity_unverified')
  cached = { value: receipt.token, expiry, appId: cfg.appId, installationId: cfg.installationId }
  return cached.value
}

async function getRepoJson(repo: SourceRepository, path: string, token: string, fetcher: Fetcher) {
  return boundedJson(API + '/repos/' + repo.owner + '/' + repo.name + path, {
    method: 'GET', headers: { Authorization: 'Bearer ' + token },
  }, fetcher)
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
    const token = await readToken(repo, fetcher)
    // Repo name alone is not authorization: prove immutable repo and owner IDs.
    const identity = await getRepoJson(repo, '', token, fetcher)
    if (identity.id !== repo.repositoryId || identity.owner?.id !== repo.ownerId ||
      String(identity.full_name).toLowerCase() !== (repo.owner + '/' + repo.name).toLowerCase() ||
      identity.default_branch !== repo.branch) throw new InspectionError('identity_unverified')
    const commit = await getRepoJson(repo, '/commits/' + repo.branch, token, fetcher)
    const sha = commit.sha
    if (typeof sha !== 'string' || !SOURCE_GIT_SHA.test(sha)) throw new InspectionError('identity_unverified')
    const common = {
      repository: repo.owner + '/' + repo.name, repositoryId: repo.repositoryId,
      projectSlug: repo.projectSlug, sha, observedAt: new Date().toISOString(), readonly: true as const,
    }
    if (verified.action === 'status') return { ok: true, action: 'status', ...common }

    const path = verified.path
    const suffix = path.split('/').map(encodeURIComponent).join('/')
    const result = await getRepoJson(repo, '/contents/' + suffix + '?ref=' + sha, token, fetcher)
    if (result.type !== 'file' || result.path !== path || result.encoding !== 'base64' ||
      !Number.isSafeInteger(result.size) || result.size < 1 || result.size > SOURCE_MAX_BYTES ||
      typeof result.content !== 'string') throw new InspectionError('source_denied')
    const encoded = result.content.replace(/\s/g, '')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
      throw new InspectionError('source_denied')
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.byteLength !== result.size || bytes.byteLength > SOURCE_MAX_BYTES)
      throw new InspectionError('source_denied')
    let decoded: string
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { throw new InspectionError('source_denied') }
    if (!isSafeInspectableText(decoded)) throw new InspectionError('source_denied')
    const lines = selectedSourceLines(decoded)
    const totalLines = decoded.split(/\r?\n/).length
    return {
      ok: true, action: 'read_file', path, lines, totalLines,
      truncated: totalLines > lines.length,
      sourceUrl: immutableSourceUrl(repo, sha, path, lines.length),
      untrustedSource: true, ...common,
    }
  } catch (error) {
    return fail(error instanceof InspectionError ? error.code : 'provider_unavailable')
  }
}
