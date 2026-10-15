import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createStudioFixture, sqlJson } from './test-fixture'
import { testSql } from '../test-db'
import { ensureStudioWorkspace } from './store'

describe('owner-bound studio creation in real PostgreSQL', () => {
  it('serializes two independent SQL connections creating the same studio intent', async () => {
    const f=createStudioFixture(), input={kind:'new' as const,name:'Race',idempotencyKey:randomUUID()}
    const database=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME
    if(!/^website_test_[0-9]+$/.test(database??''))throw Error('Owned SQL fixture required')
    const preset={version:'atlas-web-builder-v1',model:'claude-sonnet-4-6',maxTokens:6000,systemPrompt:'Fixture',skillIds:['design-taste-frontend','impeccable'],skills:[]}
    const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database!])
    let out='',err=''
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b)
    const done=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(err)))})
    child.stdin.end(`begin; set role service_role; select pg_advisory_xact_lock(hashtextextended('atlas-studio:${f.owner.userId}:${input.idempotencyKey}',0)); select pg_advisory_xact_lock(882016); select pg_sleep(1); select website_build_studio_ensure(${sqlJson(f.owner)},${sqlJson(input)},${sqlJson(preset)}); commit;`)
    let ready=false
    for(let n=0;n<20;n++){if(testSql("select exists(select 1 from pg_locks where locktype='advisory' and objid=882016 and granted);")==='t'){ready=true;break}await new Promise(r=>setTimeout(r,20))}
    let second:Awaited<ReturnType<typeof ensureStudioWorkspace>>|undefined
    try{expect(ready).toBe(true);second=await ensureStudioWorkspace(f.db,f.owner,input)}finally{await done}
    expect(second).toEqual(JSON.parse(out.split('\n').find(s=>s.trim().startsWith('{'))!))
    expect(f.countOwnedProjects()).toBe(3)
    expect(testSql(`select count(*) from conversations where user_id='${f.owner.userId}';`)).toBe('1')
  },15000)
  it('recovers a lost creation response without another project, agent or conversation', async () => {
    const f = createStudioFixture(), input = { kind: 'new' as const, name: 'Min hemsida', idempotencyKey: randomUUID() }
    const a = await ensureStudioWorkspace(f.db, f.owner, input)
    const b = await ensureStudioWorkspace(f.db, f.owner, input)
    expect(b).toEqual(a)
    expect(f.countOwnedProjects()).toBe(3)
    const agent = await f.builder(a.projectId)
    expect(agent).toMatchObject({ projectId: a.projectId, model: 'claude-sonnet-4-6', maxTokens: 6000 })
    expect(agent.skills).toEqual(['design-taste-frontend', 'impeccable'])
    expect(agent.config.atlas_builder_preset.version).toBe('atlas-web-builder-v1')
    expect(agent.config.atlas_builder_preset.skills).toHaveLength(2)
    for (const skill of agent.config.atlas_builder_preset.skills) expect(skill.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(testSql(`select count(*) from conversations where project_id='${a.projectId}' and user_id='${f.owner.userId}';`)).toBe('1')
    expect(testSql(`select count(*) from project_budgets where project_id='${a.projectId}';`)).toBe('0')
    await expect(ensureStudioWorkspace(f.db, f.owner, { ...input, name: 'Annat' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('creates a conversation for an existing project without replacing its agent or settings', async () => {
    const f = createStudioFixture(), agent = randomUUID()
    testSql(`insert into agents(id,project_id,name,model,config) values('${agent}','${f.projectId}','Min agent','claude-sonnet-4-6','{"max_tokens":3500}'); insert into website_build_project_settings(project_id,builder_agent_id) values('${f.projectId}','${agent}');`)
    const a = await ensureStudioWorkspace(f.db, f.owner, { kind: 'existing', projectId: f.projectId, idempotencyKey: randomUUID() })
    expect(a.projectId).toBe(f.projectId)
    expect(f.countOwnedProjects()).toBe(2)
    expect(await f.builder(f.projectId)).toMatchObject({ id: agent, maxTokens: 3500 })
  })

  it('checks actual database ownership even when a caller names a foreign id in its allowlist', async () => {
    const f = createStudioFixture()
    await expect(ensureStudioWorkspace(f.db, { ...f.foreign, allowedProjectIds: [f.projectId] }, { kind: 'existing', projectId: f.projectId, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(ensureStudioWorkspace(f.db, { ...f.owner, allowedProjectIds: [] }, { kind: 'existing', projectId: f.projectId, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects absent principals and malformed or client-authorizing inputs before creating anything', async () => {
    const f = createStudioFixture(), input = { kind: 'new' as const, name: 'Normal', idempotencyKey: randomUUID() }
    for (const bad of [{ ...input, name: '' }, { ...input, name: 'x'.repeat(121) }, { ...input, idempotencyKey: '../bad' }, { ...input, ownerId: f.foreign.userId }, { ...input, preset: { model: 'fake' } }]) {
      await expect(ensureStudioWorkspace(f.db, f.owner, bad as typeof input)).rejects.toMatchObject({ status: 400 })
    }
    await expect(ensureStudioWorkspace(f.db, { userId: '', allowedProjectIds: [] }, input)).rejects.toMatchObject({ status: 400 })
    expect(f.countOwnedProjects()).toBe(2)
  })

  it('rolls back project creation when agent insertion fails', async () => {
    const f = createStudioFixture()
    testSql(`create function test_reject_studio_agent() returns trigger language plpgsql as $$ begin if new.project_id in(select id from public.projects where owner_id='${f.owner.userId}') then raise exception 'FIXTURE_AGENT_REJECTED'; end if; return new; end $$;
      create trigger test_reject_studio_agent before insert on agents for each row execute function test_reject_studio_agent();`)
    try {
      await expect(ensureStudioWorkspace(f.db, f.owner, { kind: 'new', name: 'Rollback', idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'BUILD_UNAVAILABLE', message: expect.stringContaining('FIXTURE_AGENT_REJECTED') })
      expect(f.countOwnedProjects()).toBe(2)
      expect(testSql(`select count(*) from conversations where user_id='${f.owner.userId}';`)).toBe('0')
    } finally { testSql('drop trigger test_reject_studio_agent on agents; drop function test_reject_studio_agent();') }
  })

  it('gives authenticated users owner-only SELECT and no mutation or RPC bypass', async () => {
    const f = createStudioFixture()
    const a = await ensureStudioWorkspace(f.db, f.owner, { kind: 'new', name: 'Privat', idempotencyKey: randomUUID() })
    expect(testSql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${f.foreign.userId}',true); select count(*) from website_build_studio_intents where project_id='${a.projectId}'; rollback;`).split('\n').at(-1)).toBe('0')
    expect(testSql("select has_function_privilege('authenticated','website_build_studio_ensure(jsonb,jsonb,jsonb)','execute') or has_function_privilege('anon','website_build_studio_ensure(jsonb,jsonb,jsonb)','execute');")).toBe('f')
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(testSql(`select has_table_privilege('${role}','website_build_studio_intents','insert') or has_table_privilege('${role}','website_build_studio_intents','update') or has_table_privilege('${role}','website_build_studio_intents','delete');`)).toBe('f')
    }
    expect(() => testSql(`select website_build_studio_ensure(${sqlJson({ ...f.foreign, allowedProjectIds: [a.projectId] })},${sqlJson({ kind: 'existing', projectId: a.projectId, idempotencyKey: randomUUID() })},'{}');`, true)).toThrow('WEBSITE_BUILD_NOT_FOUND')
  })
})
