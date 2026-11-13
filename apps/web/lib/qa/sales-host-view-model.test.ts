import {describe,it,expect} from 'vitest'
import {salesConnectionLabel} from '@/lib/sales/view-model'
const status={workerId:'x',managed:true,generation:1,desiredState:'running' as const,connectionState:'online' as const,cliState:'ready' as const,lastSeenAt:null,workerExpiresAt:'2026-10-18',executionPaused:false,reconnectRequested:false}
describe('honest host status',()=>{
 it('distinguishes paused from working',()=>expect(salesConnectionLabel({...status,desiredState:'paused'})).toBe('Förberedelsen är pausad'))
 it('shows offline before model readiness',()=>expect(salesConnectionLabel({...status,connectionState:'offline'})).toBe('Datorn är inte ansluten just nu'))
 it('shows blocked model access',()=>expect(salesConnectionLabel({...status,cliState:'blocked'})).toBe('Specialisten behöver ses över'))
 it('shows revoked connection',()=>expect(salesConnectionLabel({...status,connectionState:'revoked'})).toBe('Anslutningen är återkallad'))
 it('reports readiness without claiming a job is running',()=>expect(salesConnectionLabel(status)).toBe('Redo att förbereda utkast'))
})
