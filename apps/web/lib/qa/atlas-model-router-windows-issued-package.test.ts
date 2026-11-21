import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { inspectWindowsBrokerEnrollmentPackage } from '@/lib/atlas/model-router/windows-broker-issued-package'
import { BROKER_PROTOCOL_VERSION, OMNIRA_REPOSITORY_ID } from '@/lib/atlas/code-broker/types'

const NOW=Date.parse('2026-10-29T13:10:00.000Z')
const make=()=>({
  domain:'omnira.code_broker.enrollment.v1',
  enrollmentId:randomUUID(),
  hostId:randomUUID(),
  challenge:randomBytes(32).toString('base64url'),
  pairingCode:randomBytes(8).toString('hex').toUpperCase(),
  expiresAt:new Date(NOW+9*60_000).toISOString(),
  protocolVersion:BROKER_PROTOCOL_VERSION,
  algorithm:'ES256',
  allowedRepositoryIds:[OMNIRA_REPOSITORY_ID],
})

describe('Incoming Windows Code Broker enrollment must be reviewed offline first',()=>{
  it('accepts only the narrow existing server package shape without authorizing signing',()=>{
    const e=make()
    const r=inspectWindowsBrokerEnrollmentPackage(e,NOW)
    expect(r.status).toBe('shape_valid_untrusted')
    expect(r.enrollmentId).toBe(e.enrollmentId)
    expect(r.hostId).toBe(e.hostId)
    expect(r.challengeLengthBytes).toBe(32)
    expect(r.pairingCodeLengthBytes).toBe(8)
    expect(r.authenticatedOriginVerified).toBe(false)
    expect(r.ownerApprovedForSigning).toBe(false)
    expect(r.permissionToSign).toBe(false)
    expect(r.serverEnrollmentAttempted).toBe(false)
    expect(r.modelExecutionAuthorized).toBe(false)
    const visible=JSON.stringify(r)
    expect(visible).not.toContain(e.challenge)
    expect(visible).not.toContain(e.pairingCode)
  })
  it('cannot infer authentic server origin merely from correctly shaped data',()=>{
    const r=inspectWindowsBrokerEnrollmentPackage(make(),NOW)
    expect(r.reason).toMatch(/unverified/i)
    expect(r.authenticatedOriginVerified).toBe(false)
  })
  it('rejects secret-looking and elevation fields not present in server contract',()=>{
    for(const prop of [
      { operatorApproved:true },{ identityId:'id' },{ privateKey:'marker' },
      { serverOrigin:'https://example.test' },{ execute:true },
      { sessionToken:'marker' },
    ]){
      const r=inspectWindowsBrokerEnrollmentPackage({...make(),...prop},NOW)
      expect(r.status).toBe('blocked')
    }
  })
  it('refuses altered domain, pairing-code grammar or challenge length',()=>{
    for(const update of [
      {domain:'omnira.code_broker.request.v1'},
      {challenge:randomBytes(31).toString('base64url')},
      {challenge:'+'.repeat(43)},
      {pairingCode:'lowercaseabcdef'},
      {pairingCode:'INVALID!'},
      {pairingCode:''},
      {algorithm:'HS256'},
      {protocolVersion:2},
    ]){
      expect(inspectWindowsBrokerEnrollmentPackage({...make(),...update},NOW).status).toBe('blocked')
    }
  })
  it('refuses wrong or expanded repository permissions',()=>{
    for(const list of [
      [],['github.com/random/repo'],
      [OMNIRA_REPOSITORY_ID, 'github.com/other/repo'],
    ]) expect(inspectWindowsBrokerEnrollmentPackage({
      ...make(),allowedRepositoryIds:list,
    },NOW).status).toBe('blocked')
  })
  it('refuses expired, long-lived or future-claimed package windows',()=>{
    for(const expiresAt of [
      new Date(NOW-1).toISOString(),
      new Date(NOW).toISOString(),
      new Date(NOW+600001).toISOString(),
      '2026-10-29', '2026-02-31T00:00:00.000Z',
    ]){
      const r=inspectWindowsBrokerEnrollmentPackage({...make(),expiresAt},NOW)
      expect(r.status).toBe('blocked')
    }
  })
  it('refuses duplicate, malformed or unsupported version UUIDs',()=>{
    const one=make()
    for(const bad of [
      {...one,hostId:one.enrollmentId},
      {...one,hostId:'00000000-0000-0000-0000-000000000000'},
      {...one,enrollmentId:'../../.git'},
      {...one,hostId:''},
    ]) expect(inspectWindowsBrokerEnrollmentPackage(bad,NOW).status).toBe('blocked')
  })
  it('rejects invalid system clocks and unknown data without leaking fields',()=>{
    for(const x of [null,undefined,{},[],false,'data',42]){
      const r=inspectWindowsBrokerEnrollmentPackage(x,NOW)
      expect(r.status).toBe('blocked')
      expect(r.challengeLengthBytes).toBeNull()
    }
    expect(inspectWindowsBrokerEnrollmentPackage(make(),-1).status).toBe('blocked')
    expect(inspectWindowsBrokerEnrollmentPackage(make(),Number.NaN).status).toBe('blocked')
  })
})
