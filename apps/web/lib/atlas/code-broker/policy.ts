import { BROKER_PROTOCOL_VERSION, BROKER_VERSION, OMNIRA_REPOSITORY_ID } from './types'

export interface BrokerBuildPolicy {
  protocolVersion: number
  brokerVersion: string
  allowedBuildSha256: ReadonlySet<string>
  allowedRepositoryIds: readonly string[]
}

export function configuredBrokerBuildPolicy(): BrokerBuildPolicy {
  const hashes = (process.env.OMNIRA_CODE_BROKER_ALLOWED_BUILD_SHA256 ?? '')
    .split(',').map(value => value.trim().toLowerCase()).filter(value => /^[a-f0-9]{64}$/.test(value))
  return {
    protocolVersion: BROKER_PROTOCOL_VERSION,
    brokerVersion: BROKER_VERSION,
    allowedBuildSha256: new Set(hashes),
    allowedRepositoryIds: [OMNIRA_REPOSITORY_ID],
  }
}

/**
 * SECURITY SEMANTICS — read before relying on this in a later phase.
 *
 * `buildSha256` is a build identity the broker DECLARES (the CLI takes it from
 * `--build-sha256`) and signs with its device key; this function checks that
 * declaration against an operator-configured allowlist and fails closed when the
 * allowlist is empty or the value is absent from it. Nothing measures the
 * executable that is actually running, so this is NOT remote attestation: it
 * proves a device holding an enrolled key vouched for an allowlisted build, not
 * which binary is executing. A later phase that needs "this exact binary" must add
 * a source-verified mechanism; it must not infer it from this field.
 */
export function brokerBuildAccepted(input: {
  protocolVersion: number
  brokerVersion: string
  buildSha256: string
}, policy = configuredBrokerBuildPolicy()): boolean {
  return input.protocolVersion === policy.protocolVersion
    && input.brokerVersion === policy.brokerVersion
    && policy.allowedBuildSha256.has(input.buildSha256)
}
