/**
 * lib/media/social-credentials.ts — the only way to a usable social credential.
 *
 * THE RELATION (owner lock, 2026-09-14):
 *   Project → Platform → Verified External Account → Credential
 *
 * A consumer names the project of the content, run or resource it is acting on —
 * a project id it read from that row server-side — and gets a credential back only
 * when every link holds:
 *   1. the project id is a UUID (no slug, no default, no "first project");
 *   2. the project has an ACTIVE, UNBLOCKED binding on the platform;
 *   3. the binding's credential exists: Instagram and Facebook stored for that
 *      project; YouTube, during Y1, the platform's Vercel OAuth credential, which only
 *      the one binding marked platform_env_transitional may use;
 *   4. the provider, asked with that credential right now, answers with the binding's
 *      account.
 * Anything else is a refusal with a closed code. There is no fallback of any kind —
 * not to another project's credential, not to an environment token, not to The
 * Prompt — and every caller treats a refusal as a stop.
 *
 * YOUTUBE Y1 (transitional, not the end state). With only upload scope the channel
 * cannot be read before an upload. The credential then comes back with
 * channelVerifiedBeforeUpload = false, and confirmYouTubeUploadChannel() checks the
 * channel YouTube reports for the upload against the binding: a mismatch blocks the
 * binding permanently, stopping every later upload. The end state is project-scoped
 * YouTube credentials with the channel verified before every upload
 * (ATLAS_ROADMAP_SV.md).
 *
 * SECRETS. A resolved credential lives only in the caller's memory for its run. It
 * is never returned by a route, logged, audited or written anywhere; refusal codes
 * carry no provider text.
 */
import 'server-only'
import {
  blockBinding,
  isProjectId,
  readActiveBinding,
  type SocialAccountBinding,
  type SocialPlatform,
} from './social-bindings'
import { readStoredCredential } from './token-store'
import {
  attestFacebookPage,
  attestInstagramCredential,
  attestYouTubeChannels,
  canReadOwnChannel,
  exchangeYouTubeGrant,
  EXTERNAL_ACCOUNT_ID,
  type IdentityFailure,
} from './social-identity'
import { platformYouTubeGrant } from './youtube'

export type CredentialRefusal =
  /** No server-derived project id — nothing to resolve a credential for. */
  | 'project_required'
  /** The project has no active binding on the platform. */
  | 'binding_missing'
  /** The binding was contradicted after the fact and is blocked until rebound. */
  | 'binding_blocked'
  | 'binding_unreadable'
  /** The binding exists but its credential does not. */
  | 'credential_missing'
  | 'credential_unreadable'
  /** The provider rejected the credential. */
  | 'credential_invalid'
  /** The provider says the credential is not the binding's account. */
  | 'account_mismatch'
  /** The provider could not be asked just now. */
  | 'provider_unavailable'

const RETRYABLE: ReadonlySet<CredentialRefusal> = new Set(['binding_unreadable', 'credential_unreadable', 'provider_unavailable'])

/** A refusal no retry can fix: a person has to bind, replace or unblock. */
export function refusalIsPermanent(refusal: CredentialRefusal): boolean {
  return !RETRYABLE.has(refusal)
}

export interface InstagramCredential {
  platform: 'instagram'
  projectId: string
  bindingId: string
  /** The binding's Instagram professional account id, confirmed by Instagram for this credential. */
  accountId: string
  username: string | null
  token: string
  apiBase: string
  isIgLogin: boolean
  /** The stored credential's recorded expiry, when there is one. */
  expiresAt: Date | null
}

export interface FacebookCredential {
  platform: 'facebook'
  projectId: string
  bindingId: string
  /** The binding's page id, confirmed by Meta for this credential's page token. */
  pageId: string
  pageName: string | null
  pageToken: string
  /** The stored credential's recorded expiry, when there is one. */
  expiresAt: Date | null
}

export interface YouTubeCredential {
  platform: 'youtube'
  projectId: string
  bindingId: string
  /** The binding's channel id. Confirmed before upload only when channelVerifiedBeforeUpload. */
  channelId: string
  channelTitle: string | null
  accessToken: string
  channelVerifiedBeforeUpload: boolean
}

export type CredentialResolution<T> =
  | { ok: true; credential: T; binding: SocialAccountBinding }
  | { ok: false; refusal: CredentialRefusal; binding: SocialAccountBinding | null }

type Refused = { ok: false; refusal: CredentialRefusal; binding: SocialAccountBinding | null }

const refuse = (refusal: CredentialRefusal, binding: SocialAccountBinding | null = null): Refused =>
  ({ ok: false, refusal, binding })

function identityRefusal(failure: IdentityFailure): CredentialRefusal {
  if (failure === 'provider_unavailable') return 'provider_unavailable'
  if (failure === 'credential_invalid') return 'credential_invalid'
  return 'account_mismatch'
}

async function activeBinding(
  projectId: unknown, platform: SocialPlatform,
): Promise<{ ok: true; binding: SocialAccountBinding } | Refused> {
  if (!isProjectId(projectId)) return refuse('project_required')
  const read = await readActiveBinding(projectId, platform)
  if (!read.ok) return refuse('binding_unreadable')
  if (!read.binding) return refuse('binding_missing')
  if (read.binding.projectId !== projectId || read.binding.platform !== platform) return refuse('binding_unreadable')
  if (read.binding.blockedAt) return refuse('binding_blocked', read.binding)
  return { ok: true, binding: read.binding }
}

/** The project's verified Instagram credential, or a refusal. */
export async function resolveInstagramCredential(projectId: unknown): Promise<CredentialResolution<InstagramCredential>> {
  const active = await activeBinding(projectId, 'instagram')
  if (!active.ok) return active
  const { binding } = active
  if (binding.credentialSource !== 'project_store') return refuse('credential_missing', binding)

  const stored = await readStoredCredential(binding.projectId, 'instagram')
  if (!stored.ok) return refuse('credential_unreadable', binding)
  if (!stored.credential) return refuse('credential_missing', binding)

  const identity = await attestInstagramCredential(stored.credential.accessToken, binding.externalAccountId)
  if (!identity.ok) return refuse(identityRefusal(identity.failure), binding)
  if (identity.accountId !== binding.externalAccountId) return refuse('account_mismatch', binding)

  return {
    ok: true,
    binding,
    credential: {
      platform: 'instagram',
      projectId: binding.projectId,
      bindingId: binding.bindingId,
      accountId: identity.accountId,
      username: identity.username,
      token: stored.credential.accessToken,
      apiBase: identity.apiBase,
      isIgLogin: identity.isIgLogin,
      expiresAt: stored.credential.expiresAt,
    },
  }
}

/** The project's verified Facebook page credential, or a refusal. */
export async function resolveFacebookCredential(projectId: unknown): Promise<CredentialResolution<FacebookCredential>> {
  const active = await activeBinding(projectId, 'facebook')
  if (!active.ok) return active
  const { binding } = active
  if (binding.credentialSource !== 'project_store') return refuse('credential_missing', binding)

  const stored = await readStoredCredential(binding.projectId, 'facebook')
  if (!stored.ok) return refuse('credential_unreadable', binding)
  if (!stored.credential) return refuse('credential_missing', binding)

  const page = await attestFacebookPage(stored.credential.accessToken, binding.externalAccountId)
  if (!page.ok) return refuse(identityRefusal(page.failure), binding)
  if (page.pageId !== binding.externalAccountId) return refuse('account_mismatch', binding)

  return {
    ok: true,
    binding,
    credential: {
      platform: 'facebook',
      projectId: binding.projectId,
      bindingId: binding.bindingId,
      pageId: page.pageId,
      pageName: page.pageName,
      pageToken: page.pageToken,
      expiresAt: stored.credential.expiresAt,
    },
  }
}

/** The project's YouTube credential (Y1: only the binding the platform credential is attached to), or a refusal. */
export async function resolveYouTubeCredential(projectId: unknown): Promise<CredentialResolution<YouTubeCredential>> {
  const active = await activeBinding(projectId, 'youtube')
  if (!active.ok) return active
  const { binding } = active
  // Y1: the platform's Vercel credential serves exactly the binding marked for it.
  if (binding.credentialSource !== 'platform_env_transitional') return refuse('credential_missing', binding)

  const grant = platformYouTubeGrant()
  if (!grant) return refuse('credential_missing', binding)

  const access = await exchangeYouTubeGrant(grant)
  if (!access.ok) return refuse(identityRefusal(access.failure), binding)

  let channelVerifiedBeforeUpload = false
  let channelTitle: string | null = null
  if (canReadOwnChannel(access.scopes)) {
    const channels = await attestYouTubeChannels(access.accessToken)
    if (!channels.ok) return refuse(identityRefusal(channels.failure), binding)
    const own = channels.channels.find(channel => channel.channelId === binding.externalAccountId)
    if (!own) return refuse('account_mismatch', binding)
    channelVerifiedBeforeUpload = true
    channelTitle = own.title
  }

  return {
    ok: true,
    binding,
    credential: {
      platform: 'youtube',
      projectId: binding.projectId,
      bindingId: binding.bindingId,
      channelId: binding.externalAccountId,
      channelTitle,
      accessToken: access.accessToken,
      channelVerifiedBeforeUpload,
    },
  }
}

export interface CredentialResolver {
  instagram(projectId: unknown): Promise<CredentialResolution<InstagramCredential>>
  facebook(projectId: unknown): Promise<CredentialResolution<FacebookCredential>>
  youtube(projectId: unknown): Promise<CredentialResolution<YouTubeCredential>>
}

/**
 * One resolution per project and platform for the lifetime of the returned object —
 * a single cron run or request. Nothing is shared between runs: there is no module
 * cache, so a credential or an account can never outlive the run that verified it.
 */
export function createCredentialResolver(): CredentialResolver {
  const memo = new Map<string, Promise<unknown>>()
  const once = <T>(key: string, run: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) memo.set(key, run())
    return memo.get(key) as Promise<T>
  }
  return {
    instagram: (projectId) => once(`instagram:${String(projectId)}`, () => resolveInstagramCredential(projectId)),
    facebook: (projectId) => once(`facebook:${String(projectId)}`, () => resolveFacebookCredential(projectId)),
    youtube: (projectId) => once(`youtube:${String(projectId)}`, () => resolveYouTubeCredential(projectId)),
  }
}

/**
 * After an upload: does the channel YouTube reports for it match the binding? A
 * channel that differs — or that YouTube did not report — blocks the binding, so no
 * later upload can reach the wrong channel. Returns whether the upload is confirmed.
 */
export async function confirmYouTubeUploadChannel(
  credential: YouTubeCredential, uploadedChannelId: string | null,
): Promise<{ confirmed: true } | { confirmed: false; blocked: boolean }> {
  if (typeof uploadedChannelId === 'string' && EXTERNAL_ACCOUNT_ID.test(uploadedChannelId)
      && uploadedChannelId === credential.channelId) {
    return { confirmed: true }
  }
  return { confirmed: false, blocked: await blockBinding(credential.bindingId) }
}
