/**
 * Omnira Trading Core — INTERNAL / TRUSTED barrel.
 *
 * ⚠ This is NOT the public contract. It is deliberately absent from
 * `lib/trading/index.ts`, so code importing `@/lib/trading` cannot reach it.
 *
 * Everything here can mint or consume execution authority. Import from this
 * path only inside the trading authority boundary — the Risk Engine (Fas 5),
 * Prop Engine (Fas 9), Approval layer (Fas 6) and Execution Gateway.
 *
 * If you are writing UI, analytics, reporting or any read-side code, you want
 * `@/lib/trading` instead.
 */

export {
  grantAuthorityIssuer,
  isGenuineAuthority,
  issueApprovalGrant,
  issuePropClearance,
  issueRiskClearance,
} from './authority'
export type {
  ApprovalGrant, AuthorityCapability, AuthorityIssuer, PropClearance, RiskClearance,
} from './authority'

export { openExecutionGate } from './execution-gate'
export type { ExecutionGateInput, ExecutionGateResult } from './execution-gate'
