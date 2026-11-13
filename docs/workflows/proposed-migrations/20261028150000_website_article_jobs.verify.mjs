// Behavioural check of the PROPOSED website_article_jobs migration on PGlite (Postgres 16/17 WASM).
// Single connection: SKIP LOCKED contention is not exercised here; lease fencing and idempotency are.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const sqlPath = process.argv[2]
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid, slug text);
  create table public.website_content (id uuid primary key default gen_random_uuid());
`)
await db.exec(readFileSync(sqlPath, 'utf8'))
const one = async (q, p = []) => (await db.query(q, p)).rows[0]
const P = (await one(`insert into projects(slug) values('ai-media-automation') returning id`)).id
const N1 = '00000000-0000-0000-0000-0000000000a1', N2 = '00000000-0000-0000-0000-0000000000a2', N3 = '00000000-0000-0000-0000-0000000000a3'
const enq = async (n, cap = 2) => (await one(`select website_article_job_enqueue($1,$2,null,$3,$4,3) r`, [P, n, 'omnira_' + n, cap])).r
const results = []
const check = (name, fn) => results.push([name, fn])

check('duplicate trigger → exactly one job per news item', async () => {
  assert.equal(await enq(N1), 'enqueued')
  assert.equal(await enq(N1), 'exists')
  assert.equal((await one(`select count(*)::int c from website_article_jobs where news_item_id=$1`, [N1])).c, 1)
})
check('rolling 24h daily cap', async () => {
  assert.equal(await enq(N2), 'enqueued')
  assert.equal(await enq(N3), 'daily_cap')
})
let A
check('claim leases one job; a second claim does not get the same job', async () => {
  A = await one(`select * from website_article_job_claim(600)`)
  assert.ok(A && A.lease_token && A.state === 'running' && A.attempts === 1)
  const B = await one(`select * from website_article_job_claim(600)`)
  assert.ok(B && B.id !== A.id)
  const C = await one(`select * from website_article_job_claim(600)`)
  assert.equal(C, undefined)
})
check('finish with a stale/foreign lease token is refused', async () => {
  const r = await one(`select website_article_job_finish($1, gen_random_uuid(), 'saved', 'x', null, '{}'::jsonb, 0, 0) r`, [A.id])
  assert.equal(r.r, false)
  assert.equal((await one(`select state from website_article_jobs where id=$1`, [A.id])).state, 'running')
})
check('deferred (cost gate) re-queues and does not consume the attempt', async () => {
  const r = await one(`select website_article_job_finish($1,$2,'deferred','spend refused',null,'{"draft":{}}'::jsonb,0.05,0) r`, [A.id, A.lease_token])
  assert.equal(r.r, true)
  const j = await one(`select * from website_article_jobs where id=$1`, [A.id])
  assert.equal(j.state, 'queued'); assert.equal(j.attempts, 0); assert.equal(j.lease_token, null)
  assert.deepEqual(j.checkpoint, { draft: {} }); assert.equal(Number(j.cost_usd), 0.05)
})
check('expired lease is reclaimed with a NEW token; old token can no longer finish', async () => {
  const a = await one(`select * from website_article_job_claim(600)`)
  await db.query(`update website_article_jobs set lease_expires_at = now() - interval '1 second' where id=$1`, [a.id])
  const b = await one(`select * from website_article_job_claim(600)`)
  assert.equal(b.id, a.id); assert.notEqual(b.lease_token, a.lease_token); assert.equal(b.attempts, a.attempts + 1)
  assert.equal((await one(`select website_article_job_finish($1,$2,'saved','x',null,null,0,0) r`, [a.id, a.lease_token])).r, false)
  assert.equal((await one(`select website_article_job_finish($1,$2,'retry','ai error',null,null,0,0) r`, [b.id, b.lease_token])).r, true)
})
check('retry after the last attempt → failed (no infinite retries)', async () => {
  await db.query(`update website_article_jobs set max_attempts = 3, attempts = 2 where id=$1`, [A.id])
  const c = await one(`select * from website_article_job_claim(600)`)
  assert.equal(c.id, A.id); assert.equal(c.attempts, 3)
  await one(`select website_article_job_finish($1,$2,'retry','still failing',null,null,0,0)`, [c.id, c.lease_token])
  const j = await one(`select state, finished_at from website_article_jobs where id=$1`, [A.id])
  assert.equal(j.state, 'failed'); assert.ok(j.finished_at)
})
check('worker that died on its last attempt is failed by the next claim, not re-run', async () => {
  const d = await one(`select * from website_article_jobs where state='running'`)
  await db.query(`update website_article_jobs set attempts = max_attempts, lease_expires_at = now() - interval '1 s' where id=$1`, [d.id])
  await one(`select * from website_article_job_claim(600)`)
  assert.equal((await one(`select state from website_article_jobs where id=$1`, [d.id])).state, 'failed')
})
check('anon/authenticated cannot execute the queue functions', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(db.query(`select * from website_article_job_claim(600)`), /permission denied/)
    await db.exec(`reset role`)
  }
})

let failed = 0
for (const [name, fn] of results) {
  try { await fn(); console.log('PASS', name) } catch (e) { failed++; console.log('FAIL', name, '-', e.message) }
}
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
