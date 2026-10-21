import { initializeWorkerDb, TEST_PRINCIPAL,testSql } from '../lib/website-build/test-db'
let authenticated=true
export function setFixtureSignedIn(value:boolean){authenticated=value}
let db: ReturnType<typeof initializeWorkerDb>
export function createAdminClient() { return db ??= initializeWorkerDb() }
export async function resolveProjectAccess() {if(!authenticated)return {ok:false as const,response:Response.json({error:'Unauthorized'},{status:401})};createAdminClient();const allowedProjectIds=JSON.parse(testSql("select coalesce(jsonb_agg(id),'[]') from projects where owner_id='"+TEST_PRINCIPAL.userId+"';"));return {ok:true as const,userId:TEST_PRINCIPAL.userId,allowedProjectIds}}
