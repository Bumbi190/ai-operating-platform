import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createStudioFixture,sqlJson} from './test-fixture'
import {testSql} from '../test-db'
import {ATLAS_WEB_BUILDER_PRESET} from './preset'
const migration=()=>testSql(readFileSync(resolve(process.cwd(),'supabase/migrations/20261015122500_atlas_builder_output_allowance_v2.sql'),'utf8'))
describe('managed builder output allowance migration',()=>{
 it('upgrades only exact factory v1 configurations, preserving custom agents and budgets',async()=>{
  const f=createStudioFixture()
  const legacy={...ATLAS_WEB_BUILDER_PRESET,version:'atlas-web-builder-v1',maxTokens:6000}
  const make=()=>JSON.parse(testSql('select website_build_studio_ensure('+sqlJson(f.owner)+','+sqlJson({kind:'new',name:'Legacy',idempotencyKey:randomUUID()})+','+sqlJson(legacy)+');'))
  const unchanged=make(),customCap=make(),customPrompt=make(),customConfig=make()
  const cap=await f.builder(customCap.projectId),prompt=await f.builder(customPrompt.projectId),config=await f.builder(customConfig.projectId)
  testSql("update agents set config=jsonb_set(config,'{max_tokens}','3500'::jsonb) where id='"+cap.id+"';")
  testSql("update agents set system_prompt='Min egen prompt' where id='"+prompt.id+"';")
  testSql("update agents set config=config||'{\"temperature\":0.2}'::jsonb where id='"+config.id+"';")
  const before=testSql('select coalesce(jsonb_agg(to_jsonb(b) order by project_id),\'[]\') from project_budgets b;')
  migration()
  expect(await f.builder(unchanged.projectId)).toMatchObject({maxTokens:12000,config:{atlas_builder_preset:{version:'atlas-web-builder-v2',maxTokens:12000}}})
  expect(await f.builder(customCap.projectId)).toMatchObject({maxTokens:3500})
  expect(await f.builder(customPrompt.projectId)).toMatchObject({maxTokens:6000})
  expect(await f.builder(customConfig.projectId)).toMatchObject({maxTokens:6000,config:{temperature:0.2}})
  expect(testSql('select coalesce(jsonb_agg(to_jsonb(b) order by project_id),\'[]\') from project_budgets b;')).toBe(before)
  migration()
  expect(await f.builder(unchanged.projectId)).toMatchObject({maxTokens:12000})
 },30000)
 it('keeps the creation RPC private and rejects an incomplete preset',()=>{
  const f=createStudioFixture();migration()
  expect(testSql("select has_function_privilege('authenticated','public.website_build_studio_ensure(jsonb,jsonb,jsonb)','execute');")).toBe('f')
  expect(()=>testSql('select website_build_studio_ensure('+sqlJson(f.owner)+','+sqlJson({kind:'new',name:'Bad',idempotencyKey:randomUUID()})+','+sqlJson({model:'claude-sonnet-4-6'})+');')).toThrow('INVALID_STUDIO_INPUT')
 })
})
