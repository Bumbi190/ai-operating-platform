/**
 * READ-ONLY view model for a future, owner-confirmed one-time TPM signature.
 *
 * This is UI projection, NOT an authorization oracle. BrokerSettingsModel is
 * already derived by the existing owner-protected settings loader. We still
 * hide any host/identity detail if that loader reports no operator authority
 * or a failed read. No secret-bearing enrollment package is accepted here.
 *
 * Important: even "operator_eligible" is NOT an affirmative owner action.
 * There is deliberately no sign(), consent(), RPC, fetch or local storage.
 */
import type { BrokerSettingsModel, StoredBroker } from '../code-broker/types'

export type OwnerReviewPreviewState =
  | 'not_operator'
  | 'registry_unreadable'
  | 'pending_activation'
  | 'broker_active'
  | 'enrollment_expired_or_invalid'
  | 'enrollment_waiting_for_proof'
  | 'no_enrollment'

export interface OwnerReviewPreview {
  readonly mode: 'read_only_review'
  readonly state: OwnerReviewPreviewState
  readonly title: string
  readonly description: string
  readonly hostId: string | null
  readonly expiresAt: string | null
  readonly operatorSettingsEligible: boolean
  readonly explicitSigningDecisionRecorded: false
  readonly issuerTrustedForProduction: false
  readonly buildAllowlistVerified: false
  readonly challengeProofCompleted: false
  readonly durableConsentReplayVerified: false
  readonly windowsSignerReadyForRealChallenge: false
  readonly realConsentRequestAvailable: false
  readonly enrollmentAuthorized: false
  readonly modelDispatchAuthorized: false
}

type PreviewDetail = Omit<OwnerReviewPreview,
  'mode' | 'operatorSettingsEligible' |
  'explicitSigningDecisionRecorded' |
  'issuerTrustedForProduction' |
  'buildAllowlistVerified' | 'challengeProofCompleted' |
  'durableConsentReplayVerified' |
  'windowsSignerReadyForRealChallenge' |
  'realConsentRequestAvailable' |
  'enrollmentAuthorized' | 'modelDispatchAuthorized'>

function view(
  status: PreviewDetail,
  operatorSettingsEligible: boolean,
): OwnerReviewPreview {
  return {
    mode: 'read_only_review',
    ...status,
    operatorSettingsEligible,
    explicitSigningDecisionRecorded: false,
    issuerTrustedForProduction: false,
    buildAllowlistVerified: false,
    challengeProofCompleted: false,
    durableConsentReplayVerified: false,
    windowsSignerReadyForRealChallenge: false,
    realConsentRequestAvailable: false,
    enrollmentAuthorized: false,
    modelDispatchAuthorized: false,
  }
}
const isNonempty=(x:unknown):x is string=>
  typeof x==='string' && x.length<=128 && x.trim().length>0
const selected=(brokers:StoredBroker[],status:'pending'|'active')=>
  brokers.find(b=>b.status===status && isNonempty(b.hostId) && isNonempty(b.brokerId))

export function ownerSigningReviewPreview(model:BrokerSettingsModel):OwnerReviewPreview {
  // The settings model is NOT itself an authorization token. Even when the
  // operator is eligible to view settings, no signing is possible.
  if(!model?.capability?.allowed) return view({
    state:'not_operator',
    title:'Behörighet saknas',
    description:'Bara en autentiserad plattformsoperatör kan granska enhetsidentiteter.',
    hostId:null,expiresAt:null,
  },false)
  if(!model.readable) return view({
    state:'registry_unreadable',
    title:'Brokerregistret kan inte läsas',
    description:'Kunde inte verifiera aktuellt registreringsläge. Ingen signering tillåts.',
    hostId:null,expiresAt:null,
  },true)

  const pending=selected(model.brokers??[],'pending')
  if(pending) return view({
    state:'pending_activation',
    title:'Enhet väntar på ett separat godkännande',
    description:'Brokerbeviset är mottaget, men enhetens aktivering är en annan åtgärd än godkännande av en TPM-signatur.',
    hostId:pending.hostId,expiresAt:null,
  },true)

  const active=selected(model.brokers??[],'active')
  if(active) return view({
    state:'broker_active',
    title:'En redan aktiv broker är registrerad',
    description:'En aktiv broker ger inte automatiskt rätt till nya TPM-signaturer eller kodexekvering.',
    hostId:active.hostId,expiresAt:null,
  },true)

  const enrollment=model.openEnrollment
  if(enrollment) {
    const now=Date.parse(model.generatedAt)
    const expires=Date.parse(enrollment.expiresAt)
    if(enrollment.state!=='issued' || !isNonempty(enrollment.hostId) ||
       !Number.isFinite(now) || !Number.isFinite(expires) || expires<=now) {
      return view({
        state:'enrollment_expired_or_invalid',
        title:'Registreringsutmaningen är inte giltig',
        description:'Ingen giltig utfärdad engångsutmaning kunde bekräftas i läsögonblicket.',
        hostId:null,expiresAt:null,
      },true)
    }
    return view({
      state:'enrollment_waiting_for_proof',
      title:'Registreringsutmaning finns',
      description:'En utfärdad utmaning finns i registret. Det finns ännu inget verifierat ägargodkännande för en enskild Windows-signatur.',
      hostId:enrollment.hostId,expiresAt:enrollment.expiresAt,
    },true)
  }

  return view({
    state:'no_enrollment',
    title:'Ingen signeringsbegäran att granska',
    description:'Ingen aktuell enhetsregistrering finns i läsögonblicket. Förhandsgranskningen kan inte starta någon registrering.',
    hostId:null,expiresAt:null,
  },true)
}
