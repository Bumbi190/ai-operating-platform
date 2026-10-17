import 'server-only'
import {REVIEWER_MODEL} from './review'
export type CloudTextProfile={deployment:typeof REVIEWER_MODEL;qualificationHash:string;expiresAt:string;inputTokenUpperBound:number;tokenBudgetVerified:true;pricingVerified:true}
/** Operator-reviewed role qualification is intentionally absent. Task12 must
 * supply exact source/output/provider/token-budget evidence before admission.
 * Owner project spend authorization/reservation is a separate authority. */
export function readCloudTextProfile():CloudTextProfile|null{return null}
