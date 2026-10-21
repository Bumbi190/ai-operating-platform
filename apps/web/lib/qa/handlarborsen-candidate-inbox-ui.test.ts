import * as React from 'react'
import { describe,expect,it,vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HandlarborsenCandidateInbox } from '@/components/platform/vnext/HandlarborsenCandidateInbox'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'
import type { CompetitorInboxLoad } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service'

vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
;(globalThis as unknown as {React:typeof React}).React=React
const sample: CompetitorInboxLoad={
  status:'ok',unreadCount:1,
  notifications:[{
    host:'tradingsolutions.se',
    name:'TradingSolutions D2D',officialUrl:'https://www.tradingsolutions.se/d2d/',
    firstSeenAt:'2026-10-16T20:23:40.736Z',
    createdAt:'2026-10-17T09:00:00.000Z',readAt:null,unread:true,
  }],
}
function render(mode:'owner'|'collaborator',inbox:CompetitorInboxLoad|null,enabled=true){
  return renderToStaticMarkup(React.createElement(HandlarborsenCandidateInbox,{
    mode,inbox,enabled,
  }))
}
describe('verified Atlas in-app competitor inbox UI',()=>{
  it('renders no inbox controls while the feature flag is absent',()=>{
    expect(render('owner',sample,false)).toBe('')
    expect(render('collaborator',sample,false)).toBe('')
  })
  it('shows only evidence-backed, personal, internal delivery and an optional read button',()=>{
    const html=render('owner',sample)
    expect(html).toContain('1 olästa av 1 sparade notiser')
    expect(html).toContain('TradingSolutions D2D')
    expect(html).toContain('Officiell källa')
    expect(html).toContain('Markera som läst')
    expect(html).toContain('inte skickade mejl eller pushmeddelanden')
    expect(html).not.toContain('skickat till din telefon')
    const host=renderToStaticMarkup(React.createElement(HandlarborsenCompetitors,{
      scan:null,inboxEnabled:true,inbox:sample,mode:'owner',
    }))
    expect(host).toContain('Inkorg för nya konkurrenter')
    expect(host).toContain('TradingSolutions D2D')
  })
  it('shows no fake zero count when authorized read fails',()=>{
    const html=render('collaborator',{status:'unavailable'})
    expect(html).toContain('Antalet olästa notiser är okänt, inte noll')
    expect(html).not.toContain('0 olästa')
    expect(html).not.toContain('Markera som läst')
  })
  it('renders a verified true empty inbox without manufacturing historical alerts',()=>{
    const html=render('owner',{status:'ok',unreadCount:0,notifications:[]})
    expect(html).toContain('Inga notiser har skapats för ditt konto')
    expect(html).toContain('0 olästa av 0 sparade notiser')
    expect(html).not.toContain('TradingSolutions D2D')
  })
  it('shows read acknowledgement state as personal, reversible metadata',()=>{
    const input: CompetitorInboxLoad={ status:'ok', unreadCount:0,
      notifications:[{host:'tradingsolutions.se',name:'TradingSolutions D2D',officialUrl:'https://www.tradingsolutions.se/d2d/',firstSeenAt:'2026-10-16T20:23:40.736Z',createdAt:'2026-10-17T09:00:00.000Z',readAt:'2026-10-17T11:00:00.000Z',unread:false}],
    }
    expect(render('collaborator',input)).toContain('Markera oläst')
    expect(render('collaborator',input)).toContain('0 olästa')
  })
})
