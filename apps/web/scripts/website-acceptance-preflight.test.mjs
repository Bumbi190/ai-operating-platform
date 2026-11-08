import {test} from 'node:test'
import assert from 'node:assert/strict'
import {evaluatePreflight,ACCEPTANCE_BRANCH,PRODUCTION_SUPABASE_REF} from './website-acceptance-preflight.mjs'
const ISOLATED='abcdefghijklmnopqrst'
const SECRET='fixture-secret-value-must-never-print'
const ok={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH,VERCEL_GIT_COMMIT_SHA:'541f142e7fec2f64b5f1b705e5bb847e597c7f19',WEBSITE_BUILDER_ACCEPTANCE_MODE:'1',WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF:ISOLATED,NEXT_PUBLIC_SUPABASE_URL:`https://${ISOLATED}.supabase.co`,H1_SPEND_GATE:'1',SUPABASE_SERVICE_ROLE_KEY:SECRET,NEXT_PUBLIC_SUPABASE_ANON_KEY:SECRET,CRON_SECRET:SECRET}

test('never prints secret values, only presence',()=>{
 const out=JSON.stringify(evaluatePreflight(ok,{expectedSha:'541f142'}))
 assert.ok(!out.includes(SECRET))
 assert.deepEqual(evaluatePreflight(ok).secrets,{SUPABASE_SERVICE_ROLE_KEY:'present',NEXT_PUBLIC_SUPABASE_ANON_KEY:'present',CRON_SECRET:'present'})
})
test('fully provisioned isolated target at the expected commit has no blockers',()=>{
 const r=evaluatePreflight(ok,{expectedSha:'541f142'})
 assert.deepEqual(r.blockers,[])
 assert.equal(r.database.urlMatchesAuthorizedRef,true)
 assert.deepEqual(r.realLoginBlockers,[])
 // Preview crons never fire on their own; reported even when everything else is ready.
 assert.ok(r.cronBlockers.includes('VERCEL_CRONS_RUN_ON_PRODUCTION_ONLY'))
})
test('a preview still on the production database is blocked',()=>{
 const r=evaluatePreflight({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ACCEPTANCE_BRANCH,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`})
 assert.equal(r.database.urlIsProduction,true)
 for(const b of ['ACCEPTANCE_MODE_NOT_ENABLED','ISOLATED_REF_MISSING','SUPABASE_URL_NOT_ISOLATED_REF','SPEND_GATE_NOT_ENFORCED'])assert.ok(r.blockers.includes(b),b)
 assert.ok(r.realLoginBlockers.includes('ISOLATED_DATABASE_NOT_PROVISIONED'))
 assert.ok(r.cronBlockers.includes('CRON_SECRET_ABSENT'))
})
test('production ref cannot be authorized as the isolated ref',()=>{
 const r=evaluatePreflight({...ok,WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF:PRODUCTION_SUPABASE_REF,NEXT_PUBLIC_SUPABASE_URL:`https://${PRODUCTION_SUPABASE_REF}.supabase.co`})
 assert.ok(r.blockers.includes('ISOLATED_REF_IS_PRODUCTION'))
})
test('commit and branch mismatches are blockers',()=>{
 assert.ok(evaluatePreflight(ok,{expectedSha:'deadbee'}).blockers.includes('COMMIT_SHA_MISMATCH'))
 assert.ok(evaluatePreflight({...ok,VERCEL_GIT_COMMIT_REF:'main'}).blockers.includes('NOT_ACCEPTANCE_BRANCH'))
 const local={...ok};delete local.VERCEL_GIT_COMMIT_REF;delete local.VERCEL_GIT_COMMIT_SHA
 assert.ok(evaluatePreflight(local,{branch:'main'}).blockers.includes('LOCAL_BRANCH_NOT_ACCEPTANCE_BRANCH'))
})
