import { initializeWorkerDb, TEST_PRINCIPAL } from '../lib/website-build/test-db'
let db: ReturnType<typeof initializeWorkerDb>
export function createAdminClient() { return db ??= initializeWorkerDb() }
export async function resolveProjectAccess() { return { ok: true as const, ...TEST_PRINCIPAL } }
