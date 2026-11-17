/**
 * Historical USD/SEK evidence and *illustrative* Bedrock price conversion.
 *
 * Neither Riksbank fixing nor AWS's public family SKUs establish a hard
 * billable ceiling. This helper has ZERO permission to reserve money, execute
 * models, modify cost_rates or replace Omnira's withGovernedSpend boundary.
 */
import {
  BEDROCK_PRICE_ADVISORY_VERSION, type BedrockReferenceQuote,
} from './bedrock-price-advisory'

export const BEDROCK_FX_ADVISORY_VERSION='omnira.bedrock-fx-advisory.v1' as const
// Mirrors the canonical ledger's 4-decimal round-up algorithm, but this copy is
// browser-safe and illustrative only. Its parity is tested against the server
// function; it is NEVER a reservation, settlement or accepted budget bound.
const DISPLAY_LEDGER_MAX=99_999_999.9999
function roundedUpExampleSek(sek:number):number {
  if (!Number.isFinite(sek)||sek<0||sek>DISPLAY_LEDGER_MAX) return sek
  if (sek===0) return 0
  let k=Math.ceil(sek*10_000)
  if(k>0 && (k-1)/10_000>=sek) k-=1
  if(k/10_000<sek) k+=1
  return k/10_000
}
export const RIKSBANK_USD_SEK_REFERENCE = Object.freeze({
  date:'2026-11-16',
  usdSek:10.07354,
  source:'riksbank-indicative' as const,
  sourceUrl:'https://api.riksbank.se/swea/v1/Observations/Latest/sekusdpmi',
  capturedOn:'2026-11-17',
})

type ReferenceFx = Readonly<{
  date: string
  usdSek: number
  source: 'riksbank-indicative'
  sourceUrl: string
}>

export type IllustrativeFxQuote = Readonly<{
  version: typeof BEDROCK_FX_ADVISORY_VERSION
  status: 'illustrative_only' | 'blocked'
  usdGrossReference: number | null
  sekReferenceRoundedUp: number | null
  sekWithExampleBufferRoundedUp: number | null
  quoteAsOfDate: string | null
  fxObservationDate: string | null
  appliedFxUsdSek: number | null
  exampleBufferPercent: number | null
  blockers: readonly string[]
  referenceIsIndicative: true
  fxForBillingVerified: false
  accountPriceVerified: false
  hardCeilingApproved: false
  budgetReserved: false
  creditAppliedUsd: 0
  canDispatch: false
  modelCallsMade: false
}>

/**
 * An example FX conversion, never a budget approval. The date and buffer are
 * explicitly required, never defaulted from getRates().usd_sek=10.5.
 */
export function reviewIllustrativeBedrockFx(input: {
  priceQuote: BedrockReferenceQuote
  fx: ReferenceFx
  asOfDate: string
  exampleBufferPercent: number
}): IllustrativeFxQuote {
  const problems:string[]=[
    'public_aws_sku_is_not_account_billing_quote',
    'riksbank_rate_is_indicative_not_billing_rate',
    'production_budget_and_stop_not_authorized',
  ]
  const asOf=input?.asOfDate
  const fx=input?.fx
  const q=input?.priceQuote
  const fmt=/^\d{4}-\d{2}-\d{2}$/
  const parse=(s:unknown):number|null=>{
    if(typeof s!=='string'||!fmt.test(s))return null
    const millis=Date.parse(s+'T00:00:00Z')
    return Number.isFinite(millis)&&new Date(millis).toISOString().slice(0,10)===s
      ?millis:null
  }
  const current=parse(asOf)
  const observed=parse(fx?.date)
  if(current===null||observed===null||current<observed
    ||current-observed>3*86_400_000) problems.push('fx_date_not_current_for_example')
  if(!fx||fx.source!=='riksbank-indicative'
    ||fx.sourceUrl!==RIKSBANK_USD_SEK_REFERENCE.sourceUrl
    ||!Number.isFinite(fx.usdSek)||fx.usdSek<=0||fx.usdSek>100) {
    problems.push('fx_reference_invalid')
  }
  // This is an example margin for visualization, NOT approved production policy.
  const buffer=input?.exampleBufferPercent
  if(typeof buffer!=='number'||!Number.isFinite(buffer)||buffer<0
    ||buffer>50||!Number.isInteger(buffer)) {
    problems.push('example_buffer_not_valid')
  }
  if(q?.version!==BEDROCK_PRICE_ADVISORY_VERSION
    ||q.status!=='indicative_only' || q.canDispatch!==false
    ||q.hasHardCeiling!==false || q.creditDeductionUsd!==0
    ||q.liveAccountPriceVerified!==false ||q.canonicalBudgetReserved!==false
    ||typeof q.grossUsd!=='number'||!Number.isFinite(q.grossUsd)
    ||q.grossUsd<0 || q.grossUsd>1_000_000) {
    problems.push('source_price_quote_invalid')
  }
  const usable=problems.length===3
  const gross=usable?q.grossUsd:null
  const ref=usable?roundedUpExampleSek(gross!*fx.usdSek):null
  const withBuffer=usable
    ?roundedUpExampleSek(gross!*fx.usdSek*(1+buffer/100))
    :null
  if ((ref!==null&&ref>DISPLAY_LEDGER_MAX)
    ||(withBuffer!==null&&withBuffer>DISPLAY_LEDGER_MAX)) {
    problems.push('exceeds_canonical_sek_ledger_range')
  }
  const valid=usable&&problems.length===3
  return {
    version:BEDROCK_FX_ADVISORY_VERSION,
    status:valid?'illustrative_only':'blocked',
    usdGrossReference:valid?gross:null,
    sekReferenceRoundedUp:valid?ref:null,
    sekWithExampleBufferRoundedUp:valid?withBuffer:null,
    quoteAsOfDate:typeof asOf==='string'?asOf:null,
    fxObservationDate:typeof fx?.date==='string'?fx.date:null,
    appliedFxUsdSek:valid?fx.usdSek:null,
    exampleBufferPercent:valid?buffer:null,
    blockers:[...new Set(problems)],
    referenceIsIndicative:true,
    fxForBillingVerified:false,
    accountPriceVerified:false,
    hardCeilingApproved:false,
    budgetReserved:false,
    creditAppliedUsd:0,
    canDispatch:false,
    modelCallsMade:false,
  }
}
