import 'server-only'

import { randomBytes, randomUUID } from 'node:crypto'
import { resolvePlatformOperator, type PlatformOperatorDenied, type PlatformOperatorResult } from '@/lib/auth/platform-operator'
import { brokerEnrollmentSecretHash } from './protocol'
import { configuredBrokerBuildPolicy } from './policy'
import { createBrokerStore, type BrokerStore } from './store'
import type { BrokerBoundaryResult, BrokerEnrollmentPackage, BrokerSettingsModel, StoredBroker } from './types'

const ENROLLMENT_TTL_MS = 10 * 60 * 1000

interface OperatorDeps {
  operator?: () => Promise<PlatformOperatorResult>
  store?: BrokerStore
  now?: () => Date
  randomBytes?: (size: number) => Buffer
  randomUUID?: () => string
}

function deps(input?: OperatorDeps) {
  return {
    operator: input?.operator ?? resolvePlatformOperator,
    store: input?.store ?? createBrokerStore(),
    now: input?.now ?? (() => new Date()),
    randomBytes: input?.randomBytes ?? randomBytes,
    randomUUID: input?.randomUUID ?? randomUUID,
  }
}

function denial<T extends object>(result: PlatformOperatorDenied): BrokerBoundaryResult<T> {
  return { status: result.reason === 'unauthenticated' ? 'no_principal' : 'not_permitted' }
}

export async function beginBrokerEnrollment(input?: OperatorDeps): Promise<BrokerBoundaryResult<{ enrollment: BrokerEnrollmentPackage }>> {
  const d = deps(input)
  const operator = await d.operator()
  if (!operator.ok) return denial(operator)
  const enrollmentId = d.randomUUID()
  const hostId = d.randomUUID()
  const challenge = d.randomBytes(32).toString('base64url')
  const pairingCode = d.randomBytes(8).toString('hex').toUpperCase()
  const expiresAt = new Date(d.now().getTime() + ENROLLMENT_TTL_MS).toISOString()
  const policy = configuredBrokerBuildPolicy()

  try {
    await d.store.beginEnrollment({
      enrollmentId, requestedBy: operator.userId, hostId,
      challengeHash: brokerEnrollmentSecretHash('challenge', enrollmentId, challenge),
      pairingCodeHash: brokerEnrollmentSecretHash('pairing', enrollmentId, pairingCode),
      expiresAt, allowedRepositoryIds: [...policy.allowedRepositoryIds],
    })
    return {
      status: 'ok',
      enrollment: {
        domain: 'omnira.code_broker.enrollment.v1', enrollmentId, hostId,
        challenge, pairingCode, expiresAt, protocolVersion: 1, algorithm: 'ES256',
        allowedRepositoryIds: ['github.com/bumbi190/ai-operating-platform'],
      },
    }
  } catch {
    return { status: 'conflict' }
  }
}

export async function approveBroker(brokerId: string, input?: OperatorDeps): Promise<BrokerBoundaryResult<{ broker: StoredBroker }>> {
  const d = deps(input)
  const operator = await d.operator()
  if (!operator.ok) return denial(operator)
  try {
    const broker = await d.store.approve(brokerId, operator.userId)
    return { status: 'ok', broker }
  } catch {
    return { status: 'not_permitted' }
  }
}

export async function revokeBroker(brokerId: string, state: 'revoked' | 'lost', reason: string, input?: OperatorDeps): Promise<BrokerBoundaryResult<{ broker: StoredBroker }>> {
  if (!['revoked', 'lost'].includes(state) || !reason.trim() || reason.length > 120) return { status: 'invalid_request' }
  const d = deps(input)
  const operator = await d.operator()
  if (!operator.ok) return denial(operator)
  try {
    const broker = await d.store.revoke(brokerId, operator.userId, state, reason.trim())
    return { status: 'ok', broker }
  } catch {
    return { status: 'not_permitted' }
  }
}

export async function loadBrokerSettings(input?: OperatorDeps): Promise<BrokerSettingsModel> {
  const d = deps(input)
  const operator = await d.operator()
  const generatedAt = d.now().toISOString()
  if (!operator.ok) {
    return {
      capability: { allowed: false, reason: operator.reason }, brokers: [], openEnrollment: null,
      generatedAt, readable: operator.reason !== 'unauthenticated',
    }
  }
  try {
    const [brokers, enrollment] = await Promise.all([
      d.store.brokersByOwner(operator.userId), d.store.openEnrollmentByOwner(operator.userId),
    ])
    return {
      capability: { allowed: true, reason: 'allowed' }, brokers,
      openEnrollment: enrollment ? {
        enrollmentId: enrollment.enrollmentId, hostId: enrollment.hostId,
        state: enrollment.state, createdAt: enrollment.createdAt, expiresAt: enrollment.expiresAt,
      } : null,
      generatedAt, readable: true,
    }
  } catch {
    return {
      capability: { allowed: true, reason: 'allowed' }, brokers: [], openEnrollment: null,
      generatedAt, readable: false,
    }
  }
}
