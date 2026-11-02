import { createElement } from 'react'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { BrokerSettingsModel, StoredBroker } from '@/lib/atlas/code-broker/types'
import { ownerSigningReviewPreview } from '@/lib/atlas/model-router/windows-owner-review-preview'

;(globalThis as unknown as {React:typeof React}).React=React

const NOW='2026-10-29T16:00:00.000Z'
const HOST='30000000-0000-4000-8000-000000000001'
const model=(over:Partial<BrokerSettingsModel>={}):BrokerSettingsModel=>({
  capability:{allowed:true,reason:'allowed'},
  brokers:[],openEnrollment:null,generatedAt:NOW,readable:true,...over,
})
const broker=(status:StoredBroker['status']):StoredBroker=>({
  brokerId:'40000000-0000-4000-8000-000000000001',
  enrollmentId:'20000000-0000-4000-8000-000000000001',
  ownerUserId:'10000000-0000-4000-8000-000000000001',
  hostId:HOST,publicJwk:{kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)},
  keyThumbprint:'public-thumbprint',
  algorithm:'ES256',protocolVersion:1,brokerVersion:'0.1.0',
  buildSha256:'a'.repeat(64),hostLabel:'Testvärd',
  localUidHash:'b'.repeat(64),osVersion:'synthetic',
  status,allowedRepositoryIds:['github.com/bumbi190/ai-operating-platform'],
  approvedAt:null,approvedBy:null,lastSeenAt:null,expiresAt:null,
  revokedAt:null,revokedBy:null,revokedReason:null,requestCounter:0,
  lastRequestJti:null,lastRequestAt:null,createdAt:NOW,updatedAt:NOW,
})
const enrollment=(expiresAt='2026-10-29T16:05:00.000Z')=>({
  enrollmentId:'20000000-0000-4000-8000-000000000001',
  hostId:HOST,state:'issued' as const,expiresAt,createdAt:NOW,
})
const checkNoGrants=(m:BrokerSettingsModel)=>{
  const r=ownerSigningReviewPreview(m)
  expect(r.mode).toBe('read_only_review')
  expect(r.explicitSigningDecisionRecorded).toBe(false)
  expect(r.issuerTrustedForProduction).toBe(false)
  expect(r.buildAllowlistVerified).toBe(false)
  expect(r.challengeProofCompleted).toBe(false)
  expect(r.durableConsentReplayVerified).toBe(false)
  expect(r.windowsSignerReadyForRealChallenge).toBe(false)
  expect(r.realConsentRequestAvailable).toBe(false)
  expect(r.enrollmentAuthorized).toBe(false)
  expect(r.modelDispatchAuthorized).toBe(false)
  return r
}
let render:(m:BrokerSettingsModel)=>string
beforeAll(async()=>{
  const {OwnerSigningReview}=await import('@/components/platform/vnext/OwnerSigningReview')
  render=m=>renderToStaticMarkup(createElement(OwnerSigningReview,{model:m}))
})

describe('Read-only Atlas Windows owner signing review',()=>{
  it('has truthful empty state with no actionable controls',()=>{
    expect(checkNoGrants(model()).state).toBe('no_enrollment')
    const html=render(model())
    expect(html).toContain('Godkännande av enskild signering')
    expect(html).toContain('Låst')
    expect(html).toContain('Ingen signeringsbegäran')
    expect(html).not.toMatch(/<button|<input|<form/)
  })
  it('hides host when model denies operator permission even if identity injected',()=>{
    const m=model({capability:{allowed:false,reason:'not_platform_operator'},
      brokers:[broker('active')],openEnrollment:enrollment()})
    expect(checkNoGrants(m).state).toBe('not_operator')
    expect(render(m)).not.toContain(HOST)
  })
  it('hides host when broker registry cannot be read',()=>{
    const m=model({readable:false,brokers:[broker('pending')]})
    expect(checkNoGrants(m).state).toBe('registry_unreadable')
    expect(render(m)).not.toContain(HOST)
  })
  it('shows only nonsecret host and expiry for an issued challenge',()=>{
    const m=model({openEnrollment:enrollment()})
    const r=checkNoGrants(m)
    expect(r.state).toBe('enrollment_waiting_for_proof')
    expect(r.hostId).toBe(HOST)
    expect(render(m)).toContain(HOST)
    expect(render(m)).not.toMatch(/<button|<form|<input/)
  })
  it('does not leak unexpected extra secret fields',()=>{
    // Construct a runtime object with extra fields separately: the settings
    // contract intentionally exposes only the five safe enrollment fields.
    // This tests that an unexpected server payload is never rendered.
    const unexpectedEnrollment={
      ...enrollment(),challenge:'HIDDEN_CHALLENGE_SECRET',
      pairingCode:'HIDDEN_PAIRING_CODE_SECRET',
    }
    const m=model({openEnrollment:unexpectedEnrollment})
    const html=render(m)
    expect(html).not.toContain('HIDDEN_CHALLENGE_SECRET')
    expect(html).not.toContain('HIDDEN_PAIRING_CODE_SECRET')
    expect(html).toContain(HOST)
  })
  it('refuses expired, invalid, unreadable or already-consumed challenge',()=>{
    for(const openEnrollment of [
      enrollment(NOW),enrollment('2026-10-29T15:59:00.000Z'),
      {...enrollment(),state:'proof_verified' as never},
      {...enrollment(),hostId:''},
      {...enrollment(),expiresAt:'invalid-time'},
    ]){
      const r=checkNoGrants(model({openEnrollment}))
      expect(r.state).toBe('enrollment_expired_or_invalid')
      expect(r.hostId).toBeNull()
    }
  })
  it('separates pending broker activation from owner signing consent',()=>{
    const m=model({brokers:[broker('pending')],openEnrollment:enrollment()})
    const r=checkNoGrants(m)
    expect(r.state).toBe('pending_activation')
    expect(render(m)).toContain('separat godkännande')
  })
  it('an active broker never implies signing or code execution authority',()=>{
    const m=model({brokers:[broker('active')]})
    expect(checkNoGrants(m).state).toBe('broker_active')
    expect(render(m)).toContain('inte automatiskt')
  })
  it('terminal broker records are not eligible for signing',()=>{
    for(const status of ['revoked','lost','retired'] as const)
      expect(checkNoGrants(model({brokers:[broker(status)]})).state)
        .toBe('no_enrollment')
  })
  it('UI has no interactive authorization route or credential transport',()=>{
    const base=resolve(process.cwd(),'components/platform/vnext')
    const ui=readFileSync(resolve(base,'OwnerSigningReview.tsx'),'utf8')
    const css=readFileSync(resolve(base,'OwnerSigningReview.module.css'),'utf8')
    const panel=readFileSync(resolve(base,'SettingsBrokerPanel.tsx'),'utf8')
    expect(panel).toContain('<OwnerSigningReview model={model} />')
    for(const forbidden of [
      /fetch\s*\(/,/axios\./,/useEffect\s*\(/,/useState\s*\(/,
      /signCanonicalPayload\s*\(/,/localStorage\./,
      /<button/,/<form/,/onClick/,/<input/,
    ]) expect(ui).not.toMatch(forbidden)
    expect(ui).toContain('data-owner-consent-mode="read-only"')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('@media (max-width: 768px)')
    expect(css).toContain('@media (forced-colors: active)')
    expect(ui).not.toContain('/api/atlas/code-brokers/')
  })
  it('existing enrollment and separate broker activation API actions unchanged',()=>{
    const panel=readFileSync(resolve(process.cwd(),
      'components/platform/vnext/SettingsBrokerPanel.tsx'),'utf8')
    expect(panel).toContain('/api/atlas/code-brokers/')
    expect(panel).toContain('/approve')
    expect(panel).toContain('/api/atlas/code-brokers/enrollments')
  })
})
