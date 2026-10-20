/**
 * Pure, dependency-injected adapter for the DORMANT P10 creative identity DB.
 * The trusted caller must authenticate an exact signed request BEFORE invoking
 * consumeVerifiedProof. This module does not create a route or execute media.
 */
export interface CreativeIdentityRow {
  worker_id: string
  key_id: string
  public_key_spki_pem: string
  state: 'active' | 'revoked'
  creative_claim_enabled: boolean
  project_ids: string[]
}

interface DbResult<T> {
  data: T | null
  error: { message: string } | null
}

export interface CreativeIdentityDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<DbResult<CreativeIdentityRow>>
      }
    }
  }
  rpc(name: string, params: Record<string, unknown>): PromiseLike<DbResult<boolean>>
}
export interface CreativeWorkerProof {
  workerId: string
  keyId: string
  counter: number
  nonceHash: string
  requiredCapability: string
  projectIds: string[]
}
const WORKER = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/
const SHA = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Do not trust model-provided account state, public keys or projects. */
export function makeCreativeIdentityDbAdapter(db: CreativeIdentityDb) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw new Error('trusted creative DB client missing')
  }
  return {
    registry: {
      async getWorker(workerId: string) {
        if (typeof workerId !== 'string' || !WORKER.test(workerId)) return null
        try {
          const { data, error } = await db
            .from('atlas_creative_worker_identities')
            .select('worker_id,key_id,public_key_spki_pem,state,creative_claim_enabled,project_ids')
            .eq('worker_id', workerId).maybeSingle()
          if (error || !data || data.worker_id !== workerId) return null
          return Object.freeze({
            workerId: data.worker_id,
            keyId: data.key_id,
            publicKey: data.public_key_spki_pem,
            state: data.state,
            creativeClaimEnabled: data.creative_claim_enabled,
            projectIds: [...data.project_ids],
          })
        } catch { return null }
      },
    },
    store: {
      async consumeVerifiedProof(value: CreativeWorkerProof): Promise<boolean> {
        if (!value || value.requiredCapability !== 'creative.queue.claim' ||
          !WORKER.test(value.workerId) || !WORKER.test(value.keyId) ||
          !Number.isSafeInteger(value.counter) || value.counter < 1 ||
          !SHA.test(value.nonceHash) ||
          !Array.isArray(value.projectIds) ||
          value.projectIds.length < 1 || value.projectIds.length > 32 ||
          value.projectIds.some(x => typeof x !== 'string' || !UUID.test(x)) ||
          new Set(value.projectIds).size !== value.projectIds.length) return false
        try {
          const { data, error } = await db.rpc('atlas_creative_consume_worker_proof_p10', {
            p_worker_id: value.workerId,
            p_key_id: value.keyId,
            p_counter: value.counter,
            p_nonce_sha256: value.nonceHash,
            p_project_ids: value.projectIds,
          })
          return !error && data === true
        } catch { return false }
      },
    },
  }
}
