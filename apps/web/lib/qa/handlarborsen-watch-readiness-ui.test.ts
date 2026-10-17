import * as React from 'react'
import { describe,expect,it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HandlarborsenWatchReadiness } from '@/components/platform/vnext/HandlarborsenWatchReadiness'
import { deriveWatchReadiness } from '@/lib/atlas/project-analytics/handlarborsen-watch-readiness-core'
;(globalThis as unknown as {React:typeof React}).React=React
const report=deriveWatchReadiness({checkedAt:'2026-10-17T18:00:00Z',budget:'project_missing',enforcement:'advisory',globalStop:'clear',projectStop:'clear'})
const render=(value:any)=>renderToStaticMarkup(React.createElement(HandlarborsenWatchReadiness,{result:value}))
describe('non-executing competitor readiness panel',()=>{
  it('shows actual missing project budget and advisory enforcement with no start control',()=>{
    const html=render(report)
    expect(html).toContain('Driftberedskap')
    expect(html).toContain('Automatisk bevakning är avstängd')
    expect(html).toContain('Projektbudget saknas')
    expect(html).toContain('Rådgivande')
    expect(html).toContain('Beständig körhistorik')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<form')
  })
  it('never claims activation even when observed controls are healthy',()=>{
    const html=render({...report,budget:'available',enforcement:'enforced'})
    expect(html).toContain('Automatisk bevakning är avstängd')
    expect(html).toContain('ögonblicksbild')
    expect(html).toContain('inte ett körningstillstånd')
  })
  it('distinguishes unknown reads from unpaused or zero-budget claims',()=>{
    const html=render({status:'unavailable'})
    expect(html).toContain('Driftstatus kunde inte verifieras')
    expect(html).not.toContain('Ej pausad')
    expect(html).not.toContain('0 kr')
  })
  it('does not expose a private report to an unauthorized audience',()=>{
    for(const status of ['unauthorized','forbidden'])expect(render({status})).toBe('')
    expect(render(null)).toBe('')
  })
})
