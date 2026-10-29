import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { toolLabel } from '@/lib/os/chat-shared'
import { resolve } from 'node:path'
import type { SourceInspectionResult } from '@/lib/atlas/source-inspection/github'
import {
  handleNovaSourceTool, isNovaSourceReadIntent,
  novaSourcePilotEnabled, NOVA_SOURCE_TOOL_NAME, NOVA_SOURCE_TOOL, persistNovaSourceReceipt,
} from '@/lib/atlas/source-inspection/atlas-tool'

const req = { action: 'read_file', projectSlug: 'handlarborsen', path: 'app/page.tsx' }
const source: Extract<SourceInspectionResult, { ok: true; action: 'read_file' }> = { ok: true, action: 'read_file', repository: 'Bumbi190/handlarborsen',
  repositoryId: 1374257653, projectSlug: 'handlarborsen', sha: 'f'.repeat(40),
  path: 'app/page.tsx', readonly: true, sourceUrl: 'https://github.com/verified/blob/id',
  lines: [{ line: 1, text: 'PRIVATE SOURCE NOT FOR DATABASE PERSISTENCE' }], totalLines: 1,
  startLine: 1, nextStartLine: null, truncated: false,
  untrustedSource: true, observedAt: '2026-10-28T00:00:00Z' }
function guardedDb(projectId: string | null, error = false) {
  const log: Array<{op:string;field:string;value:unknown}> = []
  const db = { from: (table: string) => {
    if (table !== 'projects') throw new Error('unexpected table')
    const b: any = {
      select: () => b,
      eq: (field:string,value:unknown) => {log.push({op:'eq',field,value});return b},
      in: (field:string,value:unknown) => {log.push({op:'in',field,value});return b},
      maybeSingle: async () => ({ data: projectId ? {id:projectId} : null, error: error ? {message:'failed'} : null }),
    }
    return b
  }}
  return {db,log}
}
beforeEach(() => { vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('ATLAS_SOURCE_INSPECTION_MODE','pilot') })
afterEach(() => vi.unstubAllEnvs())

describe('Nova source inspection tool authority and minimal durable receipt',()=>{
  it('only recognizes explicit project-code read intent and ignores ordinary questions',()=>{
    expect(isNovaSourceReadIntent('Nova, visa Handlarbörsens GitHub-kod')).toBe(true)
    expect(isNovaSourceReadIntent('Vilken repo-branch använder Handlarbörsen?')).toBe(true)
    expect(isNovaSourceReadIntent('Visa app/page.tsx i Handlarbörsen')).toBe(true)
    expect(isNovaSourceReadIntent('Hur går det för Handlarbörsen?')).toBe(false)
    expect(isNovaSourceReadIntent('Kör Handlarbörsens workflows')).toBe(false)
    expect(isNovaSourceReadIntent('Visa annan kunds repo')).toBe(false)
    expect(isNovaSourceReadIntent(null)).toBe(false)
  })
  it('never treats an explicit DO NOT READ instruction as source-read consent', () => {
    for (const question of [
      'Nova, visa inte Handlarbörsens GitHub-kod.',
      'Nova, läs aldrig Handlarbörsens repo i app/page.tsx.',
      'Jag vill inte att Nova läser Handlarbörsens GitHub-kod.',
      'Visa Handlarbörsens repo utan att läsa filen.',
      "Don't read Handlarbörsens GitHub code; visa inte filen.",
      'Sök inte i Handlarbörsens github-repo.',
    ]) {
      expect(isNovaSourceReadIntent(question), question).toBe(false)
    }
    // A refusal to CHANGE code must not suppress an otherwise clear read.
    expect(isNovaSourceReadIntent('Visa Handlarbörsens GitHub-kod, men ändra inte någonting.')).toBe(true)
  })
  it('is preview-only and tool schema admits no writable action or arbitrary repo',()=>{
    expect(novaSourcePilotEnabled()).toBe(true)
    vi.stubEnv('VERCEL_ENV','production')
    expect(novaSourcePilotEnabled()).toBe(false)
    expect(NOVA_SOURCE_TOOL.name).toBe(NOVA_SOURCE_TOOL_NAME)
    expect(toolLabel(NOVA_SOURCE_TOOL_NAME)).toBe('Granskar Handlarbörsens källkod')
    expect((NOVA_SOURCE_TOOL.input_schema.properties as any).action.enum).toEqual(['status','read_file'])
    expect((NOVA_SOURCE_TOOL.input_schema.properties as any).projectSlug.enum).toEqual(['handlarborsen'])
    expect((NOVA_SOURCE_TOOL.input_schema.properties as any).startLine).toMatchObject({ type: 'integer', minimum: 1, maximum: 5000 })
    expect((NOVA_SOURCE_TOOL.input_schema.properties as any).expectedSha).toMatchObject({ type: 'string' })
    expect(NOVA_SOURCE_TOOL.input_schema.additionalProperties).toBe(false)
  })
  it('refuses all work before source dispatch unless operator, origin and project owner hold',async()=>{
    const db=guardedDb('own-project-id'),read=vi.fn(async()=>source)
    const principal=vi.fn(async()=>({ok:true,userId:'owner',email:'owner@example.test',actor:'user:owner'} as const))
    const ctx={db:db.db,userId:'owner',allowedProjectIds:['own-project-id'],sameOrigin:true}
    expect(await handleNovaSourceTool(req,{...ctx,sameOrigin:false},{operator:principal,read})).toEqual({ok:false,code:'same_origin_required'})
    expect(await handleNovaSourceTool(req,{...ctx,allowedProjectIds:[]},{operator:principal,read})).toEqual({ok:false,code:'project_unavailable'})
    const denied=vi.fn(async()=>({ok:false,reason:'not_platform_operator'} as const))
    expect(await handleNovaSourceTool(req,ctx,{operator:denied,read})).toEqual({ok:false,code:'not_authorized'})
    expect(await handleNovaSourceTool(req,ctx,{operator:vi.fn(async()=>({...await principal(),userId:'foreign'})),read})).toEqual({ok:false,code:'not_authorized'})
    expect(await handleNovaSourceTool({...req,path:'../secret'},ctx,{operator:principal,read})).toEqual({ok:false,code:'invalid_request'})
    expect(read).not.toHaveBeenCalled()
  })
  it('scopes the real query to the model-independent project owner list',async()=>{
    const p=guardedDb('own-project-id'),read=vi.fn(async()=>source)
    const ctx={db:p.db,userId:'owner',allowedProjectIds:['own-project-id'],sameOrigin:true}
    const operator=vi.fn(async()=>({ok:true,userId:'owner',email:'owner@example.test',actor:'user:owner'} as const))
    expect(await handleNovaSourceTool(req,ctx,{operator,read})).toEqual(source)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(req)
    expect(p.log).toEqual([
      {op:'eq',field:'slug',value:'handlarborsen'},
      {op:'in',field:'id',value:['own-project-id']},
    ])
  })
  it('fails closed if the SQL source project differs from the owner allowlist',async()=>{
    const p=guardedDb('foreign'),read=vi.fn(async()=>source)
    const ctx={db:p.db,userId:'owner',allowedProjectIds:['own-project-id'],sameOrigin:true}
    const operator=vi.fn(async()=>({ok:true,userId:'owner',email:'owner@example.test',actor:'user:owner'} as const))
    expect(await handleNovaSourceTool(req,ctx,{operator,read})).toEqual({ok:false,code:'project_unavailable'})
    expect(read).not.toHaveBeenCalled()
  })
  it('never persists private source lines into the conversation tool history',()=>{
    const result=persistNovaSourceReceipt(req,source)
    expect(result).toMatchObject({input:req,result:{ok:true,readonly:true,sha:'f'.repeat(40),totalLines:1}})
    expect(JSON.stringify(result)).not.toContain('PRIVATE SOURCE NOT FOR DATABASE PERSISTENCE')
    expect(persistNovaSourceReceipt({...req,path:'../../private'},source).input).toBeNull()
  })
  it('persists only continuation line metadata, never the code in a later page', () => {
    const page = { ...source, totalLines: 390, startLine: 241, nextStartLine: null,
      lines: [{ line: 241, text: 'private source belonging to later page' }] }
    const input = { ...req, startLine: 241, expectedSha: 'f'.repeat(40) }
    const receipt = persistNovaSourceReceipt(input, page)
    expect(receipt).toMatchObject({ input, result: { startLine: 241, nextStartLine: null, totalLines: 390 } })
    expect(JSON.stringify(receipt)).not.toContain('private source belonging to later page')
  })
  it('offers only the read tool on a special source turn and forces that exact tool once',()=>{
    const route=readFileSync(resolve('app/api/chat/route.ts'),'utf8')
    expect(route).toContain('const offeredTools: Anthropic.Tool[] = sourceReadTurn ? [NOVA_SOURCE_TOOL] : activeTools')
    expect(route).toContain("name: NOVA_SOURCE_TOOL_NAME")
    expect(route).toContain("toolUse.name !== NOVA_SOURCE_TOOL_NAME")
    expect(route).toContain("sourceReadIssued")
    expect(route).toContain('persistNovaSourceReceipt(toolUse.input, result)')
    expect(route).toContain('return handleNovaSourceTool(input,')
    expect(route).toContain("sourceReadTurn && sourceReadIssued ? [] : offeredTools")
  })
})
