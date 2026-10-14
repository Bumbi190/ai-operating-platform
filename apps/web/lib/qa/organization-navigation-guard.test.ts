import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const middleware = readFileSync(resolve(process.cwd(), 'middleware.ts'), 'utf8')
const confirm = readFileSync(resolve(process.cwd(), 'app/auth/confirm/page.tsx'), 'utf8')
describe('Collaborator navigation containment', () => {
  it('uses authenticated session identity and rejects legacy API routes', () => {
    expect(middleware).toContain(".eq('user_id', user.id)")
    expect(middleware).toContain("membership?.role === 'collaborator'")
    expect(middleware).toContain('collaboratorDirectoryRead')
    expect(middleware).toContain('handlWorkflowCreate')
    expect(middleware).toContain('handlWorkflowEdit')
    expect(middleware).toContain('!(collaboratorDirectoryRead || collaboratorWorkflowRead || handlWorkflowCreate || handlWorkflowEdit)')
    expect(middleware).toContain("status: 403")
  })
  it('redirects collaborators out of legacy Atlas screens', () => {
    expect(middleware).toContain("pathname === '/organization'")
    expect(middleware).toContain("url.pathname = '/organization'")
    expect(middleware).toContain("if (denied) return new NextResponse('Access revoked', { status: 403 })")
  })
  it('honors allowlisted invitation callback destination in fallback browser exchange', () => {
    expect(confirm).toContain("safeAuthDestination(params.get('next'))")
    expect(confirm).not.toContain("router.replace('/atlas')")
    expect(confirm).toContain("router.replace(destination)")
  })
})
