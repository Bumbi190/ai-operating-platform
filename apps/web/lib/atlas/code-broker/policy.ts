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

export function brokerBuildAccepted(input: {
  protocolVersion: number
  brokerVersion: string
  buildSha256: string
}, policy = configuredBrokerBuildPolicy()): boolean {
  return input.protocolVersion === policy.protocolVersion
    && input.brokerVersion === policy.brokerVersion
    && policy.allowedBuildSha256.has(input.buildSha256)
}
