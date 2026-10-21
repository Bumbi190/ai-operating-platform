import {it,expect} from 'vitest'
import {websiteUserMessage} from '../prompt'
import {createWebsiteMockups} from './mockups'
import type {BuildSnapshot} from '../types'
const draft={format:'static-website.v1',title:'Vald design',css:'body{background:#123456}',pages:[{key:'index',title:'Hem',bodyHtml:'<h1>Godkänd referens</h1>',behaviors:[]}]}
const canonicalDraft=JSON.stringify(draft)
import {createHash} from 'node:crypto'
const reference={approvedPages:[{key:'index',title:'Hem',purpose:'Visa'}],mockupId:'11111111-1111-4111-8111-111111111111',sha256:createHash('sha256').update(canonicalDraft).digest('hex'),canonicalDraft}
const snapshot={writer:{},brief:'Alla tre godkända sidor ska byggas',agentId:'agent',previousArtifact:null,feedback:[],candidate:null,interpretation:null,controlRequested:null,designReference:reference} as unknown as BuildSnapshot
it('passes the exact approved mockup as subordinate design reference alongside the entire agreed brief',()=>{const message=JSON.parse(websiteUserMessage(snapshot,null));expect(message.brief).toBe(snapshot.brief);expect(message.designReference).toMatchObject({mockupId:reference.mockupId,sha256:reference.sha256,draft})})
it('refuses a changed design reference instead of silently building without it',()=>{expect(()=>websiteUserMessage({...snapshot,designReference:{...reference,canonicalDraft:canonicalDraft+' '}} as unknown as BuildSnapshot,null)).toThrow('INVALID_DESIGN_REFERENCE')})
it('keeps the design payload out of feedback interpretation prompts while retaining the brief',()=>{const message=JSON.parse(websiteUserMessage(snapshot,null,false));expect(message).not.toHaveProperty('designReference');expect(message.brief).toBe(snapshot.brief)})

it('retains the canonical active-project lock before the plan lock in approval',async()=>{
 const {readFileSync}=await import('node:fs'),{resolve}=await import('node:path')
 const sql=readFileSync(resolve('supabase/migrations/20261015210000_website_mockup_review.sql'),'utf8').split('create or replace function public.website_build_plan_approve(')[1].split('end $$;')[0]
 expect(sql.indexOf('website_build_studio_require_active')).toBeGreaterThan(sql.indexOf('website_build_check_access'))
 expect(sql.indexOf('website_build_studio_require_active')).toBeLessThan(sql.indexOf('select * into strict p'))
})
