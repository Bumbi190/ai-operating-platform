import {it,expect,beforeAll,afterAll} from 'vitest'
import {ExecutionLeasePostgres,q} from './fixtures/sdf-execution-lease-postgres'
const db=new ExecutionLeasePostgres()
beforeAll(()=>db.start(),120000);afterAll(()=>db.stop(),60000)
it('obtains an atomic claim-bound execution lease from real PostgreSQL',()=>{const f=db.createParent(),p=f.proof;const r=JSON.parse(db.sql('select public.atlas_code_work_execution_lease('+[q(p.workId)+'::uuid',q(p.claimId)+'::uuid',p.fence,q(p.brokerId),q(p.brokerHostId),q(p.brokerTokenHash)].join(',')+');','service_role'));expect(r.binding.workId).toBe(f.job.workId);expect(r.productionAuthority).toBe(false)})