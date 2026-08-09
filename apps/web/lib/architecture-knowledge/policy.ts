import type { KnowledgeChunk, KnowledgePolicyContext, KnowledgeSource } from './types'

const CLASSIFICATION_LEVEL: Record<'public' | 'internal' | 'confidential', number> = {
  public: 0,
  internal: 1,
  confidential: 2,
}

export function isExplicitlyAuthorizedInternalPrincipal(email: string | null | undefined): boolean {
  if (!email) return false
  const configured = [
    process.env.BREVO_ADMIN_EMAIL,
    ...(process.env.ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS ?? '').split(','),
  ].map(value => value?.trim().toLowerCase()).filter((value): value is string => !!value)
  return configured.includes(email.trim().toLowerCase())
}

function scopeAllowed(scope: KnowledgeSource['scope'], policy: KnowledgePolicyContext): boolean {
  if (scope.kind === 'platform') return policy.internalAuthorized
  if (scope.kind === 'tenant') return !!policy.tenantId && scope.tenantId === policy.tenantId
  if (!policy.allowedProjectIds.includes(scope.projectId)) return false
  return !scope.tenantId || (!!policy.tenantId && scope.tenantId === policy.tenantId)
}

function classificationAllowed(classification: KnowledgeSource['classification'], policy: KnowledgePolicyContext): boolean {
  if (classification === 'prohibited') return false
  if (classification === 'local_only') return policy.runtime === 'local'
  if (classification === 'internal' && !policy.internalAuthorized) return false
  return CLASSIFICATION_LEVEL[classification] <= CLASSIFICATION_LEVEL[policy.classificationCeiling]
}

export function sourceEligibleBeforeRanking(
  source: KnowledgeSource,
  policy: KnowledgePolicyContext,
  requestedVersion?: string | null,
  requestedBookId?: string | null,
): boolean {
  if (!policy.principalId || !source.scope || !source.classification) return false
  if (source.activationStatus !== 'active') return false
  if (!['approved', 'verified'].includes(source.canonicalStatus)) return false
  if (requestedBookId && source.bookId !== requestedBookId) return false
  if (requestedVersion ? source.version !== requestedVersion : !source.current) return false
  return classificationAllowed(source.classification, policy) && scopeAllowed(source.scope, policy)
}

export function filterEligibleSources(
  sources: KnowledgeSource[],
  policy: KnowledgePolicyContext,
  requestedVersion?: string | null,
  requestedBookId?: string | null,
): KnowledgeSource[] {
  return sources.filter(source => sourceEligibleBeforeRanking(source, policy, requestedVersion, requestedBookId))
}

export function filterEligibleChunks(chunks: KnowledgeChunk[], sources: KnowledgeSource[]): KnowledgeChunk[] {
  const eligible = new Set(sources.map(source => source.knowledgeSourceId))
  return chunks.filter(chunk => eligible.has(chunk.knowledgeSourceId))
}
