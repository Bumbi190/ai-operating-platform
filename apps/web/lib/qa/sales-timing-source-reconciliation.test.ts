import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {it,expect} from 'vitest'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
import {runMigrationGuard} from '../../scripts/check-migrations.mjs'
import captured from './fixtures/the-prompt/production-ledger-sales-timing-20261019.json'
const dir=resolve(process.cwd(),'supabase/migrations'),name='sales_contact_timing'
it('retains the exact already-applied reviewed SQL as one enforced canonical file',()=>{
 const files=readdirSync(dir).filter(f=>f.endsWith('_'+name+'.sql'));expect(files).toEqual(['20261019065056_sales_contact_timing.sql'])
 // Git's canonical LF bytes must match even when Windows checks out CRLF.
 const bytes=Buffer.from(readFileSync(resolve(dir,files[0]),'utf8').replace(/\r\n/g,'\n'));expect(bytes.length).toBe(36997)
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('8c651b4962445328991f837ff509b7146139921f8437ac2bfd7afbff0af27476')
 const state=inspectCanonicalMigrationFiles(readdirSync(dir));expect(state.enforcedNames).toContain(name);expect(state.grandfatheredNames).not.toContain(name)
})
it('accepts the actual 171-name ledger while missing, duplicated and unknown names still fail',()=>{
 const state=inspectCanonicalMigrationFiles(readdirSync(dir));expect(captured).toHaveLength(171);expect(new Set(captured).size).toBe(171)
 expect(evaluateAppliedMigrationLedger(captured,state)).toMatchObject({enforcedCount:134,appliedLedgerCount:171})
 expect(()=>evaluateAppliedMigrationLedger(captured.filter(n=>n!==name),state)).toThrow(/sales_contact_timing/)
 expect(()=>evaluateAppliedMigrationLedger([...captured,name],state)).toThrow(/duplicate/)
 expect(()=>evaluateAppliedMigrationLedger([...captured,'unreviewed_future_migration'],state)).toThrow(/unknown/)
})
it('classifies both actual live timing tables as server-only',()=>{
 const registry=JSON.parse(readFileSync(resolve(process.cwd(),'tests/isolation/schema-security.json'),'utf8'))
 for(const table of ['sales_contact_history_revisions','sales_contact_timing_rules'])expect(registry.tables[table]).toEqual({class:'SERVER_ONLY',rls:true,policies:0,anon_grants:false,authenticated_grants:false,service_role:true})
 expect(registry._meta.total_tables).toBe(Object.keys(registry.tables).length)
})
it('runs the unchanged fail-closed Vercel guard against the captured real ledger without override',async()=>{
 let calls=0
 const result=await runMigrationGuard({env:{NODE_ENV:'test',VERCEL:'1',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-not-a-secret'},logger:{...console,log(){},warn(){throw Error('No bypass')}},fetchImpl:async(url,options)=>{calls++;expect(url).toBe('https://fixture.supabase.co/rest/v1/rpc/omnira_applied_migrations');expect(options?.body).toBe('{}');return Response.json(captured)}})
 expect(calls).toBe(1);expect(result).toMatchObject({skipped:false,policyVersion:2,canonicalSqlCount:148,enforcedCount:134,appliedLedgerCount:171})
})
