import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, generateKeyPairSync } from 'node:crypto'
import {
  immutableSourceUrl, isSafeInspectableText, parseSourceRequest,
  safeSourcePath, selectedSourceLines, sourceRepositoryForProject,
} from '@/lib/atlas/source-inspection/policy'
import { __clearNovaSourceTokenForTest, inspectVerifiedSource } from '@/lib/atlas/source-inspection/github'

const SHA = 'f'.repeat(40)
const REPO_ID = 1374257653
const PRIVATE_KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
}).privateKey
const json = (data: unknown) => new Response(JSON.stringify(data), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})

function configure() {
  vi.stubEnv('NOVA_SOURCE_GITHUB_APP_ID', '157001')
  vi.stubEnv('NOVA_SOURCE_GITHUB_INSTALLATION_ID', '91110')
  vi.stubEnv('NOVA_SOURCE_GITHUB_APP_PRIVATE_KEY', PRIVATE_KEY)
}
const ROOT_TREE = 'a'.repeat(40)
const SRC_TREE = 'b'.repeat(40)
const APP_TREE = 'c'.repeat(40)
const DEFAULT_FILE = 'export default function Page() {\n  return null\n}\n'
const gitBlobHash = (text: string) => {
  const bytes = Buffer.from(text, 'utf8')
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
}
function fakeGitHub(opts: {
  repoId?: number; ownerId?: number; branch?: string; sha?: string;
  fileText?: string; blobText?: string; blobSha?: string; tokenRepositories?: readonly number[];
  permissions?: Record<string, string>; repositorySelection?: string;
  targetMode?: string; ancestorMode?: string; truncatedTree?: boolean; invalidTreeSha?: boolean;
  throwOnRequest?: boolean;
} = {}) {
  const observed: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = []
  const file = opts.fileText ?? DEFAULT_FILE
  const blobSha = gitBlobHash(file)
  const fetcher: typeof fetch = async (input, init) => {
    if (opts.throwOnRequest) throw new Error('secret-that-must-not-escape')
    const url = String(input), method = init?.method || 'GET'
    const headers = init?.headers as Record<string, string>
    const body = typeof init?.body === 'string' ? init.body : ''
    observed.push({ url, method, headers, body })
    if (url.endsWith('/access_tokens')) return json({
      token: 'fixture-installation-token', expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      permissions: opts.permissions ?? { contents: 'read', metadata: 'read' },
      repository_selection: opts.repositorySelection ?? 'selected',
      repositories: (opts.tokenRepositories ?? [REPO_ID]).map(id => ({ id })),
    })
    if (url.endsWith('/repos/Bumbi190/handlarborsen')) return json({
      id: opts.repoId ?? REPO_ID, owner: { id: opts.ownerId ?? 158544361 },
      full_name: 'Bumbi190/handlarborsen', default_branch: opts.branch ?? 'main',
    })
    if (url.endsWith('/commits/main')) return json({
      sha: opts.sha ?? SHA, commit: { tree: { sha: ROOT_TREE } },
    })
    const truncated = opts.truncatedTree ?? false
    if (url.endsWith('/git/trees/' + ROOT_TREE)) return json({
      sha: opts.invalidTreeSha ? 'e'.repeat(40) : ROOT_TREE, truncated,
      tree: [{ path: 'src', mode: opts.ancestorMode ?? '040000',
        type: opts.ancestorMode === '120000' ? 'blob' : 'tree', sha: SRC_TREE }],
    })
    if (url.endsWith('/git/trees/' + SRC_TREE)) return json({
      sha: SRC_TREE, truncated, tree: [{ path: 'app', mode: '040000', type: 'tree', sha: APP_TREE }],
    })
    if (url.endsWith('/git/trees/' + APP_TREE)) return json({
      sha: APP_TREE, truncated, tree: [
        { path: 'page.tsx', mode: opts.targetMode ?? '100644', type: 'blob',
          sha: blobSha, size: Buffer.byteLength(file) },
      ],
    })
    if (url.endsWith('/git/blobs/' + blobSha)) {
      const text = opts.blobText ?? file
      return json({
        sha: opts.blobSha ?? blobSha, size: Buffer.byteLength(file),
        encoding: 'base64', content: Buffer.from(text).toString('base64'),
      })
    }
    throw Error('unexpected mock endpoint')
  }
  return { fetcher, observed }
}

beforeEach(() => { __clearNovaSourceTokenForTest(); configure() })
afterEach(() => { vi.unstubAllEnvs(); __clearNovaSourceTokenForTest() })

describe('Nova trusted source boundary, separate from SDF-1 execution', () => {
  it('admits exactly the verified repo binding, no model-selected host or project', () => {
    expect(sourceRepositoryForProject('handlarborsen')).toMatchObject({
      repositoryId: REPO_ID, ownerId: 158544361, name: 'handlarborsen',
    })
    for (const project of ['the-prompt', 'familje-stunden', 'ai-media-automation', 'omnira', '', null, {}]) {
      expect(sourceRepositoryForProject(project)).toBeNull()
    }
  })
  it('validates exact request keys and refuses arbitrary host/path, traversal and sensitive files', () => {
    expect(parseSourceRequest({ action: 'status', projectSlug: 'handlarborsen' })).toEqual({
      action: 'status', projectSlug: 'handlarborsen',
    })
    expect(parseSourceRequest({ action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx' })).toMatchObject({
      action: 'read_file', path: 'src/app/page.tsx',
    })
    for (const path of [
      '.env', 'app/.env.local', 'app/../.env', '../README.md', 'src/%2e%2e/secret.ts',
      'app\\page.tsx', 'https://example.com/index.ts', '/etc/passwd', 'src/.git/config',
      'src/secrets/data.json', 'src/credentials.json', 'public/key.pem', 'package-lock.json',
      'src/foo.png', 'src//page.tsx', 'src/test?x=1', 'src/config/token-file.json',
    ]) {
      expect(safeSourcePath(path), path).toBeNull()
    }
    expect(parseSourceRequest({ action: 'status', projectSlug: 'handlarborsen', host: 'evil.test' })).toBeNull()
    expect(parseSourceRequest({ action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx', ref: 'main' })).toBeNull()
    expect(parseSourceRequest({ action: 'publish', projectSlug: 'handlarborsen' })).toBeNull()
  })
  it('rejects credential-looking text instead of revealing a redacted partial file', () => {
    expect(isSafeInspectableText('const api_key = "super-secret-secret"')).toBe(false)
    expect(isSafeInspectableText('-----BEGIN PRIVATE KEY-----\nsecret')).toBe(false)
    expect(isSafeInspectableText('const x = "sk-' + 'a'.repeat(32) + '"')).toBe(false)
    expect(isSafeInspectableText('a'.repeat(32_769))).toBe(false)
    expect(isSafeInspectableText('file\0bad')).toBe(false)
    expect(isSafeInspectableText('export const ok = true')).toBe(true)
    expect(selectedSourceLines('alpha\nbeta')).toEqual([{ line: 1, text: 'alpha' }, { line: 2, text: 'beta' }])
    expect(immutableSourceUrl(sourceRepositoryForProject('handlarborsen')!, SHA, 'src/app/page.tsx', 8))
      .toBe('https://github.com/Bumbi190/handlarborsen/blob/' + SHA + '/src/app/page.tsx#L1-L8')
  })
  it('mints exact single-repository read-only App token and returns SHA-pinned source evidence', async () => {
    const github = fakeGitHub()
    const result = await inspectVerifiedSource({
      action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx',
    }, { fetcher: github.fetcher })
    expect(result).toMatchObject({
      ok: true, action: 'read_file', repositoryId: REPO_ID, sha: SHA,
      path: 'src/app/page.tsx', readonly: true, untrustedSource: true,
    })
    if (!result.ok || result.action !== 'read_file') throw Error('expected source')
    expect(result.sourceUrl).toContain('/blob/' + SHA + '/src/app/page.tsx')
    expect(result.lines[0]).toEqual({ line: 1, text: 'export default function Page() {' })
    expect(JSON.stringify(result)).not.toContain('fixture-installation-token')
    const mint = github.observed[0]
    expect(mint.url).toBe('https://api.github.com/app/installations/91110/access_tokens')
    expect(mint.method).toBe('POST')
    expect(JSON.parse(mint.body)).toEqual({ repository_ids: [REPO_ID], permissions: { contents: 'read' } })
    expect(github.observed.slice(3, 6).map(c => c.url)).toEqual([
      'https://api.github.com/repos/Bumbi190/handlarborsen/git/trees/' + ROOT_TREE,
      'https://api.github.com/repos/Bumbi190/handlarborsen/git/trees/' + SRC_TREE,
      'https://api.github.com/repos/Bumbi190/handlarborsen/git/trees/' + APP_TREE,
    ])
    expect(github.observed[6].url).toContain('/git/blobs/' + gitBlobHash(DEFAULT_FILE))
    expect(github.observed.some(call => call.url.includes('/contents/'))).toBe(false)
    for (const call of github.observed) {
      expect(call.url).toMatch(/^https:\/\/api\.github\.com\//)
      expect(call.headers.Authorization).toMatch(/^Bearer /)
    }
  })
  it('has an independent status query and does not read any file for it', async () => {
    const github = fakeGitHub()
    const result = await inspectVerifiedSource({ action: 'status', projectSlug: 'handlarborsen' }, { fetcher: github.fetcher })
    expect(result).toMatchObject({ ok: true, action: 'status', sha: SHA, repositoryId: REPO_ID })
    expect(github.observed).toHaveLength(3)
  })
  it.each([
    [{ repoId: 999 }, 'identity_unverified'],
    [{ ownerId: 999 }, 'identity_unverified'],
    [{ branch: 'develop' }, 'identity_unverified'],
    [{ sha: 'INVALID' }, 'identity_unverified'],
    [{ tokenRepositories: [999] }, 'identity_unverified'],
    [{ tokenRepositories: [REPO_ID, 999] }, 'identity_unverified'],
    [{ permissions: { contents: 'write' } }, 'identity_unverified'],
    [{ permissions: { contents: 'read', issues: 'write' } }, 'identity_unverified'],
    [{ repositorySelection: 'all' }, 'identity_unverified'],
    [{ throwOnRequest: true }, 'provider_unavailable'],
  ] as const)('fails closed on unexpected provider identity/authority %j', async (opts, code) => {
    const github = fakeGitHub(opts)
    const result = await inspectVerifiedSource({
      action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx',
    }, { fetcher: github.fetcher })
    expect(result).toEqual({ ok: false, code })
    expect(JSON.stringify(result)).not.toContain('secret-that-must-not-escape')
  })
  it.each([
    [{ targetMode: '120000' }, 'source link to a denied target'],
    [{ targetMode: '160000' }, 'submodule'],
    [{ targetMode: '040000' }, 'subtree mistaken for a file'],
    [{ ancestorMode: '120000' }, 'ancestor symlink'],
    [{ invalidTreeSha: true }, 'tree response from the wrong commit tree'],
    [{ truncatedTree: true }, 'incomplete tree listing'],
    [{ blobText: 'A'.repeat(DEFAULT_FILE.length) }, 'blob whose bytes do not match its pinned SHA'],
    [{ blobSha: 'e'.repeat(40) }, 'wrong blob SHA metadata'],
  ] as const)('rejects %s before exposing source content: %s', async (options, _description) => {
    const github = fakeGitHub(options)
    const result = await inspectVerifiedSource({
      action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx',
    }, { fetcher: github.fetcher })
    expect(result).toEqual({ ok: false, code: 'source_denied' })
    expect(JSON.stringify(result)).not.toContain(DEFAULT_FILE)
  })
  it('blocks any source containing a secret-looking assignment, without returning partial text', async () => {
    const github = fakeGitHub({ fileText: 'const api_key = "never-print-this-value"\n' })
    const result = await inspectVerifiedSource({
      action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx',
    }, { fetcher: github.fetcher })
    expect(result).toEqual({ ok: false, code: 'source_denied' })
  })
  it('revalidates path at the network boundary even if a typed caller is compromised', async () => {
    const github = fakeGitHub()
    const result = await inspectVerifiedSource({
      action: 'read_file', projectSlug: 'handlarborsen', path: '../README.md',
    } as any, { fetcher: github.fetcher })
    expect(result).toEqual({ ok: false, code: 'source_denied' })
    expect(github.observed).toHaveLength(0)
  })
  it('does not dispatch even a read when App credentials are absent', async () => {
    vi.stubEnv('NOVA_SOURCE_GITHUB_APP_ID', '')
    const github = fakeGitHub()
    const result = await inspectVerifiedSource({ action: 'status', projectSlug: 'handlarborsen' }, { fetcher: github.fetcher })
    expect(result).toEqual({ ok: false, code: 'not_configured' })
    expect(github.observed).toHaveLength(0)
  })
})
