import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {describe,it,expect,vi} from 'vitest'
import {createHiggsfieldPanelController} from '../../components/platform/vnext/higgsfield-panel-state'
import {SettingsHiggsfieldConnect} from '../../components/platform/vnext/SettingsHiggsfieldConnect'
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
describe('Higgsfield settings interactions',()=>{
 it('never reads or changes an account without management capability',async()=>{
  const fetcher=vi.fn();const c=createHiggsfieldPanelController(projectId,false,fetcher,()=>{})
  await c.load();await c.act('inspect');await c.act('disconnect');await c.act('connect')
  expect(fetcher).not.toHaveBeenCalled()
  const html=renderToStaticMarkup(React.createElement(SettingsHiggsfieldConnect,{projectId,canManage:false}))
  expect(html).not.toContain('<button')
 })
 it('sends explicit project and keeps one request in flight',async()=>{
  let resolve!:(r:Response)=>void
  const fetcher=vi.fn(()=>new Promise<Response>(r=>resolve=r))
  const c=createHiggsfieldPanelController(projectId,true,fetcher,()=>{})
  const first=c.act('inspect');await c.act('inspect')
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit]
  expect(url).toBe('/api/media/higgsfield/inspect');expect(JSON.parse(String(init.body))).toEqual({project_id:projectId})
  resolve(new Response(JSON.stringify({status:'connected',creditBalance:0,quoteCredits:4,observedAt:'2026-10-22T08:00:00Z'})));await first
  expect(c.getSnapshot().creditBalance).toBe(0);expect(c.getSnapshot().working).toBe(false)
 })
 it('never displays raw provider errors and keeps absent prices unknown',async()=>{
  const c=createHiggsfieldPanelController(projectId,true,async()=>new Response(JSON.stringify({error:'private-token'}),{status:503}),()=>{})
  await c.load();expect(c.getSnapshot().status).toBe('unavailable')
  expect(c.getSnapshot().creditBalance).toBe(null)
  expect(JSON.stringify(c.getSnapshot())).not.toContain('private-token')
 })
 it('allows retrying a transient inspection failure without claiming the account disconnected',async()=>{
  let inspections=0
  const fetcher:typeof fetch=async (input)=>{
   if(String(input).includes('/status'))return new Response(JSON.stringify({status:'connected',creditBalance:null,quoteCredits:null,observedAt:null}))
   inspections++
   return inspections===1 ? new Response(JSON.stringify({ok:false,error:'provider_unavailable'}),{status:503})
    :new Response(JSON.stringify({status:'connected',creditBalance:0,quoteCredits:4,observedAt:'2026-10-22T08:00:00Z'}))
  }
  const c=createHiggsfieldPanelController(projectId,true,fetcher,()=>{})
  await c.load();expect(c.getSnapshot().status).toBe('connected')
  await c.act('inspect');expect(c.getSnapshot().status).toBe('connected')
  expect(c.getSnapshot().inspectionUnavailable).toBe(true)
  await c.act('inspect');expect(inspections).toBe(2)
  expect(c.getSnapshot().inspectionUnavailable).toBe(false)
  expect(c.getSnapshot().creditBalance).toBe(0)
 })
 it('asks for reconnect when inspection returns the closed revoked-credential code',async()=>{
  const fetcher:typeof fetch=async input=>String(input).includes('/status')
   ?new Response(JSON.stringify({status:'connected'}))
   :new Response(JSON.stringify({ok:false,error:'reconnect_required'}),{status:503})
  const c=createHiggsfieldPanelController(projectId,true,fetcher,()=>{})
  await c.load();await c.act('inspect')
  expect(c.getSnapshot().status).toBe('reconnect_required')
  expect(c.getSnapshot().inspectionUnavailable).toBe(false)
 })
 it('does not show an authorized connection after a rejected inspection permission',async()=>{
  const fetcher:typeof fetch=async input=>String(input).includes('/status')
   ?new Response(JSON.stringify({status:'connected'}))
   :new Response(JSON.stringify({ok:false,error:'access_denied'}),{status:403})
  const c=createHiggsfieldPanelController(projectId,true,fetcher,()=>{})
  await c.load();await c.act('inspect')
  expect(c.getSnapshot().status).toBe('unavailable')
  expect(c.getSnapshot().inspectionUnavailable).toBe(false)
 })
 it('only follows the pinned provider authorization endpoint',async()=>{
  const navigate=vi.fn()
  const c=createHiggsfieldPanelController(projectId,true,async()=>new Response(JSON.stringify({authorization_url:'https://evil.example/oauth/authorize'})),navigate)
  await c.act('connect');expect(navigate).not.toHaveBeenCalled()
  expect(c.getSnapshot().status).toBe('unavailable')
 })
 it('renders an isolated panel without requiring other settings providers',()=>{
  const html=renderToStaticMarkup(React.createElement(SettingsHiggsfieldConnect,{projectId,canManage:true}))
  expect(html).toContain('Higgsfield')
  expect(html).toContain('Videogenerering är inte aktiverad')
  expect(html).toContain('Läs saldo och testpris')
 })
})
