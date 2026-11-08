import type {PlanRevisionRef} from '../planning/types'

export type ProspectCompany = {
  source: 'scb'; sourceId: string; sourceUrl: string; retrievedAt: string
  name: string; branchName: string; orgnr: string; cfar: string; city: string | null
  municipalityCode: string; sniCodes: string[]; restricted: boolean; inactive: boolean
}
export type ProspectObservation = {
  id: string; viewport: 'desktop' | 'mobile'; kind: string
  description: string; selector: string; value: string
}
export type ProspectCapture = {
  id: string; sourceUrl: string; finalUrl: string; capturedAt: string; engine: 'playwright'
  images: {viewport: 'desktop' | 'mobile'; width: number; height: number; assetId: string; sha256: string}[]
  observations: ProspectObservation[]; warnings: string[]
}
export type ProspectImprovement = {
  id: string; title: string; observationIds: string[]; proposal: string; verification: string
  concept: {heading: string; body: string}
}
export type ProspectContent = {
  version: 1; company: ProspectCompany
  website: {url: string; verifiedAt: string; verifiedBy: string; method: 'operator'} | null
  capture: ProspectCapture | null; improvements: ProspectImprovement[]
  design: (PlanRevisionRef & {conversationId: string; inputSha256: string}) | null
  build: {sessionId: string; revisionId: string; sha256: string; planRevisionId: string; mockupId: string; mockupSha256: string} | null
  demo: {url: string; publisher: 'vercel'; exportSha256: string; artifactSha256: string; checkedAt: string; desktopWidth: 1440; mobileWidth: 390; mobileOverflow: false; desktopOverflow: false} | null
}
export type ProspectRef = {projectId: string; prospectId: string}
export type ProspectRevisionRef = ProspectRef & {revisionId: string; sha256: string}
export type ProspectView = ProspectRef & {
  revisionId: string; sha256: string; number: number; content: ProspectContent; createdAt: string; updatedAt: string
  approval: {id: string; revisionId: string; sha256: string; reviewedBy: string; reviewedAt: string; scope: 'prospect_review'} | null
}
export type SaveProspectInput = {
  projectId: string; prospectId?: string; expectedRevisionId: string | null
  content: ProspectContent; idempotencyKey: string
}
export type ProspectReadiness = {ready: boolean; missing: string[]}
